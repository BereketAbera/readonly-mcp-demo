import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { setLogSink } from "../../src/core/log";
import { newReport, redactDeep } from "../../src/core/redact";
import { buildRuntime, type Runtime } from "../../src/mcp/handler";
import { createMcpServer } from "../../src/mcp/server";
import { SEED_END, SEED_START } from "../../src/mock/seed";
import { TOOLS, type ToolContext } from "../../src/tools/catalog";
import type { BookingApi } from "../../src/upstream/booking";

type Result = { isError?: boolean; structuredContent?: Record<string, unknown>; content: unknown };

async function connect(rt: Runtime, ctx: ToolContext = rt.ctx) {
  const server = createMcpServer(ctx, { mode: rt.config.mode });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "unit", version: "1.0.0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as Result;
  return { client, call };
}

const FULL = { start: SEED_START, end: SEED_END };

describe("aggregates keyed by data are arrays", () => {
  it("payment totals by method include card payments and add up to the total taken", async () => {
    const { call } = await connect(await buildRuntime({}));
    for (const range of [{ start: "2026-11-21", end: "2026-11-22" }, { start: SEED_START, end: "2026-11-25" }]) {
      const data = (await call("get_transactions", range)).structuredContent as {
        paymentCount: number;
        totalTaken: number;
        byMethod: Array<{ method: string; count: number; amount: number }>;
      };
      expect(data.byMethod.map((m) => m.method).sort()).toEqual(["Cash", "Credit card", "EFTPOS"]);
      expect(data.byMethod.reduce((s, m) => s + m.count, 0)).toBe(data.paymentCount);
      const sum = data.byMethod.reduce((s, m) => s + Math.round(m.amount * 100), 0) / 100;
      expect(sum).toBe(data.totalTaken);
    }
  });

  it("a product category named Birthday parties survives redaction", async () => {
    const { call } = await connect(await buildRuntime({}));
    const bookings = (await call("list_bookings", { start: "2026-11-21", end: "2026-11-21" })).structuredContent as {
      itemsByCategory: Array<{ category: string; items: number }>;
      byStatus: Array<{ status: string; bookings: number }>;
      bookingCount: number;
    };
    expect(bookings.itemsByCategory.map((c) => c.category)).toContain("Birthday parties");
    expect(bookings.byStatus.reduce((s, x) => s + x.bookings, 0)).toBe(bookings.bookingCount);
  });

  it("a department or category named like a contact field is kept as well", async () => {
    const rt = await buildRuntime({});
    const products = await rt.ctx.booking.listProducts();
    const renamed = products.map((p) => (p.reportingCategoryName === "Café" ? { ...p, reportingCategoryName: "Mobile app orders" } : p));
    const booking = Object.create(rt.ctx.booking) as BookingApi;
    booking.listProducts = async () => renamed;
    const { call } = await connect(rt, { ...rt.ctx, booking });
    const report = (await call("get_revenue_report", { start: "2026-11-16", end: "2026-11-22", groupBy: "category" })).structuredContent as {
      rows: Array<{ key: string }>;
    };
    expect(report.rows.map((r) => r.key)).toContain("Mobile app orders");
  });

  it("no tool output depends on key redaction: the second layer removes nothing", async () => {
    const rt = await buildRuntime({});
    const args: Record<string, Record<string, unknown>> = {
      list_staff: { includeArchived: true },
      get_pay_rates: { asOf: "2026-11-20" },
      list_products: { includeInactive: true },
      get_revenue_report: { ...FULL, groupBy: "category" },
      labour_cost_percent: { ...FULL, groupBy: "department" },
    };
    for (const tool of TOOLS) {
      const raw = await tool.run(tool.input.parse(args[tool.name] ?? FULL), rt.ctx);
      const report = newReport();
      redactDeep(raw, report);
      expect(report.removedKeys, tool.name).toBe(0);
    }
  });
});

describe("what results carry", () => {
  it("marks every result as mock data and advertises a fixed tool list", async () => {
    const rt = await buildRuntime({});
    const { client, call } = await connect(rt);
    expect(client.getServerCapabilities()?.tools?.listChanged).toBe(false);
    expect((await call("list_products", {})).structuredContent?.dataSource).toBe("mock (fictional demo data)");
  });

  it("returns pay as department averages only, never a minimum, maximum or median", async () => {
    const { call } = await connect(await buildRuntime({}));
    const pay = (await call("get_pay_rates", { asOf: "2026-11-20" })).structuredContent as { departments: Array<Record<string, unknown>> };
    for (const d of pay.departments) {
      expect(Object.keys(d).sort()).toEqual(d.withheld ? ["department", "ratedPositions", "withheld"] : ["averageRate", "department", "ratedPositions"]);
    }
    expect(pay.departments.find((d) => d.department === "Duty manager")).toEqual({ department: "Duty manager", ratedPositions: 2, withheld: true });
  });

  it("shows only that a timesheet has a note, unless notes are switched on (then masked)", async () => {
    const day = { start: "2026-11-14", end: "2026-11-14" };
    const plain = await connect(await buildRuntime({}));
    const hidden = JSON.stringify((await plain.call("get_timesheets", day)).structuredContent);
    expect(hidden).toContain('"hasNote":true');
    expect(hidden).not.toContain("school group");

    const withNotes = await connect(await buildRuntime({ INCLUDE_TIMESHEET_NOTES: "true" }));
    const shown = JSON.stringify((await withNotes.call("get_timesheets", day)).structuredContent);
    expect(shown).toContain("Called in for a school group. Text me on [redacted phone]");
    expect(shown).not.toContain("0491");
  });

  it("never returns medical guest flags", async () => {
    const rt = await buildRuntime({});
    const medical = [...(await Promise.all(["2026-11-21", "2026-11-22", "2026-11-14", "2026-11-15"].map((d) => rt.ctx.booking.searchBookings(d))))]
      .flat()
      .filter((b) => b.customerFlags.some((f) => f.type === "Medical"));
    expect(medical.length).toBeGreaterThan(0); // the seed has some to hide
    const { call } = await connect(rt);
    const text = JSON.stringify((await call("list_bookings", { start: "2026-11-14", end: "2026-11-22" })).structuredContent);
    expect(text).not.toContain("Medical");
    expect(text).not.toContain("allergy");
  });

  it("returns custom staff fields only when named, and never personal ones", async () => {
    const defaults = await connect(await buildRuntime({}));
    const none = JSON.stringify((await defaults.call("list_staff", {})).structuredContent);
    expect(none).not.toContain("Uniform size");
    expect(none).not.toContain("extraFields");

    const named = await connect(await buildRuntime({ STAFF_EXTRA_FIELDS: "Uniform size, Date of birth, Bank account" }));
    const staff = (await named.call("list_staff", {})).structuredContent as { staff: Array<{ extraFields?: Array<{ field: string }> }> };
    const fields = new Set(staff.staff.flatMap((s) => s.extraFields ?? []).map((f) => f.field));
    expect([...fields]).toEqual(["Uniform size"]);
  });

  it("explains an empty result instead of returning bare zeros", async () => {
    const { call } = await connect(await buildRuntime({}));
    const week = (await call("labour_cost_percent", { start: "2026-11-23", end: "2026-11-29" })).structuredContent as { warnings: string[] };
    expect(week.warnings.join(" ")).toMatch(/No timesheets or revenue between 2026-11-23 and 2026-11-29. The demo data covers 2026-10-26 to 2026-11-22/);
    const payments = (await call("get_transactions", { start: "2025-01-01", end: "2025-01-07" })).structuredContent as { note: string };
    expect(payments.note).toMatch(/^No payments between/);
  });
});

describe("dates far from today", () => {
  it("answers a year-9999 request at once with a validation error", async () => {
    const lines: string[] = [];
    const restore = setLogSink((line) => lines.push(line));
    try {
      const { call } = await connect(await buildRuntime({}));
      const started = Date.now();
      for (const name of ["list_bookings", "get_transactions", "get_revenue_report", "labour_cost_percent"]) {
        const result = await call(name, { start: "9999-12-31", end: "9999-12-31" });
        expect(result.isError, name).toBe(true);
        expect(JSON.stringify(result.content)).toMatch(/Dates must be between 2000-01-01 and 2099-12-31/);
      }
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      restore();
    }
  });
});
