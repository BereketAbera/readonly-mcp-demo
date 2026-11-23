import { describe, expect, it } from "vitest";
import { zonedUnix } from "../../src/core/dates";
import {
  computeLabourCost,
  hourlyRateFor,
  labourPercent,
  shiftCostCents,
  workedShifts,
  type WorkedShift,
} from "../../src/tools/labour";
import type { CtPayRate, CtPayRateByUser, CtTimeActivitiesByUser } from "../../src/upstream/workforce";

const TZ = "Australia/Brisbane";

const casual: CtPayRate = {
  effectiveDate: "2026-07-01",
  rateType: "hourly",
  isDefaultRateEnabled: true,
  defaultRate: 32.4,
  isResourceRateEnabled: true,
  resourcesRates: [
    { resourceId: "job-desk", isUsingDefaultRate: true },
    { resourceId: "job-party", rate: 34.6, isUsingDefaultRate: false },
  ],
};

function shift(partial: Partial<WorkedShift> & Pick<WorkedShift, "userId" | "date" | "paidSeconds">): WorkedShift {
  return {
    activityId: `a-${partial.userId}-${partial.date}`,
    jobId: "job-desk",
    department: "Front desk",
    clockIn: 0,
    clockOut: 0,
    unpaidBreakSeconds: 0,
    scheduledShiftId: "s1",
    note: "",
    ...partial,
  };
}

describe("hourly rate resolution", () => {
  it("uses the job's own rate when one is set", () => {
    expect(hourlyRateFor(casual, "job-party")).toBe(34.6);
  });
  it("falls back to the default rate", () => {
    expect(hourlyRateFor(casual, "job-desk")).toBe(32.4);
    expect(hourlyRateFor(casual, "job-unknown")).toBe(32.4);
    expect(hourlyRateFor(casual, null)).toBe(32.4);
  });
  it("returns undefined for salaried or missing rates", () => {
    expect(hourlyRateFor({ ...casual, rateType: "yearly" }, "job-desk")).toBeUndefined();
    expect(hourlyRateFor(undefined, "job-desk")).toBeUndefined();
    expect(hourlyRateFor({ ...casual, isDefaultRateEnabled: false, resourcesRates: [] }, "job-desk")).toBeUndefined();
  });
});

describe("labour maths", () => {
  it("costs a shift as paid hours x rate, with optional on-cost, in cents", () => {
    expect(shiftCostCents(7.5 * 3600, 32.4, 0)).toBe(24_300);
    expect(shiftCostCents(7.5 * 3600, 32.4, 12)).toBe(27_216);
    expect(shiftCostCents(20 * 60, 30, 0)).toBe(1_000);
  });
  it("rounds labour percent to one decimal and returns null without revenue", () => {
    expect(labourPercent(1_000, 4_000)).toBe(25);
    expect(labourPercent(1, 3)).toBe(33.3);
    expect(labourPercent(2, 3)).toBe(66.7);
    expect(labourPercent(500, 0)).toBeNull();
  });
});

describe("worked shifts", () => {
  const start = zonedUnix("2026-11-16", "09:00", TZ);
  const activities: CtTimeActivitiesByUser[] = [
    {
      userId: 1,
      shifts: [
        {
          id: "t1",
          start: { timestamp: start, timezone: TZ },
          end: { timestamp: start + 8 * 3600, timezone: TZ },
          jobId: "job-desk",
          schedulerShiftId: "s1",
          managerNote: "",
          employeeNote: "",
        },
        // Still clocked in: ignored.
        { id: "t2", start: { timestamp: start + 86_400, timezone: TZ }, end: null, jobId: "job-desk", schedulerShiftId: null },
      ],
      manualBreaks: [
        // 30 minutes inside the shift.
        { id: "b1", start: { timestamp: start + 4 * 3600, timezone: TZ }, end: { timestamp: start + 4.5 * 3600, timezone: TZ }, manualBreakId: "meal" },
        // Overlaps the end of the shift by 10 minutes: only 20 minutes count.
        { id: "b2", start: { timestamp: start + 8 * 3600 - 20 * 60, timezone: TZ }, end: { timestamp: start + 8 * 3600 + 10 * 60, timezone: TZ }, manualBreakId: "meal" },
      ],
      timeOffs: [],
    },
  ];

  it("deducts overlapping unpaid breaks and skips open shifts", () => {
    const worked = workedShifts(activities, new Map([["job-desk", "Front desk"]]), TZ, { start: "2026-11-16", end: "2026-11-30" });
    expect(worked).toHaveLength(1);
    expect(worked[0].unpaidBreakSeconds).toBe(50 * 60);
    expect(worked[0].paidSeconds).toBe(8 * 3600 - 50 * 60);
    expect(worked[0].department).toBe("Front desk");
  });

  it("assigns shifts to the venue-local date, not the UTC date", () => {
    // 09:00 in Brisbane is 23:00 UTC the previous day.
    const worked = workedShifts(activities, new Map(), TZ, { start: "2026-11-16", end: "2026-11-16" });
    expect(worked[0].date).toBe("2026-11-16");
    expect(worked[0].department).toBe("Unassigned");
    expect(workedShifts(activities, new Map(), TZ, { start: "2026-11-15", end: "2026-11-15" })).toHaveLength(0);
  });
});

describe("computeLabourCost", () => {
  const payRates: CtPayRateByUser[] = [
    { userId: 1, payRate: casual },
    { userId: 2, payRate: { ...casual, defaultRate: 30, isResourceRateEnabled: false, resourcesRates: [] } },
  ];
  const shifts: WorkedShift[] = [
    shift({ userId: 1, date: "2026-11-16", paidSeconds: 8 * 3600 }), // 8h x 32.40 = 259.20
    shift({ userId: 1, date: "2026-11-21", paidSeconds: 4 * 3600, jobId: "job-party", department: "Party hosts" }), // 4h x 34.60 = 138.40
    shift({ userId: 2, date: "2026-11-21", paidSeconds: 6 * 3600 }), // 6h x 30 = 180.00
    shift({ userId: 3, date: "2026-11-22", paidSeconds: 5 * 3600 }), // no rate: excluded
  ];
  const revenue = [
    { date: "2026-11-16", netCents: 100_000, gstCents: 10_000, entries: 10 },
    { date: "2026-11-21", netCents: 200_000, gstCents: 20_000, entries: 20 },
    { date: "2026-11-23", netCents: 999_999, gstCents: 0, entries: 1 }, // outside range
  ];
  const base = { range: { start: "2026-11-16", end: "2026-11-22" }, onCostPercent: 0, shifts, payRates, revenue };

  it("totals labour and revenue and divides them", () => {
    const r = computeLabourCost({ ...base, groupBy: "week" });
    expect(r.totals.labourCost).toBe(577.6);
    expect(r.totals.netRevenue).toBe(3000);
    expect(r.totals.labourPercent).toBe(19.3);
    expect(r.totals.paidHours).toBe(18);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].label).toBe("Week of 16 Nov");
    expect(r.counts.shiftsWithoutRate).toBe(1);
    expect(r.warnings.join(" ")).toMatch(/no hourly rate/);
  });

  it("groups by day, including days with no shifts or revenue", () => {
    const r = computeLabourCost({ ...base, groupBy: "day" });
    expect(r.rows.map((x) => x.key)).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
    const sat = r.rows.find((x) => x.key === "2026-11-21");
    expect(sat).toMatchObject({ labourCost: 318.4, netRevenue: 2000, labourPercent: 15.9 });
    expect(r.rows.find((x) => x.key === "2026-11-17")).toMatchObject({ labourCost: 0, netRevenue: 0, labourPercent: null });
    const sum = r.rows.reduce((s, x) => s + Math.round(x.labourCost * 100), 0);
    expect(sum / 100).toBe(r.totals.labourCost);
  });

  it("groups by department against total venue revenue", () => {
    const r = computeLabourCost({ ...base, groupBy: "department" });
    const desk = r.rows.find((x) => x.key === "Front desk");
    const party = r.rows.find((x) => x.key === "Party hosts");
    expect(desk).toMatchObject({ labourCost: 439.2, netRevenue: null, labourPercent: 14.6 });
    expect(party).toMatchObject({ labourCost: 138.4, labourPercent: 4.6 });
    expect(r.rows[0].key).toBe("Front desk"); // sorted by cost
    expect(desk!.shareOfLabourCost + party!.shareOfLabourCost).toBeCloseTo(100, 0);
  });

  it("applies on-cost to every shift", () => {
    const r = computeLabourCost({ ...base, groupBy: "week", onCostPercent: 12 });
    expect(r.totals.labourCost).toBe(646.91);
    expect(r.totals.labourPercent).toBe(21.6);
  });
});
