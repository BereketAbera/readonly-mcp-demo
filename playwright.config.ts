import { defineConfig, devices } from "@playwright/test";

const external = process.env.E2E_BASE_URL;
const baseURL = external ?? "http://127.0.0.1:3202";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  // Locally, run against a production build on the assigned port (pnpm build first).
  webServer: external
    ? undefined
    : { command: "pnpm start", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
