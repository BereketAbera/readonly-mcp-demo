import { dayLabel, eachDate, localDate, shortDate, weekStart } from "../core/dates";
import type { CtPayRate, CtPayRateByUser, CtTimeActivitiesByUser } from "../upstream/workforce";

/** Pure labour-cost maths. No I/O, so it is unit-tested directly. */

export interface DateRange {
  start: string;
  end: string;
}

export interface WorkedShift {
  activityId: string;
  userId: number;
  date: string;
  jobId: string | null;
  department: string;
  clockIn: number;
  clockOut: number;
  unpaidBreakSeconds: number;
  paidSeconds: number;
  scheduledShiftId: string | null;
  note: string;
}

/** Hourly rate for a job: the job's own rate when set, otherwise the default rate. */
export function hourlyRateFor(payRate: CtPayRate | undefined, jobId: string | null): number | undefined {
  if (!payRate || payRate.rateType !== "hourly") return undefined;
  if (payRate.isResourceRateEnabled && jobId) {
    const resource = payRate.resourcesRates.find((r) => r.resourceId === jobId);
    if (resource && !resource.isUsingDefaultRate && typeof resource.rate === "number") return resource.rate;
  }
  if (payRate.isDefaultRateEnabled && typeof payRate.defaultRate === "number") return payRate.defaultRate;
  return undefined;
}

/** Completed clocked shifts in range, with overlapping unpaid manual breaks deducted. */
export function workedShifts(
  activities: CtTimeActivitiesByUser[],
  jobTitles: ReadonlyMap<string, string>,
  timeZone: string,
  range: DateRange,
): WorkedShift[] {
  const out: WorkedShift[] = [];
  for (const user of activities) {
    for (const shift of user.shifts) {
      if (!shift.end) continue; // still clocked in
      const clockIn = shift.start.timestamp;
      const clockOut = shift.end.timestamp;
      const date = localDate(clockIn, timeZone);
      if (date < range.start || date > range.end || clockOut <= clockIn) continue;
      let unpaidBreakSeconds = 0;
      for (const brk of user.manualBreaks) {
        if (!brk.end) continue;
        const overlap = Math.min(brk.end.timestamp, clockOut) - Math.max(brk.start.timestamp, clockIn);
        if (overlap > 0) unpaidBreakSeconds += overlap;
      }
      out.push({
        activityId: shift.id,
        userId: user.userId,
        date,
        jobId: shift.jobId,
        department: (shift.jobId && jobTitles.get(shift.jobId)) || "Unassigned",
        clockIn,
        clockOut,
        unpaidBreakSeconds,
        paidSeconds: Math.max(0, clockOut - clockIn - unpaidBreakSeconds),
        scheduledShiftId: shift.schedulerShiftId,
        note: shift.managerNote || shift.employeeNote || "",
      });
    }
  }
  return out.sort((a, b) => a.clockIn - b.clockIn);
}

export type LabourGroupBy = "day" | "week" | "department";

export interface DailyRevenue {
  date: string;
  netCents: number;
  gstCents: number;
  entries: number;
}

export interface LabourInput {
  range: DateRange;
  groupBy: LabourGroupBy;
  onCostPercent: number;
  shifts: WorkedShift[];
  payRates: CtPayRateByUser[];
  revenue: DailyRevenue[];
}

export interface LabourRow {
  key: string;
  label: string;
  paidHours: number;
  labourCost: number;
  /** Null for department rows: revenue is venue-wide. */
  netRevenue: number | null;
  labourPercent: number | null;
  shareOfLabourCost: number;
}

const toMoney = (cents: number) => Math.round(cents) / 100;
const toHours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;

// #region labour-percent
/** Labour cost as a share of revenue, to one decimal place. Null when there is no revenue. */
export function labourPercent(labourCents: number, revenueCents: number): number | null {
  if (revenueCents <= 0) return null;
  return Math.round((labourCents / revenueCents) * 1000) / 10;
}

/** Cost of one shift in cents: paid hours x hourly rate, plus on-cost. */
export function shiftCostCents(paidSeconds: number, hourlyRate: number, onCostPercent: number): number {
  return Math.round((paidSeconds / 3600) * hourlyRate * 100 * (1 + onCostPercent / 100));
}
// #endregion labour-percent

export function computeLabourCost(input: LabourInput) {
  const rateByUser = new Map(input.payRates.map((r) => [r.userId, r.payRate]));
  const groups = new Map<string, { label: string; seconds: number; cents: number }>();
  const departments = new Map<string, { seconds: number; cents: number }>();
  const warnings = new Set<string>();
  let unratedShifts = 0;
  let unpaidBreakSeconds = 0;
  let paidSeconds = 0;
  let labourCents = 0;

  const groupKey = (date: string, department: string) =>
    input.groupBy === "day" ? date : input.groupBy === "week" ? weekStart(date) : department;
  const groupLabel = (key: string) =>
    input.groupBy === "day" ? dayLabel(key) : input.groupBy === "week" ? `Week of ${shortDate(key)}` : key;

  // Seed day and week rows so periods without shifts or revenue still appear.
  if (input.groupBy !== "department") {
    for (const date of eachDate(input.range.start, input.range.end)) {
      const key = groupKey(date, "");
      if (!groups.has(key)) groups.set(key, { label: groupLabel(key), seconds: 0, cents: 0 });
    }
  }

  for (const shift of input.shifts) {
    const payRate = rateByUser.get(shift.userId);
    const rate = hourlyRateFor(payRate, shift.jobId);
    unpaidBreakSeconds += shift.unpaidBreakSeconds;
    if (rate === undefined) {
      unratedShifts += 1;
      continue;
    }
    if (payRate && shift.date < payRate.effectiveDate) {
      warnings.add("Some shifts predate the current pay rate's effective date; the current rate was used.");
    }
    const cents = shiftCostCents(shift.paidSeconds, rate, input.onCostPercent);
    paidSeconds += shift.paidSeconds;
    labourCents += cents;
    const key = groupKey(shift.date, shift.department);
    const group = groups.get(key) ?? { label: groupLabel(key), seconds: 0, cents: 0 };
    group.seconds += shift.paidSeconds;
    group.cents += cents;
    groups.set(key, group);
    const dept = departments.get(shift.department) ?? { seconds: 0, cents: 0 };
    dept.seconds += shift.paidSeconds;
    dept.cents += cents;
    departments.set(shift.department, dept);
  }
  if (unratedShifts > 0) warnings.add(`${unratedShifts} shift(s) had no hourly rate and were left out of labour cost.`);

  const revenueByKey = new Map<string, number>();
  let revenueCents = 0;
  let gstCents = 0;
  let entries = 0;
  for (const day of input.revenue) {
    if (day.date < input.range.start || day.date > input.range.end) continue;
    revenueCents += day.netCents;
    gstCents += day.gstCents;
    entries += day.entries;
    if (input.groupBy !== "department") {
      const key = groupKey(day.date, "");
      revenueByKey.set(key, (revenueByKey.get(key) ?? 0) + day.netCents);
    }
  }

  const rows: LabourRow[] = [...groups.entries()]
    .map(([key, g]) => {
      const rowRevenue = input.groupBy === "department" ? null : revenueByKey.get(key) ?? 0;
      return {
        key,
        label: g.label,
        paidHours: toHours(g.seconds),
        labourCost: toMoney(g.cents),
        netRevenue: rowRevenue === null ? null : toMoney(rowRevenue),
        labourPercent: labourPercent(g.cents, rowRevenue ?? revenueCents),
        shareOfLabourCost: labourCents > 0 ? Math.round((g.cents / labourCents) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => (input.groupBy === "department" ? b.labourCost - a.labourCost : a.key.localeCompare(b.key)));

  return {
    totals: {
      paidHours: toHours(paidSeconds),
      labourCost: toMoney(labourCents),
      netRevenue: toMoney(revenueCents),
      labourPercent: labourPercent(labourCents, revenueCents),
    },
    rows,
    byDepartment: [...departments.entries()]
      .map(([department, d]) => ({ department, paidHours: toHours(d.seconds), labourCost: toMoney(d.cents) }))
      .sort((a, b) => b.labourCost - a.labourCost),
    counts: {
      shiftsCounted: input.shifts.length - unratedShifts,
      shiftsWithoutRate: unratedShifts,
      unpaidBreakHours: toHours(unpaidBreakSeconds),
      revenueEntries: entries,
      gst: toMoney(gstCents),
    },
    warnings: [...warnings],
  };
}
