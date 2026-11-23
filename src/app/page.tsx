import Link from "next/link";
import { ArrowRight, Ban, CalendarRange, EyeOff, KeyRound, ListChecks } from "lucide-react";
import { Architecture } from "@/components/architecture";
import { MockNotice } from "@/components/mock-notice";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isWeekend, shortDate } from "@/core/dates";
import { SEED_END, SEED_START } from "@/mock/seed";
import { labour, listDemoTools } from "@/lib/demo-client";
import { money, percent } from "@/lib/format";

export const dynamic = "force-static";

const GUARANTEES = [
  {
    icon: ListChecks,
    title: "Nine tools, none that write",
    body: "Every tool is registered read-only and idempotent. There is no create, update or delete tool and no general request tool.",
  },
  {
    icon: Ban,
    title: "GET-only, allowlisted paths",
    body: "The upstream client has one public method, get(), and a fixed list of paths. A guard under it throws on any other method.",
  },
  {
    icon: EyeOff,
    title: "Personal fields removed",
    body: "Phone, email, home address, date of birth, bank and card details are dropped from every result. Pay is only shown aggregated.",
  },
  {
    icon: KeyRound,
    title: "Secrets stay in the environment",
    body: "Bearer tokens and API credentials come from Worker secrets. Logs carry tool names, timings and a token hash, never data.",
  },
];

export default async function Home() {
  const [weekly, daily, { tools }] = await Promise.all([
    labour(SEED_START, SEED_END, "week"),
    labour(SEED_START, SEED_END, "day"),
    listDemoTools(),
  ]);

  const split = (weekend: boolean) => {
    const rows = daily.rows.filter((r) => isWeekend(r.key) === weekend);
    const cost = rows.reduce((s, r) => s + r.labourCost, 0);
    const revenue = rows.reduce((s, r) => s + (r.netRevenue ?? 0), 0);
    return revenue > 0 ? Math.round((cost / revenue) * 1000) / 10 : null;
  };

  return (
    <div className="space-y-14">
      <section className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-card">Remote MCP server</Badge>
            <Badge variant="outline" className="bg-card">Streamable HTTP</Badge>
            <Badge variant="outline" className="bg-card">Runs on Cloudflare Workers</Badge>
          </div>
          <h1 className="mt-4 text-[2.1rem] leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
            Read-only venue data for a project-management assistant
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            A small MCP server that lets an assistant read staff, rosters, timesheets, pay, bookings, products, payments
            and revenue for <span className="font-medium text-foreground">Lakeside Play Centre (fictional)</span>, and
            work out labour cost as a share of revenue. It has no way to create, change or delete anything.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-10 px-4">
              <Link href="/tools">
                Run the tools <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-10 px-4">
              <Link href="/connect">Connect an MCP client</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Example call</p>
          <div className="mt-3 rounded-lg bg-code p-4 font-mono text-[13px] leading-relaxed text-code-foreground">
            <p className="text-[#93a1b8]">{"// tools/call"}</p>
            <p>
              <span className="text-[#8fd3ff]">labour_cost_percent</span>({"{"}
            </p>
            <p className="pl-4">
              start: <span className="text-[#9fe0b4]">&quot;{SEED_START}&quot;</span>,
            </p>
            <p className="pl-4">
              end: <span className="text-[#9fe0b4]">&quot;{SEED_END}&quot;</span>,
            </p>
            <p className="pl-4">
              groupBy: <span className="text-[#9fe0b4]">&quot;week&quot;</span>
            </p>
            <p>{"})"}</p>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Labour cost</dt>
              <dd className="mt-0.5 font-semibold tabular">{money(weekly.totals.labourCost)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Net revenue</dt>
              <dd className="mt-0.5 font-semibold tabular">{money(weekly.totals.netRevenue)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Labour %</dt>
              <dd className="mt-0.5 font-semibold text-accent-foreground tabular">{percent(weekly.totals.labourPercent)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Paid hours from timesheets x hourly rates, divided by recognised revenue excluding GST. The result returns
            these inputs too.
          </p>
        </div>
      </section>

      <MockNotice />

      <section aria-labelledby="numbers">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="numbers" className="text-xl font-semibold tracking-tight">
            Four weeks of seeded data
          </h2>
          <p className="text-sm text-muted-foreground">
            <CalendarRange className="mr-1 inline size-4 align-[-3px]" aria-hidden />
            {shortDate(SEED_START)} to {shortDate(SEED_END)} 2026 · Australia/Brisbane
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Net revenue (ex GST)" value={money(weekly.totals.netRevenue)} note="Recognised on the visit date" />
          <Stat label="Labour cost" value={money(weekly.totals.labourCost)} note={`${Math.round(weekly.totals.paidHours).toLocaleString("en-AU")} paid hours, base rates`} />
          <Stat label="Labour cost / revenue" value={percent(weekly.totals.labourPercent)} note="All four weeks" emphasis />
          <Stat
            label="Weekdays vs weekends"
            value={
              <span>
                {percent(split(false))} <span className="text-base font-normal text-muted-foreground">vs</span> {percent(split(true))}
              </span>
            }
            note="Quiet term-time weekdays carry the most labour per dollar"
          />
        </div>
        <p className="mt-3 text-sm">
          <Link href="/labour-cost" className="font-medium text-primary underline-offset-4 hover:underline">
            See labour cost by day, week and department
          </Link>
        </p>
      </section>

      <section aria-labelledby="path">
        <h2 id="path" className="text-xl font-semibold tracking-tight">
          Request path
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The same TypeScript handler serves the Cloudflare Worker and this Next.js deployment. Each request passes the
          checks in this order before a tool runs.
        </p>
        <div className="mt-4">
          <Architecture />
        </div>
      </section>

      <section aria-labelledby="tools" className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <h2 id="tools" className="text-xl font-semibold tracking-tight">
            What keeps it read-only
          </h2>
          <ul className="mt-4 space-y-4">
            {GUARANTEES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm">
            <Link href="/how-it-works" className="font-medium text-primary underline-offset-4 hover:underline">
              Read the code behind each check
            </Link>
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Tools the server lists</h3>
            <span className="text-xs text-muted-foreground">from tools/list</span>
          </div>
          <ul className="mt-3 divide-y">
            {tools.map((tool) => (
              <li key={tool.name} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                <code className="shrink-0 font-mono text-[13px] font-medium text-accent-foreground sm:w-44">{tool.name}</code>
                <span className="text-sm text-muted-foreground">{tool.title ?? tool.annotations?.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
