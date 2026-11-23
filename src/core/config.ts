/**
 * Configuration comes only from the environment (Worker bindings and secrets,
 * or process.env on Vercel). Nothing secret is read from source.
 */

export type UpstreamMode = "mock" | "live";

export interface ApiConfig {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface ServerConfig {
  mode: UpstreamMode;
  timezone: string;
  rateLimitPerMinute: number;
  /** Exact origins of pages that may call /mcp from a browser (same-origin pages; no CORS is served). */
  allowedOrigins: string[];
  secretTokens: string[];
  /** Accepted only while upstreams are mocked (fictional data). */
  publicDemoToken?: string;
  payRateMinGroupSize: number;
  /** Connecteam custom fields list_staff may return, besides Department and Employment type. */
  staffExtraFields: string[];
  /** Whether get_timesheets returns note text (masked) instead of only `hasNote`. */
  includeTimesheetNotes: boolean;
  workforce: ApiConfig;
  booking: ApiConfig;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

export type EnvSource = Record<string, unknown>;

/**
 * Public token for the fictional demo data. Accepted only while the upstreams
 * are mocked; set MCP_PUBLIC_DEMO_TOKEN=none to turn it off.
 */
export const DEFAULT_PUBLIC_DEMO_TOKEN = "lakeside-demo-readonly";

/** Credentials the in-memory mock upstreams accept when none are configured. */
export const MOCK_CREDENTIALS = {
  workforce: { clientId: "mock-workforce-client", clientSecret: "mock-workforce-secret" },
  booking: { clientId: "mock-booking-client", clientSecret: "mock-booking-secret" },
} as const;

const REAL_CREDENTIAL_KEYS = ["CONNECTEAM_CLIENT_ID", "CONNECTEAM_CLIENT_SECRET", "ROLLER_CLIENT_ID", "ROLLER_CLIENT_SECRET"];

function str(env: EnvSource, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function list(env: EnvSource, key: string): string[] {
  return (str(env, key) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function int(env: EnvSource, key: string, fallback: number, min: number, max: number): number {
  const raw = str(env, key);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ConfigError(`${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function bool(env: EnvSource, key: string): boolean {
  const raw = str(env, key)?.toLowerCase();
  if (raw === undefined || raw === "false" || raw === "0" || raw === "no") return false;
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  throw new ConfigError(`${key} must be true or false`);
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function publicDemoToken(env: EnvSource): string | undefined {
  const value = str(env, "MCP_PUBLIC_DEMO_TOKEN") ?? DEFAULT_PUBLIC_DEMO_TOKEN;
  return value.toLowerCase() === "none" ? undefined : value;
}

// #region upstream-mode
/**
 * Mock mode serves fictional data, so it is never a silent fallback: the value
 * must be exactly mock or live (any case), and real API credentials or secret
 * bearer tokens require the mode to be set explicitly.
 */
export function parseUpstreamMode(env: EnvSource): UpstreamMode {
  const raw = str(env, "UPSTREAM_MODE");
  const hasCredentials = REAL_CREDENTIAL_KEYS.some((key) => str(env, key) !== undefined);
  if (raw === undefined) {
    if (hasCredentials || str(env, "MCP_BEARER_TOKENS") !== undefined) {
      throw new ConfigError("Set UPSTREAM_MODE to live (or mock for the fictional demo data)");
    }
    return "mock";
  }
  const mode = raw.toLowerCase();
  if (mode !== "mock" && mode !== "live") throw new ConfigError('UPSTREAM_MODE must be "mock" or "live"');
  if (mode === "mock" && hasCredentials) {
    throw new ConfigError("API credentials are set but UPSTREAM_MODE is mock; refusing to serve fictional data");
  }
  return mode;
}
// #endregion upstream-mode

function origin(value: string, key: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");
    return url.origin;
  } catch {
    throw new ConfigError(`${key} must list origins such as https://example.com`);
  }
}

/** Origins the hosting platform says this deployment is served from (Vercel system variables). */
function platformOrigins(env: EnvSource): string[] {
  const out: string[] = [];
  const site = str(env, "NEXT_PUBLIC_SITE_URL");
  if (site) out.push(origin(site, "NEXT_PUBLIC_SITE_URL"));
  for (const key of ["VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL", "VERCEL_BRANCH_URL"]) {
    const host = str(env, key);
    if (host) out.push(origin(`https://${host}`, key));
  }
  return out;
}

export function loadConfig(env: EnvSource): ServerConfig {
  const mode = parseUpstreamMode(env);
  const timezone = str(env, "VENUE_TIMEZONE") ?? "Australia/Brisbane";
  if (!isValidTimeZone(timezone)) throw new ConfigError("VENUE_TIMEZONE is not a valid IANA time zone");

  const workforceBase = (str(env, "CONNECTEAM_API_BASE") ?? "https://api-au.connecteam.com").replace(/\/$/, "");
  const bookingBase = (str(env, "ROLLER_API_BASE") ?? "https://api.roller.app").replace(/\/$/, "");

  const secretTokens = list(env, "MCP_BEARER_TOKENS");
  const credential = (key: string, mockValue: string): string => {
    const value = str(env, key);
    if (value) return value;
    if (mode === "live") throw new ConfigError(`${key} is required when UPSTREAM_MODE=live`);
    return mockValue;
  };

  const config: ServerConfig = {
    mode,
    timezone,
    rateLimitPerMinute: int(env, "RATE_LIMIT_PER_MINUTE", 60, 1, 10_000),
    allowedOrigins: [...new Set([...list(env, "ALLOWED_ORIGINS").map((o) => origin(o, "ALLOWED_ORIGINS")), ...platformOrigins(env)])],
    secretTokens,
    publicDemoToken: mode === "mock" ? publicDemoToken(env) : undefined,
    payRateMinGroupSize: int(env, "PAY_RATE_MIN_GROUP", 3, 1, 50),
    staffExtraFields: list(env, "STAFF_EXTRA_FIELDS"),
    includeTimesheetNotes: bool(env, "INCLUDE_TIMESHEET_NOTES"),
    workforce: {
      baseUrl: workforceBase,
      tokenUrl: str(env, "CONNECTEAM_TOKEN_URL") ?? `${workforceBase}/oauth/v1/token`,
      clientId: credential("CONNECTEAM_CLIENT_ID", MOCK_CREDENTIALS.workforce.clientId),
      clientSecret: credential("CONNECTEAM_CLIENT_SECRET", MOCK_CREDENTIALS.workforce.clientSecret),
    },
    booking: {
      baseUrl: bookingBase,
      tokenUrl: str(env, "ROLLER_TOKEN_URL") ?? `${bookingBase}/token`,
      clientId: credential("ROLLER_CLIENT_ID", MOCK_CREDENTIALS.booking.clientId),
      clientSecret: credential("ROLLER_CLIENT_SECRET", MOCK_CREDENTIALS.booking.clientSecret),
    },
  };

  if (mode === "live") {
    if (secretTokens.length === 0) throw new ConfigError("MCP_BEARER_TOKENS is required when UPSTREAM_MODE=live");
    if (secretTokens.some((t) => t.length < 32)) throw new ConfigError("Each MCP bearer token must be at least 32 characters");
    for (const url of [config.workforce.baseUrl, config.workforce.tokenUrl, config.booking.baseUrl, config.booking.tokenUrl]) {
      if (!url.startsWith("https://")) throw new ConfigError("Upstream URLs must use https in live mode");
    }
  }
  if (secretTokens.length === 0 && !config.publicDemoToken) {
    throw new ConfigError("Set MCP_BEARER_TOKENS (or MCP_PUBLIC_DEMO_TOKEN while upstreams are mocked)");
  }
  return config;
}
