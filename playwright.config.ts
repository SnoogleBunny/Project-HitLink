import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const adminPort = Number(process.env.FLOWSTATE_ADMIN_E2E_PORT ?? "3100");
const memberPort = Number(process.env.FLOWSTATE_MEMBER_E2E_PORT ?? "3101");
const apiPort = Number(process.env.FLOWSTATE_API_E2E_PORT ?? "3102");
const landingPort = Number(process.env.FLOWSTATE_LANDING_E2E_PORT ?? "3103");
const adminBaseURL = `http://127.0.0.1:${adminPort}`;
// Isolate admin and member auth cookies while staying on loopback-only hosts.
const memberBaseURL = `http://localhost:${memberPort}`;
const apiBaseURL = `http://127.0.0.1:${apiPort}`;
const landingBaseURL = `http://127.0.0.1:${landingPort}`;
const serverMode = process.env.FLOWSTATE_E2E_SERVER_MODE ?? "development";
if (
  serverMode !== "development" &&
  serverMode !== "development-clean" &&
  serverMode !== "production"
) {
  throw new Error(
    "FLOWSTATE_E2E_SERVER_MODE must be development, development-clean, or production.",
  );
}
if (serverMode === "production") {
  const missingBuilds = [
    "admin-web",
    "member-web",
    "api",
    "landing-web",
  ].filter(
    (app) =>
      !fs.existsSync(
        path.join(process.cwd(), "apps", app, ".next", "BUILD_ID"),
      ),
  );
  if (missingBuilds.length > 0) {
    throw new Error(
      `Production E2E mode requires built apps. Missing BUILD_ID: ${missingBuilds.join(", ")}. Run pnpm build first.`,
    );
  }
}
const packageManager =
  process.platform === "win32"
    ? "corepack.cmd pnpm@10.33.0"
    : "corepack pnpm@10.33.0";
const nextCommand = serverMode === "production" ? "start" : "dev";
const serverCommand = (workspace: string, port: number) =>
  `${packageManager} --filter ${workspace} exec next ${nextCommand} --hostname 127.0.0.1 --port ${port}`;
const supportedRuntimePath = [path.dirname(process.execPath), process.env.PATH]
  .filter(Boolean)
  .join(path.delimiter);
const e2eEnvironment = {
  FLOWSTATE_ADMIN_E2E_BASE_URL: adminBaseURL,
  FLOWSTATE_API_E2E_BASE_URL: apiBaseURL,
  FLOWSTATE_LANDING_E2E_BASE_URL: landingBaseURL,
  FLOWSTATE_MEMBER_E2E_BASE_URL: memberBaseURL,
  FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL: "migration-corrections@example.test",
  FLOWSTATE_WAITLIST_PATH:
    process.env.FLOWSTATE_WAITLIST_PATH ??
    "test-results/every-visible-wave1/waitlist-submissions.jsonl",
  FORMS_MAGIC_LINK_SECRET: "rp20-local-signing-secret",
  NEXT_PUBLIC_APP_URL: adminBaseURL,
  NEXT_PUBLIC_FLOWSTATE_APP_URL: adminBaseURL,
  NEXT_PUBLIC_MEMBER_APP_URL: memberBaseURL,
  PATH: supportedRuntimePath,
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
};
Object.assign(process.env, e2eEnvironment);
const sharedServerEnv: Record<string, string> = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir:
    process.env.FLOWSTATE_PLAYWRIGHT_OUTPUT_DIR ??
    "test-results/every-visible-wave1/playwright-artifacts",
  reporter: process.env.FLOWSTATE_PLAYWRIGHT_JSON_REPORT
    ? [
        ["list"],
        ["json", { outputFile: process.env.FLOWSTATE_PLAYWRIGHT_JSON_REPORT }],
      ]
    : [
        ["list"],
        [
          "html",
          {
            open: "never",
            outputFolder: "test-results/every-visible-wave1/playwright-report",
          },
        ],
      ],
  use: {
    baseURL: adminBaseURL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: serverCommand("admin-web", adminPort),
      env: sharedServerEnv,
      url: `${adminBaseURL}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: serverCommand("member-web", memberPort),
      env: sharedServerEnv,
      url: `${memberBaseURL}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: serverCommand("api", apiPort),
      env: sharedServerEnv,
      url: `${apiBaseURL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: serverCommand("landing-web", landingPort),
      env: sharedServerEnv,
      url: landingBaseURL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      testIgnore: ["landing-target-sizes.spec.ts", "**/*.test.mjs"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-landing",
      testMatch: "landing-target-sizes.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: landingBaseURL },
    },
  ],
});
