import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildDiscoveryContract,
  buildExecutionManifest,
  verifyExecutionManifest,
} from "./every-visible-feature-ledger.execution.mjs";

const REQUIRED_ACKNOWLEDGEMENT = "I_ACKNOWLEDGE_THIS_DATABASE_IS_DISPOSABLE";

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

  const portBase = Number(inputEnv.FLOWSTATE_CANONICAL_PORT_BASE ?? "3300");
  if (![3300, 3400].includes(portBase)) {
    throw new Error(
      "FLOWSTATE_CANONICAL_PORT_BASE must be 3300 or 3400; protected preview ports and arbitrary quartets are not allowed.",
    );
  }

  const ports = {
    admin: requireExactPort(inputEnv, "FLOWSTATE_ADMIN_E2E_PORT", portBase),
    api: requireExactPort(inputEnv, "FLOWSTATE_API_E2E_PORT", portBase + 2),
    landing: requireExactPort(
      inputEnv,
      "FLOWSTATE_LANDING_E2E_PORT",
      portBase + 3,
    ),
    member: requireExactPort(
      inputEnv,
      "FLOWSTATE_MEMBER_E2E_PORT",
      portBase + 1,
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
  if (
    inputEnv.TEST_DATABASE_URL &&
    inputEnv.TEST_DATABASE_URL !== inputEnv.DATABASE_URL
  ) {
    throw new Error(
      "TEST_DATABASE_URL must match the canonical DATABASE_URL when set.",
    );
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
    discoveryReportPath: path.join(outputRoot, "discovery.json"),
    discoveryContractPath: path.join(outputRoot, "discovery-contract.json"),
    ports,
    repoRoot: path.resolve(repoRoot),
  };
}

export function canonicalSteps() {
  const command = process.platform === "win32" ? "corepack.cmd" : "corepack";
  const pnpm = ["pnpm@10.33.0"];
  const browserArgs = [
    ...pnpm,
    "exec",
    "playwright",
    "test",
    "--project=chromium",
    "--project=chromium-landing",
    "--workers=1",
  ];
  return [
    {
      command,
      args: [...browserArgs, "--list", "--reporter=json"],
      name: "discovery",
    },
    {
      command,
      args: [
        ...pnpm,
        "exec",
        "turbo",
        "run",
        "build",
        "--force",
        "--concurrency=1",
      ],
      name: "build",
    },
    { command, args: [...pnpm, "db:reset:demo"], name: "reset-demo-database" },
    { command, args: browserArgs, name: "playwright" },
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
      stdio: options.captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal, stdout });
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

export async function runCanonical(
  inputEnv = process.env,
  { preflightOnly = false } = {},
) {
  const resolved = canonicalEnvironment(inputEnv);
  const steps = canonicalSteps(resolved);
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

  // The same project selection feeds discovery and execution. Validate the real
  // ledger before compiling apps or touching the disposable demo database.
  const ledger = JSON.parse(
    fs.readFileSync(
      path.join(
        resolved.repoRoot,
        "tests/e2e/every-visible-feature-ledger.json",
      ),
      "utf8",
    ),
  );
  const discovery = await runStep(steps[0], {
    cwd: resolved.repoRoot,
    env,
    captureOutput: true,
  });
  if (discovery.code !== 0)
    throw new Error(
      `Canonical discovery failed with exit code ${discovery.code}.`,
    );
  const discoveryReport = JSON.parse(discovery.stdout);
  const discoveryContract = buildDiscoveryContract({
    ledger,
    report: discoveryReport,
  });
  fs.writeFileSync(
    resolved.discoveryReportPath,
    `${JSON.stringify(discoveryReport, null, 2)}\n`,
  );
  fs.writeFileSync(
    resolved.discoveryContractPath,
    `${JSON.stringify(discoveryContract, null, 2)}\n`,
  );
  console.log(
    `[canonical] Real-ledger preflight: ${discoveryContract.tests.length} discovered tests; every required selector exists.`,
  );
  if (preflightOnly) return { discoveryContract, resolved };

  const build = await runStep(steps[1], { cwd: resolved.repoRoot, env });
  if (build.code !== 0)
    throw new Error(`Canonical build failed with exit code ${build.code}.`);
  assertProductionBuilds(resolved.repoRoot);

  const reset = await runStep(steps[2], { cwd: resolved.repoRoot, env });
  if (reset.code !== 0)
    throw new Error(
      `Canonical database reset failed with exit code ${reset.code}.`,
    );

  fs.rmSync(resolved.playwrightReportPath, { force: true });
  const playwright = await runStep(steps[3], { cwd: resolved.repoRoot, env });
  if (!fs.existsSync(resolved.playwrightReportPath)) {
    throw new Error(
      `Playwright did not write ${resolved.playwrightReportPath}; exit code ${playwright.code}.`,
    );
  }

  const report = JSON.parse(
    fs.readFileSync(resolved.playwrightReportPath, "utf8"),
  );
  const manifest = buildExecutionManifest({ ledger, report });
  fs.writeFileSync(
    resolved.executionManifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  let verificationError;
  try {
    verifyExecutionManifest(manifest, { discoveryContract });
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
  const options = process.argv.slice(2);
  if (options.some((option) => option !== "--preflight"))
    throw new Error("Only --preflight is supported.");
  runCanonical(process.env, {
    preflightOnly: options.includes("--preflight"),
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
