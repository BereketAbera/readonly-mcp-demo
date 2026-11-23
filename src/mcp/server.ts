import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import type { UpstreamMode } from "../core/config";
import { MAX_RANGE_DAYS } from "../core/dates";
import { logEvent } from "../core/log";
import { redactDeep } from "../core/redact";
import { SEED_END, SEED_START, VENUE_NAME } from "../mock/seed";
import { TOOLS, type ToolContext, type ToolDefinition } from "../tools/catalog";
import { UpstreamAuthError, UpstreamHttpError, UpstreamPolicyError } from "../upstream/http";

export const SERVER_INFO = {
  name: "lakeside-readonly-mcp",
  title: `${VENUE_NAME}: read-only operations data`,
  version: "1.0.0",
};

export function serverInstructions(mode: UpstreamMode, timezone: string): string {
  return [
    `Read-only access to workforce data (staff, rosters, timesheets, pay rates) and booking data (bookings, products, payments, revenue) for ${VENUE_NAME}, a single-venue entertainment business.`,
    `Dates are venue-local (${timezone}) in YYYY-MM-DD form; ranges are inclusive and limited to ${MAX_RANGE_DAYS} days per call. Amounts are AUD.`,
    "Phone numbers, email addresses, home addresses, dates of birth and bank or card details are never returned.",
    mode === "mock" ? `This is a demo with mocked upstream APIs and fictional data covering ${SEED_START} to ${SEED_END}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function publicMessage(error: unknown): string {
  if (error instanceof UpstreamHttpError) return `${error.message}. Please try again shortly.`;
  if (error instanceof UpstreamAuthError) return "The server could not authenticate with an upstream API.";
  if (error instanceof UpstreamPolicyError) return `Blocked by the read-only policy: ${error.message}`;
  return "The tool failed unexpectedly. The failure was logged without request data.";
}

async function runTool(tool: ToolDefinition, args: unknown, ctx: ToolContext, tokenId?: string): Promise<CallToolResult> {
  const started = Date.now();
  const range = args as { start?: unknown; end?: unknown };
  try {
    const raw = await tool.run(args, ctx);
    const safe = redactDeep(raw);
    logEvent("tool_call", {
      tool: tool.name,
      ok: true,
      ms: Date.now() - started,
      token: tokenId,
      start: typeof range?.start === "string" ? range.start : undefined,
      end: typeof range?.end === "string" ? range.end : undefined,
    });
    return { content: [{ type: "text", text: JSON.stringify(safe) }], structuredContent: safe };
  } catch (error) {
    logEvent("tool_call", {
      tool: tool.name,
      ok: false,
      ms: Date.now() - started,
      token: tokenId,
      error: error instanceof Error ? error.name : "Error",
      status: error instanceof UpstreamHttpError ? error.status : undefined,
    });
    return { isError: true, content: [{ type: "text", text: publicMessage(error) }] };
  }
}

// #region tool-registration
/** Every tool is declared read-only, non-destructive and idempotent. */
export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function createMcpServer(ctx: ToolContext, options: { mode: UpstreamMode; tokenId?: string }): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: { listChanged: false } },
    instructions: serverInstructions(options.mode, ctx.timezone),
    jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
  });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { title: tool.title, ...READ_ONLY_ANNOTATIONS },
      },
      (args: unknown) => runTool(tool, args, ctx, options.tokenId),
    );
  }
  return server;
}
// #endregion tool-registration
