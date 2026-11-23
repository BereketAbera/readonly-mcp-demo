declare namespace Cloudflare {
  interface Env {
    UPSTREAM_MODE: string;
    VENUE_TIMEZONE: string;
    RATE_LIMIT_PER_MINUTE: string;
    MCP_PUBLIC_DEMO_TOKEN: string;
    MCP_RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  }
}
