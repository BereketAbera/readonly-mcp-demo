import type { Metadata } from "next";
import { LabourExplorer } from "@/components/labour-explorer";
import { MockNotice } from "@/components/mock-notice";
import { PageIntro } from "@/components/page-intro";
import { Stat } from "@/components/stat";
import { shortDate } from "@/core/dates";
import { SEED_END, SEED_START } from "@/mock/seed";
import { labour } from "@/lib/demo-client";
import { hours, money, percent } from "@/lib/format";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Labour cost" };

export default async function LabourCostPage() {
  const [week, day, department] = await Promise.all([
    labour(SEED_START, SEED_END, "week"),
    labour(SEED_START, SEED_END, "day"),
    labour(SEED_START, SEED_END, "department"),
  ]);
  const { inputs } = week;

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="labour_cost_percent" title="Labour cost as a share of revenue">
        The combined tool joins the two APIs: paid hours from timesheets, priced at each person&apos;s hourly rate for the
        job they clocked into, divided by recognised net revenue. Figures below are the tool&apos;s own output for{" "}
        {shortDate(SEED_START)} to {shortDate(SEED_END)} 2026.
      </PageIntro>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Labour cost / net revenue" value={percent(week.totals.labourPercent)} emphasis note="Four weeks, base rates" />
        <Stat label="Labour cost" value={money(week.totals.labourCost)} note={`${hours(week.totals.paidHours)} paid hours`} />
        <Stat label="Net revenue (ex GST)" value={money(week.totals.netRevenue)} note={`GST ${money(inputs.revenue.gst)}`} />
        <Stat label="Shifts priced" value={inputs.timesheets.shiftsCounted} note={`${hours(inputs.timesheets.unpaidBreakHours)} h unpaid breaks deducted`} />
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
                  <code className="font-mono text-[12.5px] text-accent-foreground break-all">{source}</code>
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
            <li>
              An optional <code className="font-mono text-[12.5px]">onCostPercent</code> input adds superannuation or other
              on-costs to every shift.
            </li>
          </ul>
        </div>
      </section>

      <MockNotice compact />
    </div>
  );
}
