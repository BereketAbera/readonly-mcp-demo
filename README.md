# Read-only MCP server: Connecteam + ROLLER → ClickUp

A small remote MCP server (Streamable HTTP) that lets ClickUp's AI (Brain and Super Agents) read Connecteam workforce
data and ROLLER booking data for **Lakeside Play Centre**, a fictional single-venue play centre, and work out labour cost
as a percentage of revenue. It cannot create, change or delete anything.

- Live demo: https://readonly-mcp-demo.vercel.app (pages: `/`, `/tools`, `/labour-cost`, `/how-it-works`, `/connect`)
- MCP endpoint: `https://readonly-mcp-demo.vercel.app/mcp`
- Public demo token: `lakeside-demo-readonly` (accepted only while the upstream APIs are mocked)

**Everything upstream is mocked.** Connecteam (AU region) and ROLLER (REST and Reporting APIs) are in-memory mocks
that follow the request and response shapes in their public developer docs. The data is four weeks of fictional,
deterministic seed data (26 Oct to 22 Nov 2026), and every tool result carries `dataSource: "mock (fictional demo data)"`.
Nothing in this repository has been run against the real APIs.

**Where it runs.** This public copy runs on Vercel. The same handler is the Cloudflare Worker entry
(`src/worker.ts`), which is tested inside workerd and with `wrangler dev`; there is no Cloudflare deployment of this demo.

## How it cannot modify or leak data, in three sentences

The server has no write tools: its only upstream client can send GET to a fixed list of Connecteam and ROLLER paths, a
guard underneath blocks every other method and host, and the ROLLER key itself can be scoped to just those GET
endpoints. Results are cut down to named fields, with contact, bank, card, tax file and Medicare details and medical
flags removed before anything leaves the server. The API keys live only as Cloudflare secrets your team sets, and
ClickUp connects with its own bearer token that you can rotate or revoke at any time.

**What it does share:** staff names, rostered and clocked times, hours, labour totals and pay as department averages,
because that is what the questions need. `get_pay_rates` never returns one person's rate, but on a day one person worked
a department alone, `labour_cost_percent` and `get_timesheets` together imply that person's rate. So who can use the
connection in ClickUp decides who sees this data (see the decisions below).

## What the demo shows

- **Built for ClickUp's AI.** ClickUp adds external MCP servers as Custom MCP connections in the App Center, with a URL
  and an API key or custom header. `/connect` follows ClickUp's help article step by step, including the choice between
  a personal ("Just for me") and a Workspace ("For all members") connection. It has not been tested in a ClickUp
  Workspace yet; that is the first acceptance check.
- **One codebase, two runtimes.** `src/mcp/handler.ts` takes a web-standard `Request` and returns a `Response`.
  `src/worker.ts` serves it on Cloudflare Workers; `src/app/mcp/route.ts` serves the same handler from Next.js here.
- **Official MCP SDK.** `@modelcontextprotocol/sdk` 1.32 with its web-standard Streamable HTTP transport, stateless,
  JSON responses, protocol version 2025-11-25, one JSON-RPC message per request (batches get 400).
- **Strictly read-only.** Nine read tools, no write or general request tool, a GET-only upstream client with fixed
  path allowlists, and a fetch guard underneath that throws on any other method or host.
- **Data minimisation by allowlist.** Tools copy named fields only. Custom staff fields are returned only when named in
  `STAFF_EXTRA_FIELDS`; timesheet notes show as `hasNote` unless `INCLUDE_TIMESHEET_NOTES` is on; medical guest flags
  are never returned; totals keyed by data (payment methods, departments, categories) are arrays. A second layer masks
  phone numbers, emails, bank, tax file and Medicare numbers in any free text.
- **Hardened edges.** Dates limited to 2000 to 2099 and 31 days per call, with count-based date loops; bearer tokens
  compared in constant time; a per-token rate limit (per visitor for the shared demo token); an explicit browser-origin
  list; mock mode that never switches on by accident; CSP and Permissions-Policy headers.
- **OAuth 2.0 client credentials for both APIs,** each in its documented style (HTTP Basic + form body for Connecteam
  on its AU host; JSON body for ROLLER), with tokens cached until shortly before expiry and refreshed once on a 401.
- **The combined tool.** `labour_cost_percent` prices clocked hours at each person's base rate for the job worked,
  divides by recognised net revenue (ex GST), groups by day, week or department, and returns its inputs. Super can be
  added with `onCostPercent: 12`; the headline 30.8% is wages only (34.5% with 12% super).

## Tools and upstream endpoints

All upstream calls are `GET`. ROLLER reports are queried one day at a time because the API limits date filters to one
day.

| Tool | Upstream endpoints |
| --- | --- |
| `list_staff` | Connecteam `GET /users/v1/users` |
| `get_schedules(start, end)` | Connecteam `GET /scheduler/v1/schedulers`, `GET /scheduler/v2/schedulers/{schedulerId}/shifts`, `GET /users/v1/users`, `GET /jobs/v1/jobs` |
| `get_timesheets(start, end)` | Connecteam `GET /time-clock/v1/time-clocks`, `GET /time-clock/v1/time-clocks/{timeClockId}/time-activities`, users, jobs |
| `get_pay_rates(asOf?)` | Connecteam `GET /pay-rates/v1/pay-rates`, users, jobs (department averages; small groups withheld) |
| `list_bookings(start, end)` | ROLLER `GET /bookings?date=` per day, `GET /data/products` |
| `list_products` | ROLLER `GET /data/products` |
| `get_transactions(start, end)` | ROLLER `GET /data/bookingpayments` per day |
| `get_revenue_report(start, end, groupBy?)` | ROLLER `GET /reporting/revenue-entries` per day, `GET /data/products` |
| `labour_cost_percent(start, end, groupBy?, onCostPercent?)` | Connecteam time clocks, time activities, pay rates and jobs; ROLLER revenue entries per day |

Dates are venue-local `YYYY-MM-DD`, inclusive, at most 31 days per call. Amounts are AUD. A result with no rows says so
(and, on the demo, which dates the data covers) instead of returning bare zeros.

## Run it

Requirements: Node 20+ and pnpm.

```bash
pnpm install
pnpm dev                    # Next.js UI + /mcp on http://localhost:3202
npx wrangler dev --env demo # the Cloudflare Worker with the mocks on :8787 (no Cloudflare login needed)
```

Try the endpoint:

```bash
curl -s http://localhost:3202/mcp \
  -H "Authorization: Bearer lakeside-demo-readonly" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Record a real client session (initialize, `tools/list`, one `tools/call`) against any deployment:

```bash
node scripts/client-session.mjs https://readonly-mcp-demo.vercel.app/mcp --out session.txt
```

Smoke-test a deployment against live data. It prints only counts, sizes and timings, never names or amounts:

```bash
node scripts/smoke.mjs https://<worker-host>/mcp --token <secret> --start 2026-11-16 --end 2026-11-22
```

## Tests

```bash
pnpm lint
pnpm typecheck              # app + the workerd test project
pnpm test                   # unit + integration + workers (Vitest)
pnpm build && pnpm test:e2e # Playwright: desktop 1440, phone 390 and narrow 320, against `next start` on :3202
```

- **Unit** (`tests/unit`): labour-cost maths, date handling (including the year-9999 case and count-based loops),
  input bounds, redaction of keys and free text, custom-field rules, every tool's output shape (array aggregates that add
  up, pay as averages only, notes and medical flags hidden, empty-range notes), the HTTP gate (origin list, DNS
  rebinding, batches, body size, per-visitor limits), configuration rules, the GET-only client and fetch guard, OAuth
  token caching and the mock APIs.
- **Integration** (`tests/integration`): the official MCP SDK client over real HTTP. Lists tools, calls every tool,
  proves no write-capable tool exists, checks results carry no contact or medical details and are marked as mock data,
  checks 401, 405, 403, 400 for batches and 429. Set `MCP_TEST_URL` (and `MCP_TEST_TOKEN`) to run it against a
  deployment.
- **Workers** (`tests/workers`): runs inside workerd with the `demo` environment from `wrangler.toml` via
  `@cloudflare/vitest-plugin`: health check, 401s, and an MCP SDK client session against the Worker.
- **E2E** (`e2e/site.spec.ts`): every page at three widths with no sideways scroll, the run-a-tool panel (form-side
  range check, readable server errors, empty ranges, "Run this tool"), the labour views, the 404 page, the example
  questions, and the endpoint's 401/200 behaviour. Set `E2E_BASE_URL` to test a deployment.
- **Accessibility** (`e2e/a11y.spec.ts`): axe-core with the WCAG 2.2 AA and best-practice rules on every page, at
  desktop and phone sizes, with the run panel showing a result.

## Configuration

All configuration comes from the environment: Worker vars and secrets on Cloudflare, environment variables on
Vercel or in `.env.local`. See `.env.example`.

| Variable | Default | Notes |
| --- | --- | --- |
| `UPSTREAM_MODE` | `mock` | `mock` or `live`, any case; anything else is an error. Must be set explicitly once API credentials or `MCP_BEARER_TOKENS` exist, and `mock` refuses to start next to real credentials |
| `MCP_BEARER_TOKENS` | none | Comma-separated secret tokens, 32+ characters each (`openssl rand -hex 32`). Required in live mode |
| `MCP_PUBLIC_DEMO_TOKEN` | `lakeside-demo-readonly` | Mock mode only; ignored in live mode; `none` turns it off |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per token (per token and visitor for the demo token); the Worker uses the Rate Limiting binding when present |
| `ALLOWED_ORIGINS` | none | Exact origins of pages that may call `/mcp` from a browser. The deployment's own Vercel URLs are added automatically; no CORS is served, so this is for same-origin pages only |
| `VENUE_TIMEZONE` | `Australia/Brisbane` | IANA zone used for every date boundary |
| `PAY_RATE_MIN_GROUP` | `3` | `get_pay_rates` withholds the average for departments with fewer rated positions |
| `STAFF_EXTRA_FIELDS` | none | Connecteam custom fields `list_staff` may return besides Department and Employment type; personal ones are refused even when named |
| `INCLUDE_TIMESHEET_NOTES` | `false` | When `true`, `get_timesheets` returns note text (masked) instead of only `hasNote` |
| `CONNECTEAM_CLIENT_ID`, `CONNECTEAM_CLIENT_SECRET` | mock values | Live mode: OAuth client from the Integration Center |
| `CONNECTEAM_API_BASE`, `CONNECTEAM_TOKEN_URL` | `https://api-au.connecteam.com`, `{base}/oauth/v1/token` | AU-region host |
| `ROLLER_CLIENT_ID`, `ROLLER_CLIENT_SECRET` | mock values | Live mode: venue API key scoped to the four GET endpoints above |
| `ROLLER_API_BASE`, `ROLLER_TOKEN_URL` | `https://api.roller.app`, `{base}/token` | Use `https://api.play.roller.app` for the Playground |

## Working in your accounts

1. **Your private repo, your Cloudflare account.** The code lives in your GitHub repository and deploys from it,
   through Workers Builds or a deploy token you control.
2. **Your team enters the keys.** The four API keys go in with `wrangler secret put` or the Cloudflare dashboard.
   Worker secrets cannot be read back once set, so I never see them.
3. **Built against the mocks first.** Development runs in mock mode, which uses the same request shapes. The live check
   is `scripts/smoke.mjs`, which prints counts only.
4. **Nothing of yours is published.** This public demo uses only public API docs and fictional data. Your code and data
   stay private, and the code is yours.

## Deploying to Cloudflare Workers

`wrangler.toml` defaults to live mode with no public token; the `demo` environment holds the mock settings. Your team
runs the secret steps in your Cloudflare account:

```bash
npx wrangler login
# One token per connection (for example ClickUp's), comma separated.
openssl rand -hex 32 | npx wrangler secret put MCP_BEARER_TOKENS
npx wrangler secret put CONNECTEAM_CLIENT_ID
npx wrangler secret put CONNECTEAM_CLIENT_SECRET
npx wrangler secret put ROLLER_CLIENT_ID
npx wrangler secret put ROLLER_CLIENT_SECRET
npx wrangler deploy
```

Then add `https://<worker-host>/mcp` in ClickUp (App Center, Custom MCP) with the header
`Authorization: Bearer <token>`. To rotate a token, put a new value (or list) with `wrangler secret put
MCP_BEARER_TOKENS`; no code redeploy is needed. Worker logs (`wrangler tail` or Workers Logs) show one JSON line per
request and per tool call, with no data in them.

## How state works

- **No sessions.** The MCP transport is stateless: each POST builds a fresh server and transport, so any Worker
  isolate or Vercel instance can answer any request. GET and DELETE return 405.
- **Per-process caches only.** OAuth tokens and the in-memory rate-limit window live in the process (Worker isolate or
  function instance). On Workers the Rate Limiting binding is shared per location.
- **No database.** The mocks build their fixtures deterministically in memory on first use. The UI pages are rendered
  at build time from the server's own `tools/list` and `tools/call` output over an in-memory transport, including the
  example answers on the overview. The run-a-tool panel calls the live `/mcp` endpoint from the browser.

## What would change against the real APIs

- **Credentials and scopes:** a Connecteam OAuth app with read scopes only, and a ROLLER venue key scoped to exactly
  `GET /bookings`, `/data/products`, `/data/bookingpayments` and `/reporting/revenue-entries`.
- **Confirm the assumed shapes** listed on `/how-it-works` (reporting responses as plain arrays, Connecteam scope names
  and token lifetime, how departments are set up: jobs, custom fields or smart groups) on day one.
- **ROLLER speed.** ROLLER allows one call per second per credential set, and revenue entries come one day per query,
  100 per page. On the demo data a four-week labour report takes 112 ROLLER calls (about two minutes uncached) and one
  week 28 calls (about 30 seconds). Past days never change, so caching closed days in Workers KV or D1 is a planned
  milestone; ROLLER also asks integrators to share one token across servers, which points to keeping the token in KV
  or a Durable Object.
- **Booking search returns at most 100 bookings per query.** Busy days would need narrower queries (by session time or
  product) or the Reporting API export.
- **Award costs:** the pay-rates endpoint holds base rates, so weekend penalty rates are not in the demo's figures.
  For penalty rates and overtime, use the timesheet totals endpoint's pay items
  (`/time-clock/v1/time-clocks/{id}/timesheet`) as the labour source, and request pay-rate history for date-accurate
  rates.

## Decisions for the venue

- **Can ClickUp's AI see individual pay?** Labour totals and hours can imply a person's rate on a day they worked a
  department alone. The control is the ClickUp connection: personal ("Just for me") by default, Workspace-wide only if
  every member may see staff hours and pay. If not even that is acceptable, the labour tool can be limited to whole-venue
  totals.
- **Timesheet notes and custom fields:** off by default (`INCLUDE_TIMESHEET_NOTES`, `STAFF_EXTRA_FIELDS`).
- **Guest names** are dropped today; **medical flags** are never returned.
- **Minimum group size** for pay averages (`PAY_RATE_MIN_GROUP`, 3 today).
- **Revenue basis** for labour %: net recognised revenue today; gross or funds received are available.
- **Super:** headline figures are wages only; `onCostPercent` adds super or other on-costs.

## How the API sources were read

ROLLER's request shapes come from its published OpenAPI files. Connecteam's developer site blocks automated readers,
so its pages were read through search-indexed copies and a public mirror of the API reference; that is why the token
lifetime and some scope names are listed as "to confirm" until checked against a real account. ClickUp's steps come
from its help article on connecting an MCP server to a Workspace, read in a browser in November 2026.

## Project layout

```
src/
  worker.ts                 Cloudflare Workers entry
  app/mcp/route.ts          Next.js route serving the same handler
  mcp/handler.ts            Origin, bearer token, method, rate limit, body, then the MCP transport
  mcp/server.ts             McpServer with the nine tools registered read-only
  tools/catalog.ts          Tool definitions, input schemas and output shaping
  tools/labour.ts           Labour-cost maths (pure)
  upstream/http.ts          GET-only client, path allowlists, fetch guard
  upstream/oauth.ts         Client-credentials token cache
  upstream/workforce.ts     Connecteam endpoints and types
  upstream/booking.ts       ROLLER endpoints and types
  mock/                     In-memory upstream mocks and seed data
  core/                     Config, auth, rate limit, redaction, dates, logging
  app/, components/, lib/   Demo UI
scripts/                    Client session transcript and counts-only smoke test
design/                     Script, Inkscape build and font for the mark, icons, social preview and diagram (DESIGN-NOTES.md)
tests/                      Vitest: unit, integration, workers
e2e/                        Playwright
```

Sample by Bereket A. · fictional data
