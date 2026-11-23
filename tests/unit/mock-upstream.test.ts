import { describe, expect, it } from "vitest";
import { MOCK_CREDENTIALS } from "../../src/core/config";
import { daysInclusive } from "../../src/core/dates";
import { createMockUpstream } from "../../src/mock/upstream-mock";
import { getFixtures, SEED_END, SEED_START } from "../../src/mock/seed";

const mock = () =>
  createMockUpstream({
    workforceBaseUrl: "https://api-au.connecteam.com",
    bookingBaseUrl: "https://api.roller.app",
    credentials: MOCK_CREDENTIALS,
  });

async function bookingToken(fetch: ReturnType<typeof mock>["fetch"]) {
  const res = await fetch("https://api.roller.app/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: MOCK_CREDENTIALS.booking.clientId, client_secret: MOCK_CREDENTIALS.booking.clientSecret }),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

describe("seeded fixtures", () => {
  it("cover four weeks for one venue and are deterministic", () => {
    const fx = getFixtures();
    expect(daysInclusive(SEED_START, SEED_END)).toBe(28);
    expect(fx.users.filter((u) => !u.isArchived)).toHaveLength(18);
    expect(fx.bookingsByDate.size).toBe(28);
    for (const [date, bookings] of fx.bookingsByDate) {
      expect(bookings.length, date).toBeLessThanOrEqual(100);
    }
    expect(fx.shifts.length).toBeGreaterThan(150);
    expect(getFixtures()).toBe(fx);
  });
});

describe("mock booking API", () => {
  it("issues tokens only for the right client credentials", async () => {
    const { fetch } = mock();
    const bad = await fetch("https://api.roller.app/token", { method: "POST", body: JSON.stringify({ client_id: "x", client_secret: "y" }) });
    expect(bad.status).toBe(401);
    expect(await bookingToken(fetch)).toMatch(/^rl_mock_/);
  });

  it("enforces the key's endpoint scope with 403 INSUFFICIENT_SCOPE", async () => {
    const { fetch } = mock();
    const token = await bookingToken(fetch);
    const res = await fetch("https://api.roller.app/venues/me", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ errorCode: "INSUFFICIENT_SCOPE" });
  });

  it("limits reporting queries to one day", async () => {
    const { fetch } = mock();
    const token = await bookingToken(fetch);
    const headers = { authorization: `Bearer ${token}` };
    const wide = await fetch("https://api.roller.app/reporting/revenue-entries?startDate=2026-11-01&endDate=2026-11-05", { headers });
    expect(wide.status).toBe(400);
    const day = await fetch("https://api.roller.app/reporting/revenue-entries?startDate=2026-11-21&endDate=2026-11-22", { headers });
    expect(day.status).toBe(200);
    expect(((await day.json()) as unknown[]).length).toBe(100);
  });

  it("rejects missing and expired tokens", async () => {
    let now = 0;
    const m = createMockUpstream({
      workforceBaseUrl: "https://api-au.connecteam.com",
      bookingBaseUrl: "https://api.roller.app",
      credentials: MOCK_CREDENTIALS,
      now: () => now,
      tokenLifetimeSeconds: 60,
    });
    expect((await m.fetch("https://api.roller.app/data/products")).status).toBe(401);
    const token = await bookingToken(m.fetch);
    expect((await m.fetch("https://api.roller.app/data/products", { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    now = 61_000;
    expect((await m.fetch("https://api.roller.app/data/products", { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });
});

describe("mock workforce API", () => {
  it("requires HTTP Basic client credentials on the AU token endpoint", async () => {
    const { fetch } = mock();
    const form = { "content-type": "application/x-www-form-urlencoded" };
    const wrong = await fetch("https://api-au.connecteam.com/oauth/v1/token", {
      method: "POST",
      headers: { ...form, authorization: `Basic ${btoa("mock-workforce-client:wrong")}` },
      body: "grant_type=client_credentials",
    });
    expect(wrong.status).toBe(401);
    const right = await fetch("https://api-au.connecteam.com/oauth/v1/token", {
      method: "POST",
      headers: { ...form, authorization: `Basic ${btoa(`${MOCK_CREDENTIALS.workforce.clientId}:${MOCK_CREDENTIALS.workforce.clientSecret}`)}` },
      body: "grant_type=client_credentials",
    });
    expect(await right.json()).toMatchObject({ token_type: "Bearer", expires_in: 86400 });
  });
});
