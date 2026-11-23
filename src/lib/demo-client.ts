import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { buildRuntime, type Runtime } from "@/mcp/handler";
import { createMcpServer } from "@/mcp/server";

/**
 * The demo pages talk to the same MCP server through an in-memory transport
 * (no HTTP hop at build time). They always read the mocked upstreams.
 */
let runtime: Promise<Runtime> | undefined;

async function withDemoClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  runtime ??= buildRuntime({ UPSTREAM_MODE: "mock" });
  const rt = await runtime;
  const server = createMcpServer(rt.ctx, { mode: "mock" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "demo-pages", version: "1.0.0" });
  await client.connect(clientSide);
  try {
    return await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

export function listDemoTools(): Promise<{ tools: Tool[]; instructions?: string; serverName?: string }> {
  return withDemoClient(async (client) => {
    const { tools } = await client.listTools();
    return { tools, instructions: client.getInstructions(), serverName: client.getServerVersion()?.name };
  });
}

export function callDemoTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  return withDemoClient(async (client) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`Tool ${name} returned an error`);
    return result.structuredContent as T;
  });
}

export interface LabourRow {
  key: string;
  label: string;
  paidHours: number;
  labourCost: number;
  netRevenue: number | null;
  labourPercent: number | null;
  shareOfLabourCost: number;
}

export interface LabourResult {
  range: { start: string; end: string; timezone: string };
  groupBy: "day" | "week" | "department";
  totals: { paidHours: number; labourCost: number; netRevenue: number; labourPercent: number | null };
  rows: LabourRow[];
  inputs: {
    timesheets: { source: string; shiftsCounted: number; shiftsWithoutRate: number; paidHours: number; unpaidBreakHours: number };
    payRates: { source: string; basis: string; onCostPercent: number };
    revenue: { source: string; basis: string; entries: number; netRevenue: number; gst: number };
    labourByDepartment: Array<{ department: string; paidHours: number; labourCost: number }>;
  };
  formula: string;
  assumptions: string[];
  warnings: string[];
}

export function labour(start: string, end: string, groupBy: LabourResult["groupBy"]): Promise<LabourResult> {
  return callDemoTool<LabourResult>("labour_cost_percent", { start, end, groupBy });
}
