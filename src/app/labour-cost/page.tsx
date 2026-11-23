import type { Metadata } from "next";
import { Gauge, Scale } from "lucide-react";
import { Breakable } from "@/components/breakable";
import { LabourExplorer } from "@/components/labour-explorer";
import { MockNotice } from "@/components/mock-notice";
import { PageIntro } from "@/components/page-intro";
import { Stat } from "@/components/stat";
import { shortDate } from "@/core/dates";
import { SEED_END, SEED_START } from "@/mock/seed";
import { bookingWait, labour, upstreamCallCount } from "@/lib/demo-client";
import { hours, money, percent } from "@/lib/format";
import { LAST_WEEK } from "@/lib/questions";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Labour cost" };

export default async function LabourCostPage() {
  const [week, day, department, withSuper, fourWeeks, oneWeek] = await Promise.all([
    labour(SEED_START, SEED_END, "week"),
    labour(SEED_START, SEED_END, "day"),
    labour(SEED_START, SEED_END, "department"),
    labour(SEED_START, SEED_END, "week", 12),
    upstreamCallCount("labour_cost_percent", { start: SEED_START, end: SEED_END, groupBy: "week" }),
    upstreamCallCount("labour_cost_percent", { ...LAST_WEEK, groupBy: "week" }),
  ]);
  const { inputs } = week;

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="labour_cost_percent" title="Labour cost as a share of revenue">
        The combined tool joins the two APIs: paid hours from Connecteam timesheets, priced at each person&apos;s hourly rate for
        the job they clocked into, divided by recognised net revenue from ROLLER. Figures below are the tool&apos;s own output for{" "}
        {shortDate(SEED_START)} to {shortDate(SEED_END)} 2026.
      </PageIntro>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Labour cost % of net revenue"
          value={percent(week.totals.labourPercent)}
          emphasis
          note={`Base wages only. With 12% super: ${percent(withSuper.totals.labourPercent)}`}
        />
        <Stat label="Labour cost" value={money(week.totals.labourCost)} note={`${hours(week.totals.paidHours)} paid hours at base rates`} />
        <Stat label="Net revenue (ex GST)" value={money(week.totals.netRevenue)} note={`GST ${money(inputs.revenue.gst)}`} />
        <Stat label="Shifts priced" value={inputs.timesheets.shiftsCounted} note={`${hours(inputs.timesheets.unpaidBreakHours)} h unpaid breaks deducted`} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <p className="flex gap-3 rounded-xl border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
          <Scale className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Award costs.</span> These are base hourly rates, so Saturday and Sunday
            penalty rates, overtime and allowances are not in the figures. The real build takes award costs from Connecteam&apos;s
            timesheet pay items, and super can be added with <code className="font-mono text-[12.5px]">onCostPercent</code>.
          </span>
        </p>
        <p className="flex gap-3 rounded-xl border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
          <Gauge className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Live speed.</span> ROLLER allows about one call per second, and revenue
            entries come one day per query, 100 per page. On the demo data four weeks take {fourWeeks.booking} ROLLER calls (
            {bookingWait(fourWeeks.booking)}) and one week {oneWeek.booking} ({bookingWait(oneWeek.booking)}). Caching closed days in
            Workers KV or D1 is a planned milestone, so repeat questions skip those calls.
          </span>
        </p>
      </div>

      <LabourExplorer week={week} day={day} department={department} />

      <section aria-labelledby="inputs" className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 id="inputs" className="font-semibold">
            Inputs the tool returns
          </h2>
          <dl className="mt-3 divide-y text-sm">
            {[
              ["Timesheets", inputs.timesheets.source, `${inputs.timesheets.shiftsCounted} clocked shifts, ${hours(inputs.timesheets.paidHours)} paid hours`],
              ["Pay rates", inputs.payRates.source, inputs.payRates.basis],
              ["Revenue", inputs.revenue.source, `${inputs.revenue.entries.toLocaleString("en-AU")} revenue entries. ${inputs.revenue.basis}`],
            ].map(([label, source, detail]) => (
              <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[6.5rem_1fr]">
                <dt className="font-medium">{label}</dt>
                <dd>
                  <code className="font-mono text-[12.5px] text-accent-foreground [overflow-wrap:anywhere]">
                    <Breakable text={source} />
                  </code>
                  <p className="mt-0.5 text-muted-foreground">{detail}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Formula and assumptions</h2>
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 font-mono text-[12.5px] leading-relaxed">{week.formula}</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {week.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </section>

      <MockNotice compact />
    </div>
  );
}
