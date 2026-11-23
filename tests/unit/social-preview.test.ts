import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { buildRuntime } from "../../src/mcp/handler";
import { createMcpServer } from "../../src/mcp/server";
import { SEED_END, SEED_START } from "../../src/mock/seed";

// src/app/opengraph-image.png is drawn by design/build.sh with a fixed labour figure,
// written into the image's alt text at the same time. This fails if the demo data moves.
it("the social preview shows the labour figure the demo data gives", async () => {
  const rt = await buildRuntime({});
  const server = createMcpServer(rt.ctx, { mode: rt.config.mode });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "unit", version: "1.0.0" });
  await client.connect(clientSide);
  const result = await client.callTool({ name: "labour_cost_percent", arguments: { start: SEED_START, end: SEED_END, groupBy: "week" } });
  const { totals } = result.structuredContent as { totals: { labourPercent: number } };
  const alt = readFileSync(path.join(__dirname, "../../src/app/opengraph-image.alt.txt"), "utf8");
  expect(alt).toContain(`labour cost at ${totals.labourPercent.toFixed(1)}% of net revenue`);
});
