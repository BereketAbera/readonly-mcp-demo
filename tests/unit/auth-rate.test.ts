import { describe, expect, it } from "vitest";
import { acceptedToken, timingSafeEqual, verifyBearer } from "../../src/core/auth";
import { ConfigError, loadConfig } from "../../src/core/config";
import { MemoryRateLimiter } from "../../src/core/rate-limit";

describe("bearer token check", () => {
  it("accepts a configured token and identifies it only by a hash prefix", async () => {
    const secret = "a".repeat(64);
    const tokens = [await acceptedToken(secret, "secret"), await acceptedToken("lakeside-demo-readonly", "public-demo")];
    const result = await verifyBearer(`Bearer ${secret}`, tokens);
    expect(result).toEqual({ ok: true, tokenId: tokens[0].id, kind: "secret" });
    expect(tokens[0].id).toMatch(/^tok_[0-9a-f]{10}$/);
    expect(tokens[0].id).not.toContain("aaaa");
    expect(await verifyBearer("bearer lakeside-demo-readonly", tokens)).toMatchObject({ ok: true, kind: "public-demo" });
  });

  it("rejects missing, malformed and wrong tokens", async () => {
    const tokens = [await acceptedToken("lakeside-demo-readonly", "public-demo")];
    expect(await verifyBearer(null, tokens)).toEqual({ ok: false, reason: "missing" });
    expect(await verifyBearer("Basic abc", tokens)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyBearer("Bearer short", tokens)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyBearer("Bearer lakeside-demo-readonlyX", tokens)).toEqual({ ok: false, reason: "invalid" });
    expect(await verifyBearer("Bearer LAKESIDE-DEMO-READONLY", tokens)).toEqual({ ok: false, reason: "invalid" });
  });

  it("compares digests in constant time", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("per-token rate limit", () => {
  it("allows the limit per window, then reports when to retry", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(3, 60_000, () => now);
    for (let i = 0; i < 3; i += 1) expect((await limiter.check("tok_a")).allowed).toBe(true);
    expect(await limiter.check("tok_a")).toEqual({ allowed: false, retryAfter: 60 });
    expect((await limiter.check("tok_b")).allowed).toBe(true); // other tokens are unaffected
    now = 30_000;
    expect(await limiter.check("tok_a")).toEqual({ allowed: false, retryAfter: 30 });
    now = 60_001;
    expect((await limiter.check("tok_a")).allowed).toBe(true);
  });
});

describe("configuration from the environment", () => {
  it("defaults to mocked upstreams with the public demo token", () => {
    const config = loadConfig({});
    expect(config.mode).toBe("mock");
    expect(config.publicDemoToken).toBe("lakeside-demo-readonly");
    expect(config.workforce.baseUrl).toBe("https://api-au.connecteam.com");
    expect(config.workforce.tokenUrl).toBe("https://api-au.connecteam.com/oauth/v1/token");
    expect(config.booking.tokenUrl).toBe("https://api.roller.app/token");
  });

  it("refuses live mode without secrets and never accepts the public token there", () => {
    expect(() => loadConfig({ UPSTREAM_MODE: "live" })).toThrow(ConfigError);
    const live = loadConfig({
      UPSTREAM_MODE: "live",
      MCP_BEARER_TOKENS: "b".repeat(64),
      MCP_PUBLIC_DEMO_TOKEN: "lakeside-demo-readonly",
      CONNECTEAM_CLIENT_ID: "id",
      CONNECTEAM_CLIENT_SECRET: "secret",
      ROLLER_CLIENT_ID: "id",
      ROLLER_CLIENT_SECRET: "secret",
    });
    expect(live.publicDemoToken).toBeUndefined();
    expect(() => loadConfig({ UPSTREAM_MODE: "live", MCP_BEARER_TOKENS: "too-short", CONNECTEAM_CLIENT_ID: "a", CONNECTEAM_CLIENT_SECRET: "b", ROLLER_CLIENT_ID: "c", ROLLER_CLIENT_SECRET: "d" })).toThrow(/at least 32/);
  });

  it("validates numbers and time zones", () => {
    expect(() => loadConfig({ RATE_LIMIT_PER_MINUTE: "0" })).toThrow(/RATE_LIMIT_PER_MINUTE/);
    expect(() => loadConfig({ VENUE_TIMEZONE: "Mars/Olympus" })).toThrow(/time zone/);
    expect(loadConfig({ UPSTREAM_MODE: "mock", MCP_PUBLIC_DEMO_TOKEN: "none", MCP_BEARER_TOKENS: "x".repeat(40) }).publicDemoToken).toBeUndefined();
  });
});

describe("upstream mode", () => {
  const creds = { CONNECTEAM_CLIENT_ID: "a", CONNECTEAM_CLIENT_SECRET: "b", ROLLER_CLIENT_ID: "c", ROLLER_CLIENT_SECRET: "d" };
  const secret = { MCP_BEARER_TOKENS: "s".repeat(64) };

  it("accepts mock or live in any case", () => {
    expect(loadConfig({ UPSTREAM_MODE: "MOCK" }).mode).toBe("mock");
    expect(loadConfig({ UPSTREAM_MODE: "Live", ...secret, ...creds }).mode).toBe("live");
  });

  it("rejects anything else instead of falling back to the fictional data", () => {
    for (const value of ["production", "prod", "real", "on"]) {
      expect(() => loadConfig({ UPSTREAM_MODE: value, ...secret, ...creds }), value).toThrow(/must be "mock" or "live"/);
    }
  });

  it("requires an explicit mode once credentials or secret tokens are set", () => {
    expect(() => loadConfig({ ...secret, ...creds })).toThrow(/Set UPSTREAM_MODE/);
    expect(() => loadConfig({ ...secret })).toThrow(/Set UPSTREAM_MODE/);
    expect(() => loadConfig({ CONNECTEAM_CLIENT_ID: "a" })).toThrow(/Set UPSTREAM_MODE/);
  });

  it("refuses mock mode next to real credentials, so the public token never fronts them", () => {
    expect(() => loadConfig({ UPSTREAM_MODE: "mock", ...secret, ...creds })).toThrow(/refusing to serve fictional data/);
    expect(loadConfig({ UPSTREAM_MODE: "live", ...secret, ...creds }).publicDemoToken).toBeUndefined();
  });
});

describe("data and origin settings", () => {
  it("reads the data-minimisation switches", () => {
    const config = loadConfig({ STAFF_EXTRA_FIELDS: "Uniform size, Shirt colour", INCLUDE_TIMESHEET_NOTES: "true" });
    expect(config.staffExtraFields).toEqual(["Uniform size", "Shirt colour"]);
    expect(config.includeTimesheetNotes).toBe(true);
    expect(loadConfig({}).includeTimesheetNotes).toBe(false);
    expect(() => loadConfig({ INCLUDE_TIMESHEET_NOTES: "sometimes" })).toThrow(/true or false/);
  });

  it("builds the origin allowlist from ALLOWED_ORIGINS and the platform's own URLs", () => {
    const config = loadConfig({
      ALLOWED_ORIGINS: "https://ops.example.com/some/path, https://ops.example.com",
      VERCEL_PROJECT_PRODUCTION_URL: "readonly-mcp-demo.vercel.app",
      VERCEL_URL: "readonly-mcp-demo-abc123.vercel.app",
    });
    expect(config.allowedOrigins).toEqual([
      "https://ops.example.com",
      "https://readonly-mcp-demo.vercel.app",
      "https://readonly-mcp-demo-abc123.vercel.app",
    ]);
    expect(() => loadConfig({ ALLOWED_ORIGINS: "not a url" })).toThrow(/ALLOWED_ORIGINS/);
  });
});
