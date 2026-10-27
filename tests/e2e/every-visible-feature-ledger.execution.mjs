import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function normalizedFile(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function collectSpecs(suites, collected = [], ancestors = []) {
  for (const suite of suites ?? []) {
    const titlePath = suite.title ? [...ancestors, suite.title] : ancestors;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const finalResult = test.results?.at(-1);
        const actualStatus = finalResult?.status ?? "missing";
        // Playwright1.57 --list leaves expectedStatus="passed" even for a
        // declared test.fail; its discovery-time annotations carry the actual
        // contract. Runtime-only changes still differ from this preflight.
        const annotations = new Set(
          (test.annotations ?? []).map((entry) => entry.type),
        );
        const expectedStatus =
          annotations.has("skip") || annotations.has("fixme")
            ? "skipped"
            : annotations.has("fail")
              ? "failed"
              : (test.expectedStatus ?? "passed");
        collected.push({
          actualStatus,
          executed:
            finalResult !== undefined &&
            !["interrupted", "skipped"].includes(actualStatus),
          expectedStatus,
          file: normalizedFile(spec.file ?? suite.file),
          id: spec.id ?? [...titlePath, spec.title ?? ""].join(" > "),
          projectName: test.projectName ?? test.projectId ?? "",
          title: spec.title ?? "",
        });
      }
    }
    collectSpecs(suite.suites, collected, titlePath);
  }
  return collected;
}

export function scenarioTestCases(scenario) {
  return scenario.testCases ?? [scenario];
}

function testIdentity(test) {
  return JSON.stringify([
    test.projectName,
    test.file,
    test.id,
    test.expectedStatus,
  ]);
}

function configuredTests(report) {
  return collectSpecs(report.suites)
    .map(({ file, id, projectName, title, expectedStatus }) => ({
      file,
      id,
      projectName,
      title,
      expectedStatus,
    }))
    .sort((left, right) =>
      testIdentity(left).localeCompare(testIdentity(right)),
    );
}

// Discovery proves that every real ledger selector exists, not that it passed.
// Bind execution to those exact file/project/test identities, including all
// responsive variants and every constituent of a compound scenario.
export function buildDiscoveryContract({ ledger, report }) {
  const failures = [];
  const tests = configuredTests(report);
  if (report.errors?.length)
    failures.push("Playwright discovery reported errors");
  if (tests.length === 0) failures.push("Playwright discovered no tests");
  if (new Set(tests.map(testIdentity)).size !== tests.length)
    failures.push("Playwright discovered duplicate test identities");
  if (!ledger.rows?.length) failures.push("The feature ledger has no rows");
  for (const row of ledger.rows ?? []) {
    if (!row.scenarioIds?.length)
      failures.push(`${row.id}: no evidence scenarios`);
    for (const id of row.scenarioIds ?? [])
      if (!ledger.scenarios?.[id])
        failures.push(`${row.id}: unknown scenario ${id}`);
  }
  for (const [id, scenario] of Object.entries(ledger.scenarios ?? {})) {
    const cases = scenarioTestCases(scenario);
    if (!cases.length) failures.push(`${id}: no test selectors`);
    for (const selector of cases) {
      if (
        !selector.testFile?.startsWith("tests/e2e/") ||
        !selector.testTitle?.trim()
      ) {
        failures.push(`${id}: invalid test selector`);
        continue;
      }
      const matches = tests.filter((test) =>
        scenarioMatchesTest(selector, test),
      );
      if (!matches.length)
        failures.push(
          `${id}: missing ${selector.testFile}: ${selector.testTitle}`,
        );
      if (matches.some((test) => test.expectedStatus === "skipped"))
        failures.push(`${id}: a required test is configured to skip`);
    }
  }
  if (failures.length)
    throw new Error(
      `Feature-ledger discovery preflight failed: ${failures.join("; ")}`,
    );
  return { schemaVersion: 1, tests };
}

function scenarioMatchesTest(scenario, playwrightTest) {
  const relativeTestFile = (value) =>
    normalizedFile(value).split("tests/e2e/").at(-1);
  const scenarioFile = relativeTestFile(scenario.testFile);
  const reportFile = relativeTestFile(playwrightTest.file);
  return (
    scenarioFile === reportFile &&
    playwrightTest.title.includes(scenario.testTitle)
  );
}

export function buildExecutionManifest({ ledger, report }) {
  const playwrightTests = collectSpecs(report.suites);
  const scenarioExecution = Object.entries(ledger.scenarios)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, scenario]) => {
      const cases = scenarioTestCases(scenario).map((selector) => {
        const matches = playwrightTests.filter((playwrightTest) =>
          scenarioMatchesTest(selector, playwrightTest),
        );
        return {
          testFile: selector.testFile,
          testTitle: selector.testTitle,
          matches,
          executedAsExpected:
            matches.length > 0 &&
            matches.every(
              (match) =>
                match.executed && match.actualStatus === match.expectedStatus,
            ),
        };
      });
      const matches = cases.flatMap((entry) => entry.matches);
      const executedAsExpected =
        cases.length > 0 && cases.every((entry) => entry.executedAsExpected);
      return {
        executedAsExpected,
        id,
        kind: scenario.kind,
        matchedTests: matches.length,
        matches,
        cases,
        testFile: scenario.testFile,
        testTitle: scenario.testTitle,
      };
    });
  const scenarioById = new Map(
    scenarioExecution.map((scenario) => [scenario.id, scenario]),
  );
  const rowExecution = ledger.rows.map((row) => ({
    disposition: row.disposition,
    executedAsExpected: row.scenarioIds.every(
      (scenarioId) => scenarioById.get(scenarioId)?.executedAsExpected === true,
    ),
    id: row.id,
    scenarioIds: row.scenarioIds,
  }));
  const unbackedRows = rowExecution.filter((row) => !row.executedAsExpected);
  const failedScenarios = scenarioExecution.filter(
    (scenario) => !scenario.executedAsExpected,
  );

  return {
    schemaVersion: 1,
    playwright: {
      configuredTests: playwrightTests.length,
      tests: configuredTests(report),
      errors: report.errors ?? [],
      executedExpectedTests: playwrightTests.filter(
        (playwrightTest) =>
          playwrightTest.executed &&
          playwrightTest.actualStatus === playwrightTest.expectedStatus,
      ).length,
      reportStats: report.stats ?? null,
    },
    ledger: {
      dispositionCounts: ledger.counts,
      executionBackedRows: rowExecution.length - unbackedRows.length,
      executionUnbackedRows: unbackedRows.length,
      totalRows: rowExecution.length,
      unbackedRowIds: unbackedRows.map((row) => row.id),
    },
    scenarioExecution,
    failedScenarioIds: failedScenarios.map((scenario) => scenario.id),
    rowExecution,
  };
}

export function verifyExecutionManifest(manifest, { discoveryContract } = {}) {
  const failures = [];
  if (manifest.playwright.errors?.length)
    failures.push("Playwright execution reported errors");
  if (
    discoveryContract &&
    JSON.stringify(manifest.playwright.tests) !==
      JSON.stringify(discoveryContract.tests)
  )
    failures.push("executed test identities differ from preflight discovery");
  if (
    manifest.playwright.executedExpectedTests !==
    manifest.playwright.configuredTests
  ) {
    failures.push(
      `${manifest.playwright.executedExpectedTests}/${manifest.playwright.configuredTests} tests executed with their expected outcome`,
    );
  }
  if (manifest.ledger.executionUnbackedRows !== 0) {
    failures.push(
      `${manifest.ledger.executionBackedRows}/${manifest.ledger.totalRows} ledger rows are execution-backed`,
    );
  }
  if (manifest.failedScenarioIds.length > 0) {
    failures.push(`failed scenarios: ${manifest.failedScenarioIds.join(", ")}`);
  }

  if (failures.length > 0) {
    throw new Error(
      `Execution-backed ledger verification failed: ${failures.join("; ")}`,
    );
  }
  return manifest;
}

function runCli() {
  const [reportPath, ledgerPath, outputPath, discoveryPath] =
    process.argv.slice(2);
  if (!reportPath || !ledgerPath || !outputPath) {
    throw new Error(
      "Usage: node every-visible-feature-ledger.execution.mjs <playwright-report.json> <ledger.json> <output.json> <discovery.json>",
    );
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  if (!discoveryPath)
    throw new Error(
      "A preflight discovery report is required; a test count alone cannot bind execution.",
    );
  const discoveryContract = buildDiscoveryContract({
    ledger,
    report: JSON.parse(fs.readFileSync(discoveryPath, "utf8")),
  });
  const manifest = buildExecutionManifest({ ledger, report });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  verifyExecutionManifest(manifest, {
    discoveryContract,
  });
  console.log(
    `Execution-backed ledger: ${manifest.playwright.executedExpectedTests}/${manifest.playwright.configuredTests} tests expected; ${manifest.ledger.executionBackedRows}/${manifest.ledger.totalRows} rows backed; ${manifest.ledger.executionUnbackedRows} unbacked.`,
  );
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
