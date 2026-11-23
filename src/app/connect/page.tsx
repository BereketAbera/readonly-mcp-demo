import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Breakable } from "@/components/breakable";
import { CodeBlock } from "@/components/code-block";
import { CopyButton, LIGHT_COPY_BUTTON } from "@/components/copy-button";
import { PageIntro } from "@/components/page-intro";
import { publicDemoToken, siteOrigin } from "@/lib/site";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Connect" };

/** A value to paste into a form, with its own copy button. */
function ValueChip({ value, name }: { value: string; name: string }) {
  return (
    <span className="mt-1.5 flex max-w-full items-center justify-between gap-2 rounded-lg border bg-muted/60 py-1 pr-1 pl-2.5">
      <code className="min-w-0 font-mono text-[12.5px] text-foreground [overflow-wrap:anywhere]">
        <Breakable text={value} after="/.-" />
      </code>
      <CopyButton value={value} ariaLabel={`Copy ${name}`} className={LIGHT_COPY_BUTTON} />
    </span>
  );
}

const ACCOUNT_STEPS: Array<{ title: string; body: ReactNode }> = [
  {
    title: "Your private repo, your Cloudflare account",
    body: "The code lives in your GitHub repository and deploys from it, through Workers Builds or a deploy token you control.",
  },
  {
    title: "Your team enters the keys",
    body: (
      <>
        The four API keys go in with <code className="font-mono text-[12.5px]">wrangler secret put</code> or the Cloudflare
        dashboard. Worker secrets cannot be read back once set, so I never see them.
      </>
    ),
  },
  {
    title: "Built against the mocks first",
    body: (
      <>
        Development runs in mock mode, which uses the same request shapes. The live check is a smoke test that prints counts only (
        <code className="font-mono text-[12.5px]">scripts/smoke.mjs</code>), never names or amounts.
      </>
    ),
  },
  {
    title: "Nothing of yours is published",
    body: "This public demo uses only public API docs and fictional data. Your code and data stay private, and the code is yours.",
  },
];

export default function ConnectPage() {
  const token = publicDemoToken();
  const endpoint = `${siteOrigin()}/mcp`;

  const curlList = [
    `curl -s ${endpoint} \\`,
    `  -H "Authorization: Bearer ${token}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Accept: application/json, text/event-stream" \\`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  ].join("\n");

  const curlCall = [
    `curl -s ${endpoint} \\`,
    `  -H "Authorization: Bearer ${token}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Accept: application/json, text/event-stream" \\`,
    `  -d '{`,
    `    "jsonrpc": "2.0", "id": 2, "method": "tools/call",`,
    `    "params": {`,
    `      "name": "labour_cost_percent",`,
    `      "arguments": { "start": "2026-11-16", "end": "2026-11-22", "groupBy": "day" }`,
    `    }`,
    `  }'`,
  ].join("\n");

  const config = JSON.stringify(
    {
      mcpServers: {
        "lakeside-readonly": {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );

  const sdk = `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "my-client", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("${endpoint}"), {
    requestInit: { headers: { Authorization: "Bearer ${token}" } },
  }),
);

const { tools } = await client.listTools(); // nine read-only tools
const result = await client.callTool({
  name: "labour_cost_percent",
  arguments: { start: "2026-11-16", end: "2026-11-22", groupBy: "day" },
});`;

  const facts: Array<{ label: string; value: string; copy?: string }> = [
    { label: "Endpoint", value: endpoint, copy: "endpoint URL" },
    { label: "Header", value: `Authorization: Bearer ${token}`, copy: "authorization header" },
    { label: "Transport", value: "Streamable HTTP, stateless: POST only, JSON responses, one message per request" },
    { label: "Protocol", value: "2025-11-25 (older versions negotiated by the SDK)" },
    { label: "Rate limit", value: "60 requests per minute per token (per visitor for this public token)" },
  ];

  return (
    <div className="space-y-10">
      <PageIntro eyebrow="Connect ClickUp or any MCP client" title="One URL, one header">
        The public token below only works while the APIs are mocked, so it is safe to share. A real deployment gives each
        connection its own secret token instead.
      </PageIntro>

      <section aria-labelledby="endpoint" className="overflow-hidden rounded-2xl border bg-card">
        <h2 id="endpoint" className="sr-only">
          Endpoint details
        </h2>
        <dl className="divide-y">
          {facts.map(({ label, value, copy }) => (
            <div
              key={label}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:gap-x-4"
            >
              <dt className="col-start-1 row-start-1 text-sm text-muted-foreground">{label}</dt>
              <dd
                className={
                  copy
                    ? "col-span-2 min-w-0 font-mono text-[12.5px] [overflow-wrap:anywhere] sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-[13.5px]"
                    : "col-span-2 min-w-0 text-sm sm:col-span-1 sm:col-start-2 sm:row-start-1"
                }
              >
                {copy ? <Breakable text={value} after="/." /> : value}
              </dd>
              {copy ? (
                <dd className="col-start-2 row-start-1 sm:col-start-3">
                  <CopyButton value={value} ariaLabel={`Copy ${copy}`} className={LIGHT_COPY_BUTTON} />
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="clickup" className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 id="clickup" className="text-lg font-semibold tracking-tight">
          Adding it to ClickUp
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          ClickUp Brain and Super Agents can use tools from an external MCP server added as a Custom MCP connection. Following
          ClickUp&apos;s help article on connecting an MCP server to a Workspace:
        </p>
        <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 text-sm md:grid-cols-2">
          <li className="min-w-0 rounded-xl border bg-background p-4">
            <StepNumber n={1} />
            <p className="mt-2 font-medium">Open Custom MCP</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              In ClickUp&apos;s browser app, open the App Center (Workspace avatar, then Apps), select Custom MCP in the sidebar and
              click Add New.
            </p>
          </li>
          <li className="min-w-0 rounded-xl border bg-background p-4">
            <StepNumber n={2} />
            <p className="mt-2 font-medium">Choose who can use it</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Pick <span className="font-medium text-foreground">Just for me</span>, a personal connection only you can use. Pick For
              all members only if everyone in the Workspace may see staff hours and pay; only owners and admins can add that.
            </p>
          </li>
          <li className="min-w-0 rounded-xl border bg-background p-4">
            <StepNumber n={3} />
            <p className="mt-2 font-medium">Name, URL and authentication</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">Name it, for example Venue data (read-only), and paste the URL:</p>
            <ValueChip value={endpoint} name="server URL" />
            <p className="mt-2.5 leading-relaxed text-muted-foreground">
              For authentication choose API key or No authentication, and add a custom header. Name:
            </p>
            <ValueChip value="Authorization" name="header name" />
            <p className="mt-2 leading-relaxed text-muted-foreground">Value:</p>
            <ValueChip value={`Bearer ${token}`} name="header value" />
          </li>
          <li className="min-w-0 rounded-xl border bg-background p-4">
            <StepNumber n={4} />
            <p className="mt-2 font-medium">Check the tools</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              ClickUp connects and lists the tools. Expect the nine on the{" "}
              <Link href="/tools" className="font-medium text-primary underline underline-offset-4">
                Tools page
              </Link>
              , then add them to a Super Agent or use them in Brain.
            </p>
          </li>
        </ol>
        <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          Not yet tested against a ClickUp Workspace, so labels in the dialog may differ; checking the connection is the first
          acceptance test. ClickUp has no fixed outbound IP addresses, so the endpoint relies on its token rather than an IP
          allowlist. For real data, give ClickUp its own secret token and rotate it by updating the Worker secret.
        </p>
      </section>

      <section aria-labelledby="accounts">
        <h2 id="accounts" className="text-lg font-semibold tracking-tight">
          Working in your accounts
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The real build happens in your Cloudflare account and private GitHub repository, and your team keeps the API credentials.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ACCOUNT_STEPS.map(({ title, body }) => (
            <li key={title} className="rounded-xl border bg-card p-4">
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="curl" className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <h2 id="curl" className="font-semibold">
            List the tools with curl
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">The Accept header must list both JSON and event streams.</p>
          <CodeBlock className="mt-3" code={curlList} caption="tools/list" language="bash" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">Call a tool</h2>
          <p className="mt-1 text-sm text-muted-foreground">Stateless: no session header is needed between calls.</p>
          <CodeBlock className="mt-3" code={curlCall} caption="tools/call" language="bash" />
        </div>
      </section>

      <section aria-labelledby="config" className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <h2 id="config" className="font-semibold">
            Generic MCP client config
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The common <code className="font-mono text-[13px]">mcpServers</code> shape for remote servers. Some clients name the
            type <code className="font-mono text-[13px]">streamable-http</code> or the URL key{" "}
            <code className="font-mono text-[13px]">serverUrl</code>.
          </p>
          <CodeBlock className="mt-3" code={config} caption="mcp.json" language="json" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">Official TypeScript SDK</h2>
          <p className="mt-1 text-sm text-muted-foreground">The same client the integration tests and the session transcript use.</p>
          <CodeBlock className="mt-3" code={sdk} caption="client.ts" />
        </div>
      </section>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
      {n}
    </span>
  );
}
