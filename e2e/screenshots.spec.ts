import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Captures the demo screenshots. Skipped unless SCREENSHOTS=1.
 * SCREENSHOT_DIR defaults to ../screens (next to the other demos' screenshots).
 */
const dir = process.env.SCREENSHOT_DIR ?? path.resolve(__dirname, "../../screens");
const PREFIX = "readonly-mcp-server";

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots");

const DESKTOP = [
  { name: "home", path: "/" },
  { name: "tools", path: "/tools", run: true },
  { name: "labour", path: "/labour-cost" },
  { name: "how", path: "/how-it-works" },
  ...(process.env.SCREENSHOT_EXTRAS ? [{ name: "connect", path: "/connect" }] : []),
];

for (const shot of DESKTOP) {
  test(`desktop ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(shot.path);
    await expect(page.locator("h1")).toBeVisible();
    if (shot.run) {
      await page.getByRole("button", { name: "Run tool" }).click();
      await expect(page.getByTestId("tool-result")).toContainText("labourPercent");
      await page.getByTestId("tool-result").scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.screenshot({ path: path.join(dir, `${PREFIX}-${shot.name}-desktop.png`) });
  });
}

test("desktop one-way path, the section alone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const section = page.locator('section[aria-labelledby="path"]');
  await expect(section.locator("svg").first()).toBeVisible();
  // The section's box plus a margin of page background, in page coordinates.
  const box = await section.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  });
  const pad = 24;
  await page.screenshot({
    path: path.join(dir, `${PREFIX}-path-desktop.png`),
    fullPage: true,
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
  });
});

test("phone home, full page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await page.screenshot({ path: path.join(dir, `${PREFIX}-home-phone.png`), fullPage: true });
});

test("phone extras, full page", async ({ page }) => {
  test.skip(!process.env.SCREENSHOT_EXTRAS, "Extra review shots only");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["/tools", "/labour-cost", "/how-it-works", "/connect"]) {
    await page.goto(p);
    await page.screenshot({ path: path.join(dir, `${PREFIX}${p.replace("/", "-")}-phone.png`), fullPage: true });
  }
});
