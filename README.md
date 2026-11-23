# Read-only MCP server demo

A small remote MCP server (Streamable HTTP) that lets an assistant inside a project-management tool read
workforce and booking data for **Lakeside Play Centre (fictional)**, a single-venue entertainment business, and
work out labour cost as a percentage of revenue. It cannot create, change or delete anything.

- Live demo: https://readonly-mcp-demo.vercel.app (pages: `/`, `/tools`, `/labour-cost`, `/how-it-works`, `/connect`)
- MCP endpoint: `https://readonly-mcp-demo.vercel.app/mcp`
- Public demo token: `lakeside-demo-readonly` (accepted only while the upstream APIs are mocked)

**Everything upstream is mocked.** The workforce API is an in-memory mock shaped like Connecteam's public API (AU
region) and the booking API is an in-memory mock shaped like ROLLER's REST and Reporting APIs. The data is four
weeks of fictional, deterministic seed data (26 Oct to 22 Nov 2026). Nothing in this repository has been run
against the real APIs.

## What the demo proves

- **One codebase, two runtimes.** `src/mcp/handler.ts` takes a web-standard `Request` and returns a `Response`.
  `src/worker.ts` serves it on Cloudflare Workers (checked with `wrangler dev` and with tests inside workerd);
  `src/app/mcp/route.ts` serves the same handler from Next.js on Vercel for the public demo.
- **Official MCP SDK.** `@modelcontextprotocol/sdk` 1.32 with its web-standard Streamable HTTP transport,
  stateless, JSON responses, protocol version 2025-11-25.
- **Strictly read-only.** Nine read tools, no write or general request tool, a GET-only upstream client with
  fixed path allowlists, and a fetch guard underneath that throws on any other method.
- **Data protection.** Zod-validated inputs with a 31-day range cap, personal fields removed from every result,
  pay shown only in aggregate, bearer tokens compared in constant time, a per-token rate limit, secrets read from
  the environment only, and logs that cannot carry personal data.
- **OAuth 2.0 client credentials for both APIs,** each in its documented style (HTTP Basic + form body for the
  workforce API on its AU host; JSON body for the booking API), with tokens cached until shortly before expiry and
  refreshed once on a 401.
- **The combined tool.** `labour_cost_percent` prices clocked hours at each person's rate for the job worked,
  divides by recognised net revenue (ex GST), groups by day, week or department, and returns its inputs.

## Tools and upstream endpoints

All upstream calls are `GET`. Booking reports are queried one day at a time because the API limits date filters
to one day.

| Tool | Upstream endpoints |
| --- | --- |
| `list_staff` | workforce `GET /users/v1/users` |
| `get_schedules(start, end)` | workforce `GET /scheduler/v1/schedulers`, `GET /scheduler/v2/schedulers/{schedulerId}/shifts`, `GET /users/v1/users`, `GET /jobs/v1/jobs` |
| `get_timesheets(start, end)` | workforce `GET /time-clock/v1/time-clocks`, `GET /time-clock/v1/time-clocks/{timeClockId}/time-activities`, users, jobs |
| `get_pay_rates(asOf?)` | workforce `GET /pay-rates/v1/pay-rates`, users, jobs (aggregated by department; small groups withheld) |
| `list_bookings(start, end)` | booking `GET /bookings?date=` per day, `GET /data/products` |
| `list_products` | booking `GET /data/products` |
| `get_transactions(start, end)` | booking `GET /data/bookingpayments` per day |
| `get_revenue_report(start, end, groupBy?)` | booking `GET /reporting/revenue-entries` per day, `GET /data/products` |
| `labour_cost_percent(start, end, groupBy?, onCostPercent?)` | workforce time activities, pay rates and jobs; booking revenue entries per day |

Dates are venue-local `YYYY-MM-DD`, inclusive, at most 31 days per call. Amounts are AUD.

## Run it

Requirements: Node 20+ and pnpm.

```bash
pnpm install
pnpm dev                 # Next.js UI + /mcp on http://localhost:3202
npx wrangler dev         # the Cloudflare Worker locally on :8787 (no Cloudflare login needed)
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

## Tests

```bash
pnpm lint
pnpm typecheck           # app + the workerd test project
pnpm test                # unit + integration + workers (Vitest)
pnpm build && pnpm test:e2e   # Playwright, desktop and phone, against `next start` on :3202
```

- **Unit** (`tests/unit`): labour-cost maths and grouping, rate resolution, break deduction, venue-local dates
  (including a daylight-saving zone), redaction of keys and free text, the path allowlist, the GET-only client
  and fetch guard, OAuth token caching, configuration rules, the rate limiter, and the mock APIs' scope and
  date-range rules.
- **Integration** (`tests/integration`): the official MCP SDK client over real HTTP. Lists tools, calls every
  tool, proves no write-capable tool exists, checks results carry no contact details, checks 401 with no token
  and a wrong token, 405 for GET and DELETE, 403 for a foreign Origin, 429 after the per-token limit, that a
  non-GET upstream call throws, and that logs carry no personal data. By default the server runs in-process; set
  `MCP_TEST_URL` (and `MCP_TEST_TOKEN`) to run the same suite against `wrangler dev` or a deployment.
- **Workers** (`tests/workers`): runs inside workerd with the `wrangler.toml` bindings via
  `@cloudflare/vitest-plugin` (the successor to `@cloudflare/vitest-pool-workers`): health check, 401s, and an
  MCP SDK client session against the Worker.
- **E2E** (`e2e/site.spec.ts`): every page, navigation, the run-a-tool form (including the 31-day error and
  keyboard use), the labour views, and the endpoint's 401/200 behaviour. Set `E2E_BASE_URL` to test a deployment.

## Configuration

All configuration comes from the environment: Worker vars and secrets on Cloudflare, environment variables on
Vercel or in `.env.local`. See `.env.example`.

| Variable | Default | Notes |
| --- | --- | --- |
| `UPSTREAM_MODE` | `mock` | `live` calls the real APIs and requires every credential below |
| `MCP_BEARER_TOKENS` | none | Comma-separated secret tokens, 32+ characters each (`openssl rand -hex 32`). Required in live mode |
| `MCP_PUBLIC_DEMO_TOKEN` | `lakeside-demo-readonly` | Mock mode only; ignored in live mode; `none` turns it off |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per token, in-memory limiter (the Worker uses the Rate Limiting binding when present) |
| `ALLOWED_ORIGINS` | none | Extra browser origins allowed to call `/mcp`; the site's own origin is always allowed |
| `VENUE_TIMEZONE` | `Australia/Brisbane` | IANA zone used for every date boundary |
| `PAY_RATE_MIN_GROUP` | `3` | Departments with fewer rated positions are withheld by `get_pay_rates` |
| `CONNECTEAM_CLIENT_ID`, `CONNECTEAM_CLIENT_SECRET` | mock values | Live mode: OAuth client from the Integration Center |
| `CONNECTEAM_API_BASE`, `CONNECTEAM_TOKEN_URL` | `https://api-au.connecteam.com`, `{base}/oauth/v1/token` | AU-region host |
| `ROLLER_CLIENT_ID`, `ROLLER_CLIENT_SECRET` | mock values | Live mode: venue API key scoped to the four GET endpoints above |
| `ROLLER_API_BASE`, `ROLLER_TOKEN_URL` | `https://api.roller.app`, `{base}/token` | Use `https://api.play.roller.app` for the Playground |

## Deploying to Cloudflare Workers

The Worker entry is `src/worker.ts`; `wrangler.toml` holds the non-secret settings and a Rate Limiting binding.

```bash
npx wrangler login
# One token per connector (e.g. the project tool's MCP connector), comma separated.
openssl rand -hex 32 | npx wrangler secret put MCP_BEARER_TOKENS
npx wrangler secret put CONNECTEAM_CLIENT_ID
npx wrangler secret put CONNECTEAM_CLIENT_SECRET
npx wrangler secret put ROLLER_CLIENT_ID
npx wrangler secret put ROLLER_CLIENT_SECRET
# In wrangler.toml: set UPSTREAM_MODE = "live" and delete MCP_PUBLIC_DEMO_TOKEN.
npx wrangler deploy
```

Then point the MCP client at `https://<worker-host>/mcp` with the header `Authorization: Bearer <token>`. To rotate
a token, put a new value (or list) with `wrangler secret put MCP_BEARER_TOKENS`; no redeploy of code is needed.
Worker logs (`wrangler tail` or Workers Logs) show one JSON line per request and per tool call.

## How state works

- **No sessions.** The MCP transport is stateless: each POST builds a fresh server and transport, so any Worker
  isolate or Vercel instance can answer any request. GET and DELETE return 405.
- **Per-process caches only.** OAuth tokens and the in-memory rate-limit window live in the process (Worker
  isolate or function instance). On Workers the Rate Limiting binding is shared per location.
- **No database.** The mocks generate their fixtures deterministically in memory on first use. The UI pages are
  rendered at build time from the server's own `tools/list` and `tools/call` output over an in-memory transport.
  The run-a-tool form calls the live `/mcp` endpoint from the browser.

## What would change against the real APIs

- **Credentials and scopes:** a Connecteam OAuth app with read scopes only, and a ROLLER venue key scoped to
  exactly `GET /bookings`, `/data/products`, `/data/bookingpayments` and `/reporting/revenue-entries`.
- **Confirm the assumed shapes** listed on `/how-it-works` (reporting responses as plain arrays, Connecteam scope
  names and token lifetime, how departments are modelled: jobs, custom fields or smart groups).
- **ROLLER allows one call per second per credential set.** The client already spaces live booking calls, but a
  31-day report is 31+ calls. Past days' revenue entries never change, so they should be cached (Workers KV or
  D1) or synced nightly; ROLLER also asks integrators to share one token across servers rather than each instance
  requesting its own, which points to keeping the token in KV or a Durable Object.
- **Booking search returns at most 100 bookings per query.** Busy days would need narrower queries (by session
  time or product) or the Reporting API export.
- **Award costs:** the pay-rates endpoint holds base rates. For penalty rates and overtime, use the timesheet
  totals endpoint's pay items (`/time-clock/v1/time-clocks/{id}/timesheet`) as the labour source, and request
  pay-rate history for date-accurate rates.
- **Policy decisions to confirm:** whether guest names may be shown (dropped today), the minimum group size for
  pay aggregates, and the revenue basis for labour % (net recognised revenue today; gross or funds received are
  available).

## Project layout

```
src/
  worker.ts                 Cloudflare Workers entry
  app/mcp/route.ts          Next.js route serving the same handler
  mcp/handler.ts            Origin, bearer token, method, rate limit, then the MCP transport
  mcp/server.ts             McpServer with the nine tools registered read-only
  tools/catalog.ts          Tool definitions, input schemas and output shaping
  tools/labour.ts           Labour-cost maths (pure)
  upstream/http.ts          GET-only client, path allowlists, fetch guard
  upstream/oauth.ts         Client-credentials token cache
  upstream/workforce.ts     Workforce API endpoints and types
  upstream/booking.ts       Booking API endpoints and types
  mock/                     In-memory upstream mocks and seed data
  core/                     Config, auth, rate limit, redaction, dates, logging
  app/, components/, lib/   Demo UI
tests/                      Vitest: unit, integration, workers
e2e/                        Playwright
```

Sample by Bereket A. · fictional data
