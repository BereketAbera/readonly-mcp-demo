#!/usr/bin/env node
/**
 * Smoke test for a deployment, safe to run against live data: it connects with
 * the official SDK, lists the tools, calls each one once and prints only
 * counts, sizes and timings. Names, amounts and other values are never printed.
 *
 *   node scripts/smoke.mjs https://<worker-host>/mcp --token <secret> [--start YYYY-MM-DD --end YYYY-MM-DD]
 *
 * Without --start/--end it uses the seven days ending yesterday (UTC).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const endpoint = args.find((a) => /^https?:\/\//.test(a)) ?? process.env.MCP_URL;
const token = flag("--token") ?? process.env.MCP_TOKEN;
if (!endpoint || !token) {
  console.error("Usage: node scripts/smoke.mjs <endpoint-url> --token <token> [--start YYYY-MM-DD --end YYYY-MM-DD]");
  process.exit(2);
}

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const start = flag("--start") ?? day(-7);
const end = flag("--end") ?? day(-1);
const range = { start, end };

const CALLS = {
  list_staff: {},
  get_schedules: range,
  get_timesheets: range,
  get_pay_rates: { asOf: end },
  list_bookings: { start: end, end },
  list_products: {},
  get_transactions: range,
  get_revenue_report: range,
  labour_cost_percent: { ...range, groupBy: "day" },
};

/** Array lengths and *Count fields only: shape, never content. */
function shape(data) {
  if (!data || typeof data !== "object") return "no structured content";
  const parts = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) parts.push(`${key}[${value.length}]`);
    else if (typeof value === "number" && /count$/i.test(key)) parts.push(`${key}=${value}`);
  }
  return parts.join(" ") || "no arrays";
}

const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const { tools } = await client.listTools();
console.log(`Connected to ${client.getServerVersion()?.name}; ${tools.length} tools listed; range ${start} to ${end}`);

let failures = 0;
for (const tool of tools) {
  const started = Date.now();
  const result = await client.callTool({ name: tool.name, arguments: CALLS[tool.name] ?? {} });
  const ms = Date.now() - started;
  const bytes = JSON.stringify(result.content ?? []).length;
  if (result.isError) failures += 1;
  // Tool error texts are written by the server to name only the API and status, so they are safe to print.
  const detail = result.isError ? (result.content?.[0]?.text ?? "tool error") : shape(result.structuredContent);
  console.log(`${result.isError ? "FAIL" : "ok  "} ${tool.name.padEnd(20)} ${String(ms).padStart(6)} ms ${String(bytes).padStart(8)} B  ${detail}`);
}
await client.close();
console.log(failures ? `${failures} tool(s) failed.` : "All tools answered.");
process.exit(failures ? 1 : 0);
