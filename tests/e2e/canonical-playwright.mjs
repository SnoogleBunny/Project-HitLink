import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildExecutionManifest,
  verifyExecutionManifest,
} from "./every-visible-feature-ledger.execution.mjs";

const REQUIRED_ACKNOWLEDGEMENT = "I_ACKNOWLEDGE_THIS_DATABASE_IS_DISPOSABLE";
const OWNED_PORTS = {
  admin: 3300,
  api: 3302,
  landing: 3303,
  member: 3301,
};

function requireExactPort(env, name, expected) {
  const actual = Number(env[name] ?? expected);
  if (actual !== expected) {
    throw new Error(`${name} must be ${expected}; received ${String(actual)}.`);
  }
  return actual;
}

export function canonicalEnvironment(inputEnv, repoRoot = process.cwd()) {
  if (inputEnv.FLOWSTATE_E2E_SERVER_MODE !== "development-clean") {
    throw new Error(
      "FLOWSTATE_E2E_SERVER_MODE=development-clean is required for canonical local HTTP auth and clean evidence.",
    );
  }

  const ports = {
    admin: requireExactPort(
      inputEnv,
      "FLOWSTATE_ADMIN_E2E_PORT",
      OWNED_PORTS.admin,
    ),
    api: requireExactPort(inputEnv, "FLOWSTATE_API_E2E_PORT", OWNED_PORTS.api),
    landing: requireExactPort(
      inputEnv,
      "FLOWSTATE_LANDING_E2E_PORT",
      OWNED_PORTS.landing,
    ),
    member: requireExactPort(
      inputEnv,
      "FLOWSTATE_MEMBER_E2E_PORT",
      OWNED_PORTS.member,
    ),
  };

  let database;
  try {
    database = new URL(inputEnv.DATABASE_URL);
  } catch {
    throw new Error(
      "DATABASE_URL must name the owned disposable PostgreSQL database.",
    );
  }
  if (
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    database.port !== "55435"
  ) {
    throw new Error("DATABASE_URL must use local QA PostgreSQL port 55435.");
  }
  const databaseName = decodeURIComponent(
    database.pathname.replace(/^\/+/, ""),
  );
  if (
    inputEnv.FLOWSTATE_DEMO_DATABASE_NAME !== databaseName ||
    !databaseName.includes("canonical_repair")
  ) {
    throw new Error(
      "FLOWSTATE_DEMO_DATABASE_NAME must match a database name containing canonical_repair.",
    );
  }
  if (
    inputEnv.FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT !==
    REQUIRED_ACKNOWLEDGEMENT
  ) {
    throw new Error(
      `FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT must equal ${REQUIRED_ACKNOWLEDGEMENT}.`,
    );
  }

  const outputRoot = path.resolve(
    repoRoot,
    inputEnv.FLOWSTATE_CANONICAL_OUTPUT_DIR ?? "test-results/canonical-repair",
  );
  if (!outputRoot.replaceAll("\\", "/").includes("/canonical-repair")) {
    throw new Error(
      "FLOWSTATE_CANONICAL_OUTPUT_DIR must be an owned path containing canonical-repair.",
    );
  }

  return {
    database,
    databaseName,
    executionManifestPath: path.join(
      outputRoot,
      "ledger-execution-backing.json",
    ),
    outputRoot,
    playwrightReportPath: path.join(outputRoot, "playwright-report.json"),
    ports,
    repoRoot: path.resolve(repoRoot),
  };
}

export function canonicalSteps(resolved) {
  const packageManager =
    process.platform === "win32" ? "corepack.cmd" : "corepack";
  const pnpm = ["pnpm@10.33.0"];
  return [
    {
      args: [...pnpm, "exec", "turbo", "run", "build", "--force"],
      command: packageManager,
      name: "build",
    },
    {
      args: [...pnpm, "db:reset:demo"],
      command: packageManager,
      name: "reset-demo-database",
    },
    {
      args: [
        ...pnpm,
        "exec",
        "playwright",
        "test",
        "--project=chromium",
        "--project=chromium-landing",
        "--workers=1",
      ],
      command: packageManager,
      name: "playwright",
    },
    {
      args: [
        path.join(
          resolved.repoRoot,
          "tests/e2e/every-visible-feature-ledger.execution.mjs",
        ),
        resolved.playwrightReportPath,
        path.join(
          resolved.repoRoot,
          "tests/e2e/every-visible-feature-ledger.json",
        ),
        resolved.executionManifestPath,
        "23",
      ],
      command: process.execPath,
      name: "ledger-execution",
    },
  ];
}

export function canonicalSpawnOptions(platform = process.platform) {
  return { shell: platform === "win32" };
}

function runStep(step, options) {
  console.log(
    `\n[canonical] ${step.name}: ${step.command} ${step.args.join(" ")}`,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: options.cwd,
      env: options.env,
      ...canonicalSpawnOptions(),
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });
}

function assertProductionBuilds(repoRoot) {
  const missing = ["admin-web", "member-web", "api", "landing-web"].filter(
    (app) =>
      !fs.existsSync(path.join(repoRoot, "apps", app, ".next", "BUILD_ID")),
  );
  if (missing.length > 0) {
    throw new Error(
      `Production build did not create BUILD_ID for: ${missing.join(", ")}.`,
    );
  }
}

export async function runCanonical(inputEnv = process.env) {
  const resolved = canonicalEnvironment(inputEnv);
  const steps = canonicalSteps(resolved);
  fs.rmSync(resolved.outputRoot, { force: true, recursive: true });
  fs.mkdirSync(resolved.outputRoot, { recursive: true });

  const adminBaseURL = `http://127.0.0.1:${resolved.ports.admin}`;
  const memberBaseURL = `http://localhost:${resolved.ports.member}`;
  const apiBaseURL = `http://127.0.0.1:${resolved.ports.api}`;
  const landingBaseURL = `http://127.0.0.1:${resolved.ports.landing}`;
  const env = {
    ...inputEnv,
    FLOWSTATE_ADMIN_E2E_BASE_URL: adminBaseURL,
    FLOWSTATE_ADMIN_E2E_PORT: String(resolved.ports.admin),
    FLOWSTATE_API_E2E_BASE_URL: apiBaseURL,
    FLOWSTATE_API_E2E_PORT: String(resolved.ports.api),
    FLOWSTATE_LANDING_E2E_BASE_URL: landingBaseURL,
    FLOWSTATE_LANDING_E2E_PORT: String(resolved.ports.landing),
    FLOWSTATE_MEMBER_E2E_BASE_URL: memberBaseURL,
    FLOWSTATE_MEMBER_E2E_PORT: String(resolved.ports.member),
    FLOWSTATE_PLAYWRIGHT_JSON_REPORT: resolved.playwrightReportPath,
    FLOWSTATE_PLAYWRIGHT_OUTPUT_DIR: path.join(
      resolved.outputRoot,
      "playwright-artifacts",
    ),
    FLOWSTATE_WAITLIST_PATH: path.join(
      resolved.outputRoot,
      "waitlist-submissions.jsonl",
    ),
    LANDING_EVIDENCE_DIR: path.join(
      resolved.outputRoot,
      "screenshots",
      "landing",
    ),
    NEXT_PUBLIC_APP_URL: adminBaseURL,
    NEXT_PUBLIC_FLOWSTATE_APP_URL: adminBaseURL,
    NEXT_PUBLIC_MEMBER_APP_URL: memberBaseURL,
    ONBOARDING_SCREENSHOT_DIR: path.join(
      resolved.outputRoot,
      "screenshots",
      "migration",
    ),
    RP08_EVIDENCE_DIR: path.join(resolved.outputRoot, "screenshots", "trial"),
    RP20_EVIDENCE_DIR: path.join(resolved.outputRoot, "screenshots", "rp20"),
  };
  delete env.NODE_ENV;

  const build = await runStep(steps[0], { cwd: resolved.repoRoot, env });
  if (build.code !== 0) {
    throw new Error(`Canonical build failed with exit code ${build.code}.`);
  }
  assertProductionBuilds(resolved.repoRoot);

  const reset = await runStep(steps[1], { cwd: resolved.repoRoot, env });
  if (reset.code !== 0) {
    throw new Error(
      `Canonical database reset failed with exit code ${reset.code}.`,
    );
  }

  const playwright = await runStep(steps[2], {
    cwd: resolved.repoRoot,
    env,
  });
  if (!fs.existsSync(resolved.playwrightReportPath)) {
    throw new Error(
      `Playwright did not write ${resolved.playwrightReportPath}; exit code ${playwright.code}.`,
    );
  }

  const report = JSON.parse(
    fs.readFileSync(resolved.playwrightReportPath, "utf8"),
  );
  const ledger = JSON.parse(
    fs.readFileSync(
      path.join(
        resolved.repoRoot,
        "tests/e2e/every-visible-feature-ledger.json",
      ),
      "utf8",
    ),
  );
  const manifest = buildExecutionManifest({ ledger, report });
  fs.writeFileSync(
    resolved.executionManifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  let verificationError;
  try {
    verifyExecutionManifest(manifest, { expectedConfiguredTests: 23 });
  } catch (error) {
    verificationError = error;
  }
  console.log(
    `\n[canonical] ${manifest.playwright.executedExpectedTests}/${manifest.playwright.configuredTests} intended tests executed as expected; ${manifest.ledger.executionBackedRows}/${manifest.ledger.totalRows} ledger rows backed; ${manifest.ledger.executionUnbackedRows} unbacked.`,
  );

  if (playwright.code !== 0) {
    throw new Error(
      `Canonical Playwright failed with exit code ${playwright.code}.`,
    );
  }
  if (verificationError) {
    throw verificationError;
  }
  return { manifest, resolved };
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectExecution) {
  runCanonical().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
