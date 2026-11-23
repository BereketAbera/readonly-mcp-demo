import { describe, expect, it } from "vitest";
import { buildRuntime, handleWithRuntime, isAllowedOrigin } from "../../src/mcp/handler";

const TOKEN = "lakeside-demo-readonly";
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${TOKEN}` };
const LIST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

function post(url: string, body: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers: { ...HEADERS, ...headers }, body });
}

describe("origin check", () => {
  const allowed = ["https://readonly-mcp-demo.vercel.app"];
  const site = new URL("https://readonly-mcp-demo.vercel.app/mcp");

  it("accepts only origins on the configured list", () => {
    expect(isAllowedOrigin("https://readonly-mcp-demo.vercel.app", site, allowed)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", site, allowed)).toBe(false);
    expect(isAllowedOrigin("null", site, allowed)).toBe(false);
  });

  it("never trusts the request's own host, so DNS rebinding fails", () => {
    // A rebinding page and its request share the attacker's hostname.
    const rebound = new URL("http://rebind.attacker.example:3202/mcp");
    expect(isAllowedOrigin("http://rebind.attacker.example:3202", rebound, allowed)).toBe(false);
  });

  it("allows a page on the same loopback address and port, for local development", () => {
    const local = new URL("http://127.0.0.1:3202/mcp");
    expect(isAllowedOrigin("http://127.0.0.1:3202", local, [])).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", local, [])).toBe(false);
  });

  it("ignores X-Forwarded-Host when deciding", async () => {
    const rt = await buildRuntime({});
    const res = await handleWithRuntime(
      post("https://readonly-mcp-demo.vercel.app/mcp", LIST, { origin: "https://evil.example", "x-forwarded-host": "evil.example" }),
      rt,
    );
    expect(res.status).toBe(403);
  });
});

describe("request body", () => {
  it("rejects JSON-RPC batches with 400, so one request cannot run many tool calls", async () => {
    const rt = await buildRuntime({});
    const call = { jsonrpc: "2.0", method: "tools/call", params: { name: "list_products", arguments: {} } };
    const res = await handleWithRuntime(post("http://127.0.0.1/mcp", JSON.stringify([{ ...call, id: 1 }, { ...call, id: 2 }])), rt);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: -32600, message: expect.stringMatching(/Batch requests are not supported/) } });
  });

  it("rejects bodies over 64 KB with 413 and still answers single messages", async () => {
    const rt = await buildRuntime({});
    expect((await handleWithRuntime(post("http://127.0.0.1/mcp", "x".repeat(70_000)), rt)).status).toBe(413);
    expect((await handleWithRuntime(post("http://127.0.0.1/mcp", LIST), rt)).status).toBe(200);
  });
});

describe("rate limit on the shared demo token", () => {
  it("is counted per visitor, so one visitor cannot lock out the rest", async () => {
    const rt = await buildRuntime({ RATE_LIMIT_PER_MINUTE: "2" });
    const from = (ip: string) => handleWithRuntime(post("http://127.0.0.1/mcp", LIST, { "x-real-ip": ip }), rt);
    expect((await from("203.0.113.7")).status).toBe(200);
    expect((await from("203.0.113.7")).status).toBe(200);
    expect((await from("203.0.113.7")).status).toBe(429);
    expect((await from("198.51.100.4")).status).toBe(200);
  });

  it("is counted per token for secret tokens", async () => {
    const secret = "s".repeat(64);
    const rt = await buildRuntime({ UPSTREAM_MODE: "mock", MCP_BEARER_TOKENS: secret, RATE_LIMIT_PER_MINUTE: "1" });
    const from = (ip: string) => handleWithRuntime(post("http://127.0.0.1/mcp", LIST, { authorization: `Bearer ${secret}`, "x-real-ip": ip }), rt);
    expect((await from("203.0.113.7")).status).toBe(200);
    expect((await from("198.51.100.4")).status).toBe(429);
  });
});
