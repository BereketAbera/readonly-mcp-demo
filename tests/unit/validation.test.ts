import { describe, expect, it } from "vitest";
import { addDays, daysInclusive, localDate, localTime, MAX_RANGE_DAYS, weekStart, zonedUnix } from "../../src/core/dates";
import { rangeInput } from "../../src/tools/schemas";
import { TOOLS } from "../../src/tools/catalog";

const schema = rangeInput({});

describe("date range input", () => {
  it("accepts ranges up to the cap, counting both ends", () => {
    expect(MAX_RANGE_DAYS).toBe(31);
    expect(schema.safeParse({ start: "2026-11-01", end: "2026-12-01" }).success).toBe(true);
    expect(schema.safeParse({ start: "2026-11-22", end: "2026-11-22" }).success).toBe(true);
  });

  it("rejects ranges over the cap", () => {
    const result = schema.safeParse({ start: "2026-11-01", end: "2026-12-02" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Date range is limited to 31 days per call");
  });

  it("rejects an end before the start", () => {
    const result = schema.safeParse({ start: "2026-11-10", end: "2026-11-09" });
    expect(result.error?.issues[0].message).toBe("end must be on or after start");
  });

  it.each(["2026-02-30", "2026-13-01", "26-11-01", "2026/11/01", "2026-11-1", "yesterday", ""])("rejects %s", (bad) => {
    expect(schema.safeParse({ start: bad, end: "2026-11-20" }).success).toBe(false);
  });

  it("applies the cap to every date-range tool", () => {
    // Tools that need a date range reject an empty input.
    const ranged = TOOLS.filter((t) => !t.input.safeParse({}).success);
    expect(ranged.map((t) => t.name).sort()).toEqual([
      "get_revenue_report",
      "get_schedules",
      "get_timesheets",
      "get_transactions",
      "labour_cost_percent",
      "list_bookings",
    ]);
    for (const tool of ranged) {
      expect(tool.input.safeParse({ start: "2026-01-01", end: "2026-03-01" }).success, tool.name).toBe(false);
    }
  });

  it("validates enums and numeric bounds", () => {
    const labour = TOOLS.find((t) => t.name === "labour_cost_percent")!;
    expect(labour.input.safeParse({ start: "2026-11-01", end: "2026-11-07", groupBy: "month" }).success).toBe(false);
    expect(labour.input.safeParse({ start: "2026-11-01", end: "2026-11-07", onCostPercent: 75 }).success).toBe(false);
    expect(labour.input.safeParse({ start: "2026-11-01", end: "2026-11-07", groupBy: "department", onCostPercent: 12 }).success).toBe(true);
  });
});

describe("date helpers", () => {
  it("does calendar arithmetic", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysInclusive("2026-10-26", "2026-11-22")).toBe(28);
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
  });

  it("converts between venue-local time and Unix seconds, including daylight saving zones", () => {
    const bne = zonedUnix("2026-11-21", "09:30", "Australia/Brisbane");
    expect(new Date(bne * 1000).toISOString()).toBe("2026-11-20T23:30:00.000Z");
    expect(localDate(bne, "Australia/Brisbane")).toBe("2026-11-21");
    expect(localTime(bne, "Australia/Brisbane")).toBe("09:30");
    const syd = zonedUnix("2026-11-21", "09:30", "Australia/Sydney"); // AEDT, UTC+11
    expect(new Date(syd * 1000).toISOString()).toBe("2026-11-20T22:30:00.000Z");
    const sydWinter = zonedUnix("2026-07-01", "09:30", "Australia/Sydney"); // AEST, UTC+10
    expect(new Date(sydWinter * 1000).toISOString()).toBe("2026-06-30T23:30:00.000Z");
  });
});
