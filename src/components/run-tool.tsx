"use client";

import { LoaderCircle, Play } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { highlight, type TokenKind } from "@/lib/highlight";
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
  fields: FieldSpec[];
}

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

const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "",
  comment: "text-[#93a1b8]",
  string: "text-[#9fe0b4]",
  keyword: "text-[#c9b8ff]",
  number: "text-[#ffd08a]",
  type: "text-[#8fd3ff]",
};

interface Outcome {
  status: number;
  ms: number;
  bytes: number;
  kind: "ok" | "tool-error" | "http-error";
  summary: string;
  body: string;
}

function Json({ text, className }: { text: string; className?: string }) {
  const tokens = useMemo(() => highlight(text), [text]);
  return (
    <pre className={cn("overflow-auto p-4 font-mono text-[12.5px] leading-relaxed", className)}>
      <code>
        {tokens.map((t, i) =>
          t.kind === "plain" ? (
            t.text
          ) : (
            <span key={i} className={TOKEN_CLASS[t.kind]}>
              {t.text}
            </span>
          ),
        )}
      </code>
    </pre>
  );
}

export function RunTool({ tools, token, endpoint = "/mcp" }: { tools: RunnableTool[]; token: string; endpoint?: string }) {
  const formId = useId();
  const [selected, setSelected] = useState("labour_cost_percent");
  const [values, setValues] = useState<Record<string, Record<string, string | boolean>>>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nextId, setNextId] = useState(1);

  const tool = tools.find((t) => t.name === selected) ?? tools[0];
  const current = useMemo(() => values[tool.name] ?? {}, [values, tool.name]);

  const args = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const field of tool.fields) {
      const value = current[field.name];
      if (value === undefined || value === "" || value === false) continue;
      out[field.name] = field.kind === "number" ? Number(value) : value;
    }
    return out;
  }, [tool, current]);

  const requestBody = JSON.stringify(
    { jsonrpc: "2.0", id: nextId, method: "tools/call", params: { name: tool.name, arguments: args } },
    null,
    2,
  );

  function setValue(name: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [tool.name]: { ...(prev[tool.name] ?? {}), [name]: value } }));
  }

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setRunning(true);
    const id = nextId;
    setNextId(id + 1);
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
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: tool.name, arguments: args },
        }),
      });
      const raw = await res.text();
      const ms = Math.round(performance.now() - started);
      let parsed: { result?: { isError?: boolean; structuredContent?: unknown; content?: Array<{ text?: string }> }; error?: unknown } | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (!res.ok || !parsed || parsed.error) {
        setOutcome({ status: res.status, ms, bytes: raw.length, kind: "http-error", summary: `HTTP ${res.status}`, body: parsed ? JSON.stringify(parsed, null, 2) : raw });
      } else if (parsed.result?.isError) {
        setOutcome({
          status: res.status,
          ms,
          bytes: raw.length,
          kind: "tool-error",
          summary: "Tool returned an error",
          body: parsed.result.content?.map((c) => c.text).join("\n") ?? "",
        });
      } else {
        const content = parsed.result?.structuredContent ?? parsed.result?.content;
        setOutcome({ status: res.status, ms, bytes: raw.length, kind: "ok", summary: "Result", body: JSON.stringify(content, null, 2) });
      }
    } catch (error) {
      setOutcome({ status: 0, ms: 0, bytes: 0, kind: "http-error", summary: "Network error", body: String(error) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-labelledby={`${formId}-title`} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-5 py-4">
        <h2 id={`${formId}-title`} className="font-semibold">
          Run a tool
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Sends a JSON-RPC <code className="font-mono text-[13px]">tools/call</code> to <code className="font-mono text-[13px]">POST /mcp</code> with the
          public demo token.
        </p>
      </div>

      <form onSubmit={run} className="space-y-4 px-5 py-4" aria-describedby={`${formId}-hint`}>
        <div className="space-y-1.5">
          <label htmlFor={`${formId}-tool`} className="text-sm font-medium">
            Tool
          </label>
          <select
            id={`${formId}-tool`}
            value={tool.name}
            onChange={(e) => {
              setSelected(e.target.value);
              setOutcome(null);
            }}
            className="h-9 w-full rounded-md border border-input bg-card px-2.5 font-mono text-sm"
          >
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {tool.fields.length === 0 ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tool.fields.map((field) => {
              const id = `${formId}-${tool.name}-${field.name}`;
              const value = current[field.name];
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
                      <span className="font-mono font-medium">{field.name}</span>
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
                      id={id}
                      type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
                      required={field.required}
                      min={field.min}
                      max={field.max}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm tabular"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p id={`${formId}-hint`} className="text-xs text-muted-foreground">
          Seeded data: 26 Oct to 22 Nov 2026. Ranges over 31 days are rejected.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={running} className="h-9 px-4">
            {running ? <LoaderCircle className="animate-spin" aria-hidden /> : <Play aria-hidden />}
            {running ? "Running" : "Run tool"}
          </Button>
          <p aria-live="polite" className="text-sm text-muted-foreground tabular">
            {outcome
              ? outcome.status
                ? `HTTP ${outcome.status} · ${outcome.ms} ms · ${(outcome.bytes / 1024).toFixed(1)} KB`
                : outcome.summary
              : null}
          </p>
        </div>
      </form>

      {outcome ? (
        <div className="border-t px-5 py-4" data-testid="tool-result">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p
              className={cn(
                "text-sm font-medium",
                outcome.kind === "ok" ? "text-success" : outcome.kind === "tool-error" ? "text-warning" : "text-destructive",
              )}
            >
              {outcome.summary}
            </p>
            <CopyButton value={outcome.body} className="border-border bg-card text-foreground hover:bg-muted" />
          </div>
          <div className="overflow-hidden rounded-lg bg-code text-code-foreground">
            <Json text={outcome.body} className="max-h-[30rem]" />
          </div>
        </div>
      ) : null}
      <details className="group border-t px-5 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Request that will be sent</summary>
        <div className="mt-3 overflow-hidden rounded-lg bg-code text-code-foreground">
          <p className="border-b border-white/10 px-4 py-2 font-mono text-xs text-[#aab6c8]">
            POST {endpoint} · Authorization: Bearer {token} · Accept: application/json, text/event-stream
          </p>
          <Json text={requestBody} className="max-h-64" />
        </div>
      </details>

    </section>
  );
}
