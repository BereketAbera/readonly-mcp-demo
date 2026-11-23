#!/usr/bin/env node
/**
 * Runs a real MCP client session against a deployed server and prints a
 * plain-text transcript: initialize, tools/list, then one tools/call.
 *
 *   node scripts/client-session.mjs https://example.com/mcp [--token T] [--out file.txt]
 */
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PUBLIC_TOKEN = "lakeside-demo-readonly";
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const endpoint = args.find((a) => /^https?:\/\//.test(a)) ?? process.env.MCP_URL;
const token = flag("--token") ?? process.env.MCP_TOKEN ?? PUBLIC_TOKEN;
const out = flag("--out");
if (!endpoint) {
  console.error("Usage: node scripts/client-session.mjs <endpoint-url> [--token T] [--out file]");
  process.exit(2);
}

const lines = [];
const log = (line = "") => {
  lines.push(line);
  console.log(line);
};

// Wrap fetch to record each HTTP exchange the SDK makes (method, JSON-RPC method, status, size).
let exchange = 0;
async function recordingFetch(input, init) {
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  const started = Date.now();
  const res = await fetch(input, init);
  const text = await res.clone().text();
  exchange += 1;
  const path = new URL(String(input)).pathname;
  const type = res.headers.get("content-type") ?? "no body";
  log(
    `  HTTP #${exchange}: ${init?.method ?? "GET"} ${path} ${body?.method ?? ""} -> ${res.status} ${type}, ${text.length} bytes, ${Date.now() - started} ms`,
  );
  return res;
}

log("MCP client session transcript");
log("=============================");
log(`Date (UTC):  ${new Date().toISOString()}`);
log(`Endpoint:    ${endpoint}`);
log("Client:      @modelcontextprotocol/sdk Client with StreamableHTTPClientTransport");
log(`Auth header: Authorization: Bearer ${token === PUBLIC_TOKEN ? `${token} (public demo token, fictional data)` : "<secret, not shown>"}`);
log();

const client = new Client({ name: "transcript-client", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
  fetch: recordingFetch,
});

log("1. initialize");
await client.connect(transport);
const info = client.getServerVersion();
log(`  Server:       ${info?.name} ${info?.version}`);
log(`  Title:        ${info?.title ?? ""}`);
log(`  Protocol:     ${transport.protocolVersion ?? "(negotiated)"}`);
log(`  Capabilities: ${JSON.stringify(client.getServerCapabilities())}`);
log(`  Instructions: ${client.getInstructions()}`);
log();

log("2. tools/list");
const { tools } = await client.listTools();
for (const tool of tools) {
  const a = tool.annotations ?? {};
  const required = tool.inputSchema.required?.join(", ") || "none";
  log(`  - ${tool.name.padEnd(20)} readOnlyHint=${a.readOnlyHint} destructiveHint=${a.destructiveHint} required: ${required}`);
}
log(`  ${tools.length} tools listed.`);
log();

const call = { name: "labour_cost_percent", arguments: { start: "2026-10-26", end: "2026-11-22", groupBy: "week" } };
log(`3. tools/call ${call.name} ${JSON.stringify(call.arguments)}`);
const result = await client.callTool(call);
const data = result.structuredContent;
log(`  isError: ${Boolean(result.isError)}`);
if (data) {
  const t = data.totals;
  log(`  Totals: labour cost $${t.labourCost} / net revenue $${t.netRevenue} = ${t.labourPercent}%`);
  for (const row of data.rows) {
    log(`    ${row.label.padEnd(16)} labour $${String(row.labourCost).padStart(9)}   revenue $${String(row.netRevenue).padStart(9)}   ${row.labourPercent}%`);
  }
  log("  Full structuredContent:");
  for (const l of JSON.stringify(data, null, 2).split("\n")) log(`    ${l}`);
}
log();

await client.close();
log("Session closed.");
log();
log("Notes");
log("  - Every response is plain JSON: the server runs the Streamable HTTP transport statelessly.");
log("  - The SDK also tries GET /mcp to open an optional server-to-client stream; this server has none");
log("    and answers 405, which the MCP spec allows. That request can land between the calls above.");

if (out) writeFileSync(out, `${lines.join("\n")}\n`);
