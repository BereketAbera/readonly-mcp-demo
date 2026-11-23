import { z } from "zod";
import { addDays, dayLabel, eachDate, localDate, localTime, MAX_RANGE_DAYS, shortDate, weekStart, zonedUnix } from "../core/dates";
import { isShareableCustomField } from "../core/redact";
import type { BookingApi, RlProduct } from "../upstream/booking";
import type { CtUser, WorkforceApi } from "../upstream/workforce";
import { computeLabourCost, hourlyRateFor, workedShifts, type DailyRevenue } from "./labour";
import { isoDate, rangeInput } from "./schemas";

export interface ToolContext {
  workforce: WorkforceApi;
  booking: BookingApi;
  timezone: string;
  payRateMinGroupSize: number;
  /** Connecteam custom fields list_staff may return, besides Department and Employment type. */
  staffExtraFields: readonly string[];
  /** Whether get_timesheets returns (masked) note text instead of only `hasNote`. */
  includeTimesheetNotes: boolean;
  /** Dates the mocked data covers; absent against the live APIs. */
  coverage?: { start: string; end: string };
  /** Venue-local date today (YYYY-MM-DD). */
  today(): string;
}

export interface UpstreamCall {
  api: "workforce" | "booking";
  endpoint: string;
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: S;
  upstream: UpstreamCall[];
  run(args: z.infer<S>, ctx: ToolContext): Promise<Record<string, unknown>>;
}

function defineTool<S extends z.ZodType>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

/** Rows returned by list-style tools are capped so results stay readable for an assistant. */
export const MAX_ROWS = 250;

const round2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(n * 100);
const money = (c: number) => Math.round(c) / 100;

function fullName(user: CtUser | undefined, userId: number): string {
  return user ? `${user.firstName} ${user.lastName}` : `User ${userId}`;
}

function customField(user: CtUser, name: string): string | undefined {
  const field = user.customFields.find((f) => f.name === name);
  return typeof field?.value === "string" ? field.value : undefined;
}

async function loadPeople(ctx: ToolContext) {
  const [users, jobs] = await Promise.all([ctx.workforce.listUsers(true), ctx.workforce.listJobs()]);
  return {
    users: new Map(users.map((u) => [u.userId, u])),
    jobTitles: new Map(jobs.map((j) => [j.jobId, j.title])),
  };
}

function matchesDepartment(filter: string | undefined, department: string): boolean {
  return !filter || department.toLowerCase() === filter.trim().toLowerCase();
}

/** A note for an empty result, saying when the dates fall outside the demo data. */
function emptyNote(ctx: ToolContext, what: string, start: string, end: string): { note: string } {
  const c = ctx.coverage;
  const outside = c ? end < c.start || start > c.end : false;
  return {
    note: c && outside ? `No ${what} between ${start} and ${end}. The demo data covers ${c.start} to ${c.end}.` : `No ${what} between ${start} and ${end}.`,
  };
}

/** Totals keyed by data values (methods, departments, categories) become arrays, so redaction only ever sees field names. */
function tally<K extends string, T extends Record<string, number>>(keyName: K, map: Map<string, T>): Array<Record<K, string> & T> {
  return [...map.entries()].map(([key, totals]) => ({ [keyName]: key, ...totals }) as Record<K, string> & T);
}

function capped<T>(rows: T[]) {
  const truncated = rows.length > MAX_ROWS;
  return {
    rows: rows.slice(0, MAX_ROWS),
    truncated,
    ...(truncated ? { note: `Showing the first ${MAX_ROWS} of ${rows.length} rows. Totals cover every row; narrow the dates to see the rest.` } : {}),
  };
}

async function productIndex(ctx: ToolContext): Promise<Map<string, RlProduct>> {
  return new Map((await ctx.booking.listProducts()).map((p) => [p.productId, p]));
}

async function dailyRevenue(ctx: ToolContext, start: string, end: string) {
  const days: Array<{ date: string; entries: Awaited<ReturnType<BookingApi["listRevenueEntries"]>> }> = [];
  for (const date of eachDate(start, end)) days.push({ date, entries: await ctx.booking.listRevenueEntries(date) });
  return days;
}

const departmentFilter = z
  .string()
  .min(1)
  .max(60)
  .optional()
  .describe("Optional department name to filter by, e.g. Front desk, Attractions, Party hosts, Café, Duty manager.");

const RANGE_NOTE = `Dates are venue-local YYYY-MM-DD, inclusive; at most ${MAX_RANGE_DAYS} days per call.`;

export const TOOLS: ToolDefinition[] = [
  defineTool({
    name: "list_staff",
    title: "List staff",
    description:
      "List staff members with department, role, employment type and status, plus active staff per department. Phone numbers, email addresses, dates of birth, home addresses, bank details and kiosk PINs are never returned, and other custom fields only when the deployment allows them by name.",
    input: z.object({
      includeArchived: z.boolean().optional().describe("Include archived (former) staff. Defaults to false."),
    }),
    upstream: [{ api: "workforce", endpoint: "GET /users/v1/users" }],
    async run({ includeArchived }, ctx) {
      const users = await ctx.workforce.listUsers(Boolean(includeArchived));
      // Allowlist: only custom fields the deployment names, and never one whose type or name marks it personal.
      const allowed = new Set(ctx.staffExtraFields.map((f) => f.toLowerCase()));
      const staff = users
        .map((u) => {
          const extraFields = u.customFields
            .filter((f) => allowed.has(f.name.toLowerCase()) && isShareableCustomField(f))
            .filter((f) => ["string", "number", "boolean"].includes(typeof f.value))
            .map((f) => ({ field: f.name, value: f.value as string | number | boolean }));
          return {
            userId: u.userId,
            name: fullName(u, u.userId),
            department: customField(u, "Department") ?? "Unassigned",
            role: u.userType,
            employmentType: customField(u, "Employment type") ?? null,
            status: u.isArchived ? "archived" : "active",
            ...(extraFields.length ? { extraFields } : {}),
          };
        })
        .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
      const active = new Map<string, { staff: number }>();
      for (const s of staff) {
        if (s.status !== "active") continue;
        const d = active.get(s.department) ?? { staff: 0 };
        d.staff += 1;
        active.set(s.department, d);
      }
      return { count: staff.length, activeByDepartment: tally("department", active), staff };
    },
  }),

  defineTool({
    name: "get_schedules",
    title: "Get rostered shifts",
    description: `Rostered (scheduled) shifts between two dates with department, assigned staff and scheduled paid hours (unpaid breaks deducted). ${RANGE_NOTE}`,
    input: rangeInput({ department: departmentFilter }),
    upstream: [
      { api: "workforce", endpoint: "GET /scheduler/v1/schedulers" },
      { api: "workforce", endpoint: "GET /scheduler/v2/schedulers/{schedulerId}/shifts" },
      { api: "workforce", endpoint: "GET /users/v1/users" },
      { api: "workforce", endpoint: "GET /jobs/v1/jobs" },
    ],
    async run({ start, end, department }, ctx) {
      const [{ users, jobTitles }, schedulers] = await Promise.all([loadPeople(ctx), ctx.workforce.listSchedulers()]);
      const from = zonedUnix(start, "00:00", ctx.timezone);
      const to = zonedUnix(addDays(end, 1), "00:00", ctx.timezone);
      const rows = [];
      for (const scheduler of schedulers.filter((s) => !s.isArchived)) {
        for (const shift of await ctx.workforce.listShifts(scheduler.schedulerId, from, to)) {
          const date = localDate(shift.startTime, ctx.timezone);
          const dept = (shift.jobId && jobTitles.get(shift.jobId)) || "Unassigned";
          if (date < start || date > end || !matchesDepartment(department, dept)) continue;
          const unpaidMinutes = shift.breaks.filter((b) => b.type === "unpaid").reduce((sum, b) => sum + b.duration, 0);
          rows.push({
            shiftId: shift.id,
            date,
            start: localTime(shift.startTime, ctx.timezone),
            end: localTime(shift.endTime, ctx.timezone),
            department: dept,
            staff: shift.assignedUserIds.map((id) => fullName(users.get(id), id)),
            scheduledHours: round2((shift.endTime - shift.startTime) / 3600 - unpaidMinutes / 60),
            isOpenShift: shift.isOpenShift,
            isPublished: shift.isPublished,
          });
        }
      }
      rows.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      const departments = new Map<string, { shifts: number; hours: number }>();
      for (const r of rows) {
        const d = departments.get(r.department) ?? { shifts: 0, hours: 0 };
        d.shifts += 1;
        d.hours = round2(d.hours + r.scheduledHours);
        departments.set(r.department, d);
      }
      const { rows: shifts, ...page } = capped(rows);
      return {
        range: { start, end, timezone: ctx.timezone },
        shiftCount: rows.length,
        scheduledHours: round2(rows.reduce((s, r) => s + r.scheduledHours, 0)),
        byDepartment: tally("department", departments),
        shifts,
        ...page,
        ...(rows.length === 0 ? emptyNote(ctx, "rostered shifts", start, end) : {}),
      };
    },
  }),

  defineTool({
    name: "get_timesheets",
    title: "Get timesheets",
    description: `Clocked shifts (timesheets) between two dates: clock-in and clock-out times, unpaid break minutes and paid hours per staff member and department. Shift notes are shown as hasNote only, unless the deployment turns note text on. ${RANGE_NOTE}`,
    input: rangeInput({ department: departmentFilter }),
    upstream: [
      { api: "workforce", endpoint: "GET /time-clock/v1/time-clocks" },
      { api: "workforce", endpoint: "GET /time-clock/v1/time-clocks/{timeClockId}/time-activities" },
      { api: "workforce", endpoint: "GET /users/v1/users" },
      { api: "workforce", endpoint: "GET /jobs/v1/jobs" },
    ],
    async run({ start, end, department }, ctx) {
      const [{ users, jobTitles }, clocks] = await Promise.all([loadPeople(ctx), ctx.workforce.listTimeClocks()]);
      const activities = [];
      for (const clock of clocks.filter((c) => !c.isArchived)) {
        activities.push(...(await ctx.workforce.listTimeActivities(clock.id, start, end)));
      }
      const worked = workedShifts(activities, jobTitles, ctx.timezone, { start, end }).filter((w) =>
        matchesDepartment(department, w.department),
      );
      const rows = worked.map((w) => ({
        timeActivityId: w.activityId,
        date: w.date,
        staff: fullName(users.get(w.userId), w.userId),
        department: w.department,
        clockIn: localTime(w.clockIn, ctx.timezone),
        clockOut: localTime(w.clockOut, ctx.timezone),
        unpaidBreakMinutes: Math.round(w.unpaidBreakSeconds / 60),
        paidHours: round2(w.paidSeconds / 3600),
        rostered: w.scheduledShiftId !== null,
        // Notes are free text (sick-leave reasons, phone numbers), so by default only their presence is shown.
        ...(w.note ? (ctx.includeTimesheetNotes ? { hasNote: true, note: w.note } : { hasNote: true }) : {}),
      }));
      const departments = new Map<string, { entries: number; paidHours: number }>();
      for (const r of rows) {
        const d = departments.get(r.department) ?? { entries: 0, paidHours: 0 };
        d.entries += 1;
        d.paidHours = round2(d.paidHours + r.paidHours);
        departments.set(r.department, d);
      }
      const { rows: entries, ...page } = capped(rows);
      return {
        range: { start, end, timezone: ctx.timezone },
        entryCount: rows.length,
        paidHours: round2(rows.reduce((s, r) => s + r.paidHours, 0)),
        unrosteredEntries: rows.filter((r) => !r.rostered).length,
        byDepartment: tally("department", departments),
        entries,
        ...page,
        ...(rows.length === 0 ? emptyNote(ctx, "timesheet entries", start, end) : {}),
      };
    },
  }),

  defineTool({
    name: "get_pay_rates",
    title: "Get pay rates (department averages)",
    description:
      "Average hourly pay rate per department, with the number of rated positions. No individual rates, minimums or maximums are returned, and departments with fewer rated positions than the configured minimum are withheld. Bank details are never returned.",
    input: z.object({
      asOf: isoDate("Date the rates apply on, YYYY-MM-DD. Defaults to today (venue-local).").optional(),
    }),
    upstream: [
      { api: "workforce", endpoint: "GET /pay-rates/v1/pay-rates" },
      { api: "workforce", endpoint: "GET /users/v1/users" },
      { api: "workforce", endpoint: "GET /jobs/v1/jobs" },
    ],
    async run({ asOf }, ctx) {
      const date = asOf ?? ctx.today();
      const [{ users, jobTitles }, rates] = await Promise.all([loadPeople(ctx), ctx.workforce.getPayRates(date, date)]);
      const buckets = new Map<string, number[]>();
      const addRate = (dept: string, rate: number | undefined) => {
        if (rate === undefined) return;
        buckets.set(dept, [...(buckets.get(dept) ?? []), rate]);
      };
      for (const { userId, payRate } of rates) {
        const user = users.get(userId);
        if (!user || user.isArchived || payRate.effectiveDate > date) continue;
        if (payRate.isResourceRateEnabled && payRate.resourcesRates.length > 0) {
          for (const r of payRate.resourcesRates) addRate(jobTitles.get(r.resourceId) ?? "Unassigned", hourlyRateFor(payRate, r.resourceId));
        } else {
          addRate(customField(user, "Department") ?? "Unassigned", hourlyRateFor(payRate, null));
        }
      }
      const minGroup = ctx.payRateMinGroupSize;
      // Only the average leaves the server: a minimum, maximum or median is always one real person's rate.
      const departments = [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([department, values]) =>
          values.length < minGroup
            ? { department, ratedPositions: values.length, withheld: true }
            : { department, ratedPositions: values.length, averageRate: round2(values.reduce((s, v) => s + v, 0) / values.length) },
        );
      return {
        asOf: date,
        currency: "AUD",
        rateType: "hourly, before penalty rates and on-costs",
        departments,
        note: `Averages are withheld for departments with fewer than ${minGroup} rated positions. A person rated for two jobs counts once in each.`,
      };
    },
  }),

  defineTool({
    name: "list_bookings",
    title: "List bookings",
    description: `Bookings with a visit date between two dates: reference, visit date and session time, payment status, total and items, with totals by status and by product category. Guest names, contact details, medical flags and flag comments are not returned. ${RANGE_NOTE}`,
    input: rangeInput({}),
    upstream: [
      { api: "booking", endpoint: "GET /bookings?date={date} (one call per day)" },
      { api: "booking", endpoint: "GET /data/products" },
    ],
    async run({ start, end }, ctx) {
      const products = await productIndex(ctx);
      const rows = [];
      const categories = new Map<string, { items: number }>();
      const daysAtSearchLimit: string[] = [];
      for (const date of eachDate(start, end)) {
        const bookings = await ctx.booking.searchBookings(date);
        if (bookings.length >= 100) daysAtSearchLimit.push(date);
        for (const b of bookings) {
          rows.push({
            bookingReference: b.bookingReference,
            visitDate: date,
            sessionTime: b.items.find((i) => i.startTime)?.startTime ?? null,
            status: b.status,
            total: b.total,
            items: b.items
              .map((i) => `${i.quantity} x ${products.get(String(i.productId))?.name ?? `product ${i.productId}`}`)
              .join("; "),
            // Medical flags are health information: never returned. Comments are never returned either.
            guestFlags: b.customerFlags.filter((f) => f.type !== "Medical").map((f) => f.type),
          });
          for (const i of b.items) {
            const category = products.get(String(i.productId))?.reportingCategoryName ?? "Other";
            const c = categories.get(category) ?? { items: 0 };
            c.items += i.quantity;
            categories.set(category, c);
          }
        }
      }
      rows.sort((a, b) => (a.visitDate + (a.sessionTime ?? "")).localeCompare(b.visitDate + (b.sessionTime ?? "")));
      const statuses = new Map<string, { bookings: number }>();
      for (const r of rows) {
        const st = statuses.get(r.status) ?? { bookings: 0 };
        st.bookings += 1;
        statuses.set(r.status, st);
      }
      const { rows: bookings, ...page } = capped(rows);
      return {
        range: { start, end, timezone: ctx.timezone },
        bookingCount: rows.length,
        bookingValue: money(rows.reduce((s, r) => s + cents(r.total), 0)),
        byStatus: tally("status", statuses),
        itemsByCategory: tally("category", categories).sort((a, b) => b.items - a.items),
        bookings,
        ...page,
        ...(rows.length === 0 ? emptyNote(ctx, "bookings", start, end) : {}),
        ...(daysAtSearchLimit.length ? { warning: `Search returned its 100-booking limit on ${daysAtSearchLimit.join(", ")}.` } : {}),
      };
    },
  }),

  defineTool({
    name: "list_products",
    title: "List products",
    description:
      "Products the venue sells (passes, attractions, party packages, café and arcade cards) with type, reporting category, price including GST and status.",
    input: z.object({
      category: z.string().min(1).max(60).optional().describe("Optional reporting category, e.g. Admissions, Birthday parties, Café."),
      includeInactive: z.boolean().optional().describe("Include closed and archived products. Defaults to false."),
    }),
    upstream: [{ api: "booking", endpoint: "GET /data/products" }],
    async run({ category, includeInactive }, ctx) {
      const products = (await ctx.booking.listProducts())
        .filter((p) => includeInactive || p.productStatus === "Published")
        .filter((p) => !category || p.reportingCategoryName.toLowerCase() === category.trim().toLowerCase())
        .map((p) => ({
          productId: p.productId,
          name: p.name,
          type: p.productType,
          category: p.reportingCategoryName,
          priceIncGst: p.price,
          status: p.productStatus,
        }))
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      return { count: products.length, currency: "AUD", products };
    },
  }),

  defineTool({
    name: "get_transactions",
    title: "Get payments",
    description: `Payments taken between two dates: amount, tip, fees, method, channel and booking reference, with totals by method. Card digits and payment gateway references are not returned. ${RANGE_NOTE}`,
    input: rangeInput({}),
    upstream: [{ api: "booking", endpoint: "GET /data/bookingpayments (one call per day)" }],
    async run({ start, end }, ctx) {
      const rows = [];
      for (const date of eachDate(start, end)) {
        for (const p of await ctx.booking.listPayments(date)) {
          const unix = Math.floor(Date.parse(p.createdDate) / 1000);
          rows.push({
            paymentId: p.bookingPaymentId,
            bookingReference: p.bookingReference,
            date,
            time: localTime(unix, ctx.timezone),
            amount: p.total,
            tip: p.tip,
            fee: p.transactionFeeAmount,
            method: p.paymentMethod,
            channel: p.deviceId ? "In venue" : "Online",
          });
        }
      }
      rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      const methods = new Map<string, { count: number; amount: number }>();
      for (const r of rows) {
        const m = methods.get(r.method) ?? { count: 0, amount: 0 };
        m.count += 1;
        m.amount = money(cents(m.amount) + cents(r.amount));
        methods.set(r.method, m);
      }
      const { rows: payments, ...page } = capped(rows);
      return {
        range: { start, end, timezone: ctx.timezone },
        paymentCount: rows.length,
        totalTaken: money(rows.reduce((s, r) => s + cents(r.amount), 0)),
        tips: money(rows.reduce((s, r) => s + cents(r.tip), 0)),
        fees: money(rows.reduce((s, r) => s + cents(r.fee), 0)),
        byMethod: tally("method", methods).sort((a, b) => b.amount - a.amount),
        payments,
        ...page,
        ...(rows.length === 0 ? emptyNote(ctx, "payments", start, end) : {}),
      };
    },
  }),

  defineTool({
    name: "get_revenue_report",
    title: "Get revenue report",
    description: `Revenue between two dates from revenue entries: recognised net revenue (ex GST), GST, gross and funds received, grouped by day, week or reporting category. ${RANGE_NOTE}`,
    input: rangeInput({
      groupBy: z.enum(["day", "week", "category"]).optional().describe("How to group rows. Defaults to day."),
    }),
    upstream: [
      { api: "booking", endpoint: "GET /reporting/revenue-entries (one call per day)" },
      { api: "booking", endpoint: "GET /data/products" },
    ],
    async run({ start, end, groupBy = "day" }, ctx) {
      const [products, days] = await Promise.all([productIndex(ctx), dailyRevenue(ctx, start, end)]);
      const groups = new Map<string, { label: string; net: number; gst: number; funds: number; entries: number }>();
      const totals = { net: 0, gst: 0, funds: 0, entries: 0 };
      if (groupBy !== "category") {
        for (const date of eachDate(start, end)) {
          const key = groupBy === "day" ? date : weekStart(date);
          if (!groups.has(key)) groups.set(key, { label: groupBy === "day" ? dayLabel(key) : `Week of ${shortDate(key)}`, net: 0, gst: 0, funds: 0, entries: 0 });
        }
      }
      for (const { date, entries } of days) {
        for (const e of entries) {
          const key =
            groupBy === "day" ? date : groupBy === "week" ? weekStart(date) : products.get(e.productId)?.reportingCategoryName ?? "Other";
          const g = groups.get(key) ?? { label: key, net: 0, gst: 0, funds: 0, entries: 0 };
          g.net += cents(e.netRevenue);
          g.gst += cents(e.taxPayable);
          g.funds += cents(e.fundsReceived);
          g.entries += 1;
          groups.set(key, g);
          totals.net += cents(e.netRevenue);
          totals.gst += cents(e.taxPayable);
          totals.funds += cents(e.fundsReceived);
          totals.entries += 1;
        }
      }
      const rows = [...groups.entries()]
        .map(([key, g]) => ({
          key,
          label: g.label,
          netRevenue: money(g.net),
          gst: money(g.gst),
          grossRevenue: money(g.net + g.gst),
          fundsReceived: money(g.funds),
        }))
        .sort((a, b) => (groupBy === "category" ? b.netRevenue - a.netRevenue : a.key.localeCompare(b.key)));
      return {
        range: { start, end, timezone: ctx.timezone },
        currency: "AUD",
        basis:
          "Net revenue is revenue recognised on the visit date, excluding GST. Funds received is money taken on the day, including deposits for future visits.",
        totals: {
          netRevenue: money(totals.net),
          gst: money(totals.gst),
          grossRevenue: money(totals.net + totals.gst),
          fundsReceived: money(totals.funds),
          entries: totals.entries,
        },
        groupBy,
        rows,
        ...(totals.entries === 0 ? emptyNote(ctx, "revenue entries", start, end) : {}),
      };
    },
  }),

  defineTool({
    name: "labour_cost_percent",
    title: "Labour cost as % of revenue",
    description: `Labour cost as a percentage of net revenue between two dates, grouped by day, week or department. Labour cost = paid hours from timesheets × each person's base hourly rate for the job worked, plus an optional on-cost % (for example 12 for superannuation; 0 by default, so wages only). Revenue = recognised net revenue excluding GST. The result includes the inputs used. ${RANGE_NOTE}`,
    input: rangeInput({
      groupBy: z.enum(["day", "week", "department"]).optional().describe("How to group rows. Defaults to week."),
      onCostPercent: z
        .number()
        .min(0)
        .max(50)
        .optional()
        .describe("Optional on-cost added to wages, as a percentage (for example 12 for superannuation). Defaults to 0, wages only."),
    }),
    upstream: [
      { api: "workforce", endpoint: "GET /time-clock/v1/time-clocks" },
      { api: "workforce", endpoint: "GET /time-clock/v1/time-clocks/{timeClockId}/time-activities" },
      { api: "workforce", endpoint: "GET /pay-rates/v1/pay-rates" },
      { api: "workforce", endpoint: "GET /jobs/v1/jobs" },
      { api: "booking", endpoint: "GET /reporting/revenue-entries (one call per day)" },
    ],
    async run({ start, end, groupBy = "week", onCostPercent = 0 }, ctx) {
      const [jobs, clocks, payRates] = await Promise.all([
        ctx.workforce.listJobs(),
        ctx.workforce.listTimeClocks(),
        ctx.workforce.getPayRates(start, end),
      ]);
      const activities = [];
      for (const clock of clocks.filter((c) => !c.isArchived)) {
        activities.push(...(await ctx.workforce.listTimeActivities(clock.id, start, end)));
      }
      const shifts = workedShifts(activities, new Map(jobs.map((j) => [j.jobId, j.title])), ctx.timezone, { start, end });
      const revenue: DailyRevenue[] = (await dailyRevenue(ctx, start, end)).map(({ date, entries }) => ({
        date,
        netCents: entries.reduce((s, e) => s + cents(e.netRevenue), 0),
        gstCents: entries.reduce((s, e) => s + cents(e.taxPayable), 0),
        entries: entries.length,
      }));
      const result = computeLabourCost({ range: { start, end }, groupBy, onCostPercent, shifts, payRates, revenue });
      return {
        range: { start, end, timezone: ctx.timezone },
        groupBy,
        currency: "AUD",
        totals: result.totals,
        rows: result.rows,
        inputs: {
          timesheets: {
            source: "GET /time-clock/v1/time-clocks/{timeClockId}/time-activities",
            shiftsCounted: result.counts.shiftsCounted,
            shiftsWithoutRate: result.counts.shiftsWithoutRate,
            paidHours: result.totals.paidHours,
            unpaidBreakHours: result.counts.unpaidBreakHours,
          },
          payRates: {
            source: "GET /pay-rates/v1/pay-rates",
            basis: "Hourly rate for the job worked (job rate when set, otherwise the person's default rate).",
            onCostPercent,
          },
          revenue: {
            source: "GET /reporting/revenue-entries",
            basis: "Recognised net revenue, excluding GST.",
            entries: result.counts.revenueEntries,
            netRevenue: result.totals.netRevenue,
            gst: result.counts.gst,
          },
          labourByDepartment: result.byDepartment,
        },
        formula: "labourPercent = sum(paid hours × hourly rate × (1 + onCost%)) / sum(net revenue) × 100",
        assumptions: [
          "Award penalty rates, overtime and allowances are not applied; rates are base hourly rates.",
          onCostPercent > 0 ? `An on-cost of ${onCostPercent}% is added to every shift.` : "Wages only: superannuation and other on-costs are not added (set onCostPercent, e.g. 12).",
          "Unpaid manual breaks are deducted from clocked time.",
          "Department rows divide each department's labour cost by total venue revenue for the period.",
        ],
        warnings:
          result.counts.shiftsCounted === 0 && result.counts.revenueEntries === 0
            ? [...result.warnings, emptyNote(ctx, "timesheets or revenue", start, end).note]
            : result.warnings,
      };
    },
  }),
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
