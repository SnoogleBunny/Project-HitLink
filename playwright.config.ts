import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "corepack pnpm exec dotenv -e .env -- turbo run dev --env-mode=loose",
    // Keep direct E2E operator calls and spawned apps on the same reserved test-only channel.
    env: Object.assign(process.env, {
      FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL:
        "migration-corrections@example.test",
    }),
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
