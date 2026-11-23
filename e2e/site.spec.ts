import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", heading: "Read-only venue data for a project-management assistant" },
  { path: "/tools", heading: "Nine read-only tools" },
  { path: "/labour-cost", heading: "Labour cost as a share of revenue" },
  { path: "/how-it-works", heading: "Eight checks between an assistant and the data" },
  { path: "/connect", heading: "One URL, one header" },
];

const TOKEN = process.env.E2E_TOKEN ?? "lakeside-demo-readonly";

for (const p of PAGES) {
  test(`${p.path} renders with navigation, footer and no horizontal scroll`, async ({ page }) => {
    const response = await page.goto(p.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.heading);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(5);
    await expect(page.getByText("Sample by Bereket A. · fictional data")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("navigation marks the current page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Labour cost" }).click();
  await expect(page).toHaveURL(/\/labour-cost$/);
  await expect(page.getByRole("link", { name: "Labour cost" })).toHaveAttribute("aria-current", "page");
});

test("tools page lists the nine tools from tools/list", async ({ page }) => {
  await page.goto("/tools");
  const list = page.getByRole("list", { name: "Tools" });
  await expect(list.getByRole("heading", { level: 2 })).toHaveText([
    "list_staff",
    "get_schedules",
    "get_timesheets",
    "get_pay_rates",
    "list_bookings",
    "list_products",
    "get_transactions",
    "get_revenue_report",
    "labour_cost_percent",
  ]);
  await expect(list.getByText("readOnlyHint")).toHaveCount(9);
});

test("run a tool: labour cost through the real /mcp endpoint", async ({ page }) => {
  await page.goto("/tools");
  await page.getByRole("button", { name: "Run tool" }).click();
  const result = page.getByTestId("tool-result");
  await expect(result).toContainText('"labourPercent"');
  await expect(result).toContainText('"inputs"');
  await expect(page.getByText(/HTTP 200 · \d+ ms/)).toBeVisible();
});

test("run a tool: staff list carries no contact details", async ({ page }) => {
  await page.goto("/tools");
  await page.getByLabel("Tool", { exact: true }).selectOption("list_staff");
  await page.getByRole("button", { name: "Run tool" }).click();
  const result = page.getByTestId("tool-result");
  await expect(result).toContainText('"department"');
  await expect(result).not.toContainText("@");
  await expect(result).not.toContainText("phone");
});

test("run a tool: a range over 31 days is rejected", async ({ page }) => {
  await page.goto("/tools");
  await page.getByLabel("Tool", { exact: true }).selectOption("list_bookings");
  await page.getByLabel(/^start/).fill("2026-09-01");
  await page.getByLabel(/^end/).fill("2026-11-22");
  await page.getByRole("button", { name: "Run tool" }).click();
  const result = page.getByTestId("tool-result");
  await expect(result).toContainText("Tool returned an error");
  await expect(result).toContainText("limited to 31 days");
});

test("the run form is keyboard operable", async ({ page }) => {
  await page.goto("/tools");
  const button = page.getByRole("button", { name: "Run tool" });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("tool-result")).toContainText('"totals"');
});

test("labour page switches between day, week and department views", async ({ page }) => {
  await page.goto("/labour-cost");
  await expect(page.getByRole("tab", { name: "By day" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("table", { name: "Labour cost and revenue by day" }).locator("tbody tr")).toHaveCount(28);
  await page.getByRole("tab", { name: "By week" }).click();
  await expect(page.getByRole("table", { name: "Labour cost and revenue by week" }).locator("tbody tr")).toHaveCount(4);
  await page.getByRole("tab", { name: "By department" }).click();
  const departments = page.getByRole("table", { name: "Labour cost by department" });
  await expect(departments.locator("tbody tr")).toHaveCount(5);
  await expect(departments).toContainText("Party hosts");
});

test("how-it-works shows real code excerpts", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText("readOnlyHint: true").first()).toBeVisible();
  await expect(page.getByText("export function readOnlyFetch").first()).toBeAttached();
  await expect(page.getByRole("heading", { name: "Tool to upstream endpoint" })).toBeVisible();
});

test("connect page shows the endpoint, header and ClickUp steps", async ({ page }) => {
  await page.goto("/connect");
  await expect(page.getByText(/\/mcp$/).first()).toBeVisible();
  await expect(page.getByText(`Authorization: Bearer ${TOKEN}`).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adding it to ClickUp" })).toBeVisible();
});

test("the MCP endpoint answers JSON-RPC and rejects missing or wrong tokens", async ({ request }) => {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  const data = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  expect((await request.post("/mcp", { headers, data })).status()).toBe(401);
  expect((await request.post("/mcp", { headers: { ...headers, authorization: "Bearer wrong-token-0000" }, data })).status()).toBe(401);
  const ok = await request.post("/mcp", { headers: { ...headers, authorization: `Bearer ${TOKEN}` }, data });
  expect(ok.status()).toBe(200);
  const body = (await ok.json()) as { result: { tools: Array<{ name: string }> } };
  expect(body.result.tools).toHaveLength(9);
});
