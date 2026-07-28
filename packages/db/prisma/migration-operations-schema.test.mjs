import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const schemaUrl = new URL("./schema.prisma", import.meta.url);
const migrationUrl = new URL(
  "./migrations/20260725120000_migration_review_and_job_recovery/migration.sql",
  import.meta.url,
);

test("schema persists the approved owner-review and cancellation audit only", async () => {
  const schema = await readFile(schemaUrl, "utf8");

  for (const field of [
    "ownerReviewAcknowledgedAt",
    "ownerReviewAcknowledgedByUserId",
    "cancelledAt",
    "cancelledByOperatorId",
    "cancellationReason",
  ]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`), `${field} is missing`);
  }

  assert.match(
    schema,
    /migrationReviewAcknowledgements\s+WorkspaceMigration\[\]\s+@relation\("MigrationOwnerReviewAcknowledgement"\)/,
    "User must expose the explicit owner-review inverse relation",
  );
  assert.match(
    schema,
    /ownerReviewAcknowledgedByUser\s+User\?\s+@relation\("MigrationOwnerReviewAcknowledgement", fields: \[ownerReviewAcknowledgedByUserId\], references: \[id\], onDelete: Restrict, map: "workspace_migrations_owner_review_user_fkey"\)/,
    "WorkspaceMigration must retain the acknowledged owner through the reviewed FK",
  );
  assert.doesNotMatch(schema, /cancelledByActor|recoveredAt|recoveredByActor|recoveryNote/);
  assert.doesNotMatch(schema, /@@index\(\[workspaceId, (?:ownerReviewAcknowledgedAt|cancelledAt)\]\)/);
});

test("additive migration creates nullable audit columns and the reviewed constraints without backfill", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|TYPE)/i);
  assert.doesNotMatch(sql, /ADD COLUMN[^;]*NOT NULL/i);
  assert.doesNotMatch(sql, /UPDATE\s+"(?:workspace_migrations|import_jobs)"/i);
  assert.match(sql, /ownerReviewAcknowledgedAt/);
  assert.match(sql, /ownerReviewAcknowledgedByUserId/);
  assert.match(sql, /cancelledAt/);
  assert.match(sql, /cancelledByOperatorId/);
  assert.match(sql, /workspace_migrations_owner_review_pair_check/);
  assert.match(sql, /workspace_migrations_owner_review_stage_check/);
  assert.match(sql, /workspace_migrations_complete_audit_check/);
  assert.match(sql, /workspace_migrations_owner_review_user_fkey/);
  assert.match(sql, /import_jobs_cancellation_audit_check/);
  assert.match(sql, /ON DELETE RESTRICT/);
  assert.doesNotMatch(sql, /FOREIGN KEY \("cancelledByOperatorId"\)/);
  assert.doesNotMatch(sql, /DEFAULT|CREATE INDEX|recoveredAt|cancelledByActor/i);
  assert.match(sql, /DO \$\$/);
  assert.match(sql, /INNER JOIN "workspaces"/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /migration\."stage" = 'COMPLETE'/);
  assert.match(sql, /workspace\."status" <> 'ACTIVE'/);
  assert.match(
    sql,
    /NULLIF\(BTRIM\(migration\."ownerReviewAcknowledgedByUserId"\), ''\) IS NULL/,
  );
  assert.match(
    sql,
    /NULLIF\(BTRIM\(migration\."operationallyReadyByUserId"\), ''\) IS NULL/,
  );
});

test("cancellation audit constraint preserves legacy rows during installation", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const constraintStart = sql.indexOf(
    'ADD CONSTRAINT "import_jobs_cancellation_audit_check"',
  );

  assert.notEqual(constraintStart, -1, "cancellation audit constraint is missing");
  assert.match(
    sql.slice(constraintStart),
    /\)\s*NOT VALID\s*;\s*$/,
    "the cancellation audit CHECK must be NOT VALID so legacy invalid rows survive installation",
  );
});

test("cancellation audit constraint enforces complete audit data for new cancellations", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const constraintStart = sql.indexOf(
    'ADD CONSTRAINT "import_jobs_cancellation_audit_check"',
  );
  const normalizedConstraint = sql
    .slice(constraintStart)
    .replace(/\s+/g, " ")
    .trim();

  assert.equal(
    normalizedConstraint,
    'ADD CONSTRAINT "import_jobs_cancellation_audit_check" CHECK ( ( "status" <> \'CANCELLED\' AND "cancelledAt" IS NULL AND "cancelledByOperatorId" IS NULL AND "cancellationReason" IS NULL ) OR ( "status" = \'CANCELLED\' AND "cancelledAt" IS NOT NULL AND NULLIF(BTRIM("cancelledByOperatorId"), \'\') IS NOT NULL AND NULLIF(BTRIM("cancellationReason"), \'\') IS NOT NULL ) ) NOT VALID;',
    "new non-cancelled rows may remain unaudited, while new cancelled rows require timestamp, nonblank actor, and nonblank reason",
  );
});
