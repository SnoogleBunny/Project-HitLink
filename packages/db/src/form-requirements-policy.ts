import { createHash } from "node:crypto";

export type FormTarget =
  | "TRIAL"
  | "MEMBER"
  | "GUARDIAN"
  | "MEMBERSHIP_ACTIVATION";
export type SignerKind = "MEMBER" | "GUARDIAN";
export const LEGACY_FORM_CYCLE = "legacy";
export const DEFAULT_FORM_NOTICE_MINUTES = 1440;
export const MIN_FORM_NOTICE_MINUTES = 1;
const targets: FormTarget[] = [
  "TRIAL",
  "MEMBER",
  "GUARDIAN",
  "MEMBERSHIP_ACTIVATION",
];
const sha = /^[a-f0-9]{64}$/;
const instant = (value: string) =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => key in value);
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const boundedId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
export class FormRequirementError extends Error {}

// Keys use ASCII comparison, never a configured display locale.
export function formEvidenceHash(value: unknown): string {
  const canonical = (item: unknown): string => {
    if (item instanceof Date) return JSON.stringify(item.toISOString());
    if (Array.isArray(item)) return `[${item.map(canonical).join(",")}]`;
    if (item && typeof item === "object")
      return `{${Object.entries(item)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
        .join(",")}}`;
    if (typeof item === "number" && !Number.isFinite(item))
      throw new FormRequirementError("Invalid numeric evidence.");
    return JSON.stringify(item) ?? "null";
  };
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export interface RequirementTerms {
  schemaVersion: 1;
  targets: FormTarget[];
  effectiveAt: string;
  consentValidUntil: string | null;
  noticeLeadMinutes: number;
  expiryWarningLeadMinutes: number;
}
export function parseRequirementTerms(value: unknown): RequirementTerms {
  const root = object(value);
  const invalid = (): never => {
    throw new FormRequirementError(
      "Choose unique requirement targets, a future effective time, an explicit advance-notice interval and a valid consent expiry.",
    );
  };
  if (
    !root ||
    !exact(root, [
      "schemaVersion",
      "targets",
      "effectiveAt",
      "consentValidUntil",
      "noticeLeadMinutes",
      "expiryWarningLeadMinutes",
    ]) ||
    root.schemaVersion !== 1 ||
    !Array.isArray(root.targets) ||
    root.targets.length > targets.length ||
    !root.targets.every((target) => targets.includes(target as FormTarget)) ||
    new Set(root.targets).size !== root.targets.length ||
    typeof root.effectiveAt !== "string" ||
    !instant(root.effectiveAt) ||
    !integer(root.noticeLeadMinutes, MIN_FORM_NOTICE_MINUTES, 527040) ||
    !integer(root.expiryWarningLeadMinutes, 1, 527040) ||
    (root.consentValidUntil !== null &&
      (typeof root.consentValidUntil !== "string" ||
        !instant(root.consentValidUntil) ||
        Date.parse(root.consentValidUntil) <= Date.parse(root.effectiveAt)))
  )
    return invalid();
  return {
    schemaVersion: 1,
    targets: targets.filter((target) =>
      (root.targets as unknown[]).includes(target),
    ),
    effectiveAt: root.effectiveAt,
    consentValidUntil: root.consentValidUntil as string | null,
    noticeLeadMinutes: root.noticeLeadMinutes,
    expiryWarningLeadMinutes: root.expiryWarningLeadMinutes,
  };
}

/** An observation of the old system, never a claim that these rules existed before observedAt. */
export interface LegacyBaseline {
  schemaVersion: 1;
  basis: "OBSERVED_AT_PUBLICATION";
  observedAt: string;
  formVersionId: string | null;
  fileSha256: string | null;
  targets: FormTarget[];
  consentValidUntil: null;
}
export interface RequirementRevision {
  id: string;
  workspaceId: string;
  formDocumentId: string;
  formVersionId: string;
  fileSha256: string;
  version: number;
  terms: RequirementTerms;
  publishedAt: string;
  actorUserId: string;
  reason: string;
  previousRevisionHash: string | null;
  previewHash: string;
  baseline: LegacyBaseline | null;
  revisionHash: string;
}
export function revisionHash(
  revision: Omit<RequirementRevision, "revisionHash">,
): string {
  return formEvidenceHash({
    ...revision,
    terms: parseRequirementTerms(revision.terms),
  });
}
export function verifyRevision(revision: RequirementRevision): boolean {
  try {
    const { revisionHash: hash, ...body } = revision;
    return (
      sha.test(hash) &&
      hash === revisionHash(body) &&
      instant(revision.publishedAt) &&
      Date.parse(revision.terms.effectiveAt) >=
        Date.parse(revision.publishedAt) +
          revision.terms.noticeLeadMinutes * 60000
    );
  } catch {
    return false;
  }
}
export function selectServiceRevision(
  revisions: RequirementRevision[],
  workspaceId: string,
  documentId: string,
  serviceAt: string,
): RequirementRevision | null {
  if (!instant(serviceAt))
    throw new FormRequirementError("Invalid service time.");
  const relevant = revisions.filter(
    (row) =>
      row.workspaceId === workspaceId && row.formDocumentId === documentId,
  );
  const chain = relevant.slice().sort((a, b) => a.version - b.version);
  if (
    chain.some(
      (row, index) =>
        !verifyRevision(row) ||
        row.version !== index + 1 ||
        row.previousRevisionHash !== (chain[index - 1]?.revisionHash ?? null) ||
        (index > 0 &&
          (row.baseline !== null ||
            row.terms.effectiveAt < chain[index - 1]!.terms.effectiveAt ||
            row.publishedAt < chain[index - 1]!.publishedAt)),
    )
  )
    throw new FormRequirementError("Form requirement history needs review.");
  return (
    relevant
      .filter((row) => row.terms.effectiveAt <= serviceAt)
      .sort((a, b) =>
        a.terms.effectiveAt < b.terms.effectiveAt
          ? 1
          : a.terms.effectiveAt > b.terms.effectiveAt
            ? -1
            : b.version - a.version,
      )[0] ?? null
  );
}

export interface AcceptanceProof {
  id: string;
  workspaceId: string;
  memberId: string;
  formVersionId: string;
  requirementRevisionId: string | null;
  acceptanceCycleKey: string;
  signerKind: SignerKind;
  signedAt: string;
  validUntil: string | null;
}
export interface ServiceRequirement {
  formDocumentId: string;
  formVersionId: string;
  requirementRevisionId: string | null;
  revisionHash: string | null;
  acceptanceCycleKey: string;
  signerKind: SignerKind;
  effectiveAt: string | null;
  publishedAt: string | null;
  consentValidUntil: string | null;
  basis: "PUBLISHED_REVISION" | "OBSERVED_LEGACY";
}
export function matchingAcceptance(args: {
  workspaceId: string;
  memberId: string;
  requirement: ServiceRequirement;
  proofs: AcceptanceProof[];
  serviceAt: string;
  acceptedBy: string;
}): AcceptanceProof | null {
  if (!instant(args.serviceAt) || !instant(args.acceptedBy))
    throw new FormRequirementError("Invalid proof evaluation time.");
  const r = args.requirement;
  if (r.consentValidUntil && r.consentValidUntil <= args.serviceAt) return null;
  return (
    args.proofs
      .filter(
        (proof) =>
          proof.workspaceId === args.workspaceId &&
          proof.memberId === args.memberId &&
          proof.formVersionId === r.formVersionId &&
          proof.signerKind === r.signerKind &&
          proof.requirementRevisionId === r.requirementRevisionId &&
          proof.acceptanceCycleKey === r.acceptanceCycleKey &&
          instant(proof.signedAt) &&
          proof.signedAt <= args.acceptedBy &&
          proof.signedAt <= args.serviceAt &&
          (!r.publishedAt || proof.signedAt >= r.publishedAt) &&
          proof.validUntil === r.consentValidUntil &&
          (!proof.validUntil || proof.validUntil > args.serviceAt),
      )
      .sort(
        (a, b) =>
          b.signedAt.localeCompare(a.signedAt) || a.id.localeCompare(b.id),
      )[0] ?? null
  );
}

export interface BookingFormSnapshot {
  schemaVersion: 1;
  workspaceId: string;
  memberId: string;
  serviceAt: string;
  serviceTimezone: string;
  acceptedAt: string;
  requirements: Array<
    ServiceRequirement & {
      signedDocumentId: string;
      signedAt: string;
      validUntil: string | null;
    }
  >;
  snapshotHash: string;
}
export function createBookingFormSnapshot(args: {
  workspaceId: string;
  memberId: string;
  serviceAt: string;
  serviceTimezone: string;
  acceptedAt: string;
  requirements: ServiceRequirement[];
  proofs: AcceptanceProof[];
}): BookingFormSnapshot {
  if (
    !instant(args.serviceAt) ||
    !instant(args.acceptedAt) ||
    args.acceptedAt > args.serviceAt ||
    args.requirements.length > 100
  )
    throw new FormRequirementError("Booking form evidence is invalid.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: args.serviceTimezone }).format();
  } catch {
    throw new FormRequirementError("Invalid service timezone.");
  }
  const requirements = [...args.requirements]
    .sort(
      (a, b) =>
        a.formDocumentId.localeCompare(b.formDocumentId) ||
        a.signerKind.localeCompare(b.signerKind),
    )
    .map((requirement) => {
      const proof = matchingAcceptance({
        ...args,
        requirement,
        acceptedBy: args.acceptedAt,
      });
      if (!proof)
        throw new FormRequirementError(
          "Complete the exact forms valid for this class before booking.",
        );
      return {
        ...requirement,
        signedDocumentId: proof.id,
        signedAt: proof.signedAt,
        validUntil: proof.validUntil,
      };
    });
  const body = {
    schemaVersion: 1 as const,
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    serviceAt: args.serviceAt,
    serviceTimezone: args.serviceTimezone,
    acceptedAt: args.acceptedAt,
    requirements,
  };
  return { ...body, snapshotHash: formEvidenceHash(body) };
}
export function parseBookingFormSnapshot(
  value: unknown,
): BookingFormSnapshot | null {
  const root = object(value);
  if (
    !root ||
    !exact(root, [
      "schemaVersion",
      "workspaceId",
      "memberId",
      "serviceAt",
      "serviceTimezone",
      "acceptedAt",
      "requirements",
      "snapshotHash",
    ]) ||
    root.schemaVersion !== 1 ||
    !boundedId(root.workspaceId) ||
    !boundedId(root.memberId) ||
    typeof root.serviceAt !== "string" ||
    !instant(root.serviceAt) ||
    typeof root.acceptedAt !== "string" ||
    !instant(root.acceptedAt) ||
    root.acceptedAt > root.serviceAt ||
    typeof root.serviceTimezone !== "string" ||
    !Array.isArray(root.requirements) ||
    root.requirements.length > 100 ||
    typeof root.snapshotHash !== "string"
  )
    return null;
  for (const value of root.requirements) {
    const row = object(value);
    if (
      !row ||
      !exact(row, [
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
      ]) ||
      !boundedId(row.formDocumentId) ||
      !boundedId(row.formVersionId) ||
      !boundedId(row.signedDocumentId) ||
      !boundedId(row.acceptanceCycleKey) ||
      !["MEMBER", "GUARDIAN"].includes(String(row.signerKind)) ||
      typeof row.signedAt !== "string" ||
      !instant(row.signedAt) ||
      row.signedAt > root.acceptedAt ||
      (row.validUntil !== null &&
        (typeof row.validUntil !== "string" ||
          !instant(row.validUntil) ||
          row.validUntil <= root.serviceAt)) ||
      row.validUntil !== row.consentValidUntil
    )
      return null;
    if (row.basis === "PUBLISHED_REVISION") {
      if (
        !boundedId(row.requirementRevisionId) ||
        row.acceptanceCycleKey !== row.requirementRevisionId ||
        typeof row.revisionHash !== "string" ||
        !sha.test(row.revisionHash) ||
        typeof row.effectiveAt !== "string" ||
        !instant(row.effectiveAt) ||
        row.effectiveAt > root.serviceAt ||
        typeof row.publishedAt !== "string" ||
        !instant(row.publishedAt) ||
        row.publishedAt > root.acceptedAt
      )
        return null;
    } else if (
      row.basis !== "OBSERVED_LEGACY" ||
      row.requirementRevisionId !== null ||
      row.revisionHash !== null ||
      row.acceptanceCycleKey !== LEGACY_FORM_CYCLE ||
      row.effectiveAt !== null ||
      row.publishedAt !== null ||
      row.consentValidUntil !== null
    )
      return null;
  }
  const { snapshotHash, ...body } = root;
  if (formEvidenceHash(body) !== snapshotHash) return null;
  return root as unknown as BookingFormSnapshot;
}

export type FormConsequence =
  | { kind: "CLEAR"; proofIds: string[] }
  | { kind: "MISSING_ACCEPTANCE"; documentIds: string[] }
  | {
      kind: "PROVIDER_RECOVERY_REQUIRED";
      revisionIds: string[];
      documentIds: string[];
    }
  | { kind: "REVIEW_REQUIRED"; documentIds: string[] };
/** Called by both individual and bulk writes before any attendance/ledger mutation. */
export function evaluateBookingFormConsequence(args: {
  workspaceId: string;
  memberId: string;
  bookingCreatedAt: string;
  acceptedSnapshot: unknown;
  requirements: ServiceRequirement[];
  proofs: AcceptanceProof[];
  serviceAt: string;
  recordedAt: string;
  state: "PRESENT" | "LATE" | "NO_SHOW" | "ABSENT";
  legacyHistoricalProofs?: Array<
    AcceptanceProof & {
      formDocumentId: string;
      versionCreatedAt: string;
      historicalVersionId: string;
    }
  >;
}): FormConsequence {
  if (args.state === "ABSENT") return { kind: "CLEAR", proofIds: [] }; // Existing explicit excused correction/reversal remains available.
  if (
    !instant(args.serviceAt) ||
    !instant(args.recordedAt) ||
    !instant(args.bookingCreatedAt)
  )
    return { kind: "REVIEW_REQUIRED", documentIds: [] };
  const snapshot = parseBookingFormSnapshot(args.acceptedSnapshot);
  if (
    args.acceptedSnapshot !== null &&
    args.acceptedSnapshot !== undefined &&
    !snapshot
  )
    return { kind: "REVIEW_REQUIRED", documentIds: [] };
  if (
    snapshot &&
    (snapshot.workspaceId !== args.workspaceId ||
      snapshot.memberId !== args.memberId)
  )
    return { kind: "REVIEW_REQUIRED", documentIds: [] };
  // Signing after a class cannot retrospectively make admission/no-show evidence valid at service.
  const acceptedBy =
    args.recordedAt < args.serviceAt ? args.recordedAt : args.serviceAt;
  const proofIds: string[] = [],
    missing: string[] = [],
    provider: ServiceRequirement[] = [],
    ambiguous: string[] = [];
  for (const requirement of args.requirements) {
    const proof = matchingAcceptance({ ...args, requirement, acceptedBy });
    if (proof) {
      proofIds.push(proof.id);
      continue;
    }
    if (
      requirement.publishedAt &&
      requirement.publishedAt >
        (snapshot?.acceptedAt ?? args.bookingCreatedAt) &&
      requirement.publishedAt <= args.serviceAt &&
      requirement.effectiveAt &&
      requirement.effectiveAt <= args.serviceAt
    ) {
      // Exact immutable publication after this accepted commitment is provider provenance.
      // A new acceptance before service clears it; an expired pre-disclosed proof alone does not.
      provider.push(requirement);
      continue;
    }
    if (!snapshot && requirement.basis === "OBSERVED_LEGACY") {
      // Old rows have no policy history. Only an exact, already-existing legacy proof may
      // retain compatibility; the adapter must identify its version as existing at service.
      const historical = (args.legacyHistoricalProofs ?? []).find(
        (proof) =>
          proof.formDocumentId === requirement.formDocumentId &&
          proof.formVersionId === proof.historicalVersionId &&
          proof.versionCreatedAt <= args.serviceAt &&
          proof.workspaceId === args.workspaceId &&
          proof.memberId === args.memberId &&
          proof.signerKind === requirement.signerKind &&
          proof.signedAt <= args.serviceAt &&
          proof.acceptanceCycleKey === LEGACY_FORM_CYCLE &&
          proof.validUntil === null,
      );
      if (historical && args.state === "NO_SHOW") {
        proofIds.push(historical.id);
        continue;
      }
      ambiguous.push(requirement.formDocumentId);
      continue;
    }
    missing.push(requirement.formDocumentId);
  }
  if (provider.length)
    return {
      kind: "PROVIDER_RECOVERY_REQUIRED",
      revisionIds: [
        ...new Set(provider.map((row) => row.requirementRevisionId!)),
      ].sort(),
      documentIds: [
        ...new Set(provider.map((row) => row.formDocumentId)),
      ].sort(),
    };
  if (ambiguous.length)
    return {
      kind: "REVIEW_REQUIRED",
      documentIds: [...new Set(ambiguous)].sort(),
    };
  // A no-show is a failure to attend an otherwise admissible class. Do not consume a
  // seat whose accepted forms cannot be verified; this is review, not a provider waiver.
  if (missing.length)
    return {
      kind: args.state === "NO_SHOW" ? "REVIEW_REQUIRED" : "MISSING_ACCEPTANCE",
      documentIds: [...new Set(missing)].sort(),
    };
  return { kind: "CLEAR", proofIds };
}

export type RecoveryState =
  | "OPEN"
  | "REFUND_REVIEW"
  | "SIGNED"
  | "CANCELLED"
  | "REBOOKED"
  | "REFUNDED"
  | "NO_LONGER_REQUIRED";
export function recoveryTransition(args: {
  state: RecoveryState;
  version: number;
  expectedVersion: number;
  choice:
    | "SIGNED"
    | "CANCEL"
    | "REBOOK"
    | "REFUND_REVIEW"
    | "REFUND_CONFIRMED"
    | "NO_LONGER_REQUIRED";
  bookingCancelled: boolean;
  targetBookingId?: string | null;
  exactAcceptanceValid?: boolean;
  financialReviewCaseId?: string | null;
  refundSucceeded?: boolean;
}): RecoveryState {
  if (args.version !== args.expectedVersion)
    throw new FormRequirementError(
      "This recovery changed. Refresh before continuing.",
    );
  if (!["OPEN", "REFUND_REVIEW"].includes(args.state))
    throw new FormRequirementError("This recovery has already been resolved.");
  switch (args.choice) {
    case "SIGNED":
      if (args.state === "OPEN" && args.exactAcceptanceValid) return "SIGNED";
      break;
    case "CANCEL":
      if (args.state === "OPEN" && args.bookingCancelled) return "CANCELLED";
      break;
    case "REBOOK":
      if (
        args.state === "OPEN" &&
        args.bookingCancelled &&
        args.targetBookingId
      )
        return "REBOOKED";
      break;
    case "REFUND_REVIEW":
      if (args.bookingCancelled && args.financialReviewCaseId)
        return "REFUND_REVIEW";
      break;
    case "REFUND_CONFIRMED":
      if (args.state === "REFUND_REVIEW" && args.refundSucceeded)
        return "REFUNDED";
      break;
    case "NO_LONGER_REQUIRED":
      if (args.state === "OPEN") return "NO_LONGER_REQUIRED";
      break;
  }
  throw new FormRequirementError(
    "The requested remedy has not completed. The recovery remains open.",
  );
}

export function expiryWarningDue(args: {
  proof: AcceptanceProof;
  requirement: ServiceRequirement;
  now: string;
  warningLeadMinutes: number;
}): boolean {
  return (
    !!args.proof.validUntil &&
    args.proof.requirementRevisionId ===
      args.requirement.requirementRevisionId &&
    args.proof.acceptanceCycleKey === args.requirement.acceptanceCycleKey &&
    args.proof.validUntil === args.requirement.consentValidUntil &&
    args.now >=
      new Date(
        Date.parse(args.proof.validUntil) - args.warningLeadMinutes * 60000,
      ).toISOString() &&
    args.now < args.proof.validUntil
  );
}
