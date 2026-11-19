import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildExecutionManifest,
  verifyExecutionManifest,
} from "./every-visible-feature-ledger.execution.mjs";
import {
  canonicalEnvironment,
  canonicalSpawnOptions,
  canonicalSteps,
} from "./canonical-playwright.mjs";

function reportFor(specs) {
  return {
    suites: [
      {
        file: "fixture.spec.ts",
        specs: specs.map((spec) => ({
          file: spec.file,
          title: spec.title,
          tests: [
            {
              expectedStatus: spec.expectedStatus ?? "passed",
              projectName: spec.projectName ?? "chromium",
              results: [{ status: spec.status }],
            },
          ],
        })),
      },
    ],
    stats: {
      expected: specs.filter(
        (spec) => spec.status === (spec.expectedStatus ?? "passed"),
      ).length,
      flaky: 0,
      skipped: specs.filter((spec) => spec.status === "skipped").length,
      unexpected: specs.filter(
        (spec) => spec.status !== (spec.expectedStatus ?? "passed"),
      ).length,
    },
  };
}

function ledgerFor(scenarios) {
  return {
    counts: { "Browser-proven working": Object.keys(scenarios).length },
    rows: Object.keys(scenarios).map((scenarioId, index) => ({
      disposition: "Browser-proven working",
      id: `VF-${String(index + 1).padStart(3, "0")}`,
      scenarioIds: [scenarioId],
    })),
    scenarios,
  };
}

const diagnosticScenario = {
  "EVF-DIAGNOSTICS": {
    kind: "browser",
    testFile: "tests/e2e/browser-diagnostics.spec.ts",
    testTitle: "fails closed when the fixture reports an error",
  },
};

test("execution manifest accepts an intentionally expected diagnostic failure", () => {
  const manifest = buildExecutionManifest({
    ledger: ledgerFor(diagnosticScenario),
    report: reportFor([
      {
        expectedStatus: "failed",
        file: "browser-diagnostics.spec.ts",
        status: "failed",
        title: "fails closed when the fixture reports an error",
      },
    ]),
  });

  assert.equal(manifest.playwright.configuredTests, 1);
  assert.equal(manifest.playwright.executedExpectedTests, 1);
  assert.equal(manifest.ledger.executionBackedRows, 1);
  assert.equal(manifest.ledger.executionUnbackedRows, 0);
  assert.doesNotThrow(() => verifyExecutionManifest(manifest));
});

for (const [label, specs] of [
  [
    "failed",
    [
      {
        file: "browser-diagnostics.spec.ts",
        status: "failed",
        title: "fails closed when the fixture reports an error",
      },
    ],
  ],
  [
    "skipped",
    [
      {
        file: "browser-diagnostics.spec.ts",
        status: "skipped",
        title: "fails closed when the fixture reports an error",
      },
    ],
  ],
  ["missing", []],
]) {
  test(`execution manifest rejects a ${label} mapped scenario`, () => {
    const manifest = buildExecutionManifest({
      ledger: ledgerFor(diagnosticScenario),
      report: reportFor(specs),
    });

    assert.equal(manifest.ledger.executionBackedRows, 0);
    assert.equal(manifest.ledger.executionUnbackedRows, 1);
    assert.throws(() => verifyExecutionManifest(manifest), /EVF-DIAGNOSTICS/);
  });
}

test("execution manifest requires every matching responsive variant to execute as expected", () => {
  const ledger = ledgerFor({
    "EVF-LANDING-RESPONSIVE": {
      kind: "browser",
      testFile: "tests/e2e/landing-target-sizes.spec.ts",
      testTitle: "landing navigation targets",
    },
  });
  const manifest = buildExecutionManifest({
    ledger,
    report: reportFor([
      {
        file: "landing-target-sizes.spec.ts",
        status: "passed",
        title: "mobile-390: landing navigation targets",
      },
      {
        file: "landing-target-sizes.spec.ts",
        status: "skipped",
        title: "tablet-768: landing navigation targets",
      },
    ]),
  });

  assert.equal(manifest.scenarioExecution[0].matchedTests, 2);
  assert.equal(manifest.scenarioExecution[0].executedAsExpected, false);
  assert.throws(
    () => verifyExecutionManifest(manifest),
    /EVF-LANDING-RESPONSIVE/,
  );
});

test("canonical environment is pinned to clean-development servers, QA ports, and an owned evidence root", () => {
  const root = path.resolve("C:/repo");
  const resolved = canonicalEnvironment(
    {
      DATABASE_URL:
        "postgresql://postgres:local@127.0.0.1:55435/flowstate_qa_canonical_repair?schema=public",
      FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT:
        "I_ACKNOWLEDGE_THIS_DATABASE_IS_DISPOSABLE",
      FLOWSTATE_DEMO_DATABASE_NAME: "flowstate_qa_canonical_repair",
      FLOWSTATE_E2E_SERVER_MODE: "development-clean",
    },
    root,
  );

  assert.deepEqual(resolved.ports, {
    admin: 3300,
    api: 3302,
    landing: 3303,
    member: 3301,
  });
  assert.match(resolved.outputRoot, /canonical-repair/);
  assert.equal(resolved.database.port, "55435");
  const steps = canonicalSteps(resolved);
  assert.deepEqual(
    steps.map((step) => step.name),
    ["build", "reset-demo-database", "playwright", "ledger-execution"],
  );
  for (const step of steps.slice(0, 3)) {
    assert.match(step.command, /corepack(?:\.cmd)?$/);
    assert.equal(step.args[0], "pnpm@10.33.0");
  }
});

test("canonical environment refuses protected ports, development mode, and unowned output roots", () => {
  const baseline = {
    DATABASE_URL:
      "postgresql://postgres:local@127.0.0.1:55435/flowstate_qa_canonical_repair?schema=public",
    FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT:
      "I_ACKNOWLEDGE_THIS_DATABASE_IS_DISPOSABLE",
    FLOWSTATE_DEMO_DATABASE_NAME: "flowstate_qa_canonical_repair",
    FLOWSTATE_E2E_SERVER_MODE: "development-clean",
  };

  assert.throws(
    () =>
      canonicalEnvironment(
        { ...baseline, FLOWSTATE_ADMIN_E2E_PORT: "3000" },
        "C:/repo",
      ),
    /3300/,
  );
  assert.throws(
    () =>
      canonicalEnvironment(
        { ...baseline, FLOWSTATE_E2E_SERVER_MODE: "development" },
        "C:/repo",
      ),
    /development-clean/,
  );
  assert.throws(
    () =>
      canonicalEnvironment(
        { ...baseline, FLOWSTATE_CANONICAL_OUTPUT_DIR: "test-results/final" },
        "C:/repo",
      ),
    /canonical-repair/,
  );
});

test("canonical Windows command steps use the command shell for corepack.cmd", () => {
  assert.equal(canonicalSpawnOptions("win32").shell, true);
  assert.equal(canonicalSpawnOptions("linux").shell, false);
});
