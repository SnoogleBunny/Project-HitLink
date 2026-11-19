import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.LANDING_BASE_URL ?? "http://127.0.0.1:3003";
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const serverCommand =
  process.env.LANDING_WEB_SERVER_COMMAND ??
  `${packageManager} --filter landing-web start`;

export default defineConfig({
  testDir: ".",
  testMatch: "landing-target-sizes.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir:
    process.env.LANDING_PLAYWRIGHT_OUTPUT_DIR ??
    "../../test-results/landing-target-sizes",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "off",
  },
  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
