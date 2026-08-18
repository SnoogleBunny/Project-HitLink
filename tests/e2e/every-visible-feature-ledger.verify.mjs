import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const ledgerPath = path.join(
  import.meta.dirname,
  "every-visible-feature-ledger.json",
);
const matrixPath =
  process.env.FLOWSTATE_VISIBLE_FEATURE_MATRIX ??
  "C:/Users/Jacky/AppData/Local/hermes/kanban/boards/hitlink/attachments/t_667d825b/every-visible-feature-matrix.json";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function countBy(rows, field) {
  return Object.fromEntries(
    [...new Set(rows.map((row) => row[field]))]
      .sort()
      .map((value) => [
        value,
        rows.filter((row) => row[field] === value).length,
      ]),
  );
}

test("the RP-20 ledger closes every authoritative visible-feature row", () => {
  const matrixBytes = fs.readFileSync(matrixPath);
  const matrix = JSON.parse(matrixBytes);
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));

  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.sourceMatrix.sha256, sha256(matrixBytes));
  assert.equal(ledger.sourceMatrix.candidate, matrix.candidate);
  assert.equal(ledger.sourceMatrix.tree, matrix.tree);
  assert.equal(ledger.rows.length, 263);
  assert.deepEqual(
    ledger.rows.map((row) => row.id).sort(),
    matrix.rows.map((row) => row.id).sort(),
  );
  assert.equal(new Set(ledger.rows.map((row) => row.id)).size, 263);

  const allowedDispositions = new Set([
    "Browser-proven working",
    "Removed/not part of demo",
    "Truthfully unavailable",
  ]);
  for (const row of ledger.rows) {
    assert.ok(allowedDispositions.has(row.disposition), row.id);
    assert.ok(!JSON.stringify(row).toLowerCase().includes("unproven"), row.id);
    assert.ok(
      Array.isArray(row.scenarioIds) && row.scenarioIds.length > 0,
      row.id,
    );
    assert.ok(row.evidenceSummary?.trim(), row.id);
    for (const scenarioId of row.scenarioIds) {
      assert.ok(ledger.scenarios[scenarioId], `${row.id}: ${scenarioId}`);
    }

    if (row.disposition === "Browser-proven working") {
      assert.ok(
        row.scenarioIds.some(
          (scenarioId) => ledger.scenarios[scenarioId].kind === "browser",
        ),
        `${row.id}: browser evidence required`,
      );
    }
    if (row.disposition === "Truthfully unavailable") {
      assert.ok(
        row.scenarioIds.some((scenarioId) => {
          const scenario = ledger.scenarios[scenarioId];
          return (
            scenario.kind === "browser" &&
            scenario.assertions.includes("visible-boundary") &&
            scenario.assertions.includes("zero-external-requests")
          );
        }),
        `${row.id}: unavailable boundary evidence required`,
      );
    }
    if (row.disposition === "Removed/not part of demo") {
      assert.ok(
        row.scenarioIds.some((scenarioId) => {
          const scenario = ledger.scenarios[scenarioId];
          return (
            scenario.kind === "browser" &&
            scenario.assertions.includes("absence-proof")
          );
        }),
        `${row.id}: absence evidence required`,
      );
    }
  }

  assert.deepEqual(countBy(ledger.rows, "disposition"), ledger.counts);
  assert.deepEqual(ledger.counts, {
    "Browser-proven working": 243,
    "Removed/not part of demo": 10,
    "Truthfully unavailable": 10,
  });
  assert.equal(
    Object.values(ledger.counts).reduce((sum, count) => sum + count, 0),
    263,
  );

  for (const [scenarioId, scenario] of Object.entries(ledger.scenarios)) {
    assert.ok(
      scenario.kind === "browser" || scenario.kind === "gate",
      scenarioId,
    );
    assert.ok(
      Array.isArray(scenario.assertions) && scenario.assertions.length > 0,
      scenarioId,
    );
    assert.ok(scenario.testFile?.startsWith("tests/e2e/"), scenarioId);
    assert.ok(scenario.testTitle?.trim(), scenarioId);
    const testSource = fs.readFileSync(
      path.join(repoRoot, scenario.testFile),
      "utf8",
    );
    assert.ok(
      testSource.includes(scenario.testTitle),
      `${scenarioId}: title not found in ${scenario.testFile}`,
    );
  }
});
