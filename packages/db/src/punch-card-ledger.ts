import { financialEntitlementHoldReason } from "./entitlement-holds.js";
import type { Prisma } from "@prisma/client";
export interface AcceptedPunchCardTerms {
  version: number;
  priceCents: number;
  currency: string;
  originalPunches: number;
  restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
  programIds: string[];
  lateCancellationConsumesPunch: boolean;
  noShowConsumesPunch: boolean;
  capturedAt: string;
}
export function snapshotPunchCardTerms(
  product: {
    termsVersion?: number;
    priceCents: number;
    currency: string;
    punchesIncluded: number;
    restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
    programRestrictions?: Array<{ programId: string }>;
    lateCancellationConsumesPunch?: boolean;
    noShowConsumesPunch?: boolean;
  },
  now = new Date(),
): AcceptedPunchCardTerms {
  return {
    version: product.termsVersion ?? 1,
    priceCents: product.priceCents,
    currency: product.currency.toLowerCase(),
    originalPunches: product.punchesIncluded,
    restrictionMode: product.restrictionMode,
    programIds: (product.programRestrictions ?? []).map(
      (item) => item.programId,
    ),
    lateCancellationConsumesPunch:
      product.lateCancellationConsumesPunch ?? true,
    noShowConsumesPunch: product.noShowConsumesPunch ?? true,
    capturedAt: now.toISOString(),
  };
}
export function readPunchCardTerms(
  value: unknown,
): AcceptedPunchCardTerms | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as AcceptedPunchCardTerms;
  if (
    !Number.isInteger(v.version) ||
    v.version < 1 ||
    typeof v.lateCancellationConsumesPunch !== "boolean" ||
    typeof v.noShowConsumesPunch !== "boolean" ||
    !Number.isInteger(v.originalPunches) ||
    v.originalPunches <= 0 ||
    !Number.isInteger(v.priceCents) ||
    v.priceCents < 0 ||
    !/^[a-z]{3}$/i.test(v.currency) ||
    !Array.isArray(v.programIds) ||
    !v.programIds.every((id) => typeof id === "string") ||
    !["GENERAL", "PROGRAM_RESTRICTED"].includes(v.restrictionMode)
  )
    return null;
  return v;
}
export async function ensurePunchCardLedger(args: {
  workspaceId: string;
  cardId: string;
  db: Prisma.TransactionClient;
}) {
  const card = await args.db.memberPunchCard.findFirst({
    where: { id: args.cardId, workspaceId: args.workspaceId },
    include: { punchCardProduct: { include: { programRestrictions: true } } },
  });
  if (!card) throw new Error("Punch card not found.");
  if (card.acceptedTerms && !readPunchCardTerms(card.acceptedTerms))
    throw new Error(
      "This pack has incomplete accepted terms. Review its records before changing its balance.",
    );
  const terms =
    readPunchCardTerms(card.acceptedTerms) ??
    snapshotPunchCardTerms({
      ...card.punchCardProduct,
      priceCents: card.purchasePriceCents,
      currency: card.purchaseCurrency,
      punchesIncluded: card.originalPunches,
    });
  if (!card.acceptedTerms)
    await args.db.memberPunchCard.update({
      where: { id: card.id },
      data: { acceptedTerms: JSON.parse(JSON.stringify(terms)) },
    });
  if (
    !(await args.db.punchCardEntry.count({
      where: { memberPunchCardId: card.id },
    }))
  )
    await args.db.punchCardEntry.create({
      data: {
        workspaceId: card.workspaceId,
        memberId: card.memberId,
        memberPunchCardId: card.id,
        operationKey: `opening:${card.id}`,
        delta: card.remainingPunches,
        reason: "Opening balance",
      },
    });
  return { card, terms };
}
export async function recordPunchCardReservation(args: {
  workspaceId: string;
  memberId: string;
  cardId: string;
  bookingId: string;
  bookingRevision: number;
  db: Prisma.TransactionClient;
}) {
  await args.db.punchCardEntry.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      memberPunchCardId: args.cardId,
      bookingId: args.bookingId,
      bookingRevision: args.bookingRevision,
      operationKey: `booking:${args.bookingId}:${args.bookingRevision}:reserve`,
      delta: -1,
      reason: "Class booking reserved",
    },
  });
}
/** The current funding revision owns one unit. Corrections change that unit once, with an immutable audit entry. */
export async function settlePunchCardBooking(args: {
  workspaceId: string;
  bookingId: string;
  outcome:
    | "ATTENDED"
    | "NO_SHOW"
    | "EXCUSED"
    | "TIMELY_CANCEL"
    | "LATE_CANCEL"
    | "PROVIDER_CANCEL";
  db: Prisma.TransactionClient;
  actorWorkspaceUserId?: string;
  reason?: string;
  exceptDisputeId?: string;
}): Promise<{ ok: true; refunded: boolean } | { ok: false; message: string }> {
  const booking = await args.db.classBooking.findFirst({
    where: { id: args.bookingId, workspaceId: args.workspaceId },
  });
  if (
    !booking ||
    booking.bookingType !== "PUNCH_CARD" ||
    !booking.memberPunchCardId
  )
    return { ok: true, refunded: false };
  const held = await financialEntitlementHoldReason({
    workspaceId: args.workspaceId,
    targets: [
      { targetKind: "PUNCH_CARD", targetId: booking.memberPunchCardId },
      { targetKind: "BOOKING", targetId: booking.id },
    ],
    db: args.db,
    exceptDisputeId: args.exceptDisputeId,
  });
  if (held) return { ok: false, message: held };
  const { card, terms } = await ensurePunchCardLedger({
    workspaceId: args.workspaceId,
    cardId: booking.memberPunchCardId,
    db: args.db,
  });
  const used =
    args.outcome === "ATTENDED" ||
    (args.outcome === "NO_SHOW" && terms.noShowConsumesPunch) ||
    (args.outcome === "LATE_CANCEL" && terms.lateCancellationConsumesPunch);
  const target = used ? 1 : 0,
    delta = booking.consumedPunchCount - target;
  if (!delta) return { ok: true, refunded: false };
  if (card.remainingPunches + delta < 0)
    return {
      ok: false,
      message:
        "This attendance correction needs one available punch. Adjust the member's pack first.",
    };
  const changed = await args.db.memberPunchCard.updateMany({
    where: {
      id: card.id,
      workspaceId: args.workspaceId,
      remainingPunches: card.remainingPunches,
    },
    data: {
      remainingPunches: { increment: delta },
      status: card.remainingPunches + delta === 0 ? "DEPLETED" : "ACTIVE",
    },
  });
  if (!changed.count)
    return {
      ok: false,
      message: "This pack changed. Refresh before trying again.",
    };
  await args.db.classBooking.update({
    where: { id: booking.id },
    data: { consumedPunchCount: target },
  });
  const priorCount = await args.db.punchCardEntry.count({
    where: { bookingId: booking.id, bookingRevision: booking.fundingRevision },
  });
  await args.db.punchCardEntry.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: booking.memberId,
      memberPunchCardId: card.id,
      bookingId: booking.id,
      bookingRevision: booking.fundingRevision,
      operationKey: `booking:${booking.id}:${booking.fundingRevision}:settle:${priorCount + 1}`,
      delta,
      reason: args.reason ?? args.outcome,
      actorWorkspaceUserId: args.actorWorkspaceUserId,
    },
  });
  return { ok: true, refunded: delta > 0 };
}

/** Caller holds the schedule lock. Verified financial operations may bypass only their own hold. */
export async function adjustPunchCardUnits(args: {
  workspaceId: string;
  memberId: string;
  cardId: string;
  delta: number;
  operationKey: string;
  reason: string;
  actorWorkspaceUserId?: string;
  financialOperationId?: string;
  exceptDisputeId?: string;
  db: Prisma.TransactionClient;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (
    !Number.isSafeInteger(args.delta) ||
    args.delta === 0 ||
    !args.operationKey ||
    !args.reason.trim()
  )
    return {
      ok: false,
      message: "Enter a non-zero whole number and a reason.",
    };
  const existing = await args.db.punchCardEntry.findUnique({
    where: { operationKey: args.operationKey },
  });
  if (existing)
    return existing.workspaceId === args.workspaceId &&
      existing.memberId === args.memberId &&
      existing.memberPunchCardId === args.cardId &&
      existing.delta === args.delta &&
      existing.reason === args.reason.trim()
      ? { ok: true }
      : {
          ok: false,
          message:
            "This adjustment reference was already used for different details.",
        };
  const held = await financialEntitlementHoldReason({
    workspaceId: args.workspaceId,
    targets: [{ targetKind: "PUNCH_CARD", targetId: args.cardId }],
    db: args.db,
    exceptOperationId: args.financialOperationId,
    exceptDisputeId: args.exceptDisputeId,
  });
  if (held) return { ok: false, message: held };
  const card = await args.db.memberPunchCard.findFirst({
    where: {
      id: args.cardId,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
    },
  });
  if (!card) return { ok: false, message: "Punch card not found." };
  if (card.remainingPunches + args.delta < 0)
    return {
      ok: false,
      message: "There are not enough unused punches for this adjustment.",
    };
  await ensurePunchCardLedger({
    workspaceId: args.workspaceId,
    cardId: args.cardId,
    db: args.db,
  });
  await args.db.memberPunchCard.update({
    where: { id: card.id },
    data: {
      remainingPunches: { increment: args.delta },
      status:
        card.status === "ARCHIVED"
          ? "ARCHIVED"
          : card.remainingPunches + args.delta === 0
            ? "DEPLETED"
            : "ACTIVE",
    },
  });
  await args.db.punchCardEntry.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      memberPunchCardId: card.id,
      operationKey: args.operationKey,
      delta: args.delta,
      reason: args.reason.trim(),
      actorWorkspaceUserId: args.actorWorkspaceUserId,
    },
  });
  return { ok: true };
}
