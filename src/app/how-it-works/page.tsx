import type { Metadata } from "next";
import { ShieldCheck, Users } from "lucide-react";
import { Breakable } from "@/components/breakable";
import { CodeBlock } from "@/components/code-block";
import { PageIntro } from "@/components/page-intro";
import { SHORT_ANSWER } from "@/lib/answer";
import { excerpt } from "@/lib/excerpts";
import { API_NAME } from "@/lib/site";
import { TOOLS } from "@/tools/catalog";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "How it works" };

const SECTIONS = [
  {
    id: "tools",
    title: "1. Only read tools are registered",
    body: "The server registers nine tools and nothing else: no resources, no prompts, no create, update or delete tools, and no tool that takes a URL, path or HTTP method. Every tool carries the read-only, non-destructive and idempotent hints, the tool list is fixed (listChanged: false), and the integration tests fail if any of that changes.",
    code: [excerpt("src/mcp/server.ts", "tool-registration")],
  },
  {
    id: "client",
    title: "2. The upstream client can only GET allowlisted paths",
    body: "Tools never call fetch directly. They go through ReadOnlyClient, whose only public method is get(). The path must match a fixed template list, so even a bug in a tool cannot reach an endpoint that writes.",
    code: [
      excerpt("src/upstream/http.ts", "readonly-client"),
      excerpt("src/upstream/workforce.ts", "workforce-allowlist"),
      excerpt("src/upstream/booking.ts", "booking-allowlist"),
    ],
  },
  {
    id: "guard",
    title: "3. A guard under the client blocks every other method",
    body: "The fetch function the clients receive is wrapped once more. It lets GET through to the two API hosts and POST through to the two OAuth token URLs, and throws on anything else. The tests send POST, PUT, PATCH and DELETE through it to prove that.",
    code: [excerpt("src/upstream/http.ts", "fetch-guard")],
  },
  {
    id: "inputs",
    title: "4. Inputs are validated before any upstream call",
    body: "Each tool has a Zod schema. Dates must be real calendar dates in YYYY-MM-DD form between 2000 and 2099, the end cannot precede the start, and a range is capped at 31 days. Enums and number bounds are checked the same way, and invalid input returns a readable tool error without touching an upstream API. Loops over dates count days rather than compare strings, so no input can keep one running.",
    code: [excerpt("src/tools/schemas.ts", "date-range")],
  },
  {
    id: "redaction",
    title: "5. Results carry named fields only, then get redacted again",
    body: "Each tool copies named fields into its own output shape. list_staff returns only the custom fields a deployment names, get_timesheets shows hasNote instead of note text unless notes are switched on, medical guest flags are never returned, and totals keyed by data (payment methods, departments, categories) come back as arrays. A second layer then drops personal and financial keys wherever they appear and masks phone numbers, emails, bank, tax file and Medicare numbers inside free text.",
    code: [excerpt("src/core/redact.ts", "redaction-rules")],
  },
  {
    id: "gate",
    title: "6. Every request passes the same gate",
    body: "Origin check against an explicit list (browser clients only), bearer token, method, a rate limit per token (and per visitor for the shared demo token), then the body: at most 64 KB and one JSON-RPC message. Batches were removed from MCP in 2025-06-18 and would let one request run many tool calls. The transport is stateless with JSON responses, so GET and DELETE get 405.",
    code: [excerpt("src/mcp/handler.ts", "request-gate")],
  },
  {
    id: "tokens",
    title: "7. Tokens are compared in constant time",
    body: "Both the presented token and each accepted token are hashed to 32 bytes and compared without an early exit. Logs and the rate limiter only ever see a short hash id, never the token.",
    code: [excerpt("src/core/auth.ts", "constant-time"), excerpt("src/core/rate-limit.ts", "rate-limit")],
  },
  {
    id: "oauth",
    title: "8. Upstream OAuth tokens are cached until they expire",
    body: "Both APIs use OAuth 2.0 client credentials. Tokens are reused until shortly before expiry, concurrent callers share one token request, and a 401 triggers exactly one refresh and retry. ROLLER's docs warn that requesting a token per call can get credentials suspended.",
    code: [excerpt("src/upstream/oauth.ts", "token-cache")],
  },
  {
    id: "mode",
    title: "9. Fictional data is never served by accident",
    body: "UPSTREAM_MODE must be exactly mock or live. Real API credentials or secret tokens force it to be set, and mock mode refuses to start next to real credentials. Every result also carries a dataSource field, so an assistant can tell the demo data from a venue's real figures.",
    code: [excerpt("src/core/config.ts", "upstream-mode")],
  },
];

const DOCS = [
  {
    api: "Connecteam (AU region)",
    seen: [
      "OAuth 2.0 client credentials: POST /oauth/v1/token, HTTP Basic client authentication, grant_type=client_credentials",
      "Australian accounts use the api-au.connecteam.com host",
      "Paths for users, jobs, schedulers, shifts (v2), time clocks, time activities and pay rates, with { requestId, data, paging } envelopes",
      "Pay-rate queries need startDate and endDate, at most 365 days apart; scopes schedule.read and pay_rates.read",
    ],
    assumed: [
      "Token lifetime of 24 hours",
      "Scope names users.read, jobs.read and time_clock.read",
      "How departments are set up: jobs, plus a 'Department' custom field on each user",
      "Manual breaks are unpaid; award penalty rates come from timesheet pay items, not the pay-rates endpoint",
    ],
  },
  {
    api: "ROLLER",
    seen: [
      "POST https://api.roller.app/token with a JSON body of client_id and client_secret, returning a Bearer token with expires_in (generally 24 hours)",
      "Reuse the token until a 401; one set of credentials per venue; one call per second",
      "API keys scoped to specific endpoints; restricted endpoints answer 403 INSUFFICIENT_SCOPE",
      "GET /bookings (search, up to 100 results), /data/products, /data/bookingpayments and /reporting/revenue-entries, with date filters of at most one day",
    ],
    assumed: [
      "Reporting endpoints return a plain JSON array, 100 entries per page",
      "Endpoints outside a key's scope also answer 403 INSUFFICIENT_SCOPE",
      "Field subsets and value formats beyond the documented examples",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="space-y-12">
      <PageIntro eyebrow="How it stays read-only" title="Nine checks between ClickUp's AI and the data">
        Every excerpt below is read from the repository at build time, so it is the code that is running. Short version: nothing in
        the server can send anything but GET to an allowlisted path, and no contact, bank, card or medical details leave it.
      </PageIntro>

      <section aria-labelledby="answer" className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-primary/30 bg-accent/50 p-5 sm:p-6">
          <h2 id="answer" className="flex items-center gap-2 font-semibold text-accent-foreground">
            <ShieldCheck className="size-5" aria-hidden />
            How it cannot modify or leak your data, in three sentences
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-pretty">{SHORT_ANSWER.join(" ")}</p>
        </div>
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="size-5 text-primary" aria-hidden />
            What it does share
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
            Staff names, rostered and clocked times, hours, labour totals and pay as department averages. That is what the questions
            need, and on a day one person worked a department alone, labour cost and hours together imply their rate. So who can use
            the connection in ClickUp decides who sees it: a personal (&ldquo;Just for me&rdquo;) connection keeps it to the person
            who adds it.
          </p>
        </div>
      </section>

      <nav aria-label="On this page" className="rounded-xl border bg-card px-4 py-3">
        <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                <span className="mr-1.5 text-xs text-primary tabular">{i + 1}</span>
                {s.title.replace(/^\d+\.\s*/, "")}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-6 space-y-4">
            <div className="max-w-3xl">
              <h2 id={`${section.id}-title`} className="text-lg font-semibold tracking-tight">
                {section.title}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{section.body}</p>
            </div>
            <div className="min-w-0 space-y-3">
              {section.code.map((c) => (
                <CodeBlock key={`${c.file}-${c.region}`} code={c.code} caption={`${c.file} · ${c.region}`} collapseAfter={26} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section aria-labelledby="mapping">
        <h2 id="mapping" className="text-lg font-semibold tracking-tight">
          Tool to upstream endpoint
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Every upstream call is a GET. ROLLER reports are fetched one day at a time.</p>
        <ul className="mt-4 divide-y rounded-xl border bg-card sm:hidden">
          {TOOLS.map((tool) => (
            <li key={tool.name} className="px-4 py-3">
              <p className="font-mono text-[13px] font-medium text-accent-foreground">{tool.name}</p>
              <ul className="mt-1 space-y-0.5 font-mono text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                {tool.upstream.map((u) => (
                  <li key={u.endpoint}>
                    <span className="text-foreground">{API_NAME[u.api]}</span> <Breakable text={u.endpoint} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden overflow-hidden rounded-xl border bg-card sm:block">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[12rem]" />
              <col className="w-[10rem]" />
              <col />
            </colgroup>
            <thead className="bg-muted/70 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Tool</th>
                <th scope="col" className="px-3 py-2 font-medium">API</th>
                <th scope="col" className="px-3 py-2 font-medium">Endpoints</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {TOOLS.map((tool) => (
                <tr key={tool.name} className="align-top">
                  <th scope="row" className="px-3 py-2 text-left font-mono text-[13px] font-medium text-accent-foreground [overflow-wrap:anywhere]">
                    {tool.name}
                  </th>
                  <td className="px-3 py-2 text-muted-foreground">{[...new Set(tool.upstream.map((u) => API_NAME[u.api]))].join(" + ")}</td>
                  <td className="px-3 py-2">
                    <ul className="space-y-0.5 font-mono text-[12.5px] [overflow-wrap:anywhere]">
                      {tool.upstream.map((u) => (
                        <li key={u.endpoint}>
                          <Breakable text={u.endpoint} />
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="docs">
        <h2 id="docs" className="text-lg font-semibold tracking-tight">
          What the mocks copy from public docs, and what gets confirmed
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Built from Connecteam&apos;s API reference and ROLLER&apos;s published OpenAPI files. The items under &ldquo;to
          confirm&rdquo; get checked against your account on day one.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {DOCS.map((d) => (
            <div key={d.api} className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold">{d.api}</h3>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-success">Confirmed in public docs</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                {d.seen.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-warning">To confirm with your API keys on day 1</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {d.assumed.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="secrets" className="rounded-xl border bg-card p-5">
        <h2 id="secrets" className="text-lg font-semibold tracking-tight">
          Secrets and logs
        </h2>
        <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>Bearer tokens and both sets of API credentials are read from the environment only: Worker secrets on Cloudflare, encrypted environment variables here.</li>
          <li>In live mode the server refuses to start without a secret token of at least 32 characters, and the public demo token is switched off.</li>
          <li>Logs are single JSON lines with the tool name, duration, outcome, dates queried and a token hash id. The logger only accepts primitive values, so a result or request body cannot be passed to it.</li>
          <li>Upstream error bodies are never forwarded. A tool error says which API and status failed, nothing more.</li>
        </ul>
      </section>
    </div>
  );
}
