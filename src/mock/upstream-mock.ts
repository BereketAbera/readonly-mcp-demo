import { addDays, daysInclusive, isValidIsoDate, localDate } from "../core/dates";
import type { FetchLike } from "../upstream/http";
import { getFixtures, VENUE_TIMEZONE } from "./seed";

/**
 * In-memory stand-ins for the two upstream APIs. They speak HTTP semantics
 * (Request in, Response out) so the real client code runs unchanged against
 * them: OAuth client-credentials token endpoints, bearer checks, token expiry,
 * scope checks, documented query limits and pagination.
 */

export interface MockCredentials {
  workforce: { clientId: string; clientSecret: string };
  booking: { clientId: string; clientSecret: string };
}

export interface MockUpstreamOptions {
  workforceBaseUrl: string;
  bookingBaseUrl: string;
  credentials: MockCredentials;
  now?: () => number;
  tokenLifetimeSeconds?: number;
  /** Endpoints the booking API key is scoped to (endpoint-scoped keys). */
  bookingKeyScope?: string[];
}

export interface MockCall {
  api: "workforce" | "booking";
  method: string;
  path: string;
  status: number;
}

export interface MockUpstream {
  fetch: FetchLike;
  stats: { tokenRequests: { workforce: number; booking: number }; calls: MockCall[] };
}

export const DEFAULT_BOOKING_KEY_SCOPE = [
  "GET /bookings",
  "GET /data/products",
  "GET /data/bookingpayments",
  "GET /reporting/revenue-entries",
];

/** Booking endpoints that exist upstream but sit outside the demo key's scope. */
const BOOKING_OUT_OF_SCOPE = [/^\/venues\/me$/, /^\/data\/customers$/, /^\/data\/staffs$/, /^\/bookings\/\d+$/, /^\/products$/];

const WORKFORCE_SCOPES = ["users.read", "jobs.read", "schedule.read", "time_clock.read", "pay_rates.read"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function randomToken(prefix: string): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function intParam(q: URLSearchParams, key: string, fallback: number): number {
  const value = Number(q.get(key));
  return Number.isFinite(value) && q.get(key) !== null ? Math.floor(value) : fallback;
}

export function createMockUpstream(options: MockUpstreamOptions): MockUpstream {
  const now = options.now ?? Date.now;
  const lifetime = options.tokenLifetimeSeconds ?? 86_400;
  const bookingScope = options.bookingKeyScope ?? DEFAULT_BOOKING_KEY_SCOPE;
  const workforceOrigin = new URL(options.workforceBaseUrl).origin;
  const bookingOrigin = new URL(options.bookingBaseUrl).origin;
  const tokens = new Map<string, { api: "workforce" | "booking"; expiresAt: number; scope: string[] }>();
  const stats: MockUpstream["stats"] = { tokenRequests: { workforce: 0, booking: 0 }, calls: [] };
  let requestCounter = 0;

  const bearer = (request: Request, api: "workforce" | "booking") => {
    const match = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "");
    const token = match ? tokens.get(match[1]) : undefined;
    if (!token || token.api !== api || now() >= token.expiresAt) return undefined;
    return token;
  };

  const envelope = (data: unknown, paging?: { offset: number; total: number }) => ({
    requestId: `req_${String(++requestCounter).padStart(6, "0")}`,
    data,
    ...(paging ? { paging } : {}),
  });

  const page = <T>(items: T[], q: URLSearchParams) => {
    const limit = Math.min(Math.max(intParam(q, "limit", 100), 1), 500);
    const offset = Math.max(intParam(q, "offset", 0), 0);
    const slice = items.slice(offset, offset + limit);
    return { slice, paging: { offset: offset + slice.length, total: items.length } };
  };

  const missing = (field: string) =>
    json(422, { detail: [{ loc: ["query", field], msg: "Field required", type: "missing" }] });

  // ------------------------------------------------------------- workforce
  async function workforce(request: Request, url: URL): Promise<Response> {
    const path = url.pathname;
    const q = url.searchParams;
    if (path === "/oauth/v1/token") {
      if (request.method !== "POST") return json(405, { detail: "Method Not Allowed" });
      stats.tokenRequests.workforce += 1;
      const contentType = request.headers.get("content-type") ?? "";
      const form = contentType.includes("application/x-www-form-urlencoded") ? await request.formData() : new FormData();
      const basic = /^Basic (.+)$/.exec(request.headers.get("authorization") ?? "");
      const expected = `${options.credentials.workforce.clientId}:${options.credentials.workforce.clientSecret}`;
      if (
        !contentType.includes("application/x-www-form-urlencoded") ||
        form.get("grant_type") !== "client_credentials" ||
        !basic ||
        atob(basic[1]) !== expected
      ) {
        return json(401, { error: "invalid_client" });
      }
      const accessToken = randomToken("ct_mock_");
      tokens.set(accessToken, { api: "workforce", expiresAt: now() + lifetime * 1000, scope: WORKFORCE_SCOPES });
      return json(200, { access_token: accessToken, token_type: "Bearer", expires_in: lifetime, scope: WORKFORCE_SCOPES.join(" ") });
    }
    if (request.method !== "GET") return json(405, { detail: "Method Not Allowed" });
    const token = bearer(request, "workforce");
    if (!token) return json(401, { detail: "Unauthorized" });

    const fx = getFixtures();
    const need = (scope: string) => token.scope.includes(scope);

    if (path === "/users/v1/users") {
      if (!need("users.read")) return json(403, { detail: "Missing scope users.read" });
      const status = q.get("userStatus") ?? "active";
      const users = fx.users.filter((u) => (status === "all" ? true : status === "archived" ? u.isArchived : !u.isArchived));
      const { slice, paging } = page(users, q);
      return json(200, envelope({ users: slice }, paging));
    }
    if (path === "/jobs/v1/jobs") {
      const { slice, paging } = page(fx.jobs, q);
      return json(200, envelope({ jobs: slice }, paging));
    }
    if (path === "/scheduler/v1/schedulers") {
      return json(200, envelope({ schedulers: fx.schedulers }));
    }
    const shiftsMatch = /^\/scheduler\/v2\/schedulers\/(\d+)\/shifts$/.exec(path);
    if (shiftsMatch) {
      if (!need("schedule.read")) return json(403, { detail: "Missing scope schedule.read" });
      if (!fx.schedulers.some((s) => s.schedulerId === Number(shiftsMatch[1]))) return json(404, { detail: "Scheduler not found" });
      if (!q.get("startTime")) return missing("startTime");
      if (!q.get("endTime")) return missing("endTime");
      const from = Number(q.get("startTime"));
      const to = Number(q.get("endTime"));
      const shifts = fx.shifts.filter((s) => s.startTime < to && s.endTime > from);
      const { slice, paging } = page(shifts, q);
      return json(200, envelope({ shifts: slice }, paging));
    }
    if (path === "/time-clock/v1/time-clocks") {
      return json(200, envelope({ timeClocks: fx.timeClocks }));
    }
    const activityMatch = /^\/time-clock\/v1\/time-clocks\/(\d+)\/time-activities$/.exec(path);
    if (activityMatch) {
      if (!need("time_clock.read")) return json(403, { detail: "Missing scope time_clock.read" });
      if (!fx.timeClocks.some((c) => c.id === Number(activityMatch[1]))) return json(404, { detail: "Time clock not found" });
      const startDate = q.get("startDate");
      const endDate = q.get("endDate");
      if (!startDate) return missing("startDate");
      if (!endDate) return missing("endDate");
      if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
        return json(422, { detail: [{ loc: ["query", "startDate"], msg: "Invalid date", type: "value_error" }] });
      }
      const inRange = (ts: number) => {
        const d = localDate(ts, VENUE_TIMEZONE);
        return d >= startDate && d <= endDate;
      };
      const byUser = fx.timeActivities
        .map((u) => ({
          ...u,
          shifts: u.shifts.filter((s) => inRange(s.start.timestamp)),
          manualBreaks: u.manualBreaks.filter((b) => inRange(b.start.timestamp)),
        }))
        .filter((u) => u.shifts.length > 0);
      return json(200, envelope({ timeActivitiesByUsers: byUser }));
    }
    if (path === "/pay-rates/v1/pay-rates") {
      if (!need("pay_rates.read")) return json(403, { detail: "Missing scope pay_rates.read" });
      const startDate = q.get("startDate");
      const endDate = q.get("endDate");
      if (!startDate) return missing("startDate");
      if (!endDate) return missing("endDate");
      if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate < startDate) {
        return json(400, { request_id: "req_invalid", detail: "End date must be after start date" });
      }
      if (daysInclusive(startDate, endDate) > 366) {
        return json(400, { request_id: "req_invalid", detail: "Date range cannot exceed 365 days" });
      }
      const rates = fx.payRates.filter((r) => r.payRate.effectiveDate <= endDate);
      const { slice, paging } = page(rates, q);
      return json(200, envelope({ payRatesByUsers: slice }, paging));
    }
    return json(404, { detail: "Not Found" });
  }

  // --------------------------------------------------------------- booking
  async function booking(request: Request, url: URL): Promise<Response> {
    const path = url.pathname;
    const q = url.searchParams;
    if (path === "/token") {
      if (request.method !== "POST") return json(405, { message: "Method not allowed" });
      stats.tokenRequests.booking += 1;
      let body: { client_id?: string; client_secret?: string } = {};
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json(400, { message: "Invalid JSON body" });
      }
      const creds = options.credentials.booking;
      if (body.client_id !== creds.clientId || body.client_secret !== creds.clientSecret) {
        return json(401, { message: "Invalid client credentials" });
      }
      const accessToken = randomToken("rl_mock_");
      tokens.set(accessToken, { api: "booking", expiresAt: now() + lifetime * 1000, scope: bookingScope });
      return json(200, { access_token: accessToken, token_type: "Bearer", expires_in: lifetime });
    }
    if (request.method !== "GET") return json(405, { message: "Method not allowed" });
    const token = bearer(request, "booking");
    if (!token) return json(401, { message: "Unauthorized" });

    const known = DEFAULT_BOOKING_KEY_SCOPE.includes(`GET ${path}`) || BOOKING_OUT_OF_SCOPE.some((p) => p.test(path));
    if (!known) return json(404, { message: "Not found" });
    if (!token.scope.includes(`GET ${path}`)) {
      return json(403, { errorCode: "INSUFFICIENT_SCOPE", message: "API key is not scoped for this endpoint" });
    }

    const fx = getFixtures();
    const pageNumber = Math.max(intParam(q, "pageNumber", 1), 1);
    const pageSize = Math.min(Math.max(intParam(q, "pageSize", 100), 1), 100);
    const pageOf = <T>(items: T[]) => items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

    const oneDay = (): string | Response => {
      const startDate = q.get("startDate");
      const endDate = q.get("endDate");
      if (!startDate || !endDate || !isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
        return json(400, { message: "startDate and endDate are required (yyyy-mm-dd)" });
      }
      if (endDate < startDate || endDate > addDays(startDate, 1)) {
        return json(400, { message: "Date range must not exceed 1 day" });
      }
      return startDate;
    };

    if (path === "/bookings") {
      const date = q.get("date");
      if (!date || !isValidIsoDate(date)) return json(400, { message: "At least one search criterion is required" });
      const bookings = [...(fx.bookingsByDate.get(date) ?? [])]
        .sort((a, b) => b.createdDate.localeCompare(a.createdDate))
        .slice(0, 100);
      return json(200, { bookings });
    }
    if (path === "/data/products") {
      return json(200, pageOf(fx.products));
    }
    if (path === "/data/bookingpayments") {
      const day = oneDay();
      if (day instanceof Response) return day;
      return json(200, pageOf(fx.paymentsByDate.get(day) ?? []));
    }
    if (path === "/reporting/revenue-entries") {
      const day = oneDay();
      if (day instanceof Response) return day;
      const entries = fx.revenueByDate.get(day) ?? [];
      return json(200, entries.slice((pageNumber - 1) * 100, pageNumber * 100));
    }
    return json(404, { message: "Not found" });
  }

  const fetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    let api: MockCall["api"];
    let response: Response;
    if (url.origin === workforceOrigin) {
      api = "workforce";
      response = await workforce(request, url);
    } else if (url.origin === bookingOrigin) {
      api = "booking";
      response = await booking(request, url);
    } else {
      throw new TypeError(`Mock upstream has no host ${url.host}`);
    }
    stats.calls.push({ api, method: request.method, path: url.pathname, status: response.status });
    if (stats.calls.length > 2_000) stats.calls.splice(0, stats.calls.length - 2_000);
    return response;
  };

  return { fetch, stats };
}
