import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setLogSink } from "../../src/core/log";
import { buildRuntime, createMcpHttpHandler, handleWithRuntime, type Runtime } from "../../src/mcp/handler";
import { connect, initializeBody, MCP_HEADERS, serve } from "./helpers";

/**
 * Drives the server with the official MCP SDK client over real HTTP.
 * By default it starts the server in-process on a random port. Set
 * MCP_TEST_URL (and MCP_TEST_TOKEN) to run the same checks against a
 * deployment, e.g. `wrangler dev` or production.
 */
const REMOTE = process.env.MCP_TEST_URL;
const TOKEN = process.env.MCP_TEST_TOKEN ?? "lakeside-demo-readonly";

const EXPECTED_TOOLS = [
  "get_pay_rates",
  "get_revenue_report",
  "get_schedules",
  "get_timesheets",
  "get_transactions",
  "labour_cost_percent",
  "list_bookings",
  "list_products",
  "list_staff",
];

const WEEK = { start: "2026-11-16", end: "2026-11-22" };
const CALLS: Record<string, Record<string, unknown>> = {
  list_staff: { includeArchived: true },
  get_schedules: WEEK,
  get_timesheets: { start: "2026-11-09", end: "2026-11-15" },
  get_pay_rates: { asOf: "2026-11-20" },
  list_bookings: { start: "2026-11-21", end: "2026-11-21" },
  list_products: {},
  get_transactions: WEEK,
  get_revenue_report: { ...WEEK, groupBy: "category" },
  labour_cost_percent: { start: "2026-10-26", end: "2026-11-22", groupBy: "week" },
};

let endpoint: string;
let close: (() => Promise<void>) | undefined;
let runtime: Runtime | undefined;
let client: Client;
const logs: string[] = [];
let restoreLogs: () => void = () => undefined;
const results = new Map<string, { isError?: boolean; structuredContent?: Record<string, unknown>; content: unknown }>();

beforeAll(async () => {
  if (REMOTE) {
    endpoint = REMOTE;
  } else {
    restoreLogs = setLogSink((line) => logs.push(line));
    runtime = await buildRuntime({});
    const server = await serve((request) => handleWithRuntime(request, runtime!));
    endpoint = server.url;
    close = server.close;
  }
  client = await connect(endpoint, TOKEN);
  for (const [name, args] of Object.entries(CALLS)) {
    results.set(name, (await client.callTool({ name, arguments: args })) as never);
  }
});

afterAll(async () => {
  await client?.close();
  await close?.();
  restoreLogs();
});

describe("tool surface", () => {
  it("negotiates the current protocol and identifies the server", () => {
    expect(client.getServerVersion()?.name).toBe("lakeside-readonly-mcp");
    expect(client.getServerCapabilities()?.tools).toEqual({ listChanged: false });
    expect(client.getServerCapabilities()?.resources).toBeUndefined();
    expect(client.getServerCapabilities()?.prompts).toBeUndefined();
    expect(client.getInstructions()).toMatch(/Read-only access/);
  });

  it("lists exactly the nine read-only tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
    for (const tool of tools) {
      expect(tool.description?.length, tool.name).toBeGreaterThan(40);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("exposes no write-capable or general-purpose request tool", async () => {
    const { tools } = await client.listTools();
    const writeVerb = /(create|update|delete|remove|insert|upsert|set_|post|put|patch|write|send|cancel|refund|redeem|approve|request|fetch|proxy|http|exec|query|sql)/i;
    for (const tool of tools) {
      expect(tool.name, tool.name).not.toMatch(writeVerb);
      expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
      const props = Object.keys((tool.inputSchema.properties ?? {}) as Record<string, unknown>);
      for (const prop of props) {
        expect(["url", "path", "endpoint", "method", "body", "headers", "query", "data"], `${tool.name}.${prop}`).not.toContain(prop);
      }
    }
  });

  it("documents the date format and range cap in the input schemas", async () => {
    const { tools } = await client.listTools();
    const labour = tools.find((t) => t.name === "labour_cost_percent")!;
    const props = labour.inputSchema.properties as Record<string, { format?: string; enum?: string[]; description?: string }>;
    expect(props.start.format).toBe("date");
    expect(props.end.description).toMatch(/31 days/);
    expect(props.groupBy.enum).toEqual(["day", "week", "department"]);
    expect(labour.inputSchema.required).toEqual(["start", "end"]);
  });
});

describe("calling every tool", () => {
  it("succeeds for each tool against the seeded data", () => {
    expect([...results.keys()].sort()).toEqual(EXPECTED_TOOLS);
    for (const [name, result] of results) {
      expect(result.isError, name).toBeFalsy();
      expect(result.structuredContent, name).toBeTypeOf("object");
      const [text] = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(text.text), name).toEqual(result.structuredContent);
    }
  });

  it("returns staff, rosters, timesheets and aggregated pay", () => {
    const staff = results.get("list_staff")!.structuredContent!;
    expect(staff.count).toBe(19);
    const schedules = results.get("get_schedules")!.structuredContent!;
    expect(schedules.shiftCount).toBeGreaterThan(30);
    const timesheets = results.get("get_timesheets")!.structuredContent!;
    expect(timesheets.unrosteredEntries).toBe(1);
    const pay = results.get("get_pay_rates")!.structuredContent! as { departments: Array<Record<string, unknown>> };
    expect(pay.departments.find((d) => d.department === "Duty manager")).toMatchObject({ withheld: true });
    expect(pay.departments.find((d) => d.department === "Attractions")).toMatchObject({ ratedPositions: 5 });
  });

  it("works out labour cost as a share of revenue and returns its inputs", () => {
    const labour = results.get("labour_cost_percent")!.structuredContent! as {
      totals: { labourCost: number; netRevenue: number; labourPercent: number; paidHours: number };
      rows: Array<{ labourCost: number; netRevenue: number }>;
      inputs: { timesheets: { shiftsCounted: number }; revenue: { entries: number; netRevenue: number } };
    };
    expect(labour.rows).toHaveLength(4);
    expect(labour.totals.labourPercent).toBeCloseTo((labour.totals.labourCost / labour.totals.netRevenue) * 100, 1);
    expect(labour.totals.labourPercent).toBeGreaterThan(25);
    expect(labour.totals.labourPercent).toBeLessThan(40);
    const rowCost = labour.rows.reduce((s, r) => s + Math.round(r.labourCost * 100), 0) / 100;
    const rowRevenue = labour.rows.reduce((s, r) => s + Math.round(r.netRevenue * 100), 0) / 100;
    expect(rowCost).toBeCloseTo(labour.totals.labourCost, 2);
    expect(rowRevenue).toBeCloseTo(labour.totals.netRevenue, 2);
    expect(labour.inputs.timesheets.shiftsCounted).toBeGreaterThan(150);
    expect(labour.inputs.revenue.netRevenue).toBe(labour.totals.netRevenue);
  });

  it("never returns contact, birth, address, bank, card or medical details", () => {
    const all = JSON.stringify([...results.values()].map((r) => r.content));
    for (const needle of ["@", "0491", "+61", "phoneNumber", "email", "Example Street", "BSB", "kioskCode", "dateOfBirth", "creditCard", "pi_", "Nut allergy", "Medical"]) {
      expect(all, needle).not.toContain(needle);
    }
  });

  it("shows only that a timesheet has a note, not the note itself", async () => {
    const result = await client.callTool({ name: "get_timesheets", arguments: { start: "2026-11-14", end: "2026-11-14" } });
    const text = JSON.stringify(result.structuredContent);
    expect(text).toContain('"hasNote":true');
    expect(text).not.toContain("Text me");
  });

  it("marks every result as mock data", () => {
    for (const [name, result] of results) {
      expect(result.structuredContent?.dataSource, name).toBe("mock (fictional demo data)");
    }
  });
});

describe("input validation", () => {
  it("rejects ranges over 31 days", async () => {
    const result = await client.callTool({ name: "list_bookings", arguments: { start: "2026-10-01", end: "2026-11-22" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/limited to 31 days/);
  });

  it("rejects malformed dates and unknown enum values", async () => {
    const bad = await client.callTool({ name: "get_revenue_report", arguments: { start: "21/11/2026", end: "2026-11-22" } });
    expect(bad.isError).toBe(true);
    const enumBad = await client.callTool({ name: "labour_cost_percent", arguments: { start: "2026-11-16", end: "2026-11-22", groupBy: "staff" } });
    expect(enumBad.isError).toBe(true);
  });

  it("has no tool for writes: calling one fails", async () => {
    const result = await client.callTool({ name: "delete_booking", arguments: { bookingReference: "5020001" } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/not found/i);
  });
});

describe("HTTP boundary", () => {
  it("returns 401 without a token", async () => {
    const res = await fetch(endpoint, { method: "POST", headers: MCP_HEADERS, body: initializeBody() });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer/);
  });

  it("returns 401 with a wrong token, and the SDK client cannot connect", async () => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { ...MCP_HEADERS, authorization: "Bearer not-the-right-token-123" },
      body: initializeBody(),
    });
    expect(res.status).toBe(401);
    await expect(connect(endpoint, "not-the-right-token-123")).rejects.toThrow();
  });

  it("answers GET and DELETE with 405 (stateless server, POST only)", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await fetch(endpoint, { method, headers: { authorization: `Bearer ${TOKEN}`, accept: "text/event-stream" } });
      expect(res.status, method).toBe(405);
    }
  });

  it("rejects JSON-RPC batches with 400", async () => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { ...MCP_HEADERS, authorization: `Bearer ${TOKEN}`, "mcp-protocol-version": "2025-11-25" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]),
    });
    expect(res.status).toBe(400);
  });

  it("rejects browser requests from other origins with 403", async () => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { ...MCP_HEADERS, authorization: `Bearer ${TOKEN}`, origin: "https://attacker.example" },
      body: initializeBody(),
    });
    expect(res.status).toBe(403);
  });
});

describe.skipIf(Boolean(REMOTE))("in-process guarantees", () => {
  it("sent only GET requests upstream (plus the two OAuth token POSTs), and reused cached tokens", () => {
    const stats = runtime!.upstreams.mock!.stats;
    const nonGet = stats.calls.filter((c) => c.method !== "GET");
    expect(nonGet.every((c) => c.method === "POST" && ["/oauth/v1/token", "/token"].includes(c.path))).toBe(true);
    expect(stats.tokenRequests).toEqual({ workforce: 1, booking: 1 });
    expect(stats.calls.length).toBeGreaterThan(50);
  });

  it("throws on any non-GET upstream call", async () => {
    const { upstreams } = runtime!;
    await expect(upstreams.fetch("https://api.roller.app/bookings", { method: "POST", body: "{}" })).rejects.toThrow(/read-only/);
    await expect(upstreams.fetch("https://api-au.connecteam.com/users/v1/users", { method: "DELETE" })).rejects.toThrow(/read-only/);
    await expect(upstreams.fetch("https://api-au.connecteam.com/pay-rates/v1/pay-rates", { method: "PUT", body: "{}" })).rejects.toThrow(/read-only/);
    const send = (upstreams.clients.workforce as unknown as { send: (...a: unknown[]) => Promise<unknown> }).send.bind(upstreams.clients.workforce);
    await expect(send("PATCH", new URL("https://api-au.connecteam.com/users/v1/users"), {}, false)).rejects.toThrow(/read-only/);
  });

  it("logs tool calls without personal data", () => {
    const toolLogs = logs.filter((l) => l.includes('"tool_call"'));
    expect(toolLogs.length).toBeGreaterThanOrEqual(9);
    const joined = logs.join("\n");
    for (const needle of ["Priya", "Raman", "@", "0491", "lakeside-demo-readonly", "Bearer"]) {
      expect(joined, needle).not.toContain(needle);
    }
    expect(JSON.parse(toolLogs[0])).toMatchObject({ event: "tool_call", ok: true });
  });

  it("rate-limits each token", async () => {
    const handler = createMcpHttpHandler({ RATE_LIMIT_PER_MINUTE: "3" });
    const send = () =>
      handler(
        new Request("http://127.0.0.1/mcp", {
          method: "POST",
          headers: { ...MCP_HEADERS, authorization: `Bearer ${TOKEN}` },
          body: initializeBody(),
        }),
      );
    for (let i = 0; i < 3; i += 1) expect((await send()).status).toBe(200);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
