"use client";

import { AlertTriangle, CircleCheck, LoaderCircle, Play, WifiOff } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Tokens } from "@/components/code-body";
import { CopyButton, LIGHT_COPY_BUTTON } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { daysInclusive, MAX_RANGE_DAYS } from "@/core/dates";
import { hours, money, moneyCents, percent } from "@/lib/format";
import { highlight } from "@/lib/highlight";
import { DEMO_RANGE_LABEL } from "@/lib/site";
import { cn } from "@/lib/utils";

export interface FieldSpec {
  name: string;
  kind: "date" | "enum" | "boolean" | "number" | "text";
  required: boolean;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
}

export interface RunnableTool {
  name: string;
  title: string;
  description: string;
  fields: FieldSpec[];
}

/** Fired by the "Run this tool" buttons on the tool cards. */
export const RUN_TOOL_EVENT = "demo:run-tool";

const DEMO_START = "2026-10-26";
const DEMO_END = "2026-11-22";

const DEFAULTS: Record<string, Record<string, string | boolean>> = {
  list_staff: {},
  get_schedules: { start: "2026-11-16", end: "2026-11-22" },
  get_timesheets: { start: "2026-11-09", end: "2026-11-15" },
  get_pay_rates: { asOf: "2026-11-20" },
  list_bookings: { start: "2026-11-21", end: "2026-11-21" },
  list_products: {},
  get_transactions: { start: "2026-11-21", end: "2026-11-22" },
  get_revenue_report: { start: "2026-11-16", end: "2026-11-22", groupBy: "category" },
  labour_cost_percent: { start: "2026-10-26", end: "2026-11-22", groupBy: "week" },
};

const PLACEHOLDERS: Record<string, string> = {
  onCostPercent: "e.g. 12 for super",
  department: "e.g. Front desk",
  category: "e.g. Admissions",
};

type Data = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const obj = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
const arr = (v: unknown): Data[] => (Array.isArray(v) ? (v as Data[]) : []);

/** One plain-English line about a result, shown above the JSON. */
function summarise(tool: string, d: Data): string | null {
  switch (tool) {
    case "list_staff":
      return `${num(d.count)} staff across ${arr(d.activeByDepartment).length} departments.`;
    case "get_schedules":
      return `${num(d.shiftCount)} rostered shifts, ${hours(num(d.scheduledHours))} scheduled hours.`;
    case "get_timesheets":
      return `${num(d.entryCount)} clocked shifts, ${hours(num(d.paidHours))} paid hours; ${num(d.unrosteredEntries)} not on the roster.`;
    case "get_pay_rates": {
      const departments = arr(d.departments);
      const withheld = departments.filter((x) => x.withheld).length;
      return `Average hourly rate for ${departments.length - withheld} departments${withheld ? `; ${withheld} withheld (too few rated positions)` : ""}.`;
    }
    case "list_bookings":
      return `${num(d.bookingCount)} bookings worth ${moneyCents(num(d.bookingValue))}.`;
    case "list_products":
      return `${num(d.count)} products.`;
    case "get_transactions":
      return `${num(d.paymentCount)} payments, ${moneyCents(num(d.totalTaken))} taken.`;
    case "get_revenue_report": {
      const t = obj(d.totals);
      return `${money(num(t.netRevenue))} net revenue (ex GST), ${money(num(t.grossRevenue))} gross.`;
    }
    case "labour_cost_percent": {
      const t = obj(d.totals);
      return t.labourPercent === null
        ? "No revenue in this range, so there is no labour percentage."
        : `Labour ${money(num(t.labourCost))} is ${percent(num(t.labourPercent))} of ${money(num(t.netRevenue))} net revenue.`;
    }
    default:
      return null;
  }
}

/** The reason inside an MCP error, without the protocol prefix. */
function readableError(text: string): string {
  const match = /Invalid arguments for tool [\w-]+:\s*([\s\S]+)$/.exec(text);
  return (match ? match[1] : text.replace(/^MCP error -?\d+:\s*/, "")).trim();
}

interface Outcome {
  tool: string;
  kind: "ok" | "tool-error" | "http-error" | "network-error";
  status: number;
  ms: number;
  bytes: number;
  /** Readable headline for errors, plain-English summary for results. */
  message: string | null;
  note: string | null;
  /** Raw body: JSON for results and HTTP errors, the server's text for tool errors. */
  body: string;
  request: string;
}

function Json({ text, label, className }: { text: string; label: string; className?: string }) {
  const tokens = useMemo(() => highlight(text), [text]);
  return (
    <pre
      tabIndex={0}
      role="region"
      aria-label={label}
      className={cn("overflow-auto p-4 font-mono text-[12.5px] leading-relaxed focus-visible:outline-[#8fd3ff] focus-visible:-outline-offset-2", className)}
    >
      <code>
        <Tokens tokens={tokens} />
      </code>
    </pre>
  );
}

function headerLines(endpoint: string, token: string): string {
  return [
    `POST ${endpoint}`,
    `Authorization: Bearer ${token}`,
    "Content-Type: application/json",
    "Accept: application/json, text/event-stream",
    "MCP-Protocol-Version: 2025-11-25",
  ].join("\n");
}

function RequestView({ endpoint, token, body }: { endpoint: string; token: string; body: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-code text-code-foreground">
      <pre className="border-b border-white/10 px-4 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[#aab6c8] [overflow-wrap:anywhere]">
        {headerLines(endpoint, token)}
      </pre>
      <Json text={body} label="Request body" className="max-h-64" />
    </div>
  );
}

export function RunTool({ tools, token, endpoint = "/mcp" }: { tools: RunnableTool[]; token: string; endpoint?: string }) {
  const formId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState("labour_cost_percent");
  const [values, setValues] = useState<Record<string, Record<string, string | boolean>>>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nextId, setNextId] = useState(1);
  const [tried, setTried] = useState(false);

  const tool = tools.find((t) => t.name === selected) ?? tools[0];
  const current = useMemo(() => values[tool.name] ?? {}, [values, tool.name]);
  const hasRange = tool.fields.some((f) => f.name === "start") && tool.fields.some((f) => f.name === "end");

  useEffect(() => {
    function onSelect(event: Event) {
      const name = (event as CustomEvent<string>).detail;
      if (!tools.some((t) => t.name === name)) return;
      setSelected(name);
      setOutcome(null);
      setTried(false);
      const section = sectionRef.current;
      if (section) {
        const top = section.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.6) {
          const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          section.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
        }
      }
      selectRef.current?.focus({ preventScroll: true });
    }
    window.addEventListener(RUN_TOOL_EVENT, onSelect);
    return () => window.removeEventListener(RUN_TOOL_EVENT, onSelect);
  }, [tools]);

  // Bring a new result into view: inside the sticky panel on wide screens, on the page on phones.
  useEffect(() => {
    const el = resultRef.current;
    if (!outcome || !el) return;
    const { top } = el.getBoundingClientRect();
    if (top >= 0 && top < window.innerHeight - 200) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  }, [outcome]);

  const args = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const field of tool.fields) {
      const value = current[field.name];
      if (value === undefined || value === "" || value === false) continue;
      out[field.name] = field.kind === "number" ? Number(value) : value;
    }
    return out;
  }, [tool, current]);

  const start = typeof current.start === "string" ? current.start : "";
  const end = typeof current.end === "string" ? current.end : "";
  const rangeIssue = useMemo(() => {
    if (!hasRange || !start || !end) return null;
    if (end < start) return "The end date must be on or after the start date.";
    const days = daysInclusive(start, end);
    return days > MAX_RANGE_DAYS ? `Pick at most ${MAX_RANGE_DAYS} days; you picked ${days}.` : null;
  }, [hasRange, start, end]);
  const outsideDemo = hasRange && start && end && !rangeIssue && (end < DEMO_START || start > DEMO_END);

  const requestFor = (id: number) =>
    JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: tool.name, arguments: args } }, null, 2);

  function setValue(name: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [tool.name]: { ...(prev[tool.name] ?? {}), [name]: value } }));
  }

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (running) return;
    setTried(true);
    if (rangeIssue) {
      endRef.current?.focus();
      return;
    }
    setRunning(true);
    const id = nextId;
    setNextId(id + 1);
    const request = requestFor(id);
    const base = { tool: tool.name, request, note: null };
    const started = performance.now();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
          "MCP-Protocol-Version": "2025-11-25",
        },
        body: request,
      });
      const raw = await res.text();
      const ms = Math.round(performance.now() - started);
      const timing = { status: res.status, ms, bytes: new Blob([raw]).size };
      let parsed: { result?: { isError?: boolean; structuredContent?: unknown; content?: Array<{ text?: string }> }; error?: { message?: string } } | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (!res.ok || !parsed || parsed.error) {
        const message = parsed?.error?.message ?? `The server answered HTTP ${res.status}.`;
        setOutcome({ ...base, ...timing, kind: "http-error", message, body: parsed ? JSON.stringify(parsed, null, 2) : raw });
      } else if (parsed.result?.isError) {
        const text = parsed.result.content?.map((c) => c.text).join("\n") ?? "";
        setOutcome({ ...base, ...timing, kind: "tool-error", message: readableError(text), body: text });
      } else {
        const content = parsed.result?.structuredContent ?? parsed.result?.content;
        const data = obj(content);
        const note = [typeof data.note === "string" ? data.note : null, ...arr(data.warnings).map(String)].filter(Boolean).join(" ");
        setOutcome({ ...base, ...timing, kind: "ok", message: summarise(tool.name, data), note: note || null, body: JSON.stringify(content, null, 2) });
      }
    } catch (error) {
      setOutcome({
        ...base,
        kind: "network-error",
        status: 0,
        ms: 0,
        bytes: 0,
        message: "Could not reach /mcp. Check the connection and try again.",
        body: String(error),
      });
    } finally {
      setRunning(false);
    }
  }

  const shown = outcome && outcome.tool === tool.name ? outcome : null;
  const statusLine = shown
    ? shown.kind === "network-error"
      ? ""
      : shown.kind === "tool-error"
        ? `Tool error · isError: true · HTTP ${shown.status} · ${shown.ms} ms`
        : `HTTP ${shown.status} · ${shown.ms} ms · ${(shown.bytes / 1024).toFixed(1)} KB`
    : "";

  return (
    <section ref={sectionRef} aria-labelledby={`${formId}-title`} className="scroll-mt-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-5 py-4">
        <h2 id={`${formId}-title`} className="font-semibold">
          Run a tool
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Sends a JSON-RPC <code className="font-mono text-[13px]">tools/call</code> to <code className="font-mono text-[13px]">POST /mcp</code> with the
          public demo token.
        </p>
      </div>

      <form onSubmit={run} className="space-y-4 px-5 py-4">
        {/* Fields are locked while a call runs, so a result always belongs to the tool shown. */}
        <fieldset disabled={running} className="space-y-4">
          <legend className="sr-only">Tool and arguments</legend>
          <div className="space-y-1.5">
            <label htmlFor={`${formId}-tool`} className="text-sm font-medium">
              Tool
            </label>
            <select
              ref={selectRef}
              id={`${formId}-tool`}
              value={tool.name}
              aria-describedby={`${formId}-tool-desc`}
              onChange={(e) => {
                setSelected(e.target.value);
                setOutcome(null);
                setTried(false);
              }}
              className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm disabled:opacity-60"
            >
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} — {t.title}
                </option>
              ))}
            </select>
            <p id={`${formId}-tool-desc`} className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {tool.description}
            </p>
          </div>

          {tool.fields.length === 0 ? null : (
            <div className="grid gap-3 sm:grid-cols-2">
              {tool.fields.map((field) => {
                const id = `${formId}-${tool.name}-${field.name}`;
                const descId = `${id}-desc`;
                const value = current[field.name];
                const isEnd = field.name === "end" && hasRange;
                const invalid = isEnd && Boolean(rangeIssue);
                if (field.kind === "boolean") {
                  return (
                    <div key={field.name} className="flex items-start gap-2 sm:col-span-2">
                      <input
                        id={id}
                        type="checkbox"
                        checked={value === true}
                        onChange={(e) => setValue(field.name, e.target.checked)}
                        className="mt-0.5 size-4 accent-[var(--primary)]"
                      />
                      <label htmlFor={id} className="text-sm">
                        <span className="font-mono font-medium">{field.name}</span>{" "}
                        <span className="text-xs text-muted-foreground">optional</span>
                        {field.description ? <span className="block text-xs text-muted-foreground">{field.description}</span> : null}
                      </label>
                    </div>
                  );
                }
                return (
                  <div key={field.name} className={cn("space-y-1.5", field.kind === "text" && "sm:col-span-2")}>
                    <label htmlFor={id} className="flex items-baseline gap-1.5 text-sm">
                      <span className="font-mono font-medium">{field.name}</span>
                      <span className="text-xs text-muted-foreground">{field.required ? "required" : "optional"}</span>
                    </label>
                    {field.kind === "enum" ? (
                      <select
                        id={id}
                        value={typeof value === "string" ? value : ""}
                        aria-describedby={field.description ? descId : undefined}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm"
                      >
                        {field.required ? null : <option value="">(default)</option>}
                        {field.options?.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        ref={isEnd ? endRef : undefined}
                        id={id}
                        type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
                        required={field.required}
                        min={field.min}
                        max={field.max}
                        placeholder={PLACEHOLDERS[field.name]}
                        value={typeof value === "string" ? value : ""}
                        aria-invalid={invalid || undefined}
                        aria-describedby={[field.description ? descId : "", isEnd && rangeIssue ? `${formId}-range-error` : ""].filter(Boolean).join(" ") || undefined}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        className={cn(
                          "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm tabular placeholder:text-muted-foreground/80",
                          invalid && "border-destructive",
                        )}
                      />
                    )}
                    {field.description ? (
                      <p id={descId} className="text-xs leading-relaxed text-muted-foreground">
                        {field.description}
                      </p>
                    ) : null}
                    {isEnd && rangeIssue ? (
                      <p id={`${formId}-range-error`} role={tried ? "alert" : undefined} className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                        {rangeIssue}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {hasRange ? (
            <p className={cn("text-xs", outsideDemo ? "font-medium text-warning" : "text-muted-foreground")}>
              {outsideDemo
                ? `These dates are outside the demo data (${DEMO_RANGE_LABEL}), so the result will be empty.`
                : `Demo data: ${DEMO_RANGE_LABEL}. At most ${MAX_RANGE_DAYS} days per call.`}
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" aria-disabled={running || undefined} className="h-9 px-4 aria-disabled:opacity-70">
            {running ? <LoaderCircle className="animate-spin" aria-hidden /> : <Play aria-hidden />}
            {running ? "Running" : "Run tool"}
          </Button>
          <p aria-live="polite" className="text-sm text-muted-foreground tabular">
            {running ? "Waiting for /mcp…" : statusLine}
          </p>
        </div>
      </form>

      {shown ? (
        <div ref={resultRef} className="scroll-mt-3 border-t px-5 py-4" data-testid="tool-result">
          {shown.kind === "ok" ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                <CircleCheck className="size-4" aria-hidden /> Result
              </p>
              {shown.message ? <p className="mt-1.5 text-sm leading-relaxed">{shown.message}</p> : null}
              {shown.note ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{shown.note}</p> : null}
            </>
          ) : (
            <div
              className={cn(
                "rounded-lg border px-3.5 py-3",
                shown.kind === "tool-error" ? "border-[#f0d28a] bg-warning-soft text-warning" : "border-destructive/30 bg-destructive/5 text-destructive",
              )}
            >
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                {shown.kind === "network-error" ? <WifiOff className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}
                {shown.kind === "tool-error" ? "Tool error" : shown.kind === "network-error" ? "Network error" : `HTTP ${shown.status}`}
              </p>
              <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">{shown.message}</p>
              {shown.kind === "tool-error" ? (
                <p className="mt-2 font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">{shown.body}</p>
              ) : null}
            </div>
          )}

          {shown.kind === "network-error" ? null : (
            <Tabs key={shown.request} defaultValue="response" className="mt-3 gap-2">
              <div className="flex items-center justify-between gap-2">
                <TabsList aria-label="Exchange">
                  <TabsTrigger value="response" className="px-2.5">
                    Response
                  </TabsTrigger>
                  <TabsTrigger value="request" className="px-2.5">
                    Request sent
                  </TabsTrigger>
                </TabsList>
                <CopyButton value={shown.body} label="Copy" ariaLabel="Copy response" className={LIGHT_COPY_BUTTON} />
              </div>
              <TabsContent value="response">
                {shown.kind === "tool-error" ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Tool errors come back as plain text with <code className="font-mono">isError: true</code>, shown above.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg bg-code text-code-foreground">
                    <Json text={shown.body} label="Response JSON" className="max-h-[28rem] lg:max-h-[max(16rem,calc(100dvh-34rem))]" />
                  </div>
                )}
              </TabsContent>
              <TabsContent value="request">
                <RequestView endpoint={endpoint} token={token} body={shown.request} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      ) : (
        <details className="border-t px-5 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Request that will be sent</summary>
          <div className="mt-3">
            <RequestView endpoint={endpoint} token={token} body={requestFor(nextId)} />
          </div>
        </details>
      )}
    </section>
  );
}
