type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const project = (value: unknown, keys: readonly string[]) =>
  Object.fromEntries(
    Object.entries(object(value)).filter(
      ([key, item]) =>
        keys.includes(key) &&
        (item === null ||
          typeof item === "string" ||
          typeof item === "boolean" ||
          (typeof item === "number" && Number.isFinite(item))),
    ),
  );
const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
const targets = new Set([
  "TRIAL",
  "MEMBER",
  "GUARDIAN",
  "MEMBERSHIP_ACTIVATION",
]);

export function projectFormRequirementTerms(value: unknown) {
  const raw = object(value);
  return {
    ...project(raw, [
      "schemaVersion",
      "effectiveAt",
      "consentValidUntil",
      "noticeLeadMinutes",
      "expiryWarningLeadMinutes",
    ]),
    targets: strings(raw.targets).filter((target) => targets.has(target)),
  };
}

export function projectFormLegacyBaseline(value: unknown) {
  if (value == null) return null;
  const raw = object(value);
  return {
    ...project(raw, [
      "schemaVersion",
      "basis",
      "observedAt",
      "formVersionId",
      "fileSha256",
      "consentValidUntil",
    ]),
    targets: strings(raw.targets).filter((target) => targets.has(target)),
  };
}

/** Accepted legal identity and validity; command hashes and arbitrary JSON stay private. */
export function projectFormBookingSnapshot(value: unknown) {
  if (value == null) return null;
  const raw = object(value);
  return {
    ...project(raw, [
      "schemaVersion",
      "workspaceId",
      "memberId",
      "serviceAt",
      "serviceTimezone",
      "acceptedAt",
    ]),
    requirements: Array.isArray(raw.requirements)
      ? raw.requirements.map((row) =>
          project(row, [
            "formDocumentId",
            "formVersionId",
            "requirementRevisionId",
            "revisionHash",
            "acceptanceCycleKey",
            "signerKind",
            "effectiveAt",
            "publishedAt",
            "consentValidUntil",
            "basis",
            "signedDocumentId",
            "signedAt",
            "validUntil",
          ]),
        )
      : [],
  };
}

export function projectFormRecoveryEvidence(value: unknown) {
  return project(value, [
    "schemaVersion",
    "cause",
    "bookingId",
    "fundingRevision",
    "memberId",
    "serviceAt",
    "bookingType",
    "bookingStatus",
    "acceptedAt",
    "evidenceBasis",
    "needsRefundReview",
    "revisionId",
    "revisionHash",
    "publishedAt",
    "effectiveAt",
  ]);
}

export const exportedFormEventKinds = [
  "FORM_REQUIREMENT_PUBLISHED",
  "BOOKING_FORM_ACCEPTED",
  "FORM_RECOVERY_OPENED",
  "FORM_RECOVERY_TRANSITIONED",
  "FORM_EXPIRY_WARNING_PROCESSED",
] as const;

export const memberFormEventKinds = [
  "BOOKING_FORM_ACCEPTED",
  "FORM_RECOVERY_OPENED",
  "FORM_RECOVERY_TRANSITIONED",
] as const;

/** The individual projection omits payer settlement identities and staff routing. */
export function projectFormEvent(
  kind: string,
  value: unknown,
  individual = false,
) {
  const raw = object(value);
  switch (kind) {
    case "FORM_REQUIREMENT_PUBLISHED":
      return project(raw, [
        "revisionId",
        "version",
        "revisionHash",
        "fileSha256",
        "effectiveAt",
        "consentValidUntil",
        "noticeLeadMinutes",
        "affectedPeople",
        "affectedCommitments",
        "missingSafeContactCount",
        "deliveryState",
      ]);
    case "BOOKING_FORM_ACCEPTED":
      return {
        ...project(raw, ["bookingId", "fundingRevision", "serviceAt"]),
        revisionIds: strings(raw.revisionIds),
      };
    case "FORM_RECOVERY_OPENED":
      return project(raw, [
        "recoveryId",
        "bookingId",
        "fundingRevision",
        "revisionId",
        ...(individual ? [] : ["assignedToWorkspaceUserId"]),
      ]);
    case "FORM_RECOVERY_TRANSITIONED": {
      const common = project(raw, [
        "recoveryId",
        "bookingId",
        "fundingRevision",
        "from",
        "to",
        "version",
        "replacementBookingId",
        "signedDocumentId",
        "action",
      ]);
      return individual
        ? common
        : {
            ...common,
            ...project(raw, [
              "financialReviewCaseId",
              "refundOperationId",
              "refundId",
              "refundedAmountCents",
              "refundCurrency",
              "assignedToWorkspaceUserId",
            ]),
            refundOperationIds: strings(raw.refundOperationIds),
            refundIds: strings(raw.refundIds),
          };
    }
    case "FORM_EXPIRY_WARNING_PROCESSED":
      return project(raw, [
        "revisionId",
        "signedDocumentId",
        "memberId",
        "queuedCount",
        "needsContactReview",
        "assignedToUserId",
        "deliveryState",
      ]);
    default:
      return {};
  }
}
