import type { Metadata } from "next";
import { Breakable } from "@/components/breakable";
import { PageIntro } from "@/components/page-intro";
import { RunThisTool } from "@/components/run-this-tool";
import { RunTool, type FieldSpec, type RunnableTool } from "@/components/run-tool";
import { Badge } from "@/components/ui/badge";
import { SEED_END, SEED_START } from "@/mock/seed";
import { bookingWait, listDemoTools, upstreamCallCount } from "@/lib/demo-client";
import { API_NAME, publicDemoToken } from "@/lib/site";
import { TOOLS } from "@/tools/catalog";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Tools" };

interface JsonSchemaProperty {
  type?: string;
  format?: string;
  enum?: string[];
  description?: string;
  minimum?: number;
  maximum?: number;
}

function fieldsOf(schema: { properties?: Record<string, object>; required?: string[] }): FieldSpec[] {
  return Object.entries((schema.properties ?? {}) as Record<string, JsonSchemaProperty>).map(([name, p]) => ({
    name,
    kind: p.enum ? "enum" : p.format === "date" ? "date" : p.type === "boolean" ? "boolean" : p.type === "number" ? "number" : "text",
    required: schema.required?.includes(name) ?? false,
    description: p.description,
    options: p.enum,
    min: p.minimum,
    max: p.maximum,
  }));
}

function typeLabel(p: JsonSchemaProperty): string {
  if (p.enum) return p.enum.map((v) => `"${v}"`).join(" | ");
  if (p.format === "date") return "date";
  if (p.type === "number" && (p.minimum !== undefined || p.maximum !== undefined)) return `number ${p.minimum ?? ""}–${p.maximum ?? ""}`;
  return p.type ?? "any";
}

function Requirement({ required, block = false }: { required: boolean; block?: boolean }) {
  const layout = block ? "mt-0.5 block w-fit" : "ml-1.5";
  return required ? (
    <span className={`${layout} rounded bg-destructive/10 px-1 py-px font-sans text-[11px] font-medium text-destructive`}>required</span>
  ) : (
    <span className={`${layout} font-sans text-[11px] text-muted-foreground`}>optional</span>
  );
}

export default async function ToolsPage() {
  const [{ tools }, fourWeeks] = await Promise.all([
    listDemoTools(),
    upstreamCallCount("labour_cost_percent", { start: SEED_START, end: SEED_END, groupBy: "week" }),
  ]);
  const upstream = new Map(TOOLS.map((t) => [t.name, t.upstream]));
  const runnable: RunnableTool[] = tools.map((t) => ({
    name: t.name,
    title: t.title ?? t.name,
    description: t.description ?? "",
    fields: fieldsOf(t.inputSchema as { properties?: Record<string, object>; required?: string[] }),
  }));

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="tools/list" title="Nine read-only tools">
        <p>
          Names, descriptions and input schemas below come from the server&apos;s own{" "}
          <code className="font-mono text-[15px]">tools/list</code> response. The panel sends a real request to{" "}
          <code className="font-mono text-[15px]">/mcp</code> and shows the JSON that ClickUp&apos;s AI, or any MCP client, would
          get back.
        </p>
        <p className="mt-2 text-sm">
          Here the APIs are mocked, so calls return at once. Live, ROLLER allows about one call per second: a four-week labour
          report needs {fourWeeks.booking} ROLLER calls on the demo data, so {bookingWait(fourWeeks.booking)} before caching.
        </p>
      </PageIntro>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:rounded-2xl">
          <RunTool tools={runnable} token={publicDemoToken()} />
        </div>

        <ol className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1" aria-label="Tools">
          {tools.map((tool) => {
            const props = Object.entries((tool.inputSchema.properties ?? {}) as Record<string, JsonSchemaProperty>);
            const required = new Set((tool.inputSchema.required as string[] | undefined) ?? []);
            return (
              <li key={tool.name} id={tool.name} className="scroll-mt-6 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="font-mono text-[15px] font-semibold text-accent-foreground">{tool.name}</h2>
                    <span className="text-sm text-muted-foreground">{tool.title}</span>
                  </div>
                  <RunThisTool name={tool.name} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tool.annotations?.readOnlyHint ? <Badge className="bg-success-soft text-success">readOnlyHint</Badge> : null}
                  {tool.annotations?.destructiveHint === false ? (
                    <Badge className="bg-success-soft text-success">destructiveHint: false</Badge>
                  ) : null}
                  {tool.annotations?.idempotentHint ? <Badge variant="secondary">idempotentHint</Badge> : null}
                </div>
                <p className="mt-2.5 text-sm leading-relaxed">{tool.description}</p>

                {props.length > 0 ? (
                  <>
                    {/* Phone: one parameter per block, notes underneath. */}
                    <dl className="mt-3 divide-y rounded-lg border text-[13px] sm:hidden" aria-label={`Parameters for ${tool.name}`}>
                      {props.map(([name, p]) => (
                        <div key={name} className="px-3 py-2">
                          <dt className="font-mono">
                            {name}
                            <Requirement required={required.has(name)} />
                          </dt>
                          <dd className="mt-0.5 font-mono text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{typeLabel(p)}</dd>
                          {p.description ? <dd className="mt-0.5 leading-relaxed text-muted-foreground">{p.description}</dd> : null}
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 hidden overflow-hidden rounded-lg border sm:block">
                    <table className="w-full table-fixed text-left text-[13px]">
                      <caption className="sr-only">Input parameters for {tool.name}</caption>
                      <colgroup>
                        <col className="w-[9.5rem]" />
                        <col className="w-[8rem]" />
                        <col />
                      </colgroup>
                      <thead className="bg-muted/70 text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-1.5 font-medium">Parameter</th>
                          <th scope="col" className="px-3 py-1.5 font-medium">Type</th>
                          <th scope="col" className="px-3 py-1.5 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {props.map(([name, p]) => (
                          <tr key={name} className="align-top">
                            <td className="px-3 py-1.5 font-mono [overflow-wrap:anywhere]">
                              {name}
                              <Requirement required={required.has(name)} block />
                            </td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground [overflow-wrap:anywhere]">{typeLabel(p)}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-[13px] text-muted-foreground">No input.</p>
                )}

                <div className="mt-3 grid gap-1.5 text-xs sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-x-2">
                  <span className="text-muted-foreground sm:pt-0.5">Upstream</span>
                  <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label={`Upstream calls for ${tool.name}`}>
                    {upstream.get(tool.name)?.map((u) => (
                      <li key={u.endpoint} className="max-w-full rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[11.5px] [overflow-wrap:anywhere]">
                        <span className="text-muted-foreground">{API_NAME[u.api]} </span>
                        <Breakable text={u.endpoint} />
                      </li>
                    ))}
                  </ul>
                </div>

                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw input schema (JSON Schema)</summary>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label={`JSON Schema for ${tool.name}`}
                    className="mt-2 max-h-72 overflow-auto rounded-lg bg-code p-3 font-mono text-[12px] leading-relaxed text-code-foreground focus-visible:outline-[#8fd3ff]"
                  >
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                </details>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
