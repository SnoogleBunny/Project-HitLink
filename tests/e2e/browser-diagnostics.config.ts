import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "browser-diagnostics.helper.spec.ts",
    "browser-diagnostics.spec.ts",
  ],
  fullyParallel: false,
  outputDir: "../../test-results/browser-diagnostics",
  reporter: "list",
  use: {
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
