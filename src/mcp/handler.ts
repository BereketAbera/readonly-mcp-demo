import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { acceptedToken, verifyBearer, type AcceptedToken } from "../core/auth";
import { ConfigError, loadConfig, type EnvSource, type ServerConfig } from "../core/config";
import { localDate } from "../core/dates";
import { logEvent } from "../core/log";
import { MemoryRateLimiter, WorkersRateLimiter, type RateLimiter, type WorkersRateLimitBinding } from "../core/rate-limit";
import type { ToolContext } from "../tools/catalog";
import type { FetchLike } from "../upstream/http";
import { SEED_END, SEED_START } from "../mock/seed";
import { createUpstreams, type Upstreams } from "../upstream/index";
import { createMcpServer } from "./server";

/**
 * Framework-neutral MCP endpoint: takes a web-standard Request and returns a
 * Response, so the same code serves a Cloudflare Worker and a Next.js route.
 *
 * Order of checks: Origin -> bearer token -> method -> rate limit -> body
 * (size, single message) -> MCP.
 */

export interface HandlerOptions {
  /** Network fetch for live upstreams (tests inject one). */
  upstreamFetch?: FetchLike;
  /** Cloudflare Workers Rate Limiting binding, when configured. */
  rateLimitBinding?: WorkersRateLimitBinding;
  now?: () => number;
}

export interface Runtime {
  config: ServerConfig;
  tokens: AcceptedToken[];
  limiter: RateLimiter;
  upstreams: Upstreams;
  ctx: ToolContext;
}

const MAX_BODY_BYTES = 64 * 1024;

function jsonRpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Browser requests must come from an origin on the configured list (this
 * site's own origins and ALLOWED_ORIGINS). Request headers such as Host or
 * X-Forwarded-Host are never trusted for this. The one exception is local
 * development: a page served from the same loopback address and port. A
 * DNS-rebinding page always carries the attacker's hostname, never a loopback
 * name, so it cannot match.
 */
export function isAllowedOrigin(origin: string, url: URL, allowed: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (allowed.includes(parsed.origin)) return true;
  return LOOPBACK_HOSTS.has(parsed.hostname) && LOOPBACK_HOSTS.has(url.hostname) && parsed.port === url.port;
}

/** The address the platform says the request came from (set by Cloudflare or Vercel, not the client). */
function clientAddress(request: Request): string {
  const h = request.headers;
  return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Reads the body up to `limit` bytes; returns undefined when it is larger. */
async function readBody(request: Request, limit: number): Promise<string | undefined> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return undefined;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function buildRuntime(env: EnvSource, options: HandlerOptions = {}): Promise<Runtime> {
  const config = loadConfig(env);
  const tokens = await Promise.all([
    ...config.secretTokens.map((t) => acceptedToken(t, "secret")),
    ...(config.publicDemoToken ? [acceptedToken(config.publicDemoToken, "public-demo")] : []),
  ]);
  const limiter: RateLimiter = options.rateLimitBinding
    ? new WorkersRateLimiter(options.rateLimitBinding, 60)
    : new MemoryRateLimiter(config.rateLimitPerMinute, 60_000, options.now);
  const upstreams = createUpstreams(config, { fetch: options.upstreamFetch, now: options.now });
  const ctx: ToolContext = {
    workforce: upstreams.workforce,
    booking: upstreams.booking,
    timezone: config.timezone,
    payRateMinGroupSize: config.payRateMinGroupSize,
    staffExtraFields: config.staffExtraFields,
    includeTimesheetNotes: config.includeTimesheetNotes,
    coverage: config.mode === "mock" ? { start: SEED_START, end: SEED_END } : undefined,
    today: () => localDate(Math.floor((options.now ?? Date.now)() / 1000), config.timezone),
  };
  return { config, tokens, limiter, upstreams, ctx };
}

export async function handleWithRuntime(request: Request, rt: Runtime): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);

  // #region request-gate
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin, url, rt.config.allowedOrigins)) {
    logEvent("origin_rejected", { method: request.method });
    return jsonRpcError(403, -32000, "Origin not allowed");
  }

  const auth = await verifyBearer(request.headers.get("authorization"), rt.tokens);
  if (!auth.ok) {
    logEvent("auth_rejected", { reason: auth.reason, method: request.method });
    return jsonRpcError(401, -32001, "Missing or invalid bearer token", {
      "www-authenticate": 'Bearer realm="mcp"',
    });
  }

  if (request.method !== "POST") {
    // Stateless server: no SSE stream to open (GET) and no session to end (DELETE).
    return jsonRpcError(405, -32000, "Method not allowed. Send MCP messages with POST.", {
      allow: "POST",
    });
  }

  // A secret token is one connector's quota. The shared public demo token is
  // limited per visitor as well, so one visitor cannot use it up for everyone.
  const limitKey = auth.kind === "public-demo" ? `${auth.tokenId}:${clientAddress(request)}` : auth.tokenId;
  const decision = await rt.limiter.check(limitKey);
  if (!decision.allowed) {
    logEvent("rate_limited", { token: auth.tokenId });
    return jsonRpcError(429, -32000, "Rate limit exceeded for this token", {
      "retry-after": String(decision.retryAfter),
    });
  }

  const body = await readBody(request, MAX_BODY_BYTES);
  if (body === undefined) return jsonRpcError(413, -32000, "Request body is larger than 64 KB");
  // JSON-RPC batches were removed from MCP in 2025-06-18. One message per POST
  // also means the rate limit above counts every tool call.
  if (Array.isArray(parseJson(body))) {
    logEvent("batch_rejected", { token: auth.tokenId });
    return jsonRpcError(400, -32600, "Batch requests are not supported. Send one JSON-RPC message per POST.");
  }
  // #endregion request-gate

  const server = createMcpServer(rt.ctx, { mode: rt.config.mode, tokenId: auth.tokenId });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MAX_BODY_BYTES,
  });
  try {
    await server.connect(transport);
    const forwarded = new Headers(request.headers);
    forwarded.delete("content-length");
    const response = await transport.handleRequest(new Request(request.url, { method: "POST", headers: forwarded, body }));
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-content-type-options", "nosniff");
    logEvent("mcp_request", { status: response.status, token: auth.tokenId, ms: Date.now() - started });
    return new Response(response.body, { status: response.status, headers });
  } finally {
    await server.close().catch(() => undefined);
  }
}

/** Builds a handler bound to one environment (one runtime: token cache, rate limiter, upstream clients). */
export function createMcpHttpHandler(env: EnvSource, options: HandlerOptions = {}): (request: Request) => Promise<Response> {
  let runtime: Promise<Runtime> | undefined;
  return async (request) => {
    let rt: Runtime;
    try {
      runtime ??= buildRuntime(env, options);
      rt = await runtime;
    } catch (error) {
      runtime = undefined;
      logEvent("config_error", { error: error instanceof ConfigError ? error.message : "Unexpected configuration error" });
      return jsonRpcError(500, -32603, "Server is not configured");
    }
    return handleWithRuntime(request, rt);
  };
}

const ENV_KEYS = [
  "UPSTREAM_MODE",
  "VENUE_TIMEZONE",
  "MCP_BEARER_TOKENS",
  "MCP_PUBLIC_DEMO_TOKEN",
  "RATE_LIMIT_PER_MINUTE",
  "ALLOWED_ORIGINS",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "PAY_RATE_MIN_GROUP",
  "STAFF_EXTRA_FIELDS",
  "INCLUDE_TIMESHEET_NOTES",
  "CONNECTEAM_API_BASE",
  "CONNECTEAM_TOKEN_URL",
  "CONNECTEAM_CLIENT_ID",
  "CONNECTEAM_CLIENT_SECRET",
  "ROLLER_API_BASE",
  "ROLLER_TOKEN_URL",
  "ROLLER_CLIENT_ID",
  "ROLLER_CLIENT_SECRET",
];

let shared: { key: string; handler: (request: Request) => Promise<Response> } | undefined;

/** Process-wide handler reused across requests so token caches and rate limits persist. */
export function handleMcpRequest(request: Request, env: EnvSource, options: HandlerOptions = {}): Promise<Response> {
  const key = JSON.stringify(ENV_KEYS.map((k) => (typeof env[k] === "string" ? env[k] : null)));
  if (!shared || shared.key !== key) shared = { key, handler: createMcpHttpHandler(env, options) };
  return shared.handler(request);
}
