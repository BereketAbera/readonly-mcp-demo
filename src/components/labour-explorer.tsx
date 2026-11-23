"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isWeekend, weekdayIndex } from "@/core/dates";
import { hours, money, percent } from "@/lib/format";
import type { LabourResult, LabourRow } from "@/lib/demo-client";
import { cn } from "@/lib/utils";

const WEEKDAY = "var(--chart-1)";
const WEEKEND = "var(--chart-2)";

function niceTop(rows: LabourRow[]): number {
  const max = Math.max(10, ...rows.map((r) => r.labourPercent ?? 0));
  return Math.ceil(max / 10) * 10;
}

function ColumnChart({ rows, average, mode }: { rows: LabourRow[]; average: number | null; mode: "day" | "week" }) {
  const top = niceTop(rows);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);
  const colorOf = (row: LabourRow) => (mode === "day" && isWeekend(row.key) ? WEEKEND : WEEKDAY);

  return (
    <div aria-hidden className="select-none">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {mode === "day" ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: WEEKDAY }} /> Weekday
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: WEEKEND }} /> Weekend
            </span>
          </>
        ) : null}
        {average !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-4 bg-foreground/70" /> Period average {percent(average)}
          </span>
        ) : null}
      </div>
      <div className="relative h-64">
        <div className="absolute inset-y-0 left-10 right-0">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${(t / top) * 100}%` }}>
              <span className="absolute -left-10 w-8 -translate-y-1/2 text-right text-[11px] text-muted-foreground tabular">{t}%</span>
            </div>
          ))}
          {average !== null ? (
            <div className="absolute inset-x-0 z-10 border-t border-foreground/70" style={{ bottom: `${(average / top) * 100}%` }} />
          ) : null}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {rows.map((row, i) => {
              const height = ((row.labourPercent ?? 0) / top) * 100;
              const align = i < 2 ? "left-0" : i > rows.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
              return (
                <div key={row.key} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                  {mode === "week" ? (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 text-xs font-medium text-foreground tabular"
                      style={{ bottom: `calc(${height}% + 4px)` }}
                    >
                      {percent(row.labourPercent)}
                    </span>
                  ) : null}
                  <div
                    className="w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                    style={{ height: `${height}%`, background: colorOf(row) }}
                  />
                  <div
                    role="tooltip"
                    className={cn(
                      "pointer-events-none absolute z-20 hidden w-max max-w-56 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md group-hover:block",
                      align,
                    )}
                    style={{ bottom: `calc(${height}% + 8px)` }}
                  >
                    <p className="font-medium text-foreground">{row.label}</p>
                    <p className="mt-0.5 text-muted-foreground tabular">
                      {percent(row.labourPercent)} · labour {money(row.labourCost)} · revenue {money(row.netRevenue ?? 0)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-10 mt-2 flex gap-[2px]">
        {rows.map((row) => (
          <div key={row.key} className="min-w-0 flex-1 text-center text-[11px] text-muted-foreground tabular">
            {mode === "week" ? (
              row.label.replace("Week of ", "w/c ")
            ) : (
              <span className={weekdayIndex(row.key) === 0 ? "" : "hidden sm:inline"}>{Number(row.key.slice(8))}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentBars({ rows }: { rows: LabourRow[] }) {
  const max = Math.max(...rows.map((r) => r.labourCost), 1);
  return (
    <ul aria-hidden className="space-y-3">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <span className="truncate text-sm">{row.label}</span>
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-5 rounded-r-[4px]" style={{ width: `${(row.labourCost / max) * 72}%`, background: WEEKDAY }} />
            <span className="shrink-0 text-xs text-muted-foreground tabular">
              {money(row.labourCost)} · {percent(row.labourPercent)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PeriodTable({ result, caption }: { result: LabourResult; caption: string }) {
  const department = result.groupBy === "department";
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm sm:min-w-[34rem]">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/70 text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">{department ? "Department" : result.groupBy === "week" ? "Week" : "Day"}</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Paid hours</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Labour cost</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{department ? "Share of labour" : "Net revenue"}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{department ? "% of revenue" : "Labour %"}</th>
          </tr>
        </thead>
        <tbody className="divide-y tabular">
          {result.rows.map((row) => (
            <tr key={row.key} className={cn(!department && result.groupBy === "day" && isWeekend(row.key) && "bg-[#fdf3ee]")}>
              <th scope="row" className="px-3 py-1.5 text-left font-normal">{row.label}</th>
              <td className="hidden px-3 py-1.5 text-right sm:table-cell">{hours(row.paidHours)}</td>
              <td className="px-3 py-1.5 text-right">{money(row.labourCost)}</td>
              <td className="px-3 py-1.5 text-right">{department ? `${row.shareOfLabourCost.toFixed(1)}%` : money(row.netRevenue ?? 0)}</td>
              <td className="px-3 py-1.5 text-right font-medium">{percent(row.labourPercent)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-muted/40 font-medium tabular">
          <tr>
            <th scope="row" className="px-3 py-2 text-left">Total</th>
            <td className="hidden px-3 py-2 text-right sm:table-cell">{hours(result.totals.paidHours)}</td>
            <td className="px-3 py-2 text-right">{money(result.totals.labourCost)}</td>
            <td className="px-3 py-2 text-right">{department ? "100%" : money(result.totals.netRevenue)}</td>
            <td className="px-3 py-2 text-right">{percent(result.totals.labourPercent)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function LabourExplorer({ week, day, department }: { week: LabourResult; day: LabourResult; department: LabourResult }) {
  return (
    <Tabs defaultValue="day" className="gap-4">
      <TabsList aria-label="Group labour cost by">
        <TabsTrigger value="day" className="px-3">By day</TabsTrigger>
        <TabsTrigger value="week" className="px-3">By week</TabsTrigger>
        <TabsTrigger value="department" className="px-3">By department</TabsTrigger>
      </TabsList>

      <TabsContent value="week" className="space-y-5">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-medium">Labour cost as % of net revenue, by week</h3>
          <ColumnChart rows={week.rows} average={week.totals.labourPercent} mode="week" />
        </div>
        <PeriodTable result={week} caption="Labour cost and revenue by week" />
      </TabsContent>

      <TabsContent value="day" className="space-y-5">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-medium">Labour cost as % of net revenue, by day</h3>
          <ColumnChart rows={day.rows} average={day.totals.labourPercent} mode="day" />
          <p className="mt-3 text-xs text-muted-foreground">Day of month, 26 Oct to 22 Nov 2026. Hover a column for its figures; the table below lists every day.</p>
        </div>
        <PeriodTable result={day} caption="Labour cost and revenue by day" />
      </TabsContent>

      <TabsContent value="department" className="space-y-5">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-medium">Labour cost by department, and as % of total net revenue</h3>
          <DepartmentBars rows={department.rows} />
        </div>
        <PeriodTable result={department} caption="Labour cost by department" />
      </TabsContent>
    </Tabs>
  );
}
