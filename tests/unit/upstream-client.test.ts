import { describe, expect, it, vi } from "vitest";
import {
  matchRule,
  ReadOnlyClient,
  readOnlyFetch,
  UpstreamHttpError,
  UpstreamPolicyError,
  type FetchLike,
  type TokenSource,
} from "../../src/upstream/http";
import { BOOKING_RULES } from "../../src/upstream/booking";
import { ClientCredentialsTokenSource } from "../../src/upstream/oauth";
import { WORKFORCE_RULES } from "../../src/upstream/workforce";

const staticTokens = (): TokenSource & { invalidated: number } => ({
  invalidated: 0,
  async getToken() {
    return "tok";
  },
  invalidate() {
    this.invalidated += 1;
  },
});

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("path allowlist", () => {
  it("accepts only the documented read endpoints", () => {
    expect(matchRule("/users/v1/users", WORKFORCE_RULES)?.name).toBe("list users");
    expect(matchRule("/scheduler/v2/schedulers/7001/shifts", WORKFORCE_RULES)?.name).toBe("list scheduler shifts");
    expect(matchRule("/time-clock/v1/time-clocks/9001/time-activities", WORKFORCE_RULES)?.name).toBe("list time activities");
    expect(matchRule("/reporting/revenue-entries", BOOKING_RULES)?.name).toBe("list revenue entries");
  });

  it.each([
    "/users/v1/users/1001",
    "/users/v1/users/../../admin",
    "/users/v1/users%2F..",
    "/scheduler/v2/schedulers/abc/shifts",
    "/scheduler/v2/schedulers/7001/shifts/bulk",
    "//users/v1/users",
    "/users/v1/users?x=1",
    "/time-clock/v1/time-clocks/9001/clock-in",
    "/pay-rates/v1/pay-rates/delete",
    "",
  ])("rejects %s", (path) => {
    expect(matchRule(path, [...WORKFORCE_RULES, ...BOOKING_RULES])).toBeUndefined();
  });

  it("rejects booking write and out-of-scope paths", () => {
    for (const path of ["/bookings/draft", "/bookings/draft/publish", "/giftcards", "/webhooks", "/redemptions", "/venues/me"]) {
      expect(matchRule(path, BOOKING_RULES), path).toBeUndefined();
    }
  });
});

describe("ReadOnlyClient", () => {
  it("exposes get() and nothing else that can send a request", () => {
    const methods = Object.getOwnPropertyNames(ReadOnlyClient.prototype).filter((m) => m !== "constructor").sort();
    expect(methods).toEqual(["get", "send", "throttle"]);
  });

  it("refuses non-allowlisted paths before any network call", async () => {
    const fetch = vi.fn<FetchLike>();
    const client = new ReadOnlyClient({ api: "workforce", baseUrl: "https://api-au.connecteam.com", rules: WORKFORCE_RULES, tokens: staticTokens(), fetch });
    await expect(client.get("/users/v1/users/1001")).rejects.toBeInstanceOf(UpstreamPolicyError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws on a non-GET call even if the type system is bypassed", async () => {
    const fetch = vi.fn<FetchLike>();
    const client = new ReadOnlyClient({ api: "booking", baseUrl: "https://api.roller.app", rules: BOOKING_RULES, tokens: staticTokens(), fetch });
    const send = (client as unknown as { send: (m: string, u: URL, r: unknown, retry: boolean) => Promise<unknown> }).send.bind(client);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      await expect(send(method, new URL("https://api.roller.app/bookings"), BOOKING_RULES[0], false)).rejects.toThrow(/read-only/);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends GET with a bearer token and encodes query values", async () => {
    const fetch = vi.fn<FetchLike>(async () => okJson({ bookings: [] }));
    const client = new ReadOnlyClient({ api: "booking", baseUrl: "https://api.roller.app", rules: BOOKING_RULES, tokens: staticTokens(), fetch });
    await client.get("/bookings", { date: "2026-11-21", ids: [1, 2], skip: undefined });
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://api.roller.app/bookings?date=2026-11-21&ids=1&ids=2");
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
  });

  it("refreshes the token once on 401, then surfaces upstream errors without bodies", async () => {
    const tokens = staticTokens();
    const fetch = vi.fn<FetchLike>(async () => new Response("secret upstream detail", { status: 401 }));
    const client = new ReadOnlyClient({ api: "booking", baseUrl: "https://api.roller.app", rules: BOOKING_RULES, tokens, fetch });
    const error = await client.get("/data/products").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamHttpError);
    expect((error as Error).message).toBe('Booking API returned HTTP 401 for "list products"');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(tokens.invalidated).toBe(1);
  });
});

describe("readOnlyFetch guard", () => {
  const inner = vi.fn<FetchLike>(async () => okJson({}));
  const guarded = readOnlyFetch(inner, {
    apiOrigins: ["https://api-au.connecteam.com", "https://api.roller.app"],
    tokenUrls: ["https://api-au.connecteam.com/oauth/v1/token", "https://api.roller.app/token"],
  });

  it("allows GET to the two API hosts and POST only to the token URLs", async () => {
    await guarded("https://api.roller.app/data/products");
    await guarded("https://api.roller.app/token", { method: "POST", body: "{}" });
    await guarded("https://api-au.connecteam.com/oauth/v1/token", { method: "POST", body: "grant_type=client_credentials" });
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("blocks %s to API endpoints", async (method) => {
    await expect(guarded("https://api.roller.app/bookings", { method, body: method === "DELETE" ? undefined : "{}" })).rejects.toThrow(
      UpstreamPolicyError,
    );
  });

  it("blocks other hosts and token URLs with query strings", async () => {
    await expect(guarded("https://example.com/anything")).rejects.toThrow(/unexpected host/);
    await expect(guarded("https://api.roller.app/token?x=1", { method: "POST", body: "{}" })).rejects.toThrow(UpstreamPolicyError);
  });
});

describe("OAuth client-credentials token cache", () => {
  function tokenServer() {
    let n = 0;
    const fetch = vi.fn<FetchLike>(async () => okJson({ access_token: `t${++n}`, token_type: "Bearer", expires_in: 3600 }));
    return fetch;
  }

  it("reuses a token until shortly before expiry", async () => {
    let now = 1_000_000;
    const fetch = tokenServer();
    const source = new ClientCredentialsTokenSource({
      api: "booking",
      tokenUrl: "https://api.roller.app/token",
      style: "json-body",
      credentials: { clientId: "id", clientSecret: "secret" },
      fetch,
      now: () => now,
    });
    expect(await source.getToken()).toBe("t1");
    now += 3_000_000; // 50 minutes later: still cached
    expect(await source.getToken()).toBe("t1");
    now += 560_000; // within the 60s refresh window
    expect(await source.getToken()).toBe("t2");
    expect(source.requestCount).toBe(2);
  });

  it("shares one in-flight request between concurrent callers and refetches after invalidate()", async () => {
    const fetch = tokenServer();
    const source = new ClientCredentialsTokenSource({
      api: "workforce",
      tokenUrl: "https://api-au.connecteam.com/oauth/v1/token",
      style: "basic-form",
      credentials: { clientId: "id", clientSecret: "secret" },
      fetch,
    });
    const tokens = await Promise.all([source.getToken(), source.getToken(), source.getToken()]);
    expect(tokens).toEqual(["t1", "t1", "t1"]);
    source.invalidate();
    expect(await source.getToken()).toBe("t2");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sends Basic auth + form body for the workforce API and a JSON body for the booking API", async () => {
    const fetch = tokenServer();
    await new ClientCredentialsTokenSource({ api: "workforce", tokenUrl: "https://w/t", style: "basic-form", credentials: { clientId: "id", clientSecret: "pw" }, fetch }).getToken();
    await new ClientCredentialsTokenSource({ api: "booking", tokenUrl: "https://b/t", style: "json-body", credentials: { clientId: "id", clientSecret: "pw" }, fetch }).getToken();
    const [, wf] = fetch.mock.calls[0];
    const [, bk] = fetch.mock.calls[1];
    expect(new Headers(wf?.headers).get("authorization")).toBe(`Basic ${btoa("id:pw")}`);
    expect(wf?.body).toBe("grant_type=client_credentials");
    expect(JSON.parse(String(bk?.body))).toEqual({ client_id: "id", client_secret: "pw" });
  });

  it("fails closed when the token endpoint rejects the credentials", async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 }));
    const source = new ClientCredentialsTokenSource({ api: "booking", tokenUrl: "https://b/t", style: "json-body", credentials: { clientId: "x", clientSecret: "y" }, fetch });
    await expect(source.getToken()).rejects.toThrow("booking token request failed with HTTP 401");
  });
});
