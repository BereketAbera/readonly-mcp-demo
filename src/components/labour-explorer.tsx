"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isWeekend, weekdayIndex } from "@/core/dates";
import { hours, money, percent } from "@/lib/format";
import type { LabourResult, LabourRow } from "@/lib/demo-client";
import { cn } from "@/lib/utils";

const WEEKDAY = "var(--chart-1)";
const WEEKEND = "var(--chart-2)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function niceTop(rows: LabourRow[]): number {
  const max = Math.max(10, ...rows.map((r) => r.labourPercent ?? 0));
  return Math.ceil(max / 10) * 10;
}

function figures(row: LabourRow): string {
  return `${percent(row.labourPercent)} · labour ${money(row.labourCost)} · revenue ${money(row.netRevenue ?? 0)}`;
}

/**
 * Column chart. Each column is a button: hover, tap or the arrow keys select
 * it, and the readout under the chart shows its figures. The table below the
 * chart lists the same numbers for screen readers and for scanning.
 */
function ColumnChart({ rows, average, mode, label }: { rows: LabourRow[]; average: number | null; mode: "day" | "week"; label: string }) {
  const top = niceTop(rows);
  const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);
  const colorOf = (row: LabourRow) => (mode === "day" && isWeekend(row.key) ? WEEKEND : WEEKDAY);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusable, setFocusable] = useState(rows.length - 1);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const shown = hovered ?? selected;

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: rows.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = Math.min(rows.length - 1, Math.max(0, keys[event.key]));
    setFocusable(next);
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="select-none">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
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
        <div className="absolute inset-y-0 left-10 right-12">
          <div aria-hidden>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-border" style={{ bottom: `${(t / top) * 100}%` }}>
                <span className="absolute -left-10 w-8 -translate-y-1/2 text-right text-[11px] text-muted-foreground tabular">{t}%</span>
              </div>
            ))}
            {average !== null ? (
              <div
                className={cn("pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/70", mode === "day" ? "z-30" : "z-10")}
                style={{ bottom: `${(average / top) * 100}%` }}
              >
                <span className="absolute -right-12 w-11 -translate-y-1/2 pl-1.5 text-[11px] leading-tight font-medium text-foreground tabular">
                  avg
                  <br />
                  {percent(average)}
                </span>
              </div>
            ) : null}
          </div>
          <div role="group" aria-label={`${label}. Use the arrow keys to move between columns.`} className="absolute inset-0 flex items-end gap-[2px]">
            {rows.map((row, i) => {
              const height = ((row.labourPercent ?? 0) / top) * 100;
              const active = shown === i;
              return (
                <button
                  key={row.key}
                  ref={(el) => {
                    buttons.current[i] = el;
                  }}
                  type="button"
                  tabIndex={i === focusable ? 0 : -1}
                  aria-pressed={selected === i}
                  aria-label={`${row.label}: ${figures(row)}`}
                  onClick={() => {
                    setSelected(selected === i ? null : i);
                    setFocusable(i);
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setFocusable(i)}
                  onKeyDown={(e) => move(e, i)}
                  className="relative z-20 flex h-full min-w-0 flex-1 cursor-pointer items-end justify-center rounded-t-[4px] focus-visible:outline-offset-1"
                >
                  {mode === "week" ? (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 rounded bg-card/90 px-1 text-xs font-medium text-foreground tabular"
                      style={{ bottom: `calc(${height}% + 4px)` }}
                      aria-hidden
                    >
                      {percent(row.labourPercent)}
                    </span>
                  ) : null}
                  <span
                    aria-hidden
                    className={cn("block w-full rounded-t-[4px] transition-opacity", mode === "week" ? "max-w-20" : "max-w-6", shown !== null && !active && "opacity-55")}
                    style={{ height: `${height}%`, background: colorOf(row) }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-10 mr-12 mt-2 flex gap-[2px]" aria-hidden>
        {rows.map((row, i) => {
          const day = Number(row.key.slice(8));
          const month = Number(row.key.slice(5, 7));
          const monthMark = mode === "day" && (i === 0 || day === 1);
          return (
            <div key={row.key} className="min-w-0 flex-1 text-center text-[11px] leading-tight text-muted-foreground tabular">
              {mode === "week" ? (
                row.label.replace("Week of ", "w/c ")
              ) : (
                <>
                  <span className={weekdayIndex(row.key) === 0 || monthMark ? "" : "hidden sm:inline"}>{day}</span>
                  {monthMark ? <span className="block font-medium text-foreground">{MONTHS[month - 1]}</span> : null}
                </>
              )}
            </div>
          );
        })}
      </div>
      <p data-testid="chart-readout" className="mt-3 min-h-10 rounded-lg bg-muted/70 px-3 py-2 text-sm tabular sm:min-h-0" aria-hidden>
        {shown !== null ? (
          <>
            <span className="font-medium">{rows[shown].label}</span>
            <span className="text-muted-foreground"> · {figures(rows[shown])}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Tap or hover a column for its figures, or focus the chart and use the arrow keys.</span>
        )}
      </p>
    </div>
  );
}

function DepartmentBars({ rows }: { rows: LabourRow[] }) {
  const max = Math.max(...rows.map((r) => r.labourCost), 1);
  return (
    <ul aria-hidden className="space-y-3">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)_10.5rem]">
          <span className="truncate text-sm">{row.label}</span>
          <div className="h-5 min-w-0 rounded-r-[4px] bg-muted/70">
            <div className="h-full rounded-r-[4px]" style={{ width: `${(row.labourCost / max) * 100}%`, background: WEEKDAY }} />
          </div>
          <span className="col-start-2 text-xs text-muted-foreground tabular sm:col-start-3">
            {money(row.labourCost)} · {percent(row.labourPercent)} of revenue
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "Mon 26 Oct" in full; "Mon 26" on phones, where the month is in the chart above. */
function RowLabel({ row, groupBy }: { row: LabourRow; groupBy: LabourResult["groupBy"] }) {
  if (groupBy !== "day") return <>{row.label}</>;
  const short = row.label.split(" ").slice(0, 2).join(" ");
  return (
    <>
      <span className="sm:hidden" aria-hidden>
        {short}
      </span>
      <span className="hidden sm:inline">{row.label}</span>
      <span className="sr-only sm:hidden">{row.label}</span>
    </>
  );
}

function PeriodTable({ result, caption }: { result: LabourResult; caption: string }) {
  const department = result.groupBy === "department";
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-muted/70 text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">{department ? "Department" : result.groupBy === "week" ? "Week" : "Day"}</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Paid hours</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Labour cost</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{department ? "Share of labour" : "Net revenue"}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {department ? "% of revenue" : <><span className="sm:hidden">Labour %</span><span className="hidden sm:inline">Labour cost %</span></>}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y tabular">
          {result.rows.map((row) => (
            <tr key={row.key} className={cn(!department && result.groupBy === "day" && isWeekend(row.key) && "bg-[#fdf3ee]")}>
              <th scope="row" className="px-3 py-1.5 text-left font-normal whitespace-nowrap">
                <RowLabel row={row} groupBy={result.groupBy} />
              </th>
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
  const weekValues = week.rows.map((r) => r.labourPercent ?? 0);
  return (
    <section aria-labelledby="breakdown">
      <h2 id="breakdown" className="sr-only">
        Breakdown by day, week and department
      </h2>
      <Tabs defaultValue="day" className="gap-4">
        <TabsList aria-label="Group labour cost by">
          <TabsTrigger value="day" className="px-3">By day</TabsTrigger>
          <TabsTrigger value="week" className="px-3">By week</TabsTrigger>
          <TabsTrigger value="department" className="px-3">By department</TabsTrigger>
        </TabsList>

        <TabsContent value="week" className="space-y-5">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <h3 className="mb-1 text-sm font-medium">Labour cost % of net revenue, by week</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Flat: every week sits between {percent(Math.min(...weekValues))} and {percent(Math.max(...weekValues))}.
            </p>
            <ColumnChart rows={week.rows} average={week.totals.labourPercent} mode="week" label="Labour cost % of net revenue by week" />
          </div>
          <PeriodTable result={week} caption="Labour cost and revenue by week" />
        </TabsContent>

        <TabsContent value="day" className="space-y-5">
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-medium">Labour cost % of net revenue, by day</h3>
            <ColumnChart rows={day.rows} average={day.totals.labourPercent} mode="day" label="Labour cost % of net revenue by day" />
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
    </section>
  );
}
