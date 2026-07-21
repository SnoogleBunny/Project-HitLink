import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const historicalMigrationUrl = new URL(
  "../prisma/migrations/20260530120000_migration_first_onboarding_ops/migration.sql",
  import.meta.url,
);
const repairMigrationUrl = new URL(
  "../prisma/migrations/20260721164000_migration_imported_record_index_name/migration.sql",
  import.meta.url,
);

const historicalIndexName =
  "migration_imported_records_workspaceId_importedModel_importedRecordId_idx";
const postgresIdentifierLimitBytes = 63;
const truncatedHistoricalName = Buffer.from(historicalIndexName)
  .subarray(0, postgresIdentifierLimitBytes)
  .toString("utf8");
const repairedIndexName =
  "migration_imported_records_workspace_model_record_idx";

test("MigrationImportedRecord uses a PostgreSQL-safe mapped index name", async () => {
  const schema = await readFile(schemaUrl, "utf8");

  assert.ok(
    Buffer.byteLength(repairedIndexName) <= postgresIdentifierLimitBytes,
    "the mapped index name must fit PostgreSQL's 63-byte identifier limit",
  );
  assert.match(
    schema,
    new RegExp(
      `@@index\\(\\[workspaceId, importedModel, importedRecordId\\], map: "${repairedIndexName}"\\)`,
    ),
  );
});

test("the additive repair renames the PostgreSQL-truncated index without rebuilding it", async () => {
  const historicalMigration = await readFile(historicalMigrationUrl, "utf8");
  const repairMigration = await readFile(repairMigrationUrl, "utf8");
  const expectedRename =
    `ALTER INDEX "${truncatedHistoricalName}" RENAME TO "${repairedIndexName}";`;

  assert.match(
    historicalMigration,
    new RegExp(`CREATE INDEX "${historicalIndexName}"`),
    "the test must remain anchored to the already-applied migration that PostgreSQL truncates",
  );
  assert.ok(
    Buffer.byteLength(truncatedHistoricalName) === postgresIdentifierLimitBytes,
    "the old physical index name must model PostgreSQL's exact truncation",
  );
  assert.ok(repairMigration.includes(expectedRename));
  assert.doesNotMatch(repairMigration, /\b(?:DROP|CREATE)\s+(?:UNIQUE\s+)?INDEX\b/i);
  assert.doesNotMatch(repairMigration, /\b(?:DROP|TRUNCATE|DELETE)\b/i);
});
