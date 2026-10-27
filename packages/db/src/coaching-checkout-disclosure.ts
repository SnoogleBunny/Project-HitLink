import type { Prisma } from "@prisma/client";
import type { CoachingBookingDisclosure } from "./coaching-availability.js";
import { CoachingBookingPolicyError } from "./coaching-booking-policy.js";

export const coachingCheckoutDisclosureKind =
  "COACHING_CHECKOUT_BOOKING_DISCLOSURE_RECORDED";
type Tx = Prisma.TransactionClient;

/** Capture only after schedule, current payer and financial locks. This exact
 * post-lock DB millisecond belongs to a NEW provider request, never its replay. */
export async function coachingCheckoutCaptureTimeTx(tx: Tx): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ capturedAt: Date }>>`
    SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC') AS "capturedAt"`;
  if (!rows[0]) throw new CoachingBookingPolicyError("Checkout disclosure time is unavailable.");
  return rows[0].capturedAt;
}

/** Internal producer boundary: SQL independently validates the exact newly
 * submitted operation, current scoped policy/help identity and atomic pairing.
 * JSON.stringify's original requestHash and PostgreSQL JSONB hash are distinct. */
export async function recordCoachingCheckoutDisclosureTx(
  tx: Tx,
  input: { workspaceId: string; operationId: string; disclosure: CoachingBookingDisclosure },
): Promise<string> {
  const op = await tx.financialOperation.findFirst({
    where: { id: input.operationId, workspaceId: input.workspaceId },
  });
  if (!op?.submittedAt || op.kind !== "CHECKOUT" || op.status !== "SUBMITTED" || op.version !== 1)
    throw new CoachingBookingPolicyError("A new submitted checkout is required for its booking disclosure.");
  const payload = op.payload as Prisma.JsonObject;
  const commercial = payload.metadata as Prisma.JsonObject | undefined;
  const hashes = await tx.$queryRaw<Array<{ requestPayloadHash: string }>>`
    SELECT encode(sha256(convert_to(payload::text,'UTF8')),'hex') AS "requestPayloadHash"
    FROM financial_operations WHERE id=${op.id} AND "workspaceId"=${input.workspaceId}`;
  if (!commercial || !hashes[0])
    throw new CoachingBookingPolicyError("Checkout disclosure identity is unavailable.");
  const event = await tx.workspaceDataEvent.create({ data: {
    workspaceId: input.workspaceId,
    actorUserId: op.actorUserId,
    kind: coachingCheckoutDisclosureKind,
    createdAt: op.submittedAt,
    metadata: {
      schemaVersion: 1,
      operationId: op.id,
      operationVersionAtCapture: 1,
      requestHash: op.requestHash,
      requestPayloadHash: hashes[0].requestPayloadHash,
      enrollmentId: op.targetId,
      beneficiaryMemberId: op.beneficiaryMemberId,
      programVersionId: commercial.programVersionId ?? null,
      payerAccountId: op.payerAccountId,
      payerUserId: op.actorUserId,
      payerGrantId: commercial.payerGrantId || null,
      payerGrantVersion: commercial.payerGrantVersion
        ? Number(commercial.payerGrantVersion) : null,
      capturedAt: op.submittedAt.toISOString(),
      appointmentBookingDisclosure: input.disclosure,
    } as Prisma.InputJsonObject,
  } });
  return event.id;
}

/** Scoped domain reader. Caller must already authorize this exact enrollment.
 * Later FAILED/REVIEW_REQUIRED/etc. never erase a captured SUPPORT promise;
 * this reader confers neither access, payment status, nor payer/client rights. */
export async function readCoachingCheckoutHelpPromiseTx(
  tx: Tx,
  scope: { workspaceId: string; enrollmentId: string; beneficiaryMemberId: string },
): Promise<number | undefined> {
  const rows = await tx.$queryRaw<Array<{ hours: string | null }>>`
    SELECT min((e.metadata->'appointmentBookingDisclosure'->>'resolutionResponseHours')::numeric)::text AS hours
    FROM workspace_data_events e
    WHERE e."workspaceId"=${scope.workspaceId} AND e.kind=${coachingCheckoutDisclosureKind}
      AND e.metadata->>'enrollmentId'=${scope.enrollmentId}
      AND e.metadata->>'beneficiaryMemberId'=${scope.beneficiaryMemberId}
      AND coaching_checkout_disclosure_bound(e."workspaceId",e."actorUserId",e.metadata)`;
  return rows[0]?.hours == null ? undefined : Number(rows[0].hours);
}

/** Deliberately safe archive projection: no payer identity, provider/request
 * data, hashes, intake, private notes, coach/room identities or client slots. */
export type CoachingCheckoutHelpReceipt = {
  id: string;
  capturedAt: Date;
  enrollmentId: string;
  programVersionId: string;
  policyEventId: string;
  policyVersion: number;
  reviewedAt: string;
  availableCount: number;
  notOpenCount: number;
  caseOwnerNameSnapshot: string;
  resolutionResponseHours: number;
  notHeld: true;
};
/** Only for a caller's independently authorized named-client program archive.
 * It is NOT a general owner policy-history or payer commercial DTO extension. */
export async function listCoachingCheckoutHelpReceiptsTx(
  tx: Tx,
  scope: { workspaceId: string; enrollmentId: string; beneficiaryMemberId: string },
): Promise<CoachingCheckoutHelpReceipt[]> {
  return tx.$queryRaw<CoachingCheckoutHelpReceipt[]>`
    SELECT e.id, e."createdAt" AS "capturedAt",
      e.metadata->>'enrollmentId' AS "enrollmentId", e.metadata->>'programVersionId' AS "programVersionId",
      e.metadata->'appointmentBookingDisclosure'->>'policyEventId' AS "policyEventId",
      (e.metadata->'appointmentBookingDisclosure'->>'policyVersion')::integer AS "policyVersion",
      e.metadata->'appointmentBookingDisclosure'->>'reviewedAt' AS "reviewedAt",
      (e.metadata->'appointmentBookingDisclosure'->>'availableCount')::bigint::double precision AS "availableCount",
      (e.metadata->'appointmentBookingDisclosure'->>'notOpenCount')::bigint::double precision AS "notOpenCount",
      e.metadata->'appointmentBookingDisclosure'->>'resolutionOwnerNameSnapshot' AS "caseOwnerNameSnapshot",
      (e.metadata->'appointmentBookingDisclosure'->>'resolutionResponseHours')::bigint::double precision AS "resolutionResponseHours",
      TRUE AS "notHeld"
    FROM workspace_data_events e
    WHERE e."workspaceId"=${scope.workspaceId} AND e.kind=${coachingCheckoutDisclosureKind}
      AND e.metadata->>'enrollmentId'=${scope.enrollmentId}
      AND e.metadata->>'beneficiaryMemberId'=${scope.beneficiaryMemberId}
      AND coaching_checkout_disclosure_bound(e."workspaceId",e."actorUserId",e.metadata)
    ORDER BY e."createdAt", e.id`;
}
