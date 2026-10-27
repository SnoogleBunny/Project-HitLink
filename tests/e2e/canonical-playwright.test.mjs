import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildDiscoveryContract,
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

test("discovery binds a declared expected failure using Playwright's list annotations", () => {
  const ledger = ledgerFor(diagnosticScenario);
  const spec = {
    file: "browser-diagnostics.spec.ts",
    title: "fails closed when the fixture reports an error",
    status: "skipped",
  };
  const discovery = reportFor([spec]);
  discovery.suites[0].specs[0].tests[0].annotations = [{ type: "fail" }];
  const contract = buildDiscoveryContract({ ledger, report: discovery });
  assert.equal(contract.tests[0].expectedStatus, "failed");
  const manifest = buildExecutionManifest({
    ledger,
    report: reportFor([
      { ...spec, expectedStatus: "failed", status: "failed" },
    ]),
  });
  assert.doesNotThrow(() =>
    verifyExecutionManifest(manifest, { discoveryContract: contract }),
  );
  const unexpectedPass = buildExecutionManifest({
    ledger,
    report: reportFor([
      { ...spec, expectedStatus: "failed", status: "passed" },
    ]),
  });
  assert.throws(
    () =>
      verifyExecutionManifest(unexpectedPass, { discoveryContract: contract }),
    /EVF-DIAGNOSTICS/,
  );
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
    ["discovery", "build", "reset-demo-database", "playwright"],
  );
  for (const step of steps) {
    assert.match(step.command, /corepack(?:\.cmd)?$/);
    assert.equal(step.args[0], "pnpm@10.33.0");
  }
  assert.ok(steps[0].args.includes("--list"));
  assert.deepEqual(steps[0].args.slice(0, -2), steps[3].args);
});

const connectedScenario = {
  CONNECTED: {
    kind: "browser",
    testCases: [
      { testFile: "tests/e2e/owner.spec.ts", testTitle: "owner roster" },
      { testFile: "tests/e2e/member.spec.ts", testTitle: "member booking" },
    ],
  },
};
const connectedSpecs = [
  { file: "owner.spec.ts", title: "owner roster", status: "passed" },
  { file: "member.spec.ts", title: "member booking", status: "passed" },
];

test("discovery requires every constituent of a real-ledger scenario before execution", () => {
  const ledger = ledgerFor(connectedScenario);
  const discovery = reportFor(
    connectedSpecs.map((spec) => ({ ...spec, status: "skipped" })),
  );
  const contract = buildDiscoveryContract({ ledger, report: discovery });
  assert.equal(contract.tests.length, 2);
  const manifest = buildExecutionManifest({
    ledger,
    report: reportFor(connectedSpecs),
  });
  assert.doesNotThrow(() =>
    verifyExecutionManifest(manifest, { discoveryContract: contract }),
  );
  assert.throws(
    () =>
      buildDiscoveryContract({
        ledger,
        report: reportFor(connectedSpecs.slice(0, 1)),
      }),
    /CONNECTED: missing.*member booking/,
  );
});

test("discovery rejects a required configured skip and an unknown row scenario", () => {
  const ledger = ledgerFor(connectedScenario);
  assert.throws(
    () =>
      buildDiscoveryContract({
        ledger,
        report: reportFor([
          connectedSpecs[0],
          {
            ...connectedSpecs[1],
            expectedStatus: "skipped",
            status: "skipped",
          },
        ]),
      }),
    /required test is configured to skip/,
  );
  ledger.rows[0].scenarioIds.push("REMOVED");
  assert.throws(
    () => buildDiscoveryContract({ ledger, report: reportFor(connectedSpecs) }),
    /unknown scenario REMOVED/,
  );
});

test("same-count execution cannot substitute a different test or project after preflight", () => {
  const ledger = ledgerFor(connectedScenario);
  const contract = buildDiscoveryContract({
    ledger,
    report: reportFor(connectedSpecs),
  });
  for (const changed of [
    { ...connectedSpecs[1], title: "different member action" },
    { ...connectedSpecs[1], projectName: "other-project" },
  ]) {
    const manifest = buildExecutionManifest({
      ledger,
      report: reportFor([connectedSpecs[0], changed]),
    });
    assert.throws(
      () => verifyExecutionManifest(manifest, { discoveryContract: contract }),
      /test identities differ/,
    );
  }
});

test("every compound outcome must execute; a passing sibling cannot cover a missing or skipped case", () => {
  const ledger = ledgerFor(connectedScenario);
  for (const specs of [
    connectedSpecs.slice(0, 1),
    [connectedSpecs[0], { ...connectedSpecs[1], status: "skipped" }],
  ]) {
    const manifest = buildExecutionManifest({
      ledger,
      report: reportFor(specs),
    });
    assert.equal(manifest.scenarioExecution[0].executedAsExpected, false);
    assert.throws(() => verifyExecutionManifest(manifest), /CONNECTED/);
  }
});

test("a test with the same basename in another directory cannot satisfy a ledger selector", () => {
  const ledger = ledgerFor(connectedScenario);
  const report = reportFor([
    connectedSpecs[0],
    { ...connectedSpecs[1], file: "unrelated/member.spec.ts" },
  ]);
  assert.throws(
    () => buildDiscoveryContract({ ledger, report }),
    /CONNECTED: missing.*member booking/,
  );
});

test("discovery and execution report-level errors cannot produce an acceptance receipt", () => {
  const ledger = ledgerFor(connectedScenario);
  const report = {
    ...reportFor(connectedSpecs),
    errors: [{ message: "Worker setup failed" }],
  };
  assert.throws(
    () => buildDiscoveryContract({ ledger, report }),
    /discovery reported errors/,
  );
  assert.throws(
    () => verifyExecutionManifest(buildExecutionManifest({ ledger, report })),
    /execution reported errors/,
  );
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
      canonicalEnvironment({
        ...baseline,
        TEST_DATABASE_URL: "postgresql://localhost:55435/another_test",
      }),
    /TEST_DATABASE_URL must match/,
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

test("a second exact canonical quartet leaves retained 3300 and preview 3100 services alone", () => {
  const baseline = {
    DATABASE_URL:
      "postgresql://localhost:55435/hitlink_canonical_repair_test?schema=public",
    FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT:
      "I_ACKNOWLEDGE_THIS_DATABASE_IS_DISPOSABLE",
    FLOWSTATE_DEMO_DATABASE_NAME: "hitlink_canonical_repair_test",
    FLOWSTATE_E2E_SERVER_MODE: "development-clean",
    FLOWSTATE_CANONICAL_PORT_BASE: "3400",
  };
  assert.deepEqual(canonicalEnvironment(baseline).ports, {
    admin: 3400,
    member: 3401,
    api: 3402,
    landing: 3403,
  });
  assert.deepEqual(
    canonicalEnvironment({
      ...baseline,
      FLOWSTATE_ADMIN_E2E_PORT: "3400",
      FLOWSTATE_MEMBER_E2E_PORT: "3401",
      FLOWSTATE_API_E2E_PORT: "3402",
      FLOWSTATE_LANDING_E2E_PORT: "3403",
    }).ports,
    { admin: 3400, member: 3401, api: 3402, landing: 3403 },
  );
  for (const base of ["3000", "3100", "3301", "3500", "invalid"]) {
    assert.throws(
      () =>
        canonicalEnvironment({
          ...baseline,
          FLOWSTATE_CANONICAL_PORT_BASE: base,
        }),
      /PORT_BASE must be 3300 or 3400/,
    );
  }
  for (const name of [
    "FLOWSTATE_ADMIN_E2E_PORT",
    "FLOWSTATE_MEMBER_E2E_PORT",
    "FLOWSTATE_API_E2E_PORT",
    "FLOWSTATE_LANDING_E2E_PORT",
  ]) {
    assert.throws(
      () => canonicalEnvironment({ ...baseline, [name]: "3300" }),
      /must be 340/,
    );
  }
  assert.ok(canonicalSteps()[1].args.includes("--concurrency=1"));
});
