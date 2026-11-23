import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** WCAG 2.2 AA and best-practice rules, on every page, after the interactive parts have content. */
for (const path of ["/", "/tools", "/labour-cost", "/how-it-works", "/connect", "/no-such-page"]) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    if (path === "/tools") {
      await page.getByRole("button", { name: "Run tool" }).click();
      await expect(page.getByTestId("tool-result")).toBeVisible();
    }
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(summary).toEqual([]);
  });
}
