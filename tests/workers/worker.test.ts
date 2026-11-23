import { env, SELF } from "cloudflare:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";

/** These tests run inside workerd, the Cloudflare Workers runtime, with the bindings from wrangler.toml. */

const BASE = "https://mcp.example.test";
const TOKEN = "lakeside-demo-readonly";

async function connect(): Promise<Client> {
  const client = new Client({ name: "workerd-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
      fetch: (input, init) => SELF.fetch(input, init),
    }),
  );
  return client;
}

describe("Cloudflare Worker", () => {
  it("serves a health check", async () => {
    const res = await SELF.fetch(`${BASE}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", mcpEndpoint: "/mcp" });
  });

  it("reads its configuration from wrangler.toml bindings", () => {
    expect(env.UPSTREAM_MODE).toBe("mock");
    expect(env.VENUE_TIMEZONE).toBe("Australia/Brisbane");
    expect(typeof (env as unknown as { MCP_RATE_LIMITER?: { limit: unknown } }).MCP_RATE_LIMITER?.limit).toBe("function");
  });

  it("rejects requests without a valid bearer token", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
    expect((await SELF.fetch(`${BASE}/mcp`, { method: "POST", headers, body })).status).toBe(401);
    const wrong = await SELF.fetch(`${BASE}/mcp`, { method: "POST", headers: { ...headers, authorization: "Bearer wrong-token-000" }, body });
    expect(wrong.status).toBe(401);
  });

  it("runs the MCP server in workerd: list tools and call one", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);

    const result = await client.callTool({
      name: "labour_cost_percent",
      arguments: { start: "2026-11-16", end: "2026-11-22", groupBy: "day" },
    });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { rows: unknown[]; totals: { labourPercent: number } };
    expect(data.rows).toHaveLength(7);
    expect(data.totals.labourPercent).toBeGreaterThan(20);

    const staff = await client.callTool({ name: "list_staff", arguments: {} });
    expect(JSON.stringify(staff.content)).not.toContain("@");
    await client.close();
  });
});
