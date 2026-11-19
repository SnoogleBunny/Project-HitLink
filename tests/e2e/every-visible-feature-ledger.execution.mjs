import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function normalizedFile(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function collectSpecs(suites, collected = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const finalResult = test.results?.at(-1);
        const actualStatus = finalResult?.status ?? "missing";
        const expectedStatus = test.expectedStatus ?? "passed";
        collected.push({
          actualStatus,
          executed:
            finalResult !== undefined &&
            !["interrupted", "skipped"].includes(actualStatus),
          expectedStatus,
          file: normalizedFile(spec.file ?? suite.file),
          projectName: test.projectName ?? test.projectId ?? "",
          title: spec.title ?? "",
        });
      }
    }
    collectSpecs(suite.suites, collected);
  }
  return collected;
}

function scenarioMatchesTest(scenario, playwrightTest) {
  const scenarioFile = normalizedFile(scenario.testFile);
  const reportFile = normalizedFile(playwrightTest.file);
  return (
    (scenarioFile.endsWith(`/${reportFile}`) ||
      reportFile.endsWith(`/${scenarioFile}`) ||
      path.posix.basename(scenarioFile) === path.posix.basename(reportFile)) &&
    playwrightTest.title.includes(scenario.testTitle)
  );
}

export function buildExecutionManifest({ ledger, report }) {
  const playwrightTests = collectSpecs(report.suites);
  const scenarioExecution = Object.entries(ledger.scenarios)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, scenario]) => {
      const matches = playwrightTests.filter((playwrightTest) =>
        scenarioMatchesTest(scenario, playwrightTest),
      );
      const executedAsExpected =
        matches.length > 0 &&
        matches.every(
          (match) =>
            match.executed && match.actualStatus === match.expectedStatus,
        );
      return {
        executedAsExpected,
        id,
        kind: scenario.kind,
        matchedTests: matches.length,
        matches,
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

export function verifyExecutionManifest(
  manifest,
  { expectedConfiguredTests } = {},
) {
  const failures = [];
  if (
    expectedConfiguredTests !== undefined &&
    manifest.playwright.configuredTests !== expectedConfiguredTests
  ) {
    failures.push(
      `expected ${expectedConfiguredTests} configured tests, received ${manifest.playwright.configuredTests}`,
    );
  }
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
  const [reportPath, ledgerPath, outputPath, expectedTestsText] =
    process.argv.slice(2);
  if (!reportPath || !ledgerPath || !outputPath) {
    throw new Error(
      "Usage: node every-visible-feature-ledger.execution.mjs <playwright-report.json> <ledger.json> <output.json> [expected-tests]",
    );
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const manifest = buildExecutionManifest({ ledger, report });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  verifyExecutionManifest(manifest, {
    expectedConfiguredTests:
      expectedTestsText === undefined ? undefined : Number(expectedTestsText),
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
