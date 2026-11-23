import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { RunTool, type FieldSpec, type RunnableTool } from "@/components/run-tool";
import { Badge } from "@/components/ui/badge";
import { listDemoTools } from "@/lib/demo-client";
import { publicDemoToken } from "@/lib/site";
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

export default async function ToolsPage() {
  const { tools } = await listDemoTools();
  const upstream = new Map(TOOLS.map((t) => [t.name, t.upstream]));
  const runnable: RunnableTool[] = tools.map((t) => ({
    name: t.name,
    title: t.title ?? t.name,
    fields: fieldsOf(t.inputSchema as { properties?: Record<string, object>; required?: string[] }),
  }));

  return (
    <div className="space-y-8">
      <PageIntro eyebrow="tools/list" title="Nine read-only tools">
        Names, descriptions and input schemas below come from the server&apos;s own <code className="font-mono text-[15px]">tools/list</code>{" "}
        response. The form sends a real request to <code className="font-mono text-[15px]">/mcp</code> and shows the JSON that an MCP
        client would get back.
      </PageIntro>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
          <RunTool tools={runnable} token={publicDemoToken()} />
        </div>

        <ol className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1" aria-label="Tools">
          {tools.map((tool) => {
            const props = (tool.inputSchema.properties ?? {}) as Record<string, JsonSchemaProperty>;
            const required = new Set((tool.inputSchema.required as string[] | undefined) ?? []);
            return (
              <li key={tool.name} id={tool.name} className="scroll-mt-6 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="font-mono text-[15px] font-semibold text-accent-foreground">{tool.name}</h2>
                  <span className="text-sm text-muted-foreground">{tool.title}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tool.annotations?.readOnlyHint ? (
                    <Badge className="bg-success-soft text-success">readOnlyHint</Badge>
                  ) : null}
                  {tool.annotations?.destructiveHint === false ? (
                    <Badge className="bg-success-soft text-success">destructiveHint: false</Badge>
                  ) : null}
                  {tool.annotations?.idempotentHint ? <Badge variant="secondary">idempotentHint</Badge> : null}
                </div>
                <p className="mt-2.5 text-sm leading-relaxed">{tool.description}</p>

                {Object.keys(props).length > 0 ? (
                  <div className="mt-3 overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[28rem] text-left text-[13px]">
                      <caption className="sr-only">Input parameters for {tool.name}</caption>
                      <thead className="bg-muted/70 text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-1.5 font-medium">Parameter</th>
                          <th scope="col" className="px-3 py-1.5 font-medium">Type</th>
                          <th scope="col" className="px-3 py-1.5 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(props).map(([name, p]) => (
                          <tr key={name} className="align-top">
                            <td className="px-3 py-1.5 font-mono">
                              {name}
                              {required.has(name) ? <span className="text-destructive" aria-label="required">*</span> : null}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground">{typeLabel(p)}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] text-muted-foreground">No required input.</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Upstream:</span>
                  {upstream.get(tool.name)?.map((u) => (
                    <span key={u.endpoint} className="rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[11.5px]">
                      <span className="text-muted-foreground">{u.api === "workforce" ? "workforce" : "booking"} </span>
                      {u.endpoint}
                    </span>
                  ))}
                </div>

                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw input schema (JSON Schema)</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-code p-3 font-mono text-[12px] leading-relaxed text-code-foreground">
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
