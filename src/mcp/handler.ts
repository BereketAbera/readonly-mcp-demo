import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { acceptedToken, verifyBearer, type AcceptedToken } from "../core/auth";
import { ConfigError, loadConfig, type EnvSource, type ServerConfig } from "../core/config";
import { localDate } from "../core/dates";
import { logEvent } from "../core/log";
import { MemoryRateLimiter, WorkersRateLimiter, type RateLimiter, type WorkersRateLimitBinding } from "../core/rate-limit";
import type { ToolContext } from "../tools/catalog";
import type { FetchLike } from "../upstream/http";
import { createUpstreams, type Upstreams } from "../upstream/index";
import { createMcpServer } from "./server";

/**
 * Framework-neutral MCP endpoint: takes a web-standard Request and returns a
 * Response, so the same code serves a Cloudflare Worker and a Next.js route.
 *
 * Order of checks: Origin -> bearer token -> method -> rate limit -> MCP.
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

/**
 * Browser requests must come from this site (or a configured origin). The host
 * is compared, not the scheme, because TLS often ends at a proxy in front of us.
 */
function isAllowedOrigin(origin: string, request: Request, url: URL, allowed: readonly string[]): boolean {
  if (allowed.includes(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [url.host, request.headers.get("host"), request.headers.get("x-forwarded-host")];
  return hosts.some((h) => h !== null && h.toLowerCase() === originHost.toLowerCase());
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
    today: () => localDate(Math.floor((options.now ?? Date.now)() / 1000), config.timezone),
  };
  return { config, tokens, limiter, upstreams, ctx };
}

export async function handleWithRuntime(request: Request, rt: Runtime): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);

  // #region request-gate
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin, request, url, rt.config.allowedOrigins)) {
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

  const decision = await rt.limiter.check(auth.tokenId);
  if (!decision.allowed) {
    logEvent("rate_limited", { token: auth.tokenId });
    return jsonRpcError(429, -32000, "Rate limit exceeded for this token", {
      "retry-after": String(decision.retryAfter),
    });
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
    const response = await transport.handleRequest(request);
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
  "PAY_RATE_MIN_GROUP",
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
