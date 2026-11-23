import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Runs inside workerd, the Cloudflare Workers runtime, using wrangler.toml.
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.toml" } })],
        test: { name: "workers", include: ["tests/workers/**/*.test.ts"], testTimeout: 60_000 },
      },
    ],
  },
});
