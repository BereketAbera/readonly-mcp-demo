import { dayLabel } from "@/core/dates";
import {
  callDemoTool,
  labour,
  type RevenueResult,
  type SchedulesResult,
  type TransactionsResult,
} from "@/lib/demo-client";
import { hours, money, moneyCents, percent } from "@/lib/format";

/** The last full week of demo data, standing in for "last week". */
export const LAST_WEEK = { start: "2026-11-16", end: "2026-11-22" } as const;
const SATURDAY = "2026-11-21";
const WEEKEND = { start: "2026-11-21", end: "2026-11-22" } as const;

export interface ExampleQuestion {
  question: string;
  tool: string;
  args: Record<string, unknown>;
  answer: string;
}

const LONG_DAYS: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const longDay = (date: string) => dayLabel(date).replace(/^\w{3}/, (d) => LONG_DAYS[d] ?? d);

/**
 * Questions a venue manager might ask in ClickUp, the tool call each one
 * becomes, and the answer from that call's real output on the demo data.
 * Built at build time, so the figures always match the tools.
 */
export async function exampleQuestions(): Promise<ExampleQuestion[]> {
  const weekArgs = { ...LAST_WEEK, groupBy: "week" };
  const dayArgs = { ...LAST_WEEK, groupBy: "day" };
  const rosterArgs = { start: SATURDAY, end: SATURDAY };
  const categoryArgs = { ...LAST_WEEK, groupBy: "category" };
  const [week, days, roster, payments, revenue] = await Promise.all([
    labour(LAST_WEEK.start, LAST_WEEK.end, "week"),
    labour(LAST_WEEK.start, LAST_WEEK.end, "day"),
    callDemoTool<SchedulesResult>("get_schedules", rosterArgs),
    callDemoTool<TransactionsResult>("get_transactions", WEEKEND),
    callDemoTool<RevenueResult>("get_revenue_report", categoryArgs),
  ]);

  const ranked = days.rows.filter((r) => r.labourPercent !== null).sort((a, b) => (b.labourPercent ?? 0) - (a.labourPercent ?? 0));
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];

  const duty = roster.shifts.filter((s) => s.department === "Duty manager").flatMap((s) => s.staff);
  const others = roster.byDepartment
    .filter((d) => d.department !== "Duty manager")
    .sort((a, b) => b.shifts - a.shifts)
    .map((d) => `${d.department.toLowerCase()} ${d.shifts}`);

  const methodTotal = (name: string) => payments.byMethod.find((m) => m.method === name)?.amount ?? 0;
  const eftpos = methodTotal("EFTPOS");
  const credit = methodTotal("Credit card");
  const cash = methodTotal("Cash");

  const [top, second] = revenue.rows;
  const share = Math.round((top.netRevenue / revenue.totals.netRevenue) * 100);

  return [
    {
      question: "What was labour as a percentage of revenue last week?",
      tool: "labour_cost_percent",
      args: weekArgs,
      answer: `${percent(week.totals.labourPercent)}: ${money(week.totals.labourCost)} in base wages against ${money(week.totals.netRevenue)} of net revenue (ex GST).`,
    },
    {
      question: "Which day last week had the worst labour cost against revenue?",
      tool: "labour_cost_percent",
      args: dayArgs,
      answer: `${longDay(worst.key)}, at ${percent(worst.labourPercent)} (${money(worst.labourCost)} of wages, ${money(worst.netRevenue ?? 0)} of revenue). The best was ${longDay(best.key)} at ${percent(best.labourPercent)}.`,
    },
    {
      question: "Who is rostered on Saturday?",
      tool: "get_schedules",
      args: rosterArgs,
      answer: `${roster.shiftCount} shifts and ${hours(roster.scheduledHours)} rostered hours. ${duty.join(" and ")} is duty manager; the rest: ${others.join(", ")}.`,
    },
    {
      question: "How much did we take by card at the weekend?",
      tool: "get_transactions",
      args: WEEKEND,
      answer: `${moneyCents(eftpos + credit)} by card (EFTPOS ${moneyCents(eftpos)}, credit card ${moneyCents(credit)}) of ${moneyCents(payments.totalTaken)} taken; ${moneyCents(cash)} was cash.`,
    },
    {
      question: "Which part of the business earned the most last week?",
      tool: "get_revenue_report",
      args: categoryArgs,
      answer: `${top.label}: ${money(top.netRevenue)} of ${money(revenue.totals.netRevenue)} net revenue (${share}%). ${second.label} came second with ${money(second.netRevenue)}.`,
    },
  ];
}
