import Link from "next/link";
import { ArrowRight, CalendarRange, Cloud } from "lucide-react";
import { MockNotice } from "@/components/mock-notice";
import { OneWayPath } from "@/components/one-way-path";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isWeekend, shortDate } from "@/core/dates";
import { SEED_END, SEED_START } from "@/mock/seed";
import { labour, listDemoTools } from "@/lib/demo-client";
import { hours, money, percent } from "@/lib/format";
import { exampleQuestions, LAST_WEEK } from "@/lib/questions";

export const dynamic = "force-static";

const GUARANTEES = [
  {
    title: "Nine tools, none that write",
    body: "Every tool is registered read-only and idempotent. There is no create, update or delete tool and no general request tool, so a ClickUp Super Agent has nothing it could change.",
  },
  {
    title: "GET-only, allowlisted paths",
    body: "The upstream client has one public method, get(), and a fixed list of Connecteam and ROLLER paths. A guard under it throws on any other method or host.",
  },
  {
    title: "Contact, bank, card and medical details removed",
    body: "Tools copy named fields only. Phone numbers, emails, addresses, birth dates, bank, card, tax file and Medicare numbers and medical guest flags never leave the server.",
  },
  {
    title: "Pay rates as department averages",
    body: "get_pay_rates never returns one person's rate. Staff names, hours and labour totals are returned, and on a day one person worked alone they can imply a rate, so choose who in ClickUp can use the connection.",
  },
  {
    title: "Secrets stay in your Cloudflare account",
    body: "Bearer tokens and API keys are Worker secrets your team sets. Logs carry tool names, timings and a token hash, never data.",
  },
];

export default async function Home() {
  const [weekly, daily, withSuper, { tools }, questions] = await Promise.all([
    labour(SEED_START, SEED_END, "week"),
    labour(SEED_START, SEED_END, "day"),
    labour(SEED_START, SEED_END, "week", 12),
    listDemoTools(),
    exampleQuestions(),
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
          <p className="text-sm font-medium text-primary">Connecteam + ROLLER → ClickUp AI</p>
          <h1 className="mt-2 text-[2.1rem] leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
            Read-only staff, roster and revenue data for ClickUp&apos;s AI
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
            A remote MCP server with mocked Connecteam (AU) and ROLLER APIs for{" "}
            <span className="font-medium text-foreground">Lakeside Play Centre</span>, a fictional play centre. It reads staff,
            rosters, timesheets, pay, bookings, payments and revenue, and works out labour cost as a share of revenue. Nothing
            can be created, changed or deleted.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge variant="outline" className="bg-card">Remote MCP server</Badge>
            <Badge variant="outline" className="bg-card">Streamable HTTP</Badge>
            <Badge variant="outline" className="bg-card">Cloudflare Worker build included</Badge>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-10 px-4">
              <Link href="/tools">
                Run the tools <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-10 px-4">
              <Link href="/connect">Add it to ClickUp</Link>
            </Button>
          </div>
          <p className="mt-4 flex max-w-xl gap-2 text-sm leading-relaxed text-muted-foreground">
            <Cloud className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              This public copy runs the same handler on Vercel. The Worker entry (
              <code className="font-mono text-[13px] text-foreground">src/worker.ts</code>) is tested in workerd and deploys with{" "}
              <code className="font-mono text-[13px] text-foreground">wrangler deploy</code>.
            </span>
          </p>
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
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Labour cost</dt>
              <dd className="mt-0.5 font-semibold tabular">{money(weekly.totals.labourCost)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Net revenue (ex GST)</dt>
              <dd className="mt-0.5 font-semibold tabular">{money(weekly.totals.netRevenue)}</dd>
            </div>
            <div className="col-span-2 flex items-baseline justify-between gap-3 rounded-lg bg-accent/70 px-3 py-2">
              <dt className="text-accent-foreground">Labour cost % of net revenue</dt>
              <dd className="text-xl font-semibold text-accent-foreground tabular">{percent(weekly.totals.labourPercent)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Paid hours from timesheets × base hourly rates, divided by recognised revenue excluding GST. The result returns these
            inputs too.
          </p>
        </div>
      </section>

      <MockNotice />

      {/* From 768 px the text sits beside the tall drawing; from 1152 px the wide drawing shows at its drawn size. */}
      <section
        aria-labelledby="path"
        className="md:grid md:grid-cols-[1fr_25rem] md:grid-rows-[auto_auto_1fr] md:items-start md:gap-x-8 min-[72rem]:block"
      >
        <h2 id="path" className="text-xl font-semibold tracking-tight md:col-start-1">
          One-way data path
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground text-pretty md:col-start-1">
          Data can only travel one way, from Connecteam and ROLLER to ClickUp. Writes and personal details stop inside the server.
        </p>
        <OneWayPath className="mt-5 md:col-start-2 md:row-[1/span_3] md:mt-0 min-[72rem]:mt-5" />
        <p className="mt-4 text-sm text-muted-foreground md:col-start-1">
          The numbers match the nine checks on{" "}
          <Link href="/how-it-works" className="font-medium text-primary underline underline-offset-4">
            How it works
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="ask">
        <div className="max-w-3xl">
          <h2 id="ask" className="text-xl font-semibold tracking-tight">
            Ask it in ClickUp
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Questions a manager could type into ClickUp Brain or a Super Agent, the tool call each one becomes, and what that call
            returns from the demo data. &ldquo;Last week&rdquo; is {shortDate(LAST_WEEK.start)} to {shortDate(LAST_WEEK.end)} 2026.
            ClickUp words its own reply; the figures come from these results.
          </p>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {questions.map((q, i) => (
            <li key={q.question} className={i === 0 ? "rounded-xl border border-primary/30 bg-card p-4 md:col-span-2" : "rounded-xl border bg-card p-4"}>
              <p className="font-medium text-pretty">&ldquo;{q.question}&rdquo;</p>
              <p className="mt-2 font-mono text-[12px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                <span className="text-accent-foreground">{q.tool}</span> {JSON.stringify(q.args).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ")}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-pretty">{q.answer}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="numbers">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="numbers" className="text-xl font-semibold tracking-tight">
            Four weeks of demo data
          </h2>
          <p className="text-sm text-muted-foreground">
            <CalendarRange className="mr-1 inline size-4 align-[-3px]" aria-hidden />
            {shortDate(SEED_START)} to {shortDate(SEED_END)} 2026 · Australia/Brisbane
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Labour cost % of net revenue"
            value={percent(weekly.totals.labourPercent)}
            note={`Base wages only. With 12% super: ${percent(withSuper.totals.labourPercent)}`}
            emphasis
          />
          <Stat label="Labour cost" value={money(weekly.totals.labourCost)} note={`${hours(weekly.totals.paidHours)} paid hours at base rates`} />
          <Stat label="Net revenue (ex GST)" value={money(weekly.totals.netRevenue)} note="Recognised on the visit date" />
          <Stat
            label="Weekdays vs weekends (base rates)"
            value={
              <span>
                {percent(split(false))} <span className="text-sm font-normal text-muted-foreground">vs</span> {percent(split(true))}
              </span>
            }
            note="Saturday and Sunday penalty rates would raise the weekend figure"
          />
        </div>
        <p className="mt-3 text-sm">
          <Link href="/labour-cost" className="font-medium text-primary underline-offset-4 hover:underline">
            See labour cost by day, week and department
          </Link>
        </p>
      </section>

      <section aria-labelledby="tools" className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <h2 id="tools" className="text-xl font-semibold tracking-tight">
            What keeps it read-only, and what it shares
          </h2>
          <ul className="mt-4 space-y-4">
            {GUARANTEES.map(({ title, body }) => (
              <li key={title}>
                <p className="font-medium">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm">
            <Link href="/how-it-works" className="font-medium text-primary underline-offset-4 hover:underline">
              Read the code behind each check
            </Link>
          </p>
        </div>
        <div className="self-start rounded-2xl border bg-card p-5">
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
