import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { PageIntro } from "@/components/page-intro";
import { publicDemoToken, siteOrigin } from "@/lib/site";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "Connect" };

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

  const facts: Array<[string, string, boolean]> = [
    ["Endpoint", endpoint, true],
    ["Header", `Authorization: Bearer ${token}`, true],
    ["Transport", "Streamable HTTP, stateless: POST only, JSON responses", false],
    ["Protocol", "2025-11-25 (older versions negotiated by the SDK)", false],
    ["Rate limit", "60 requests per minute per token", false],
  ];

  return (
    <div className="space-y-10">
      <PageIntro eyebrow="Connect from an MCP client" title="One URL, one header">
        The public token below only works while the upstream APIs are mocked, so it is safe to share. A real deployment
        would issue each connector its own secret token instead.
      </PageIntro>

      <section aria-labelledby="endpoint" className="overflow-hidden rounded-2xl border bg-card">
        <h2 id="endpoint" className="sr-only">
          Endpoint details
        </h2>
        <dl className="divide-y">
          {facts.map(([label, value, copy]) => (
            <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className={copy ? "min-w-0 font-mono text-[13.5px] break-all" : "min-w-0 text-sm"}>{value}</dd>
              {copy ? (
                <div>
                  <CopyButton value={value} className="border-border bg-card text-foreground hover:bg-muted" />
                </div>
              ) : (
                <span className="hidden sm:block" />
              )}
            </div>
          ))}
        </dl>
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

      <section aria-labelledby="clickup" className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 id="clickup" className="text-lg font-semibold tracking-tight">
          Adding it to ClickUp
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          ClickUp&apos;s help article on connecting an MCP server to a Workspace describes a custom server with a name, a URL, an
          authentication method and optional custom headers. Following that:
        </p>
        <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Open the App Center", "Go to MCP Servers and add a custom server."],
            ["Name and URL", `Name it, for example "Venue data (read-only)", and paste ${endpoint}.`],
            ["Authentication", "Use a custom header: Authorization with the value Bearer followed by the token."],
            ["Save", "ClickUp connects and shows the available tools. Expect the nine tools listed on the Tools page."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-xl border bg-background p-4">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <p className="mt-2 font-medium">{title}</p>
              <p className="mt-1 leading-relaxed break-words text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">
          Not tested against ClickUp: the exact field labels may differ in the App Center dialog. ClickUp needs a public HTTPS URL;
          for real data, give it a dedicated secret token and rotate it by updating the Worker secret.
        </p>
      </section>
    </div>
  );
}
