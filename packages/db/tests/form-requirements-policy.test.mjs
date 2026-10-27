import test from "node:test";
import assert from "node:assert/strict";
import {
  createBookingFormSnapshot,
  evaluateBookingFormConsequence,
  expiryWarningDue,
  formEvidenceHash,
  matchingAcceptance,
  parseBookingFormSnapshot,
  parseRequirementTerms,
  recoveryTransition,
  revisionHash,
  selectServiceRevision,
} from "../src/form-requirements-policy.ts";
const before = "2026-10-25T12:00:00.000Z",
  published = "2026-10-26T12:00:00.000Z",
  effective = "2026-10-27T12:00:00.000Z",
  service = "2026-10-28T12:00:00.000Z",
  recorded = "2026-10-28T13:00:00.000Z";
const terms = (overrides = {}) => ({
  schemaVersion: 1,
  targets: ["MEMBER"],
  effectiveAt: effective,
  consentValidUntil: null,
  noticeLeadMinutes: 1440,
  expiryWarningLeadMinutes: 1440,
  ...overrides,
});
const revision = (overrides = {}) => {
  const body = {
    id: "rev-1",
    workspaceId: "gym",
    formDocumentId: "doc",
    formVersionId: "pdf",
    version: 1,
    fileSha256: "a".repeat(64),
    terms: terms(),
    publishedAt: published,
    actorUserId: "owner",
    reason: "Updated safety requirement",
    previousRevisionHash: null,
    previewHash: "b".repeat(64),
    baseline: null,
    ...overrides,
  };
  return { ...body, revisionHash: revisionHash(body) };
};
const legacy = (overrides = {}) => ({
  formDocumentId: "doc",
  formVersionId: "pdf",
  requirementRevisionId: null,
  revisionHash: null,
  acceptanceCycleKey: "legacy",
  signerKind: "MEMBER",
  effectiveAt: null,
  publishedAt: null,
  consentValidUntil: null,
  basis: "OBSERVED_LEGACY",
  ...overrides,
});
const required = (overrides = {}) => ({
  ...legacy(),
  requirementRevisionId: "rev-1",
  revisionHash: revision().revisionHash,
  acceptanceCycleKey: "rev-1",
  effectiveAt: effective,
  publishedAt: published,
  basis: "PUBLISHED_REVISION",
  ...overrides,
});
const proof = (overrides = {}) => ({
  id: "signature",
  workspaceId: "gym",
  memberId: "member",
  formVersionId: "pdf",
  requirementRevisionId: null,
  acceptanceCycleKey: "legacy",
  signerKind: "MEMBER",
  signedAt: before,
  validUntil: null,
  ...overrides,
});
const snapshot = (requirements = [legacy()], proofs = [proof()]) =>
  createBookingFormSnapshot({
    workspaceId: "gym",
    memberId: "member",
    serviceAt: service,
    serviceTimezone: "America/Vancouver",
    acceptedAt: before,
    requirements,
    proofs,
  });
const decision = (overrides = {}) =>
  evaluateBookingFormConsequence({
    workspaceId: "gym",
    memberId: "member",
    bookingCreatedAt: before,
    acceptedSnapshot: snapshot(),
    requirements: [required()],
    proofs: [proof()],
    serviceAt: service,
    recordedAt: recorded,
    state: "NO_SHOW",
    ...overrides,
  });

test("terms are strict, canonical and bind explicit short notice rather than imposing a universal day", () => {
  assert.deepEqual(
    parseRequirementTerms(
      terms({ targets: ["GUARDIAN", "TRIAL"], noticeLeadMinutes: 5 }),
    ).targets,
    ["TRIAL", "GUARDIAN"],
  );
  for (const value of [
    terms({ unknown: true }),
    terms({ noticeLeadMinutes: 0 }),
    terms({ targets: ["MEMBER", "MEMBER"] }),
    terms({ consentValidUntil: effective }),
  ])
    assert.throws(() => parseRequirementTerms(value));
});
test("effective equality selects the new revision; a post-class publication cannot change historical service", () => {
  const row = revision();
  assert.equal(selectServiceRevision([row], "gym", "doc", published), null);
  assert.equal(
    selectServiceRevision([row], "gym", "doc", effective).id,
    row.id,
  );
  assert.equal(selectServiceRevision([row], "other-gym", "doc", service), null);
  assert.throws(() =>
    selectServiceRevision(
      [{ ...row, terms: terms({ targets: [] }) }],
      "gym",
      "doc",
      service,
    ),
  );
});
test("a later same-PDF cycle requires a distinct acceptance while preserving legacy proof", () => {
  assert.equal(
    matchingAcceptance({
      workspaceId: "gym",
      memberId: "member",
      requirement: required(),
      proofs: [proof()],
      serviceAt: service,
      acceptedBy: recorded,
    }),
    null,
  );
  const renewed = proof({
    id: "new-signature",
    requirementRevisionId: "rev-1",
    acceptanceCycleKey: "rev-1",
    signedAt: published,
  });
  assert.equal(
    matchingAcceptance({
      workspaceId: "gym",
      memberId: "member",
      requirement: required(),
      proofs: [proof(), renewed],
      serviceAt: service,
      acceptedBy: recorded,
    }).id,
    renewed.id,
  );
});
test("snapshot covers exact service instant, cycle, proof and tenant and rejects modified or malformed values", () => {
  const value = snapshot();
  assert.deepEqual(parseBookingFormSnapshot(value), value);
  assert.equal(parseBookingFormSnapshot({ ...value, memberId: "other" }), null);
  const invalid = {
    ...value,
    requirements: [{ ...value.requirements[0], signedAt: recorded }],
  };
  const body = Object.fromEntries(
    Object.entries(invalid).filter(([key]) => key !== "snapshotHash"),
  );
  assert.equal(
    parseBookingFormSnapshot({
      ...invalid,
      snapshotHash: formEvidenceHash(body),
    }),
    null,
  );
});
test("publication after an accepted booking creates provider recovery with no no-show permission", () => {
  assert.deepEqual(decision(), {
    kind: "PROVIDER_RECOVERY_REQUIRED",
    revisionIds: ["rev-1"],
    documentIds: ["doc"],
  });
  for (const state of ["PRESENT", "LATE", "NO_SHOW"])
    assert.equal(decision({ state }).kind, "PROVIDER_RECOVERY_REQUIRED");
});
test("exact advance acceptance resolves the obstacle; signing after service cannot rewrite the no-show decision", () => {
  const renewed = proof({
    requirementRevisionId: "rev-1",
    acceptanceCycleKey: "rev-1",
    signedAt: effective,
  });
  assert.equal(decision({ proofs: [renewed] }).kind, "CLEAR");
  assert.equal(
    decision({ proofs: [{ ...renewed, signedAt: recorded }] }).kind,
    "PROVIDER_RECOVERY_REQUIRED",
  );
});
test("valid legacy no-show stays valid when a replacement is only effective after the class", () => {
  assert.equal(decision({ requirements: [legacy()] }).kind, "CLEAR");
  // The historical resolver supplies legacy requirements for service, rather than today's revision.
  assert.equal(
    selectServiceRevision(
      [revision({ terms: terms({ effectiveAt: "2026-10-29T12:00:00.000Z" }) })],
      "gym",
      "doc",
      service,
    ),
    null,
  );
});
test("historical compatibility is document- and historical-version-specific, not any older signature", () => {
  const historical = {
    ...proof(),
    formDocumentId: "doc",
    versionCreatedAt: before,
    historicalVersionId: "pdf",
  };
  assert.equal(
    decision({
      acceptedSnapshot: null,
      requirements: [legacy({ formVersionId: "pdf-new" })],
      legacyHistoricalProofs: [historical],
    }).kind,
    "CLEAR",
  );
  assert.equal(
    decision({
      acceptedSnapshot: null,
      requirements: [legacy({ formVersionId: "pdf-new" })],
      legacyHistoricalProofs: [{ ...historical, formDocumentId: "unrelated" }],
    }).kind,
    "REVIEW_REQUIRED",
  );
  assert.equal(
    decision({
      acceptedSnapshot: null,
      requirements: [legacy({ formVersionId: "pdf-new" })],
      legacyHistoricalProofs: [
        { ...historical, historicalVersionId: "unsigned-version" },
      ],
    }).kind,
    "REVIEW_REQUIRED",
  );
});
test("pre-disclosed expiry is not provider provenance and expiry is independent of bearer link state", () => {
  const expiry = "2026-10-29T12:00:00.000Z";
  const r = required({
    consentValidUntil: expiry,
    publishedAt: "2026-10-24T12:00:00.000Z",
  });
  const p = proof({
    requirementRevisionId: "rev-1",
    acceptanceCycleKey: "rev-1",
    validUntil: expiry,
  });
  assert.equal(
    matchingAcceptance({
      workspaceId: "gym",
      memberId: "member",
      requirement: r,
      proofs: [p],
      serviceAt: service,
      acceptedBy: recorded,
    }).id,
    p.id,
  );
  assert.equal(
    matchingAcceptance({
      workspaceId: "gym",
      memberId: "member",
      requirement: r,
      proofs: [p],
      serviceAt: expiry,
      acceptedBy: expiry,
    }),
    null,
  );
  assert.equal(
    decision({ requirements: [r], proofs: [p], serviceAt: expiry }).kind,
    "REVIEW_REQUIRED",
  );
  assert.throws(() =>
    createBookingFormSnapshot({
      workspaceId: "gym",
      memberId: "member",
      serviceAt: expiry,
      serviceTimezone: "UTC",
      acceptedAt: before,
      requirements: [r],
      proofs: [p],
    }),
  );
});
test("expiry warning fires in the real validity window only, never for legacy or another cycle", () => {
  const expiry = "2026-10-29T12:00:00.000Z",
    p = proof({
      requirementRevisionId: "rev-1",
      acceptanceCycleKey: "rev-1",
      validUntil: expiry,
    });
  const args = {
    proof: p,
    requirement: required({ consentValidUntil: expiry }),
    now: service,
    warningLeadMinutes: 1440,
  };
  assert.equal(expiryWarningDue(args), true);
  assert.equal(expiryWarningDue({ ...args, now: expiry }), false);
  assert.equal(expiryWarningDue({ ...args, proof: proof() }), false);
  assert.equal(
    expiryWarningDue({
      ...args,
      requirement: required({ acceptanceCycleKey: "rev-2" }),
    }),
    false,
  );
});
test("recovery has attributable version gates and a refund review is never a completed refund", () => {
  const args = {
    state: "OPEN",
    version: 1,
    expectedVersion: 1,
    bookingCancelled: true,
  };
  assert.equal(
    recoveryTransition({
      ...args,
      choice: "REFUND_REVIEW",
      financialReviewCaseId: "review",
    }),
    "REFUND_REVIEW",
  );
  assert.throws(() =>
    recoveryTransition({
      ...args,
      state: "REFUND_REVIEW",
      choice: "REFUND_CONFIRMED",
      refundSucceeded: false,
    }),
  );
  assert.equal(
    recoveryTransition({
      ...args,
      state: "REFUND_REVIEW",
      choice: "REFUND_CONFIRMED",
      refundSucceeded: true,
    }),
    "REFUNDED",
  );
  assert.throws(() =>
    recoveryTransition({ ...args, expectedVersion: 0, choice: "CANCEL" }),
  );
  assert.throws(() => recoveryTransition({ ...args, choice: "REBOOK" }));
  assert.equal(
    recoveryTransition({
      ...args,
      choice: "REBOOK",
      targetBookingId: "replacement",
    }),
    "REBOOKED",
  );
});
test("malformed/foreign booking evidence fails to review before any penalty classification", () => {
  assert.equal(
    decision({ acceptedSnapshot: { ...snapshot(), workspaceId: "foreign" } })
      .kind,
    "REVIEW_REQUIRED",
  );
  assert.equal(
    decision({ requirements: [], acceptedSnapshot: { schemaVersion: 999 } })
      .kind,
    "REVIEW_REQUIRED",
  );
});

test("history verifies the full append-only chain and an exact-time correction selects its newest cycle", () => {
  const first = revision(),
    second = revision({
      id: "rev-2",
      version: 2,
      previousRevisionHash: first.revisionHash,
    });
  assert.equal(
    selectServiceRevision([second, first], "gym", "doc", service).id,
    "rev-2",
  );
  assert.throws(
    () => selectServiceRevision([second], "gym", "doc", service),
    /history needs review/,
  );
  assert.throws(
    () =>
      selectServiceRevision(
        [
          first,
          revision({
            id: "rev-2",
            version: 2,
            previousRevisionHash: "c".repeat(64),
          }),
        ],
        "gym",
        "doc",
        service,
      ),
    /history needs review/,
  );
});
