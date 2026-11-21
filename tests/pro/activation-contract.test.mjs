import assert from "node:assert/strict";
import test from "node:test";
import { evaluateActivationReadiness } from "../../apps/pro-api/src/modules/activation/readiness.mjs";

const now = 2_000;
const scope = {
  tenantId: "synthetic-tenant",
  plane: "us",
  profileVersion: "synthetic-profile-v1",
};
const requirements = [
  "application",
  "organization_admin",
  "classification",
  "data_flow_destinations",
  "agreements",
  "profile_and_operating_envelope",
  "security_privacy",
  "independent_approval",
  "identity_service",
];
const records = requirements.map((kind) => ({
  ...scope,
  kind,
  status: "approved",
  evidenceRef: `synthetic-${kind}`,
  reviewerId: `synthetic-reviewer-${kind}`,
  effectiveAt: 1_000,
  expiresAt: 3_000,
}));
const review = (evidence, overrides = {}) =>
  evaluateActivationReadiness({
    scope,
    now,
    readVerifiedEvidence: async (requested) => {
      assert.deepEqual(requested, scope);
      return evidence;
    },
    ...overrides,
  });

test("organization readiness demands every verified prerequisite and stays in review", async () => {
  assert.deepEqual(await review(records), {
    status: "ready_for_invitation_review",
  });
  for (const kind of requirements) {
    assert.deepEqual(await review(records.filter((row) => row.kind !== kind)), {
      status: "blocked",
      reason: kind,
    });
  }
  assert.deepEqual(await review([...records, records[0]]), {
    status: "blocked",
    reason: "evidence_conflict",
  });
  assert.deepEqual(
    await review(records, {
      readVerifiedEvidence: async () => {
        throw new Error("synthetic backend failure");
      },
    }),
    { status: "blocked", reason: "evidence_unavailable" },
  );
});

test("organization readiness rejects stale, unapproved, mismatched, and non-independent review evidence", async () => {
  const change = (kind, patch) =>
    records.map((row) => (row.kind === kind ? { ...row, ...patch } : row));
  for (const patch of [
    { expiresAt: now },
    { effectiveAt: now + 1 },
    { status: "pending" },
    { profileVersion: "another-profile" },
    { tenantId: "another-tenant" },
    { plane: "ca" },
    { evidenceRef: "" },
    { reviewerId: "" },
  ])
    assert.deepEqual(await review(change("agreements", patch)), {
      status: "blocked",
      reason: "agreements",
    });
  assert.deepEqual(
    await review(
      change("independent_approval", {
        reviewerId: "synthetic-reviewer-security_privacy",
      }),
    ),
    { status: "blocked", reason: "independent_approval" },
  );
});
