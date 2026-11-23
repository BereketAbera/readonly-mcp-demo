import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { PageIntro } from "@/components/page-intro";
import { excerpt } from "@/lib/excerpts";
import { TOOLS } from "@/tools/catalog";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "How it works" };

const SECTIONS = [
  {
    id: "tools",
    title: "1. Only read tools are registered",
    body: "The server registers nine tools and nothing else: no resources, no prompts, no create, update or delete tools, and no tool that takes a URL, path or HTTP method. Every tool carries the read-only, non-destructive and idempotent hints, and the integration tests fail if that ever changes.",
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
    body: "Each tool has a Zod schema. Dates must be real calendar dates in YYYY-MM-DD form, the end cannot precede the start, and a range is capped at 31 days. Enums and number bounds are checked the same way, and invalid input returns a tool error without touching an upstream API.",
    code: [excerpt("src/tools/schemas.ts", "date-range")],
  },
  {
    id: "redaction",
    title: "5. Results are redacted on the way out",
    body: "Tools first map upstream records onto explicit output fields. Then every result passes through a second layer that drops personal and financial keys wherever they appear and masks phone numbers, email addresses and bank details inside free text, such as a manager's note.",
    code: [excerpt("src/core/redact.ts", "redaction-rules")],
  },
  {
    id: "gate",
    title: "6. Every request passes the same gate",
    body: "Origin check (for browser clients), bearer token, method, then a per-token rate limit, in that order. The transport is stateless with JSON responses, so GET and DELETE are answered with 405. Request bodies are capped at 64 KB.",
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
    body: "Both APIs use OAuth 2.0 client credentials. Tokens are reused until shortly before expiry, concurrent callers share one token request, and a 401 triggers exactly one refresh and retry. The booking API's docs warn that requesting a token per call can get credentials suspended.",
    code: [excerpt("src/upstream/oauth.ts", "token-cache")],
  },
];

const DOCS = [
  {
    api: "Workforce API (Connecteam-shaped)",
    seen: [
      "OAuth 2.0 client credentials: POST /oauth/v1/token, HTTP Basic client authentication, grant_type=client_credentials",
      "Australian accounts use the api-au.connecteam.com host",
      "Paths for users, jobs, schedulers, shifts (v2), time clocks, time activities and pay rates, with { requestId, data, paging } envelopes",
      "Pay-rate queries need startDate and endDate, at most 365 days apart; scopes schedule.read and pay_rates.read",
    ],
    assumed: [
      "Token lifetime of 24 hours (stated by a third-party profile, not seen on Connecteam's own pages)",
      "Scope names users.read, jobs.read and time_clock.read",
      "Departments modelled as jobs, plus a 'Department' custom field on each user",
      "Manual breaks are unpaid; award penalty rates are not part of the pay-rates endpoint",
    ],
  },
  {
    api: "Booking API (ROLLER-shaped)",
    seen: [
      "POST https://api.roller.app/token with a JSON body of client_id and client_secret, returning a Bearer token with expires_in (generally 24 hours)",
      "Reuse the token until a 401; one set of credentials per venue; one call per second",
      "API keys scoped to specific endpoints; restricted endpoints answer 403 INSUFFICIENT_SCOPE",
      "GET /bookings (search, up to 100 results), /data/products, /data/bookingpayments and /reporting/revenue-entries, with date filters of at most one day",
    ],
    assumed: [
      "Reporting endpoints return a plain JSON array (the docs show the record schema only)",
      "Endpoints outside a key's scope also answer 403 INSUFFICIENT_SCOPE",
      "Field subsets and value formats beyond the documented examples",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <div className="space-y-12">
      <PageIntro eyebrow="How it stays read-only" title="Eight checks between an assistant and the data">
        Every excerpt below is read from the repository at build time, so it is the code that is running. Short version:
        nothing in the server can send anything but GET to an allowlisted path, and nothing personal leaves it.
      </PageIntro>

      <nav aria-label="On this page" className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-md border bg-card px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground">
            {s.title.replace(/^\d+\.\s*/, "")}
          </a>
        ))}
      </nav>

      <div className="space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <h2 id={`${section.id}-title`} className="text-lg font-semibold tracking-tight">
                {section.title}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{section.body}</p>
            </div>
            <div className="min-w-0 space-y-3">
              {section.code.map((c) => (
                <CodeBlock key={`${c.file}-${c.code.slice(0, 20)}`} code={c.code} caption={c.file} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section aria-labelledby="mapping">
        <h2 id="mapping" className="text-lg font-semibold tracking-tight">
          Tool to upstream endpoint
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Every upstream call is a GET. Date-filtered booking reports are fetched one day at a time.</p>
        <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[40rem] text-sm">
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
                  <th scope="row" className="px-3 py-2 text-left font-mono text-[13px] font-medium text-accent-foreground">{tool.name}</th>
                  <td className="px-3 py-2 text-muted-foreground">{[...new Set(tool.upstream.map((u) => u.api))].join(" + ")}</td>
                  <td className="px-3 py-2">
                    <ul className="space-y-0.5 font-mono text-[12.5px]">
                      {tool.upstream.map((u) => (
                        <li key={u.endpoint}>{u.endpoint}</li>
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
          What the mocks copy from public docs, and what they assume
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The mocks were built from each vendor&apos;s public developer documentation. Connecteam&apos;s pages were read through
          search excerpts and a public mirror of its API reference; ROLLER&apos;s from its published OpenAPI files. Anything not
          confirmed is listed as an assumption to check with real credentials.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {DOCS.map((d) => (
            <div key={d.api} className="rounded-xl border bg-card p-5">
              <h3 className="font-semibold">{d.api}</h3>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-success">Seen in public docs</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                {d.seen.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs font-medium uppercase tracking-wide text-warning">Assumed, to confirm</p>
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
