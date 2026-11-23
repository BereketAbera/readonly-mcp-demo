import type { WorkersRateLimitBinding } from "./core/rate-limit";
import { handleMcpRequest } from "./mcp/handler";

/**
 * Cloudflare Workers entry point. Configuration arrives as bindings:
 * plain vars from wrangler.toml and secrets from `wrangler secret put`.
 */
interface Env {
  [key: string]: unknown;
  MCP_RATE_LIMITER?: WorkersRateLimitBinding;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return handleMcpRequest(request, env, { rateLimitBinding: env.MCP_RATE_LIMITER });
    }
    if (url.pathname === "/" || url.pathname === "/healthz") {
      return Response.json(
        { name: "lakeside-readonly-mcp", status: "ok", mcpEndpoint: "/mcp", transport: "streamable-http" },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
