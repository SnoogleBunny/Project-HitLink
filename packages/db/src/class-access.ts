import { enqueueClassBookingConfirmationTx } from "./class-booking-notifications.js";
import { MemberBookingAuthorityError, requireCurrentMemberBookingAuthorityTx, type MemberCommandActor } from "./member-booking-authority.js";
import { acceptedBookingFormsTx, recordAcceptedBookingFormsTx, evaluateBookingFormsTx, formRequirementTransaction, requireBookingFormRecoveryTx, transitionBookingFormRecoveryTx, openFormRefundReviewTx } from "./form-requirements.js";
import { FormRequirementError, formEvidenceHash, type BookingFormSnapshot } from "./form-requirements-policy.js";
import { enqueueNotificationJob } from "./notification-outbox.js";
import { isWorkspaceOperationallyReady } from "./workspace-readiness.js";
import { lockStaffAuthorityTx, normalizeAuthoritySerializationError } from "./staff-access.js";
import { createHash } from "node:crypto";
import { buildDirectBookingFundingReview, directBookingCommercialVersion, DirectBookingFundingReviewError, directBookingReviewMessage, parseDirectBookingFundingReview, type DirectBookingFunding, type DirectBookingFundingReview } from "./direct-booking-funding.js";
import { evaluateClassSchedulingPolicy, readClassSchedulingPolicy, readSchedulingPolicySnapshot, recordClassSchedulingPolicyApplied, type SchedulingPolicyReader, type SchedulingPolicySnapshot } from "./scheduling-policy.js";
import { resolveWorkspaceClockTimezone } from "./workspace-timezones.js";
import { sourceBillingCoversDate } from "./source-billing.js";
import { checkMemberClassEligibility } from "./program-progress.js";
import { financialEntitlementHoldMessage, financialEntitlementHoldReason } from "./entitlement-holds.js";
import { readPunchCardTerms, ensurePunchCardLedger, recordPunchCardReservation, settlePunchCardBooking } from "./punch-card-ledger.js";
import { Prisma, type PrismaClient } from "@prisma/client";
import { readDatabaseFailure } from "./database-failure.js";
import { prepareMembershipAllowance, reserveMembershipAllowance, settleMembershipAllowance, readAcceptedMembershipTerms } from "./membership-allowances.js";
import type {
  ClassBookingSource,
  ClassBookingStatus,
  ClassBookingType,
  MemberMembershipStatus,
  WaitlistEntryStatus,
} from "@prisma/client";
import {
  dateOnlyStringToUtcDate,
  getZonedDateTimeAsUtc,
  toDateOnlyString,
  getWorkspaceDateString,
  validateOccurrenceDate,
} from "./occurrences.js";
import { prisma } from "./client.js";
import { memberNotificationRecipients } from "./member-notification-recipients.js";
import { resolveRequiredFormStatusesForMember, type FormsDatabase } from "./forms.js";
import { classOccurrenceInclude, resolveClassOccurrence, isUnambiguousClassTime, lockClassSchedule, type ClassOccurrenceTemplate, type ClassScheduleLockDatabase } from "./class-occurrences.js";

// Module-local capability: no posted value, exported source helper or JSON replay can manufacture it.
const ownerLateBookingCapability = Symbol("owner-late-booking");

const blockedMembershipStatuses: MemberMembershipStatus[] = [
  "FROZEN",
  "PENDING_PAYMENT_METHOD",
  "CANCELLED",
  "ENDED",
];

export const activeSeatHoldingBookingStatuses: ClassBookingStatus[] = [
  "BOOKED",
  "PENDING_PAYMENT",
];
export const WAITLIST_AUTO_PROMOTION_POLICY = "FIFO_AUTO_V1";

interface AccessRestrictionRecord {
  programId: string;
}

interface AccessMembershipRecord {
  allowanceAnchorDate?: Date | null;
  allowanceTimezone?: string | null;
  sourceBillingManaged?: boolean;
  sourceAccessHeld?: boolean;
  sourceBillingEvidence?: Array<{ paidFrom: Date; paidThrough: Date }>;
  id: string;
  status: MemberMembershipStatus;
  acceptedTerms?: unknown;
  frozenFrom?: Date | null;
  frozenUntil?: Date | null;
  billingState?: { status: string; gracePeriodEndsAt: Date | null } | null;
  membershipPlan: {
    name?: string;
    termsVersion?: number;
    monthlyPriceCents?: number;
    currency?: string;
    allowanceCountingMode?: string;
    lateCancellationConsumesClass?: boolean;
    noShowConsumesClass?: boolean;
    cancellationPolicyReference?: string | null;
    freezePolicyReference?: string | null;
    lifecyclePolicy?: unknown;
    programRestrictions: AccessRestrictionRecord[];
  };
}

interface AccessPunchCardRecord {
  originalPunches?: number;
  purchasePriceCents?: number;
  purchaseCurrency?: string;
  expiresOn?: Date | null;
  id: string;
  acceptedTerms?: unknown;
  remainingPunches: number;
  status: "ACTIVE" | "DEPLETED" | "ARCHIVED";
  purchasedAt: Date;
  createdAt: Date;
  punchCardProduct: {
    id: string;
    name: string;
    termsVersion?: number;
    priceCents?: number;
    currency?: string;
    punchesIncluded?: number;
    lateCancellationConsumesPunch?: boolean;
    noShowConsumesPunch?: boolean;
    restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
    programRestrictions: AccessRestrictionRecord[];
  };
}

interface AccessDropInProductRecord {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
  createdAt: Date;
  programRestrictions: AccessRestrictionRecord[];
}

export interface AccessTemplateSummary {
  timezone?: string;
  prerequisites?: unknown;
  id: string;
  workspaceId: string;
  programId: string;
  title: string | null;
  weekday: string;
  startTimeMinutes: number;
  endTimeMinutes?: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  capacityOverride: number | null;
  program: {
    id: string;
    name: string;
  };
  room: {
    name: string;
    capacity: number | null;
  };
}

interface AccessBookingRecord {
  id: string;
  providerChangedAt?: Date | null;
  fundingRevision?: number;
  status: ClassBookingStatus;
  bookingType: ClassBookingType;
  memberPunchCardId: string | null;
  consumedPunchCount: number;
  pendingPaymentExpiresAt: Date | null;
}

interface WaitlistSummaryRecord {
  id: string;
  memberId: string;
  status: WaitlistEntryStatus;
  joinedAt: Date;
  promotedAt: Date | null;
  promotedBookingId: string | null;
  autoPromotionOptedInAt?: Date | null;
  autoPromotionConsentUserId?: string | null;
  autoPromotionPolicyVersion?: string | null;
  allowPunchCardFunding?: boolean;
  lastSkippedAt?: Date | null;
  lastSkipReason?: string | null;
  promotionHistory?: unknown;
  schedulingPolicySnapshot?: unknown;
  member: {
    fullName: string;
    email: string | null;
    phone: string | null;
    status: string;
  };
}

interface AccessTransactionDatabase extends ClassScheduleLockDatabase, SchedulingPolicyReader {
  workspaceDataEvent?: Prisma.TransactionClient["workspaceDataEvent"];
  user?: Prisma.TransactionClient["user"];
  member?: Prisma.TransactionClient["member"];
  notificationJob?: Prisma.TransactionClient["notificationJob"];
  requiredFormAssignment?: Prisma.TransactionClient["requiredFormAssignment"];
  programPromotion?: Prisma.TransactionClient["programPromotion"];
  financialEntitlementHold?: Prisma.TransactionClient["financialEntitlementHold"];
  punchCardEntry?: Prisma.TransactionClient["punchCardEntry"];
  membershipAllowanceAllocation?: Prisma.TransactionClient["membershipAllowanceAllocation"];
  classTemplate: {
    findFirst(args: Record<string, unknown>): Promise<AccessTemplateSummary | null>;
  };
  classBooking: {
    findMany?(args: Record<string, unknown>): Promise<unknown[]>;
    findFirst(args: Record<string, unknown>): Promise<AccessBookingRecord | null>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    count(args: Record<string, unknown>): Promise<number>;
  };
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<AccessMembershipRecord | null>;
  };
  memberPunchCard: {
    findMany(args: Record<string, unknown>): Promise<AccessPunchCardRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<AccessPunchCardRecord | null>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  dropInProduct: {
    findMany(args: Record<string, unknown>): Promise<AccessDropInProductRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<AccessDropInProductRecord | null>;
  };
  waitlistEntry: {
    findFirst(args: Record<string, unknown>): Promise<WaitlistSummaryRecord | null>;
    findMany(args: Record<string, unknown>): Promise<WaitlistSummaryRecord[]>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
}

interface AccessDatabase extends AccessTransactionDatabase {
  billingRecord?: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
  $transaction<T>(
    callback: (tx: AccessTransactionDatabase) => Promise<T>,
  ): Promise<T>;
}

export interface CountActiveOccurrenceBookingsDatabase {
  classBooking: {
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    count(args: Record<string, unknown>): Promise<number>;
  };
}

export type AccessResolution = (
  | {
      type: "membership";
      membershipId: string;
    }
  | {
      type: "punch_card";
      memberPunchCardId: string;
      productName: string;
    }
  | {
      type: "drop_in";
      dropInProductId: string;
      productName: string;
      priceCents: number;
      currency: string;
    }
  | {
      type: "none";
      reason:
        | "no_membership"
        | "membership_blocked"
        | "no_access_product"
        | "drop_in_disabled";
      message: string;
    }
) & { directBookingFunding?: { funding: DirectBookingFunding; sourceName: string } };

export type CreateAccessBackedBookingResult =
  | {
      status: "created" | "restored";
      bookingId: string;
      bookingType: ClassBookingType;
    }
  | {
      status: "payment_required";
      bookingId: string;
      dropInProductId: string;
      priceCents: number;
      currency: string;
    }
  | {
      status: "error";
      code:
        | "INVALID"
        | "NOT_FOUND"
        | "DUPLICATE"
        | "FULL"
        | "DROP_IN_ONLY"
        | "REVIEW_REQUIRED"
        | "NO_ACCESS";
      message: string;
    };

export type CancelAccessBackedBookingResult =
  | {
      status: "cancelled";
      bookingId: string;
      punchRefunded: boolean;
      lateCancellation: boolean;
    }
  | {
      status: "error";
      message: string;
    };

export interface WaitlistEntrySummary {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  memberPhone: string | null;
  memberStatus: string;
  position: number;
  joinedAt: Date;
  promotedAt: Date | null;
  promotedBookingId: string | null;
  autoPromotionOptedInAt?: Date | null;
  lastSkipReason?: string | null;
}

export interface ListOccurrenceWaitlistResult {
  entries: WaitlistEntrySummary[];
}

const accessDatabase = prisma as unknown as AccessDatabase;
const countDatabase = prisma as unknown as CountActiveOccurrenceBookingsDatabase;

function cleanNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function isProgramAllowed(args: {
  programId: string;
  restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
  restrictions: AccessRestrictionRecord[];
}): boolean {
  if (args.restrictionMode === "GENERAL") {
    return true;
  }

  return args.restrictions.some(
    (restriction) => restriction.programId === args.programId,
  );
}

function isMembershipProgramAllowed(args: {
  programId: string;
  membership: AccessMembershipRecord;
}): boolean {
  const accepted = readAcceptedMembershipTerms(args.membership.acceptedTerms);
  const restrictions = accepted ? accepted.programIds.map((programId) => ({ programId })) : args.membership.membershipPlan.programRestrictions;

  if (restrictions.length === 0) {
    return true;
  }

  return restrictions.some((restriction) => restriction.programId === args.programId);
}

export function getEffectiveCapacity(args: {
  capacityOverride: number | null;
  roomCapacity: number | null;
}): number | null {
  return args.capacityOverride ?? args.roomCapacity;
}

export function getOccurrenceStartsAt(args: {
  scheduledForDate: string;
  startTimeMinutes: number;
  timezone: string;
}): Date {
  return getZonedDateTimeAsUtc({
    dateString: args.scheduledForDate,
    minutes: args.startTimeMinutes,
    timezone: args.timezone,
  });
}

function isPastCancellationCutoff(args: {
  scheduledForDate: string;
  startTimeMinutes: number;
  cancellationCutoffMinutes: number;
  timezone: string;
  now: Date;
}): boolean {
  const startsAt = getOccurrenceStartsAt(args);

  return (
    args.now.getTime() >
    startsAt.getTime() - args.cancellationCutoffMinutes * 60_000
  );
}

export function canCancelClassBooking(args: {
  bookingType: ClassBookingType;
  bookingStatus: ClassBookingStatus;
  scheduledForDate: string;
  startTimeMinutes: number;
  cancellationCutoffMinutes: number;
  timezone: string;
  now: Date;
}): {
  canCancel: boolean;
  lateCancellation: boolean;
} {
  const startsAt = getOccurrenceStartsAt(args);

  if (startsAt <= args.now) {
    return {
      canCancel: false,
      lateCancellation: false,
    };
  }

  if (args.bookingStatus === "PENDING_PAYMENT") {
    return {
      canCancel: true,
      lateCancellation: false,
    };
  }

  if (args.bookingStatus !== "BOOKED") {
    return {
      canCancel: false,
      lateCancellation: false,
    };
  }

  const lateCancellation = isPastCancellationCutoff(args);

  if (lateCancellation && !["PUNCH_CARD", "MEMBERSHIP"].includes(args.bookingType)) {
    return {
      canCancel: false,
      lateCancellation: false,
    };
  }

  return {
    canCancel: true,
    lateCancellation,
  };
}

export async function cleanupExpiredPendingBookings(args: {
  workspaceId: string;
  classTemplateId?: string;
  scheduledForDate?: string;
  db?: CountActiveOccurrenceBookingsDatabase;
  now?: Date;
}): Promise<number> {
  const db = args.db ?? countDatabase;
  const where: Record<string, unknown> = {
    workspaceId: args.workspaceId,
    status: "PENDING_PAYMENT",
    pendingPaymentExpiresAt: {
      lte: args.now ?? new Date(),
    },
  };

  if (args.classTemplateId) {
    where.classTemplateId = args.classTemplateId;
  }

  if (args.scheduledForDate) {
    where.scheduledForDate = dateOnlyStringToUtcDate(args.scheduledForDate);
  }

  const transactional = db as CountActiveOccurrenceBookingsDatabase & { $transaction?: AccessDatabase["$transaction"] };
  if (transactional.$transaction) return transactional.$transaction(async (tx) => { await lockClassSchedule(tx, args.workspaceId); const result = await tx.classBooking.updateMany({ where, data: { status: "CANCELLED" } }); return result.count; });
  const result = await db.classBooking.updateMany({
    where,
    data: {
      status: "CANCELLED",
    },
  });

  return result.count;
}

export async function countActiveOccurrenceBookings(args: {
  workspaceId: string;
  classTemplateId: string;
  scheduledForDate: string;
  db?: CountActiveOccurrenceBookingsDatabase;
  now?: Date;
}): Promise<number> {
  const db = args.db ?? countDatabase;
  const now = args.now ?? new Date();
  await cleanupExpiredPendingBookings({
    workspaceId: args.workspaceId,
    classTemplateId: args.classTemplateId,
    scheduledForDate: args.scheduledForDate,
    db,
    now,
  });

  return db.classBooking.count({
    where: {
      workspaceId: args.workspaceId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: dateOnlyStringToUtcDate(args.scheduledForDate),
      OR: [
        {
          status: "BOOKED",
        },
        {
          status: "PENDING_PAYMENT",
          OR: [
            {
              pendingPaymentExpiresAt: null,
            },
            {
              pendingPaymentExpiresAt: {
                gt: now,
              },
            },
          ],
        },
      ],
    },
  });
}

// A Serializable caller can establish its snapshot while waiting for the
// schedule lock. Lock the resolved room identity before using that snapshot's
// capacity so a committed room change forces the existing whole-Tx retry.
async function lockResolvedRoomCapacityTx(db: ClassScheduleLockDatabase, workspaceId: string, roomId: string): Promise<void> {
  try {
    await db.$queryRawUnsafe?.(
      'SELECT r.id FROM rooms r JOIN locations l ON l.id = r."locationId" WHERE r.id = $1 AND l."workspaceId" = $2 FOR SHARE OF r',
      roomId,
      workspaceId,
    );
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
}

async function getActiveTemplate(args: {
  timezone: string;
  workspaceId: string;
  classTemplateId: string;
  scheduledForDate: string;
  db: AccessTransactionDatabase;
}): Promise<AccessTemplateSummary | null> {
  const template = await args.db.classTemplate.findFirst({
    where: { id: args.classTemplateId, workspaceId: args.workspaceId, archivedAt: null },
    include: classOccurrenceInclude,
  });
  if (!template) return null;
  const occurrence = resolveClassOccurrence({ template: template as unknown as ClassOccurrenceTemplate, scheduledForDate: args.scheduledForDate });
  if (!occurrence || occurrence.status === "CANCELLED" || occurrence.program.archivedAt || occurrence.room.archivedAt || occurrence.room.isActive === false) return null;
  await lockResolvedRoomCapacityTx(args.db, args.workspaceId, occurrence.roomId);
  const timezone = occurrence.timezone ?? args.timezone;
  if (!isUnambiguousClassTime(args.scheduledForDate, occurrence.startTimeMinutes, timezone) || !isUnambiguousClassTime(args.scheduledForDate, occurrence.endTimeMinutes, timezone)) return null;
  return occurrence;
}

async function getCurrentMembership(args: {
  workspaceId: string;
  memberId: string;
  db: AccessTransactionDatabase;
}): Promise<AccessMembershipRecord | null> {
  return args.db.memberMembership.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      currentMembershipSlot: "CURRENT",
    },
    include: {
      billingState: true,
      sourceBillingEvidence: true,
      membershipPlan: {
        include: {
          programRestrictions: {
            select: {
              programId: true,
            },
          },
        },
      },
    },
  });
}

function isPunchCardProgramAllowed(card: AccessPunchCardRecord, programId: string) {
  const accepted = readPunchCardTerms(card.acceptedTerms);
  if (card.acceptedTerms && !accepted) return false;
  return isProgramAllowed({ programId, restrictionMode: accepted?.restrictionMode ?? card.punchCardProduct.restrictionMode, restrictions: accepted ? accepted.programIds.map((programId) => ({ programId })) : card.punchCardProduct.programRestrictions });
}

async function selectOldestEligiblePunchCard(args: Parameters<typeof pickOldestEligiblePunchCard>[0]): Promise<{ card: AccessPunchCardRecord | null; holdReason: string | null }> {
  const db = args.db ?? accessDatabase;
  const punchCards = await db.memberPunchCard.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      status: "ACTIVE",
      remainingPunches: {
        gt: 0,
      },
    },
    include: {
      punchCardProduct: {
        include: {
          programRestrictions: {
            select: {
              programId: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        purchasedAt: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  const eligibleCards = punchCards.filter((card) => isPunchCardProgramAllowed(card, args.programId) && (!card.expiresOn || (!!args.scheduledForDate && args.scheduledForDate < toDateOnlyString(card.expiresOn))));
  if (!eligibleCards.length) return { card: null, holdReason: null };
  const holds = db.financialEntitlementHold ? await db.financialEntitlementHold.findMany({
    where: { workspaceId: args.workspaceId, targetKind: "PUNCH_CARD", targetId: { in: eligibleCards.map((card) => card.id) }, activeSlot: "ACTIVE" },
    select: { targetId: true, disputeId: true },
  }) : [];
  const heldIds = new Set(holds.map((hold) => hold.targetId));
  const card = eligibleCards.find((candidate) => !heldIds.has(candidate.id)) ?? null;
  // Only otherwise eligible assets can explain an access denial. Keep the same
  // batch lookup and retain a reason only when every candidate is held.
  const firstHold = card ? null : holds.find((hold) => hold.targetId === eligibleCards[0]!.id);
  return { card, holdReason: firstHold ? financialEntitlementHoldMessage(firstHold) : null };
}

export async function pickOldestEligiblePunchCard(args: {
  scheduledForDate?: string;
  workspaceId: string;
  memberId: string;
  programId: string;
  db?: Pick<AccessTransactionDatabase, "memberPunchCard"> & Partial<Pick<AccessTransactionDatabase, "financialEntitlementHold">>;
}): Promise<AccessPunchCardRecord | null> {
  return (await selectOldestEligiblePunchCard(args)).card;
}

export async function findEligibleDropInProduct(args: {
  workspaceId: string;
  programId: string;
  db?: Pick<AccessTransactionDatabase, "dropInProduct">;
}): Promise<AccessDropInProductRecord | null> {
  const db = args.db ?? accessDatabase;
  const dropInProducts = await db.dropInProduct.findMany({
    where: {
      workspaceId: args.workspaceId,
      isEnabled: true,
      archivedAt: null,
    },
    include: {
      programRestrictions: {
        select: {
          programId: true,
        },
      },
    },
    orderBy: [
      {
        createdAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  return (
    dropInProducts.find((dropInProduct) =>
      isProgramAllowed({
        programId: args.programId,
        restrictionMode: dropInProduct.restrictionMode,
        restrictions: dropInProduct.programRestrictions,
      }),
    ) ?? null
  );
}

export function membershipCanFundDate(membership: Pick<AccessMembershipRecord, "status" | "frozenFrom" | "frozenUntil" | "billingState" | "sourceBillingManaged" | "sourceBillingEvidence" | "sourceAccessHeld">, date: string | undefined, now: Date): boolean {
  const outsideFreeze = membership.status === "FROZEN" && !!date && !!membership.frozenFrom && !!membership.frozenUntil && (date < toDateOnlyString(membership.frozenFrom) || date >= toDateOnlyString(membership.frozenUntil));
  const billing = membership.billingState;
  const debtAllowed = billing?.gracePeriodEndsAt ? billing.gracePeriodEndsAt > now : !billing || !["GRACE_PERIOD", "PAST_DUE", "PAYMENT_FAILED"].includes(billing.status);
  const statusAllowed = membership.status === "ACTIVE" || (membership.status === "PAST_DUE" && !!billing?.gracePeriodEndsAt && billing.gracePeriodEndsAt > now) || outsideFreeze;
  return statusAllowed && debtAllowed && sourceBillingCoversDate(membership, date);
}

function membershipReviewFunding(membership: AccessMembershipRecord): AccessResolution["directBookingFunding"] {
  const accepted = readAcceptedMembershipTerms(membership.acceptedTerms);
  if (membership.acceptedTerms != null && !accepted) return undefined;
  const plan = membership.membershipPlan;
  // Legacy null contracts retain their existing unlimited allowance behavior.
  const terms = accepted ?? {
    version: plan.termsVersion ?? 1, monthlyPriceCents: plan.monthlyPriceCents ?? 0,
    currency: plan.currency ?? "usd", weeklyClassLimit: null, monthlyClassLimit: null,
    allowanceCountingMode: plan.allowanceCountingMode ?? "ATTENDANCE",
    lateCancellationConsumesClass: plan.lateCancellationConsumesClass ?? true,
    noShowConsumesClass: plan.noShowConsumesClass ?? true,
    programIds: plan.programRestrictions.map(row => row.programId),
    cancellationPolicyReference: plan.cancellationPolicyReference ?? null,
    freezePolicyReference: plan.freezePolicyReference ?? null, lifecyclePolicy: plan.lifecyclePolicy ?? null,
  };
  return { sourceName: plan.name ?? "Membership", funding: {
    kind: "MEMBERSHIP", id: membership.id, classReservations: 1,
    version: directBookingCommercialVersion({
      version: terms.version, monthlyPriceCents: terms.monthlyPriceCents, currency: terms.currency,
      weeklyClassLimit: terms.weeklyClassLimit, monthlyClassLimit: terms.monthlyClassLimit,
      allowanceCountingMode: terms.allowanceCountingMode,
      lateCancellationConsumesClass: terms.lateCancellationConsumesClass, noShowConsumesClass: terms.noShowConsumesClass,
      programIds: [...terms.programIds].sort(), cancellationPolicyReference: terms.cancellationPolicyReference,
      freezePolicyReference: terms.freezePolicyReference, lifecyclePolicy: terms.lifecyclePolicy ?? null,
      allowanceTimezone: membership.allowanceTimezone ?? null,
      allowanceAnchorDate: membership.allowanceAnchorDate ? toDateOnlyString(membership.allowanceAnchorDate) : null,
    }),
  } };
}

function punchCardReviewFunding(card: AccessPunchCardRecord): AccessResolution["directBookingFunding"] {
  const accepted = readPunchCardTerms(card.acceptedTerms);
  if (card.acceptedTerms != null && !accepted) return undefined;
  const product = card.punchCardProduct;
  const terms = accepted ?? {
    version: product.termsVersion ?? 1, priceCents: card.purchasePriceCents ?? product.priceCents ?? 0,
    currency: (card.purchaseCurrency ?? product.currency ?? "usd").toLowerCase(),
    originalPunches: card.originalPunches ?? product.punchesIncluded ?? 0,
    restrictionMode: product.restrictionMode, programIds: product.programRestrictions.map(row => row.programId),
    lateCancellationConsumesPunch: product.lateCancellationConsumesPunch ?? true,
    noShowConsumesPunch: product.noShowConsumesPunch ?? true,
  };
  return { sourceName: product.name, funding: {
    kind: "PUNCH_CARD", id: card.id, units: 1,
    version: directBookingCommercialVersion({
      productId: product.id, version: terms.version, priceCents: terms.priceCents, currency: terms.currency,
      originalPunches: terms.originalPunches, restrictionMode: terms.restrictionMode,
      programIds: [...terms.programIds].sort(), lateCancellationConsumesPunch: terms.lateCancellationConsumesPunch,
      noShowConsumesPunch: terms.noShowConsumesPunch, expiresOn: card.expiresOn ? toDateOnlyString(card.expiresOn) : null,
    }),
  } };
}

function dropInReviewFunding(product: AccessDropInProductRecord): NonNullable<AccessResolution["directBookingFunding"]> {
  return { sourceName: product.name, funding: {
    kind: "DROP_IN", id: product.id, amountCents: product.priceCents, currency: product.currency.toLowerCase(),
    version: directBookingCommercialVersion({ priceCents: product.priceCents, currency: product.currency.toLowerCase(),
      restrictionMode: product.restrictionMode, programIds: product.programRestrictions.map(row => row.programId).sort() }),
  } };
}

async function resolveBookingAccessForProgramWithDb(args: {
  workspaceId: string;
  memberId: string;
  programId: string;
  scheduledForDate?: string;
  occurrenceStartsAt?: Date;
  now?: Date;
  allowDropIn: boolean;
  includeDirectBookingFunding?: boolean;
  db: AccessTransactionDatabase;
}): Promise<AccessResolution> {
  const membership = await getCurrentMembership({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db: args.db,
  });

  const membershipHold = membership ? await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "MEMBERSHIP", targetId: membership.id }], db: args.db }) : null;
  const membershipAllowed = !!membership && !membershipHold && membershipCanFundDate(membership, args.occurrenceStartsAt && membership.allowanceTimezone ? getWorkspaceDateString(args.occurrenceStartsAt, membership.allowanceTimezone) : args.scheduledForDate, args.now ?? new Date());
  if (membership && membershipAllowed) {
    if (isMembershipProgramAllowed({ programId: args.programId, membership })) {
      return {
        type: "membership",
        membershipId: membership.id,
        ...(args.includeDirectBookingFunding ? { directBookingFunding: membershipReviewFunding(membership) } : {}),
      };
    }
  }

  const { card: punchCard, holdReason: punchCardHold } = await selectOldestEligiblePunchCard({
    scheduledForDate: args.scheduledForDate,
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    programId: args.programId,
    db: args.db,
  });

  if (punchCard) {
    return {
      type: "punch_card",
      memberPunchCardId: punchCard.id,
      productName: punchCard.punchCardProduct.name,
      ...(args.includeDirectBookingFunding ? { directBookingFunding: punchCardReviewFunding(punchCard) } : {}),
    };
  }

  const fundingHold = membershipHold ?? punchCardHold;
  if (!args.allowDropIn) {
    if (fundingHold) return { type: "none", reason: "membership_blocked", message: fundingHold };
    if (membership) {
      return {
        type: "none",
        reason: !membershipAllowed
          ? "membership_blocked"
          : "no_access_product",
        message: blockedMembershipStatuses.includes(membership.status)
          ? "This member needs an active membership or punch card for this class."
          : "This class needs a membership or punch card in this workspace.",
      };
    }

    return {
      type: "none",
      reason: "no_membership",
      message: "This class needs a membership or punch card in this workspace.",
    };
  }

  const dropInProduct = await findEligibleDropInProduct({
    workspaceId: args.workspaceId,
    programId: args.programId,
    db: args.db,
  });

  if (dropInProduct) {
    return {
      type: "drop_in",
      dropInProductId: dropInProduct.id,
      productName: dropInProduct.name,
      priceCents: dropInProduct.priceCents,
      currency: dropInProduct.currency,
      ...(args.includeDirectBookingFunding ? { directBookingFunding: dropInReviewFunding(dropInProduct) } : {}),
    };
  }

  if (fundingHold) return { type: "none", reason: "membership_blocked", message: fundingHold };
  if (membership && !membershipAllowed) {
    return {
      type: "none",
      reason: "membership_blocked",
      message: "This membership cannot book classes right now.",
    };
  }

  return {
    type: "none",
    reason: membership ? "drop_in_disabled" : "no_membership",
    message: membership
      ? "No punch card or enabled drop-in product allows this class."
      : "No current access product allows this class.",
  };
}

export async function resolveBookingAccessForProgram(args: {
  workspaceId: string;
  memberId: string;
  programId: string;
  scheduledForDate?: string;
  occurrenceStartsAt?: Date;
  now?: Date;
  allowDropIn?: boolean;
  includeDirectBookingFunding?: boolean;
  db?: AccessResolutionDatabase;
}): Promise<AccessResolution> {
  const db = (args.db ?? accessDatabase) as AccessTransactionDatabase;

  return resolveBookingAccessForProgramWithDb({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    programId: args.programId,
    scheduledForDate: args.scheduledForDate, occurrenceStartsAt: args.occurrenceStartsAt, now: args.now,
    allowDropIn: args.allowDropIn ?? true,
    includeDirectBookingFunding: args.includeDirectBookingFunding,
    db,
  });
}

export type AccessResolutionDatabase = Pick<
  AccessTransactionDatabase,
  "memberMembership" | "memberPunchCard" | "dropInProduct" | "financialEntitlementHold"
>;

async function debitPunchCard(args: {
  scheduledForDate: string;
  punchCardId?: string;
  workspaceId: string;
  memberId: string;
  programId: string;
  db: AccessTransactionDatabase;
}): Promise<{ memberPunchCardId: string } | null> {
  const punchCard = args.punchCardId ? await args.db.memberPunchCard.findFirst({ where: { id: args.punchCardId, workspaceId: args.workspaceId, memberId: args.memberId, status: "ACTIVE", remainingPunches: { gt: 0 } }, include: { punchCardProduct: { include: { programRestrictions: true } } } }) : await pickOldestEligiblePunchCard({ workspaceId: args.workspaceId, memberId: args.memberId, programId: args.programId, scheduledForDate: args.scheduledForDate, db: args.db });

  if (!punchCard || !isPunchCardProgramAllowed(punchCard, args.programId) || (punchCard.expiresOn && args.scheduledForDate >= toDateOnlyString(punchCard.expiresOn))) {
    return null;
  }

  if (args.db.punchCardEntry) await ensurePunchCardLedger({ workspaceId: args.workspaceId, cardId: punchCard.id, db: args.db as unknown as Prisma.TransactionClient });
  const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "PUNCH_CARD", targetId: punchCard.id }], db: args.db });
  if (held) return null;
  const nextRemainingPunches = punchCard.remainingPunches - 1;
  const result = await args.db.memberPunchCard.updateMany({
    where: {
      id: punchCard.id,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      status: "ACTIVE",
      remainingPunches: punchCard.remainingPunches,
    },
    data: {
      remainingPunches: nextRemainingPunches,
      status: nextRemainingPunches === 0 ? "DEPLETED" : "ACTIVE",
    },
  });

  if (result.count === 0) {
    return null;
  }

  return {
    memberPunchCardId: punchCard.id,
  };
}

async function refundPunchCard(args: {
  workspaceId: string;
  memberId: string;
  memberPunchCardId: string;
  punchCount: number;
  db: AccessTransactionDatabase;
}): Promise<boolean> {
  const punchCard = await args.db.memberPunchCard.findFirst({
    where: {
      id: args.memberPunchCardId,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
    },
    select: {
      id: true,
      remainingPunches: true,
      status: true,
    },
  });

  if (!punchCard) {
    return false;
  }

  const result = await args.db.memberPunchCard.updateMany({
    where: {
      id: punchCard.id,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      remainingPunches: punchCard.remainingPunches,
    },
    data: {
      remainingPunches: punchCard.remainingPunches + args.punchCount,
      status: "ACTIVE",
    },
  });

  return result.count > 0;
}

async function createAccessBackedBookingWithDb(args: {
  workspaceId: string;
  memberId: string;
  guardianId?: string | null;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  allowDropIn: boolean;
  source: ClassBookingSource;
  db: AccessTransactionDatabase;
  now: Date;
  trial?: boolean;
  fundingOverride?: AccessResolution;
  punchCardOverrideId?: string;
  skipWaitlistPriority?: boolean;
  sourceRestoration?: { sourceRowHash: string };
  ownerLateBooking?: { ownerUserId: string; receiptId: string; capability: typeof ownerLateBookingCapability };
}): Promise<CreateAccessBackedBookingResult> {
  if (args.ownerLateBooking && (args.ownerLateBooking.capability !== ownerLateBookingCapability || args.sourceRestoration)) return { status: "error", code: "NO_ACCESS", message: "A late-booking capability must come from the current owner confirmation transaction." };
  const memberId = args.memberId.trim();
  const classTemplateId = args.classTemplateId.trim();
  const scheduledForDate = args.scheduledForDate.trim();
  const guardianId = cleanNullable(args.guardianId);

  if (!memberId || !classTemplateId || !scheduledForDate) {
    return {
      status: "error",
      code: "INVALID",
      message: "Choose a member and class date.",
    };
  }

  const template = await getActiveTemplate({
    timezone: args.timezone,
    workspaceId: args.workspaceId,
    classTemplateId,
    scheduledForDate,
    db: args.db,
  });

  if (!template) {
    return {
      status: "error",
      code: "NOT_FOUND",
      message: "Choose an active class template in this workspace.",
    };
  }

  args = { ...args, timezone: template.timezone ?? args.timezone };
  const occurrence = validateOccurrenceDate({
    scheduledForDate,
    templateWeekday: template.weekday as never,
    timezone: args.timezone,
    now: args.now,
    direction: "future",
  });

  if (occurrence.status === "error") {
    return {
      status: "error",
      code: "INVALID",
      message: "Choose a valid upcoming date for this class.",
    };
  }

  let schedulingSnapshot: SchedulingPolicySnapshot;
  if (args.sourceRestoration) {
    const startsAt = getOccurrenceStartsAt({ scheduledForDate: occurrence.dateString, startTimeMinutes: template.startTimeMinutes, timezone: args.timezone });
    const endsAt = getOccurrenceStartsAt({ scheduledForDate: occurrence.dateString, startTimeMinutes: template.endTimeMinutes!, timezone: args.timezone });
    schedulingSnapshot = { schemaVersion: 1, mode: "SOURCE_RESTORATION", policyRevisionId: null, policyVersion: null, policyHash: null, scheduledForDate: occurrence.dateString, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), timezone: args.timezone, opensAt: null, closesAt: null, evaluatedAt: args.now.toISOString(), sourceRowHash: args.sourceRestoration.sourceRowHash };
  } else {
    if (args.ownerLateBooking && (args.source !== "ADMIN" || !await (args.db as unknown as Prisma.TransactionClient).workspaceUser.findFirst({ where: { workspaceId: args.workspaceId, userId: args.ownerLateBooking.ownerUserId, role: "OWNER", isActive: true, workspace: { status: "ACTIVE" } }, select: { id: true } }))) return { status: "error", code: "NO_ACCESS", message: "Only the current active owner can confirm a late-booking exception." };
    const evaluation = evaluateClassSchedulingPolicy({ ...(args.ownerLateBooking ? { allowLeadExceptionBeforeStart: true as const } : {}), revision: await readClassSchedulingPolicy(args.db, args.workspaceId, args.now), date: occurrence.dateString, timezone: args.timezone, startTimeMinutes: template.startTimeMinutes, endTimeMinutes: template.endTimeMinutes!, bookingCutoffMinutes: template.bookingCutoffMinutes, now: args.now });
    if (!evaluation.allowed) return { status: "error", code: "INVALID", message: evaluation.message };
    schedulingSnapshot = { ...evaluation.snapshot, ...(args.ownerLateBooking ? { leadOverrideReceiptId: args.ownerLateBooking.receiptId } : {}) };
  }
  if (!args.db.workspaceDataEvent) return { status: "error", code: "INVALID", message: "The scheduling receipt could not be recorded. Try again later." };
  let formSnapshot: BookingFormSnapshot | null = null;
  const recordScheduling = async (bookingId: string, fundingRevision: number) => {
    await recordClassSchedulingPolicyApplied({ db: args.db as unknown as Prisma.TransactionClient, workspaceId: args.workspaceId, bookingId, fundingRevision, snapshot: schedulingSnapshot });
    if (formSnapshot) await recordAcceptedBookingFormsTx(args.db as unknown as Prisma.TransactionClient, { workspaceId: args.workspaceId, bookingId, fundingRevision, snapshot: formSnapshot });
    // Dedicated waitlist/owner-exception notices remain their sole confirmation.
    // Historical restoration creates no fresh customer communication. Public trials enqueue after their registration commits.
    if (!args.skipWaitlistPriority && !args.ownerLateBooking && !args.sourceRestoration && args.source !== "PUBLIC_TRIAL") await enqueueClassBookingConfirmationTx(args.db as unknown as Prisma.TransactionClient, { workspaceId: args.workspaceId, bookingId, now: args.now });
  };

  if (args.db.programPromotion) {
    const eligibility = await checkMemberClassEligibility({ workspaceId: args.workspaceId, memberId, scheduledForDate: occurrence.dateString, occurrence: { ...template, classTemplateId: template.id }, db: args.db as unknown as Prisma.TransactionClient });
    if (!eligibility.eligible) return { status: "error", code: "NO_ACCESS", message: eligibility.reason ?? "This class has eligibility requirements." };
  }

  try {
    formSnapshot = await acceptedBookingFormsTx(args.db as unknown as Prisma.TransactionClient, { workspaceId: args.workspaceId, memberId, serviceAt: new Date(schedulingSnapshot.startsAt), serviceTimezone: args.timezone, now: args.now, trial: !!args.trial });
  } catch (error) {
    if (error instanceof FormRequirementError) return { status: "error", code: "NO_ACCESS", message: error.message };
    throw error;
  }

  await cleanupExpiredPendingBookings({
    workspaceId: args.workspaceId,
    classTemplateId,
    scheduledForDate: occurrence.dateString,
    db: args.db,
    now: args.now,
  });

  const existingBooking = await args.db.classBooking.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId,
      classTemplateId,
      scheduledForDate: occurrence.date,
    },
    select: {
      id: true,
      status: true,
      bookingType: true,
      memberPunchCardId: true,
      consumedPunchCount: true,
      pendingPaymentExpiresAt: true,
      fundingRevision: true,
    },
  });

  if (existingBooking) { const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "BOOKING", targetId: existingBooking.id }], db: args.db }); if (held) return { status: "error", code: "NO_ACCESS", message: held }; }
  if (existingBooking && existingBooking.status !== "CANCELLED") {
    return {
      status: "error",
      code: "DUPLICATE",
      message:
        existingBooking.status === "PENDING_PAYMENT"
          ? "Payment is already pending for this class."
          : "An active booking already exists for this class date.",
    };
  }

  const fundingRevision = existingBooking ? (existingBooking.fundingRevision ?? 1) + 1 : 1;
  if (!args.skipWaitlistPriority) {
    const prioritized = await promoteWaitlistTx({ ...args, maxPromotions: Number.MAX_SAFE_INTEGER });
    const promotedOwn = prioritized.promotions.length ? await args.db.classBooking.findFirst({
      where: { workspaceId: args.workspaceId, memberId, classTemplateId, scheduledForDate: occurrence.date, status: "BOOKED" },
      select: { id: true, bookingType: true },
    }) : null;
    if (promotedOwn) return { status: "created", bookingId: promotedOwn.id, bookingType: promotedOwn.bookingType };
  }
  const activeBookingCount = await countActiveOccurrenceBookings({
    workspaceId: args.workspaceId,
    classTemplateId,
    scheduledForDate: occurrence.dateString,
    db: args.db,
    now: args.now,
  });
  const effectiveCapacity = getEffectiveCapacity({
    capacityOverride: template.capacityOverride,
    roomCapacity: template.room.capacity,
  });

  if (effectiveCapacity !== null && activeBookingCount >= effectiveCapacity) {
    return {
      status: "error",
      code: "FULL",
      message: "This class is full.",
    };
  }

  if (args.db.classBooking.findMany) {
    const overlapping = await args.db.classBooking.findMany({ where: { workspaceId: args.workspaceId, memberId, scheduledForDate: occurrence.date, status: { in: ["BOOKED", "PENDING_PAYMENT"] }, classTemplateId: { not: classTemplateId } }, include: { classTemplate: { include: classOccurrenceInclude } } }) as Array<{ classTemplate: ClassOccurrenceTemplate }>;
    if (overlapping.some((booking) => { const other = resolveClassOccurrence({ template: booking.classTemplate, scheduledForDate: occurrence.dateString }); return other && other.status !== "CANCELLED" && other.startTimeMinutes < (template.endTimeMinutes ?? template.startTimeMinutes) && template.startTimeMinutes < other.endTimeMinutes; })) return { status: "error", code: "INVALID", message: "This member already has a booking at this time." };
  }
  if (args.trial) {
    const data = { fundingRevision, providerChangedAt: null, fundedByBookingId: null, workspaceId: args.workspaceId, memberId, guardianId, classTemplateId, scheduledForDate: occurrence.date, bookingType: "TRIAL", status: "BOOKED", source: args.source, fundingMembershipId: null, consumedPunchCount: 0, memberPunchCardId: null };
    const booking = existingBooking ? await args.db.classBooking.update({ where: { id: existingBooking.id }, data, select: { id: true } }) : await args.db.classBooking.create({ data, select: { id: true } });
    await recordScheduling(booking.id, fundingRevision);
    await args.db.waitlistEntry?.updateMany({ where: { workspaceId: args.workspaceId, memberId, classTemplateId, scheduledForDate: occurrence.date, status: "ACTIVE" }, data: { status: "CANCELLED" } });
    return { status: existingBooking ? "restored" : "created", bookingId: booking.id, bookingType: "TRIAL" };
  }

  const access = args.fundingOverride ?? await resolveBookingAccessForProgramWithDb({
    workspaceId: args.workspaceId,
    memberId,
    programId: template.programId,
    scheduledForDate: occurrence.dateString, occurrenceStartsAt: getOccurrenceStartsAt({ scheduledForDate: occurrence.dateString, startTimeMinutes: template.startTimeMinutes, timezone: args.timezone }), now: args.now,
    allowDropIn: args.allowDropIn,
    db: args.db,
  });

  if (access.type === "none") {
    return {
      status: "error",
      code:
        access.reason === "drop_in_disabled" && !args.allowDropIn
          ? "DROP_IN_ONLY"
          : access.reason === "drop_in_disabled"
            ? "NO_ACCESS"
            : "NO_ACCESS",
      message: access.message,
    };
  }

  if (access.type === "membership") {
    const allowance = args.db.membershipAllowanceAllocation ? await prepareMembershipAllowance({ workspaceId: args.workspaceId, memberId, membershipId: access.membershipId, scheduledForDate: occurrence.dateString, occurrenceStartsAt: getOccurrenceStartsAt({ scheduledForDate: occurrence.dateString, startTimeMinutes: template.startTimeMinutes, timezone: args.timezone }), timezone: args.timezone, db: args.db as unknown as Prisma.TransactionClient }) : null;
    if (allowance && "error" in allowance) return { status: "error", code: "NO_ACCESS", message: allowance.error ?? "Membership access is unavailable." };
    if (allowance?.windows.some((w) => w.remaining < 1)) return { status: "error", code: "NO_ACCESS", message: "This membership has no classes left in this class date's allowance period. Choose another date or ask the gym about access." };
    const funding = { fundingMembershipId: access.membershipId, ...(allowance ? { acceptedPolicy: allowance.terms } : {}) };
    const booking = existingBooking
      ? await args.db.classBooking.update({
          where: {
            id: existingBooking.id,
          },
          data: {
            guardianId,
            fundingRevision,
            providerChangedAt: null, fundedByBookingId: null,
            ...funding,
            bookingType: "MEMBERSHIP",
            status: "BOOKED",
            source: args.source,
            memberPunchCardId: null,
            dropInProductId: null,
            consumedPunchCount: 0,
            dropInPriceCents: null,
            dropInCurrency: null,
            dropInCheckoutSessionId: null,
            dropInPaymentIntentId: null,
            dropInPaidAt: null,
            pendingPaymentExpiresAt: null,
          },
          select: {
            id: true,
          },
        })
      : await args.db.classBooking.create({
          data: {
            workspaceId: args.workspaceId,
            memberId,
            guardianId,
            fundingRevision,
            providerChangedAt: null, fundedByBookingId: null,
            ...funding,
            classTemplateId,
            scheduledForDate: dateOnlyStringToUtcDate(occurrence.dateString),
            bookingType: "MEMBERSHIP",
            status: "BOOKED",
            source: args.source,
            consumedPunchCount: 0,
          },
          select: {
            id: true,
          },
        });

    if (allowance) await reserveMembershipAllowance({ workspaceId: args.workspaceId, memberId, membershipId: access.membershipId, bookingId: booking.id, bookingRevision: fundingRevision, windows: allowance.windows, db: args.db as unknown as Prisma.TransactionClient });

    await recordScheduling(booking.id, fundingRevision);
    await args.db.waitlistEntry?.updateMany({ where: { workspaceId: args.workspaceId, memberId, classTemplateId, scheduledForDate: occurrence.date, status: "ACTIVE" }, data: { status: "CANCELLED" } });
    return {
      status: existingBooking ? "restored" : "created",
      bookingId: booking.id,
      bookingType: "MEMBERSHIP",
    };
  }

  if (access.type === "punch_card") {
    const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "PUNCH_CARD", targetId: access.memberPunchCardId }], db: args.db });
    if (held) return { status: "error", code: "NO_ACCESS", message: held };
    const debit = await debitPunchCard({
      scheduledForDate: occurrence.dateString,
      punchCardId: args.punchCardOverrideId ?? access.memberPunchCardId,
      workspaceId: args.workspaceId,
      memberId,
      programId: template.programId,
      db: args.db,
    });

    if (!debit) {
      return {
        status: "error",
        code: "NO_ACCESS",
        message: "No eligible punch card has punches remaining.",
      };
    }

    const booking = existingBooking
      ? await args.db.classBooking.update({
          where: {
            id: existingBooking.id,
          },
          data: {
            guardianId,
            fundingRevision,
            providerChangedAt: null, fundedByBookingId: null,
            fundingMembershipId: null,
            bookingType: "PUNCH_CARD",
            status: "BOOKED",
            source: args.source,
            memberPunchCardId: debit.memberPunchCardId,
            dropInProductId: null,
            consumedPunchCount: 1,
            dropInPriceCents: null,
            dropInCurrency: null,
            dropInCheckoutSessionId: null,
            dropInPaymentIntentId: null,
            dropInPaidAt: null,
            pendingPaymentExpiresAt: null,
          },
          select: {
            id: true,
          },
        })
      : await args.db.classBooking.create({
          data: {
            workspaceId: args.workspaceId,
            memberId,
            guardianId,
            fundingRevision,
            providerChangedAt: null, fundedByBookingId: null,
            classTemplateId,
            scheduledForDate: dateOnlyStringToUtcDate(occurrence.dateString),
            fundingMembershipId: null,
            bookingType: "PUNCH_CARD",
            status: "BOOKED",
            source: args.source,
            memberPunchCardId: debit.memberPunchCardId,
            consumedPunchCount: 1,
          },
          select: {
            id: true,
          },
        });

    if (args.db.punchCardEntry) await recordPunchCardReservation({ workspaceId: args.workspaceId, memberId, cardId: debit.memberPunchCardId, bookingId: booking.id, bookingRevision: fundingRevision, db: args.db as unknown as Prisma.TransactionClient });
    await recordScheduling(booking.id, fundingRevision);
    await args.db.waitlistEntry?.updateMany({ where: { workspaceId: args.workspaceId, memberId, classTemplateId, scheduledForDate: occurrence.date, status: "ACTIVE" }, data: { status: "CANCELLED" } });

    return {
      status: existingBooking ? "restored" : "created",
      bookingId: booking.id,
      bookingType: "PUNCH_CARD",
    };
  }

  if (!args.allowDropIn) {
    return {
      status: "error",
      code: "DROP_IN_ONLY",
      message:
        "This class is only accessible through a paid drop-in flow. Ask the member to book it from the portal.",
    };
  }

  const booking = existingBooking
    ? await args.db.classBooking.update({
        where: {
          id: existingBooking.id,
        },
        data: {
          guardianId,
          fundingRevision,
          providerChangedAt: null, fundedByBookingId: null,
          fundingMembershipId: null,
          bookingType: "DROP_IN",
          status: "PENDING_PAYMENT",
          source: args.source,
          memberPunchCardId: null,
          dropInProductId: access.dropInProductId,
          consumedPunchCount: 0,
          dropInPriceCents: access.priceCents,
          dropInCurrency: access.currency,
          dropInCheckoutSessionId: null,
          dropInPaymentIntentId: null,
          dropInPaidAt: null,
          pendingPaymentExpiresAt: new Date(Math.min(args.now.getTime() + 30 * 60000, getOccurrenceStartsAt({ scheduledForDate: occurrence.dateString, startTimeMinutes: template.startTimeMinutes, timezone: args.timezone }).getTime())),
        },
        select: {
          id: true,
        },
      })
    : await args.db.classBooking.create({
        data: {
          workspaceId: args.workspaceId,
          memberId,
          guardianId,
          fundingRevision,
          providerChangedAt: null, fundedByBookingId: null,
          classTemplateId,
          scheduledForDate: dateOnlyStringToUtcDate(occurrence.dateString),
          fundingMembershipId: null,
          bookingType: "DROP_IN",
          status: "PENDING_PAYMENT",
          source: args.source,
          dropInProductId: access.dropInProductId,
          dropInPriceCents: access.priceCents,
          dropInCurrency: access.currency,
          pendingPaymentExpiresAt: new Date(Math.min(args.now.getTime() + 30 * 60000, getOccurrenceStartsAt({ scheduledForDate: occurrence.dateString, startTimeMinutes: template.startTimeMinutes, timezone: args.timezone }).getTime())),
        },
        select: {
          id: true,
        },
      });

  await recordScheduling(booking.id, fundingRevision);
  await args.db.waitlistEntry?.updateMany({ where: { workspaceId: args.workspaceId, memberId, classTemplateId, scheduledForDate: occurrence.date, status: "ACTIVE" }, data: { status: "CANCELLED" } });
  return {
    status: "payment_required",
    bookingId: booking.id,
    dropInProductId: access.dropInProductId,
    priceCents: access.priceCents,
    currency: access.currency,
  };
}

class DirectBookingCreationFailure extends Error {
  constructor(readonly result: Extract<CreateAccessBackedBookingResult, { status: "error" }>) {
    super(result.message);
  }
}

async function lockReviewedDirectFundingRow(db: AccessTransactionDatabase, query: string, ...values: unknown[]) {
  if (!db.$queryRawUnsafe) throw new DirectBookingFundingReviewError();
  const rows = await db.$queryRawUnsafe(query, ...values);
  if (!Array.isArray(rows) || rows.length !== 1) throw new DirectBookingFundingReviewError();
}

/** Resolve only the expressly reviewed asset. A newly preferred alternative cannot spend a different asset. */
async function resolveReviewedDirectFunding(args: {
  workspaceId: string; memberId: string; programId: string; scheduledForDate: string;
  startsAt: Date; now: Date; allowDropIn: boolean; funding: DirectBookingFunding; db: AccessTransactionDatabase;
}): Promise<AccessResolution> {
  if (args.funding.kind === "MEMBERSHIP") {
    await lockReviewedDirectFundingRow(args.db, 'SELECT m.id FROM member_memberships m JOIN membership_plans p ON p.id = m."membershipPlanId" AND p."workspaceId" = m."workspaceId" WHERE m.id = $1 AND m."workspaceId" = $2 AND m."memberId" = $3 FOR SHARE OF m, p', args.funding.id, args.workspaceId, args.memberId);
    const membership = await getCurrentMembership(args);
    const date = membership?.allowanceTimezone ? getWorkspaceDateString(args.startsAt, membership.allowanceTimezone) : args.scheduledForDate;
    if (!membership || membership.id !== args.funding.id || !membershipCanFundDate(membership, date, args.now)
      || !isMembershipProgramAllowed({ programId: args.programId, membership })
      || await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "MEMBERSHIP", targetId: membership.id }], db: args.db })) throw new DirectBookingFundingReviewError();
    return { type: "membership", membershipId: membership.id, directBookingFunding: membershipReviewFunding(membership) };
  }
  if (args.funding.kind === "PUNCH_CARD") {
    await lockReviewedDirectFundingRow(args.db, 'SELECT c.id FROM member_punch_cards c JOIN punch_card_products p ON p.id = c."punchCardProductId" AND p."workspaceId" = c."workspaceId" WHERE c.id = $1 AND c."workspaceId" = $2 AND c."memberId" = $3 FOR SHARE OF c, p', args.funding.id, args.workspaceId, args.memberId);
    const card = await args.db.memberPunchCard.findFirst({
      where: { workspaceId: args.workspaceId, memberId: args.memberId, id: args.funding.id, status: "ACTIVE", remainingPunches: { gt: 0 } },
      include: { punchCardProduct: { include: { programRestrictions: true } } },
    });
    if (!card || !isPunchCardProgramAllowed(card, args.programId)
      || (card.expiresOn && args.scheduledForDate >= toDateOnlyString(card.expiresOn))
      || await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "PUNCH_CARD", targetId: card.id }], db: args.db })) throw new DirectBookingFundingReviewError();
    return { type: "punch_card", memberPunchCardId: card.id, productName: card.punchCardProduct.name, directBookingFunding: punchCardReviewFunding(card) };
  }
  if (!args.allowDropIn) throw new DirectBookingFundingReviewError();
  await lockReviewedDirectFundingRow(args.db, 'SELECT id FROM drop_in_products WHERE id = $1 AND "workspaceId" = $2 FOR SHARE', args.funding.id, args.workspaceId);
  const product = await args.db.dropInProduct.findFirst({
    where: { workspaceId: args.workspaceId, id: args.funding.id, isEnabled: true, archivedAt: null },
    include: { programRestrictions: true },
  });
  if (!product || !isProgramAllowed({ programId: args.programId, restrictionMode: product.restrictionMode, restrictions: product.programRestrictions })) throw new DirectBookingFundingReviewError();
  return { type: "drop_in", dropInProductId: product.id, productName: product.name,
    priceCents: product.priceCents, currency: product.currency, directBookingFunding: dropInReviewFunding(product) };
}

/** Mandatory new direct-member confirmation path. Trusted owner/source and accepted-operation recovery remain separate. */
export async function createReviewedDirectClassBooking(args: {
  workspaceId: string;
  actor: MemberCommandActor;
  authorizationClock?: () => Date;
  memberId: string;
  guardianId?: string | null;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  reviewedFunding: DirectBookingFundingReview;
  allowDropIn?: boolean;
  db?: AccessDatabase;
  now?: Date;
}): Promise<CreateAccessBackedBookingResult> {
  const db = args.db ?? accessDatabase, now = args.now ?? new Date();
  try {
    const review = parseDirectBookingFundingReview(args.reviewedFunding);
    if (review.workspaceId !== args.workspaceId || review.memberId !== args.memberId
      || review.classTemplateId !== args.classTemplateId || review.scheduledForDate !== args.scheduledForDate) throw new DirectBookingFundingReviewError();
    return await db.$transaction(async (tx) => {
      await lockClassSchedule(tx, args.workspaceId);
      const authority = await requireCurrentMemberBookingAuthorityTx(tx as unknown as Prisma.TransactionClient, { workspaceId: args.workspaceId, memberId: args.memberId, actor: args.actor, authorizationClock: args.authorizationClock });
      if (review.funding.kind === "DROP_IN" && !authority.canPay) throw new MemberBookingAuthorityError();
      args = { ...args, guardianId: authority.guardianId, allowDropIn: authority.canPay && args.allowDropIn !== false };
      const template = await getActiveTemplate({ ...args, db: tx });
      if (!template || template.endTimeMinutes === undefined) throw new DirectBookingFundingReviewError();
      const timezone = template.timezone ?? args.timezone;
      const startsAt = getOccurrenceStartsAt({ scheduledForDate: args.scheduledForDate, startTimeMinutes: template.startTimeMinutes, timezone });
      const access = await resolveReviewedDirectFunding({ ...args, db: tx, now, programId: template.programId,
        startsAt, allowDropIn: args.allowDropIn ?? true, funding: review.funding });
      if (!access.directBookingFunding) throw new DirectBookingFundingReviewError();
      const current = buildDirectBookingFundingReview({
        workspaceId: args.workspaceId, memberId: args.memberId, classTemplateId: args.classTemplateId,
        scheduledForDate: args.scheduledForDate, occurrence: { programId: template.programId, startsAt: startsAt.toISOString(),
          endsAt: getOccurrenceStartsAt({ scheduledForDate: args.scheduledForDate, startTimeMinutes: template.endTimeMinutes, timezone }).toISOString(), timezone,
          cancellationCutoffMinutes: template.cancellationCutoffMinutes },
        funding: access.directBookingFunding.funding,
      });
      if (current.reviewHash !== review.reviewHash) throw new DirectBookingFundingReviewError();
      const result = await createAccessBackedBookingWithDb({ ...args, db: tx, now, timezone,
        source: "MEMBER_PORTAL", allowDropIn: args.allowDropIn ?? true, fundingOverride: access });
      // Existing cleanup and FIFO promotion precede funding writes. Every failed direct claim rolls them back too.
      if (result.status === "error") throw new DirectBookingCreationFailure(result);
      if (result.status === "payment_required") {
        if (review.funding.kind !== "DROP_IN" || result.dropInProductId !== review.funding.id
          || result.priceCents !== review.funding.amountCents || result.currency.toLowerCase() !== review.funding.currency) throw new DirectBookingFundingReviewError();
      } else {
        // An existing opted-in queue can promote this person during the claim. Its independent
        // standing preference must not make this direct result silently report a different source.
        const saved = await tx.classBooking.findFirst({ where: { id: result.bookingId, workspaceId: args.workspaceId, memberId: args.memberId },
          select: { bookingType: true, fundingMembershipId: true, memberPunchCardId: true } }) as unknown as {
            bookingType: string; fundingMembershipId: string | null; memberPunchCardId: string | null;
          } | null;
        const exact = review.funding.kind === "MEMBERSHIP"
          ? saved?.bookingType === "MEMBERSHIP" && saved.fundingMembershipId === review.funding.id
          : review.funding.kind === "PUNCH_CARD" && saved?.bookingType === "PUNCH_CARD" && saved.memberPunchCardId === review.funding.id;
        if (!exact) throw new DirectBookingFundingReviewError();
      }
      return result;
    });
  } catch (error) {
    if (error instanceof MemberBookingAuthorityError) return { status: "error", code: "NO_ACCESS", message: error.message };
    if (error instanceof DirectBookingFundingReviewError) return { status: "error", code: "REVIEW_REQUIRED", message: directBookingReviewMessage };
    if (error instanceof DirectBookingCreationFailure) return error.result;
    throw error;
  }
}

export async function createAccessBackedBooking(args: {
  workspaceId: string;
  memberId: string;
  guardianId?: string | null;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  source: ClassBookingSource;
  allowDropIn?: boolean;
  trial?: boolean;
  db?: AccessDatabase;
  now?: Date;
}): Promise<CreateAccessBackedBookingResult> {
  const db = args.db ?? accessDatabase;

  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    return createAccessBackedBookingWithDb({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      guardianId: args.guardianId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: args.scheduledForDate,
      timezone: args.timezone,
      allowDropIn: args.allowDropIn ?? true,
      trial: args.trial,
      source: args.source,
      db: tx,
      now: args.now ?? new Date(),
    });
  });
}

async function cancelAccessBackedBookingTx(tx: AccessTransactionDatabase, args: Parameters<typeof cancelAccessBackedBooking>[0], now: Date): Promise<Awaited<ReturnType<typeof cancelAccessBackedBooking>>> {
    await lockClassSchedule(tx, args.workspaceId);
    const booking = await tx.classBooking.findFirst({
      where: {
        id: args.bookingId,
        workspaceId: args.workspaceId,
        memberId: args.memberId,
      },
      include: {
        classTemplate: {
          include: classOccurrenceInclude,
        },
      },
    } as Record<string, unknown>) as (AccessBookingRecord & {
      classTemplate: ClassOccurrenceTemplate;
      scheduledForDate: Date;
    }) | null;

    if (!booking) {
      return {
        status: "error",
        message: "Booking not found.",
      } satisfies CancelAccessBackedBookingResult;
    }

    const heldFunding = booking as typeof booking & { fundingMembershipId?: string; fundedByBookingId?: string };
    const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "BOOKING", targetId: booking.id }, { targetKind: "BOOKING", targetId: heldFunding.fundedByBookingId }, { targetKind: "PUNCH_CARD", targetId: booking.memberPunchCardId }, { targetKind: "MEMBERSHIP", targetId: heldFunding.fundingMembershipId }], db: tx });
    if (held) return { status: "error", message: held } satisfies CancelAccessBackedBookingResult;
    const scheduledForDate = toDateOnlyString(booking.scheduledForDate);
    const effective = resolveClassOccurrence({ template: booking.classTemplate, scheduledForDate });
    if (!effective || effective.status === "CANCELLED") return { status: "error", message: "This class is no longer active. Refresh your bookings." } satisfies CancelAccessBackedBookingResult;
    const cancellationState = canCancelClassBooking({
      bookingType: booking.bookingType,
      bookingStatus: booking.status,
      scheduledForDate,
      startTimeMinutes: effective.startTimeMinutes,
      cancellationCutoffMinutes:
        booking.providerChangedAt ? 0 : effective.cancellationCutoffMinutes,
      timezone: effective.timezone ?? args.timezone,
      now,
    });

    if (!cancellationState.canCancel) {
      return {
        status: "error",
        message: "Cancellation cutoff has already passed for this booking.",
      } satisfies CancelAccessBackedBookingResult;
    }

    const result = await tx.classBooking.updateMany({
      where: {
        id: booking.id,
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        status: booking.status,
      },
      data: {
        status: "CANCELLED",
        pendingPaymentExpiresAt: null,
      },
    });

    if (result.count === 0) {
      return {
        status: "error",
        message: "Booking could not be cancelled.",
      } satisfies CancelAccessBackedBookingResult;
    }

    if (tx.membershipAllowanceAllocation) await settleMembershipAllowance({ workspaceId: args.workspaceId, bookingId: booking.id, outcome: cancellationState.lateCancellation ? "LATE_CANCEL" : "TIMELY_CANCEL", db: tx as unknown as Prisma.TransactionClient });

    let punchRefunded = false;
    if (tx.punchCardEntry) { const settlement = await settlePunchCardBooking({ workspaceId: args.workspaceId, bookingId: booking.id, outcome: cancellationState.lateCancellation ? "LATE_CANCEL" : "TIMELY_CANCEL", db: tx as unknown as Prisma.TransactionClient }); if (!settlement.ok) throw new Error(settlement.message); punchRefunded = settlement.refunded; }

    if (
      !tx.punchCardEntry && booking.bookingType === "PUNCH_CARD" &&
      booking.memberPunchCardId &&
      booking.consumedPunchCount > 0 &&
      !cancellationState.lateCancellation
    ) {
      punchRefunded = await refundPunchCard({
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        memberPunchCardId: booking.memberPunchCardId,
        punchCount: booking.consumedPunchCount,
        db: tx,
      });

      await tx.classBooking.update({
        where: {
          id: booking.id,
        },
        data: {
          consumedPunchCount: 0,
        },
        select: {
          id: true,
        },
      });
    }

    await promoteWaitlistTx({ workspaceId: args.workspaceId, classTemplateId: booking.classTemplate.id, scheduledForDate, timezone: args.timezone, db: tx, now, maxPromotions: Number.MAX_SAFE_INTEGER });
    return {
      status: "cancelled",
      bookingId: booking.id,
      punchRefunded,
      lateCancellation: cancellationState.lateCancellation,
    } satisfies CancelAccessBackedBookingResult;
}

export async function cancelAccessBackedBooking(args: {
  workspaceId: string;
  memberId: string;
  bookingId: string;
  timezone: string;
  db?: AccessDatabase;
  now?: Date;
}): Promise<CancelAccessBackedBookingResult> {
  const db = args.db ?? accessDatabase;
  const now = args.now ?? new Date();

  return db.$transaction(tx => cancelAccessBackedBookingTx(tx, args, now));
}

export async function listOccurrenceWaitlist(args: {
  workspaceId: string;
  classTemplateId: string;
  scheduledForDate: string;
  db?: Pick<AccessTransactionDatabase, "waitlistEntry">;
}): Promise<ListOccurrenceWaitlistResult> {
  const db = args.db ?? accessDatabase;
  const entries = await db.waitlistEntry.findMany({
    where: {
      workspaceId: args.workspaceId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: dateOnlyStringToUtcDate(args.scheduledForDate),
      status: "ACTIVE",
    },
    include: {
      member: {
        select: {
          fullName: true,
          email: true,
          phone: true,
          status: true,
        },
      },
    },
    orderBy: [
      {
        joinedAt: "asc",
      },
      {
        id: "asc",
      },
    ],
  });

  return {
    entries: entries.map((entry, index) => ({
      id: entry.id,
      memberId: entry.memberId,
      memberName: entry.member.fullName,
      memberEmail: entry.member.email,
      memberPhone: entry.member.phone,
      memberStatus: entry.member.status,
      position: index + 1,
      joinedAt: entry.joinedAt,
      promotedAt: entry.promotedAt,
      promotedBookingId: entry.promotedBookingId,
      autoPromotionOptedInAt: entry.autoPromotionOptedInAt,
      lastSkipReason: entry.lastSkipReason,
    })),
  };
}

async function joinWaitlistTx(tx: AccessTransactionDatabase, args: Parameters<typeof joinWaitlist>[0], now: Date): Promise<Awaited<ReturnType<typeof joinWaitlist>>> {
  if (!args.autoPromotionOptIn) return { status: "error" as const, message: "Agree to automatic promotion before joining the waitlist." };
    await lockClassSchedule(tx, args.workspaceId);
    if (!await waitlistConsentRecipients(tx, args.workspaceId, args.memberId, args.consentUserId!)) return { status: "error", message: "Your current account cannot authorize this person's automatic booking." };
    const template = await getActiveTemplate({
    timezone: args.timezone,
      workspaceId: args.workspaceId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: args.scheduledForDate,
      db: tx,
    });

    if (!template) {
      return {
        status: "error",
        message: "Choose an active class template in this workspace.",
      };
    }

    args = { ...args, timezone: template.timezone ?? args.timezone };
    const occurrence = validateOccurrenceDate({
      scheduledForDate: args.scheduledForDate,
      templateWeekday: template.weekday as never,
      timezone: args.timezone,
      now,
      direction: "future",
    });

    if (occurrence.status === "error") {
      return {
        status: "error",
        message: "Choose a valid upcoming class date.",
      };
    }

    const evaluation = evaluateClassSchedulingPolicy({ revision: await readClassSchedulingPolicy(tx, args.workspaceId, now), date: occurrence.dateString, timezone: args.timezone, startTimeMinutes: template.startTimeMinutes, endTimeMinutes: template.endTimeMinutes!, bookingCutoffMinutes: Math.max(template.bookingCutoffMinutes, template.cancellationCutoffMinutes), now });
    if (!evaluation.allowed) return { status: "error", message: evaluation.message };
    const schedulingSnapshot = { ...evaluation.snapshot, autoPromotionClosesAt: evaluation.snapshot.closesAt! };

    if (tx.programPromotion) {
      const eligibility = await checkMemberClassEligibility({ workspaceId: args.workspaceId, memberId: args.memberId, scheduledForDate: occurrence.dateString, occurrence: { ...template, classTemplateId: template.id }, db: tx as unknown as Prisma.TransactionClient });
      if (!eligibility.eligible) return { status: "error", message: eligibility.reason ?? "This class has eligibility requirements." };
    }

    const access = await resolveBookingAccessForProgramWithDb({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      programId: template.programId,
      scheduledForDate: occurrence.dateString, occurrenceStartsAt: getOccurrenceStartsAt({ scheduledForDate: occurrence.dateString, startTimeMinutes: template.startTimeMinutes, timezone: args.timezone }), now: args.now,
      allowDropIn: false,
      db: tx,
    });

    if (access.type === "none") {
      return {
        status: "error",
        message: "A membership or punch card is required to join this waitlist.",
      };
    }

    await cleanupExpiredPendingBookings({
      workspaceId: args.workspaceId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: occurrence.dateString,
      db: tx,
      now,
    });

    const existingBooking = await tx.classBooking.findFirst({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        classTemplateId: args.classTemplateId,
        scheduledForDate: occurrence.date,
        status: {
          not: "CANCELLED",
        },
      },
      select: {
        id: true,
      },
    });

    if (existingBooking) {
      return {
        status: "error",
        message: "This member already has a booking for that class date.",
      };
    }

    const effectiveCapacity = getEffectiveCapacity({
      capacityOverride: template.capacityOverride,
      roomCapacity: template.room.capacity,
    });

    if (effectiveCapacity === null) {
      return {
        status: "error",
        message: "This class does not use a capacity limit, so waitlist is unavailable.",
      };
    }

    const activeBookingCount = await countActiveOccurrenceBookings({
      workspaceId: args.workspaceId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: occurrence.dateString,
      db: tx,
      now,
    });

    if (activeBookingCount < effectiveCapacity) {
      return {
        status: "error",
        message: "Spots are available right now, so book the class instead.",
      };
    }

    const existingEntry = await tx.waitlistEntry.findFirst({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        classTemplateId: args.classTemplateId,
        scheduledForDate: occurrence.date,
      },
      select: {
        id: true,
        memberId: true,
        status: true,
        joinedAt: true,
        promotedAt: true,
        promotedBookingId: true,
        promotionHistory: true,
        member: {
          select: {
            fullName: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
    });

    if (existingEntry?.status === "ACTIVE") {
      return {
        status: "error",
        message: "This member is already on the waitlist for that class date.",
      };
    }

    if (existingEntry) {
      const entry = await tx.waitlistEntry.update({
        where: {
          id: existingEntry.id,
        },
        data: {
          status: "ACTIVE",
          joinedAt: now,
          promotedAt: null,
          promotedBookingId: null,
          autoPromotionOptedInAt: now,
          autoPromotionConsentUserId: args.consentUserId,
          autoPromotionPolicyVersion: WAITLIST_AUTO_PROMOTION_POLICY,
          schedulingPolicySnapshot: schedulingSnapshot,
          allowPunchCardFunding: args.allowPunchCardFunding === true,
          lastSkippedAt: null,
          lastSkipReason: null,
          promotionHistory: [...waitlistHistory(existingEntry), { kind: "OPT_IN", at: now.toISOString(), userId: args.consentUserId, allowPunchCardFunding: args.allowPunchCardFunding === true, policy: WAITLIST_AUTO_PROMOTION_POLICY, schedulingPolicyHash: schedulingSnapshot.policyHash, autoPromotionClosesAt: schedulingSnapshot.autoPromotionClosesAt }],
        },
        select: {
          id: true,
        },
      });

      return {
        status: "restored",
        waitlistEntryId: entry.id,
      };
    }

    const entry = await tx.waitlistEntry.create({
      data: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        classTemplateId: args.classTemplateId,
        scheduledForDate: dateOnlyStringToUtcDate(occurrence.dateString),
        status: "ACTIVE",
        joinedAt: now,
        autoPromotionOptedInAt: now,
        autoPromotionConsentUserId: args.consentUserId,
        autoPromotionPolicyVersion: WAITLIST_AUTO_PROMOTION_POLICY,
          schedulingPolicySnapshot: schedulingSnapshot,
        allowPunchCardFunding: args.allowPunchCardFunding === true,
        promotionHistory: [{ kind: "OPT_IN", at: now.toISOString(), userId: args.consentUserId, allowPunchCardFunding: args.allowPunchCardFunding === true, policy: WAITLIST_AUTO_PROMOTION_POLICY, schedulingPolicyHash: schedulingSnapshot.policyHash, autoPromotionClosesAt: schedulingSnapshot.autoPromotionClosesAt }],
      },
      select: {
        id: true,
      },
    });

    return {
      status: "joined",
      waitlistEntryId: entry.id,
    };
}

export async function joinWaitlist(args: {
  workspaceId: string;
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  source: "MEMBER_PORTAL";
  autoPromotionOptIn?: boolean;
  consentUserId?: string;
  allowPunchCardFunding?: boolean;
  db?: AccessDatabase;
  now?: Date;
}): Promise<
  | {
      status: "joined" | "restored";
      waitlistEntryId: string;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const db = args.db ?? accessDatabase;
  const now = args.now ?? new Date();
  if (!args.autoPromotionOptIn || !args.consentUserId) return { status: "error", message: "Agree to automatic promotion before joining the waitlist." };

  return db.$transaction(tx => joinWaitlistTx(tx, args, now));
}

async function leaveWaitlistTx(tx: AccessTransactionDatabase, args: Parameters<typeof leaveWaitlist>[0]): Promise<Awaited<ReturnType<typeof leaveWaitlist>>> {
  await lockClassSchedule(tx, args.workspaceId);
  const result = await tx.waitlistEntry.updateMany({
    where: {
      id: args.waitlistEntryId,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      status: "ACTIVE",
    },
    data: {
      status: "CANCELLED",
    },
  });

  if (result.count === 0) {
    return {
      status: "error" as const,
      message: "Waitlist entry not found.",
    };
  }

  return {
    status: "cancelled" as const,
    waitlistEntryId: args.waitlistEntryId,
  };
}

export async function leaveWaitlist(args: {
  workspaceId: string;
  memberId: string;
  waitlistEntryId: string;
  db?: AccessDatabase;
}): Promise<
  | {
      status: "cancelled";
      waitlistEntryId: string;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const db = args.db ?? accessDatabase;
  return db.$transaction(tx => leaveWaitlistTx(tx, args));
}

export async function removeWaitlistEntry(args: {
  workspaceId: string;
  waitlistEntryId: string;
  db?: AccessDatabase;
  authorize?: (tx: AccessTransactionDatabase) => Promise<boolean>;
}): Promise<
  | {
      status: "removed";
      waitlistEntryId: string;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const db = args.db ?? accessDatabase;
  return db.$transaction(async (tx) => {
  await lockClassSchedule(tx, args.workspaceId);
  if (args.authorize && !await args.authorize(tx)) return { status: "error" as const, message: "Class roster not found." };
  const result = await tx.waitlistEntry.updateMany({
    where: {
      id: args.waitlistEntryId,
      workspaceId: args.workspaceId,
      status: "ACTIVE",
    },
    data: {
      status: "CANCELLED",
    },
  });

  if (result.count === 0) {
    return {
      status: "error" as const,
      message: "Waitlist entry not found.",
    };
  }

  return {
    status: "removed" as const,
    waitlistEntryId: args.waitlistEntryId,
  };
  });
}

function waitlistHistory(entry: Pick<WaitlistSummaryRecord, "promotionHistory">): Prisma.InputJsonArray {
  return Array.isArray(entry.promotionHistory) ? entry.promotionHistory as Prisma.InputJsonArray : [];
}

async function waitlistConsentRecipients(tx: AccessTransactionDatabase, workspaceId: string, memberId: string, userId: string) {
  if (!tx.user || !tx.member) return null;
  // Permission changes use this same lock, so revocation and automatic booking
  // cannot commit across a stale guardian-authority check.
  await tx.$queryRawUnsafe?.("SELECT pg_advisory_xact_lock(hashtext($1))::text", `family-access:${workspaceId}`);
  const account = await tx.user.findFirst({ where: { id: userId, workspaceUsers: { some: { workspaceId, role: "CUSTOMER", isActive: true } } }, select: { email: true } });
  if (!account) return null;
  const recipients = await memberNotificationRecipients(tx as unknown as Prisma.TransactionClient, workspaceId, [memberId]);
  return recipients.some(person => person.email.toLowerCase() === account.email.toLowerCase()) ? recipients : null;
}

async function recordWaitlistSkip(tx: AccessTransactionDatabase, entry: WaitlistSummaryRecord, reason: string, now: Date) {
  const history = waitlistHistory(entry);
  await tx.waitlistEntry.update({ where: { id: entry.id }, data: {
    lastSkippedAt: now, lastSkipReason: reason,
    promotionHistory: entry.lastSkipReason === reason ? history : [...history, { kind: "SKIPPED", at: now.toISOString(), reason }],
  }, select: { id: true } });
}

type WaitlistPromotion = { status: "promoted"; waitlistEntryId: string; bookingId: string; bookingType: ClassBookingType };

/** Caller holds the workspace schedule lock. Seat, funding, queue and outbox commit together. */
async function promoteWaitlistTx(args: {
  workspaceId: string; classTemplateId: string; scheduledForDate: string; timezone: string;
  db: AccessTransactionDatabase; now: Date; maxPromotions: number;
}): Promise<{ promotions: WaitlistPromotion[]; message: string }> {
  const { db: tx, now } = args;
  const entries = await tx.waitlistEntry?.findMany({ where: { workspaceId: args.workspaceId, classTemplateId: args.classTemplateId, scheduledForDate: dateOnlyStringToUtcDate(args.scheduledForDate), status: "ACTIVE" }, include: { member: { select: { fullName: true, email: true, phone: true, status: true } } }, orderBy: [{ joinedAt: "asc" }, { id: "asc" }] }) ?? [];
  const promotions: WaitlistPromotion[] = [];
  if (!entries.length) return { promotions, message: "No eligible opted-in waitlisted member can take this place." };
  const template = await getActiveTemplate(args);
  args = { ...args, timezone: template?.timezone ?? args.timezone };
  const startsAt = template ? getOccurrenceStartsAt({ scheduledForDate: args.scheduledForDate, startTimeMinutes: template.startTimeMinutes, timezone: args.timezone }) : null;
  const cutoff = template && startsAt ? new Date(+startsAt - Math.max(template.bookingCutoffMinutes, template.cancellationCutoffMinutes) * 60_000) : null;
  if (!template || !cutoff || now >= cutoff) {
    const reason = !template ? "The class is unavailable or cancelled." : "Automatic promotion has closed before the booking or cancellation deadline.";
    for (const entry of entries) await recordWaitlistSkip(tx, entry, reason, now);
    return { promotions, message: reason };
  }
  const capacity = getEffectiveCapacity({ capacityOverride: template.capacityOverride, roomCapacity: template.room.capacity });
  if (capacity === null) return { promotions, message: "This class does not use a waitlist." };
  let occupied = await countActiveOccurrenceBookings({ ...args, db: tx });
  for (const entry of entries) {
    const existing = await tx.classBooking.findFirst({ where: { workspaceId: args.workspaceId, memberId: entry.memberId, classTemplateId: args.classTemplateId, scheduledForDate: dateOnlyStringToUtcDate(args.scheduledForDate), status: { not: "CANCELLED" } }, select: { id: true } });
    if (existing) {
      await recordWaitlistSkip(tx, entry, "An active booking already exists for this class date; this duplicate queue entry was closed.", now);
      await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "CANCELLED" }, select: { id: true } });
      continue;
    }
    if (occupied >= capacity || promotions.length >= args.maxPromotions) break;
    let reason: string | null = null;
    if (!entry.autoPromotionOptedInAt || !entry.autoPromotionConsentUserId || entry.autoPromotionPolicyVersion !== WAITLIST_AUTO_PROMOTION_POLICY) reason = "Automatic promotion needs a new member or guardian opt-in. This older entry has no recorded consent.";
    else if (!readSchedulingPolicySnapshot(entry.schedulingPolicySnapshot)?.autoPromotionClosesAt) reason = "Automatic promotion needs renewed consent to the current booking rules. This older entry has no scheduling deadline receipt.";
    else if (now >= new Date(readSchedulingPolicySnapshot(entry.schedulingPolicySnapshot)!.autoPromotionClosesAt!)) reason = "The automatic promotion deadline agreed when joining this queue has passed.";
    else if (readSchedulingPolicySnapshot(entry.schedulingPolicySnapshot)!.startsAt !== startsAt!.toISOString() || readSchedulingPolicySnapshot(entry.schedulingPolicySnapshot)!.endsAt !== getOccurrenceStartsAt({ scheduledForDate: args.scheduledForDate, startTimeMinutes: template.endTimeMinutes!, timezone: args.timezone }).toISOString() || readSchedulingPolicySnapshot(entry.schedulingPolicySnapshot)!.timezone !== args.timezone) reason = "The class time changed after this waitlist consent. Renew consent before automatic booking.";
    else if (!["ACTIVE", "TRIAL"].includes(entry.member.status)) reason = "The member is no longer active.";
    const recipients = !reason ? await waitlistConsentRecipients(tx, args.workspaceId, entry.memberId, entry.autoPromotionConsentUserId!) : null;
    if (!reason && !recipients) reason = "The consenting account no longer has verified booking authority for this member.";
    if (reason) { await recordWaitlistSkip(tx, entry, reason, now); continue; }
    let funding = await resolveBookingAccessForProgramWithDb({ ...args, memberId: entry.memberId, programId: template.programId, occurrenceStartsAt: startsAt!, allowDropIn: false });
    if (funding.type === "membership" && tx.membershipAllowanceAllocation) {
      const allowance = await prepareMembershipAllowance({ workspaceId: args.workspaceId, memberId: entry.memberId, membershipId: funding.membershipId, scheduledForDate: args.scheduledForDate, occurrenceStartsAt: startsAt!, timezone: args.timezone, db: tx as unknown as Prisma.TransactionClient });
      if ("error" in allowance || allowance.windows.some(window => window.remaining < 1)) {
        const pack = entry.allowPunchCardFunding && !("error" in allowance) ? await pickOldestEligiblePunchCard({ ...args, memberId: entry.memberId, programId: template.programId }) : null;
        if (pack) funding = { type: "punch_card", memberPunchCardId: pack.id, productName: pack.punchCardProduct.name };
        else reason = "error" in allowance ? allowance.error ?? "Membership access is unavailable." : "No membership allowance is available for this date; no authorized class-pack fallback is available.";
      }
    }
    if (funding.type === "none") reason = funding.message;
    if (funding.type === "punch_card" && !entry.allowPunchCardFunding) reason = "Using a paid class-pack unit was not authorized.";
    if (reason) { await recordWaitlistSkip(tx, entry, reason, now); continue; }
    const booking = await createAccessBackedBookingWithDb({ ...args, memberId: entry.memberId, source: "MEMBER_PORTAL", allowDropIn: false, fundingOverride: funding, skipWaitlistPriority: true });
    if (booking.status === "error") {
      if (booking.code === "FULL") break;
      await recordWaitlistSkip(tx, entry, booking.message, now);
      continue;
    }
    if (booking.status === "payment_required") throw new Error("Automatic promotion cannot create an unverified payment.");
    if (!tx.notificationJob) throw new Error("Waitlist promotion requires the durable notification outbox.");
    const history = waitlistHistory(entry);
    await tx.notificationJob.createMany({ data: recipients!.map(recipient => ({
      workspaceId: args.workspaceId, templateKind: "BOOKING_CONFIRMATION" as const,
      recipientEmail: recipient.email, recipientName: recipient.name,
      subject: "Your waitlist place is confirmed",
      body: `A place in ${template.title ?? template.program.name} on ${args.scheduledForDate} is confirmed. Sign in to your HitLink member portal to review the class time and cancellation rules.`,
      context: { kind: "CLASS_BOOKING", bookingId: booking.bookingId },
      dedupeKey: `waitlist:${entry.id}:${booking.bookingId}:${history.length}:${recipient.email.toLowerCase()}`,
      expiresAt: startsAt!, status: "PENDING" as const, nextAttemptAt: now,
    })), skipDuplicates: true });
    await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "PROMOTED", promotedAt: now, promotedBookingId: booking.bookingId, lastSkipReason: null, lastSkippedAt: null, promotionHistory: [...history, { kind: "PROMOTED", at: now.toISOString(), bookingId: booking.bookingId }] }, select: { id: true } });
    promotions.push({ status: "promoted", waitlistEntryId: entry.id, bookingId: booking.bookingId, bookingType: booking.bookingType });
    occupied++;
  }
  return { promotions, message: occupied >= capacity ? "No booking spot is available for promotion yet." : "No eligible opted-in waitlisted member can take this place. Skip reasons are recorded; their positions are kept." };
}

export async function promoteNextWaitlistEntry(args: {
  workspaceId: string; classTemplateId: string; scheduledForDate: string; timezone: string;
  source: ClassBookingSource; db?: AccessDatabase; now?: Date;
  authorize?: (tx: AccessTransactionDatabase) => Promise<boolean>;
}): Promise<WaitlistPromotion | { status: "error"; message: string }> {
  const db = args.db ?? accessDatabase;
  return db.$transaction(async tx => {
    await lockClassSchedule(tx, args.workspaceId);
    if (args.authorize && !await args.authorize(tx)) return { status: "error", message: "Class roster not found." };
    const result = await promoteWaitlistTx({ ...args, db: tx, now: args.now ?? new Date(), maxPromotions: 1 });
    return result.promotions[0] ?? { status: "error", message: result.message };
  });
}

/** Recover expired payment holds and missed releases, paging through every dated queue. */
export async function processWorkspaceWaitlists(workspaceId: string, now = new Date(), db = prisma) {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { location: { select: { timezone: true } } } });
  if (!workspace?.location) return { promoted: 0 };
  let promoted = 0;
  const clockTimezone = await resolveWorkspaceClockTimezone({ workspaceId, baselineTimezone: workspace.location.timezone, now, db });
  const fromDate = dateOnlyStringToUtcDate(getWorkspaceDateString(now, clockTimezone));
  let cursor: { scheduledForDate: Date; classTemplateId: string } | undefined;
  while (true) {
    const entries = await db.waitlistEntry.findMany({ where: { workspaceId, status: "ACTIVE", scheduledForDate: { gte: fromDate }, ...(cursor ? { OR: [{ scheduledForDate: { gt: cursor.scheduledForDate } }, { scheduledForDate: cursor.scheduledForDate, classTemplateId: { gt: cursor.classTemplateId } }] } : {}) }, distinct: ["classTemplateId", "scheduledForDate"], orderBy: [{ scheduledForDate: "asc" }, { classTemplateId: "asc" }], take: 100, select: { classTemplateId: true, scheduledForDate: true } });
    for (const entry of entries) promoted += await db.$transaction(async tx => {
      await lockClassSchedule(tx, workspaceId);
      const result = await promoteWaitlistTx({ workspaceId, classTemplateId: entry.classTemplateId, scheduledForDate: toDateOnlyString(entry.scheduledForDate), timezone: workspace.location!.timezone, db: tx as unknown as AccessTransactionDatabase, now, maxPromotions: Number.MAX_SAFE_INTEGER });
      return result.promotions.length;
    });
    if (entries.length < 100) break;
    cursor = entries.at(-1)!;
  }
  return { promoted };
}

export async function finalizeDropInBookingPayment(args: {
  workspaceId: string; bookingId: string; checkoutSessionId: string; amountCents: number; currency: string;
  paymentIntentId?: string | null; expiresAt?: Date | null; db?: AccessDatabase; now?: Date;
}): Promise<"booked" | "already_booked" | "missing" | "review_required"> {
  const db = args.db ?? accessDatabase, now = args.now ?? new Date();
  return db.$transaction(async (transaction) => {
    await lockClassSchedule(transaction, args.workspaceId);
    const tx = transaction as unknown as Prisma.TransactionClient;
    const booking = await tx.classBooking.findFirst({ where: { id: args.bookingId, workspaceId: args.workspaceId }, include: { classTemplate: { include: classOccurrenceInclude }, workspace: { select: { location: { select: { timezone: true } } } } } });
    if (!booking) return "missing";
    const matchesPayment = booking.bookingType === "DROP_IN" && booking.dropInCheckoutSessionId === args.checkoutSessionId && Boolean(args.checkoutSessionId) && Number.isSafeInteger(args.amountCents) && args.amountCents > 0 && booking.dropInPriceCents === args.amountCents && booking.dropInCurrency?.toLowerCase() === args.currency.toLowerCase();
    if (!matchesPayment) return "review_required";
    if (["BOOKED", "ATTENDED", "ABSENT", "NO_SHOW"].includes(booking.status) && booking.dropInPaidAt) return "already_booked";
    if (booking.status === "CANCELLED" && booking.dropInPaidAt && await tx.classBooking.count({ where: { workspaceId: args.workspaceId, fundedByBookingId: booking.id } })) return "already_booked";
    if (booking.status !== "PENDING_PAYMENT" || !booking.pendingPaymentExpiresAt || booking.pendingPaymentExpiresAt <= now) return "review_required";
    const date = toDateOnlyString(booking.scheduledForDate);
    const occurrence = resolveClassOccurrence({ template: booking.classTemplate as unknown as ClassOccurrenceTemplate, scheduledForDate: date });
    const timezone = occurrence?.timezone ?? booking.workspace.location?.timezone;
    if (!occurrence || occurrence.status !== "ACTIVE" || booking.classTemplate.archivedAt || occurrence.program.archivedAt || occurrence.room.archivedAt || !timezone || getOccurrenceStartsAt({ scheduledForDate: date, startTimeMinutes: occurrence.startTimeMinutes, timezone }) <= now) return "review_required";
    const seats = await countActiveOccurrenceBookings({ workspaceId: args.workspaceId, classTemplateId: booking.classTemplateId, scheduledForDate: date, db: tx as unknown as CountActiveOccurrenceBookingsDatabase, now });
    if (occurrence.effectiveCapacity !== null && seats > occurrence.effectiveCapacity) return "review_required";
    await tx.classBooking.update({ where: { id: booking.id }, data: { status: "BOOKED", dropInPaymentIntentId: cleanNullable(args.paymentIntentId), dropInPaidAt: now, pendingPaymentExpiresAt: null } });
    await enqueueClassBookingConfirmationTx(tx, { workspaceId: args.workspaceId, bookingId: booking.id, now });
    return "booked";
  });
}

export async function expireDropInBookingPayment(args: {
  workspaceId: string;
  bookingId: string;
  checkoutSessionId: string;
  db?: AccessDatabase;
}): Promise<"cancelled" | "missing"> {
  const db = args.db ?? accessDatabase;
  return db.$transaction(async (tx) => {
  await lockClassSchedule(tx, args.workspaceId);
  const result = await tx.classBooking.updateMany({
    where: {
      id: args.bookingId,
      workspaceId: args.workspaceId,
      status: "PENDING_PAYMENT",
      dropInCheckoutSessionId: args.checkoutSessionId,
    },
    data: {
      status: "CANCELLED",
      pendingPaymentExpiresAt: null,
    },
  });

  return result.count > 0 ? "cancelled" : "missing";
  });
}

export async function finalizePunchCardCheckoutPurchase(args: {
  workspaceId: string; memberId: string; punchCardProductId: string; originalPunches: number; priceCents: number;
  currency: string; checkoutSessionId: string; acceptedTerms?: unknown; db?: AccessDatabase; now?: Date;
}): Promise<{ status: "created" | "already_exists" | "review_required"; memberPunchCardId: string | null }> {
  const db = args.db ?? accessDatabase, now = args.now ?? new Date();
  if (!Number.isSafeInteger(args.originalPunches) || args.originalPunches <= 0 || !Number.isSafeInteger(args.priceCents) || args.priceCents <= 0 || !/^[a-z]{3}$/i.test(args.currency) || !args.checkoutSessionId.trim()) return { status: "review_required", memberPunchCardId: null };
  return db.$transaction(async (transaction) => {
    await lockClassSchedule(transaction, args.workspaceId);
    const tx = transaction as unknown as Prisma.TransactionClient;
    // Session lock also serializes a replay carrying a different workspace.
    await tx.$queryRawUnsafe?.("SELECT pg_advisory_xact_lock(hashtext($1))::text", `punch-checkout:${args.checkoutSessionId}`);
    const existing = await tx.memberPunchCard.findFirst({ where: { stripeCheckoutSessionId: args.checkoutSessionId } });
    if (existing) {
      const givenTerms = readPunchCardTerms(args.acceptedTerms), storedTerms = readPunchCardTerms(existing.acceptedTerms);
      const sameTerms = args.acceptedTerms === undefined || (!!givenTerms && !!storedTerms && givenTerms.version === storedTerms.version && givenTerms.restrictionMode === storedTerms.restrictionMode && givenTerms.lateCancellationConsumesPunch === storedTerms.lateCancellationConsumesPunch && givenTerms.noShowConsumesPunch === storedTerms.noShowConsumesPunch && JSON.stringify([...givenTerms.programIds].sort()) === JSON.stringify([...storedTerms.programIds].sort()));
      const matches = sameTerms && existing.workspaceId === args.workspaceId && existing.memberId === args.memberId && existing.punchCardProductId === args.punchCardProductId && existing.originalPunches === args.originalPunches && existing.purchasePriceCents === args.priceCents && existing.purchaseCurrency.toLowerCase() === args.currency.toLowerCase();
      return { status: matches ? "already_exists" : "review_required", memberPunchCardId: matches ? existing.id : null };
    }
    const member = await tx.member.findFirst({ where: { id: args.memberId, workspaceId: args.workspaceId, archivedAt: null }, select: { id: true } });
    const product = await tx.punchCardProduct.findFirst({ where: { id: args.punchCardProductId, workspaceId: args.workspaceId }, include: { programRestrictions: true } });
    if (!member || !product) return { status: "review_required", memberPunchCardId: null };
    const terms = readPunchCardTerms(args.acceptedTerms);
    if (args.acceptedTerms !== undefined && (!terms || terms.priceCents !== args.priceCents || terms.originalPunches !== args.originalPunches || terms.currency.toLowerCase() !== args.currency.toLowerCase())) return { status: "review_required", memberPunchCardId: null };
    if (!terms) return { status: "review_required", memberPunchCardId: null };
    const accepted = terms;
    const record = await tx.memberPunchCard.create({ data: { workspaceId: args.workspaceId, memberId: args.memberId, punchCardProductId: args.punchCardProductId, originalPunches: args.originalPunches, remainingPunches: args.originalPunches, status: "ACTIVE", purchasePriceCents: args.priceCents, purchaseCurrency: args.currency.toLowerCase(), purchasedAt: now, stripeCheckoutSessionId: args.checkoutSessionId, acceptedTerms: JSON.parse(JSON.stringify(accepted)) }, select: { id: true } });
    if (transaction.punchCardEntry) await tx.punchCardEntry.create({ data: { workspaceId: args.workspaceId, memberId: args.memberId, memberPunchCardId: record.id, operationKey: `purchase:${args.checkoutSessionId}`, delta: args.originalPunches, reason: "Paid pack purchase" } });
    return { status: "created", memberPunchCardId: record.id };
  });
}


const formRecoveryCapability = Symbol("validated form recovery");
class BookingMoveFailure extends Error {}
/** A move is one transaction: failure restores the original reservation and every funding hold. */
async function moveAccessBackedBookingTx(tx: Prisma.TransactionClient, args: Parameters<typeof moveAccessBackedBooking>[0], now: Date, mutationId: string, formRecovery?: { capability: typeof formRecoveryCapability; recoveryId: string; bookingId: string; fundingRevision: number }) {
      await lockClassSchedule(tx, args.workspaceId);
      const prior = await tx.classBookingMove.findFirst({ where: { id: mutationId, workspaceId: args.workspaceId, memberId: args.memberId, originalBookingId: args.bookingId } });
      if (prior) return { status: "moved" as const, bookingId: prior.targetBookingId };
      const original = await tx.classBooking.findFirst({ where: { id: args.bookingId, workspaceId: args.workspaceId, memberId: args.memberId }, include: { classTemplate: { include: classOccurrenceInclude }, fundingMembership: { include: { sourceBillingEvidence: true, billingState: true } } } });
      if (!original || original.status !== "BOOKED") throw new BookingMoveFailure("This booking can no longer be moved. Refresh your classes.");
      const providerFormsWaiver = formRecovery?.capability === formRecoveryCapability && formRecovery.bookingId === original.id && formRecovery.fundingRevision === original.fundingRevision;
      if (formRecovery && !providerFormsWaiver) throw new BookingMoveFailure("The form recovery commitment changed. Refresh before moving it.");
      const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "BOOKING", targetId: original.id }, { targetKind: "BOOKING", targetId: original.fundedByBookingId }, { targetKind: "PUNCH_CARD", targetId: original.memberPunchCardId }, { targetKind: "MEMBERSHIP", targetId: original.fundingMembershipId }], db: tx });
      if (held) throw new BookingMoveFailure(held);
      if (original.classTemplateId === args.targetClassTemplateId && toDateOnlyString(original.scheduledForDate) === args.targetDate) throw new BookingMoveFailure("Choose a different class.");
      const oldOccurrence = resolveClassOccurrence({ template: original.classTemplate as unknown as ClassOccurrenceTemplate, scheduledForDate: toDateOnlyString(original.scheduledForDate) });
      const target = await getActiveTemplate({ timezone: args.timezone, workspaceId: args.workspaceId, classTemplateId: args.targetClassTemplateId, scheduledForDate: args.targetDate, db: tx as unknown as AccessTransactionDatabase });
      if (!oldOccurrence || oldOccurrence.status === "CANCELLED" || !target) throw new BookingMoveFailure("A class changed. Refresh your classes before moving this booking.");
      if (!providerFormsWaiver && getOccurrenceStartsAt({ scheduledForDate: toDateOnlyString(original.scheduledForDate), startTimeMinutes: oldOccurrence.startTimeMinutes, timezone: oldOccurrence.timezone ?? args.timezone }) <= now) throw new BookingMoveFailure("A class that has started cannot be moved.");
      const late = !providerFormsWaiver && !original.providerChangedAt && isPastCancellationCutoff({ scheduledForDate: toDateOnlyString(original.scheduledForDate), startTimeMinutes: oldOccurrence.startTimeMinutes, cancellationCutoffMinutes: oldOccurrence.cancellationCutoffMinutes, timezone: oldOccurrence.timezone ?? args.timezone, now });
      let fundingOverride: AccessResolution | undefined;
      let paidFundingBookingId: string | null = null;
      if (original.bookingType === "MEMBERSHIP") {
        const membership = original.fundingMembership ?? await getCurrentMembership({ workspaceId: args.workspaceId, memberId: args.memberId, db: tx as unknown as AccessTransactionDatabase });
        if (!membership || !membershipCanFundDate(membership, args.targetDate, now)) throw new BookingMoveFailure("This membership is no longer available for a new class.");
        const terms = readAcceptedMembershipTerms(original.acceptedPolicy ?? membership.acceptedTerms);
        if (terms?.programIds.length && !terms.programIds.includes(target.programId)) throw new BookingMoveFailure("This membership does not cover the new class.");
        fundingOverride = { type: "membership", membershipId: membership.id };
        await settleMembershipAllowance({ workspaceId: args.workspaceId, bookingId: original.id, outcome: late ? "LATE_CANCEL" : "TIMELY_CANCEL", db: tx });
      } else if (original.bookingType === "PUNCH_CARD") {
        if (!original.memberPunchCardId) throw new BookingMoveFailure("The booking's punch card is missing. Ask the gym for help.");
        fundingOverride = { type: "punch_card", memberPunchCardId: original.memberPunchCardId, productName: "Punch card" };
        const settled = await settlePunchCardBooking({ workspaceId: args.workspaceId, bookingId: original.id, outcome: late ? "LATE_CANCEL" : "TIMELY_CANCEL", db: tx });
        if (!settled.ok) throw new BookingMoveFailure(settled.message);
      } else if (original.bookingType === "DROP_IN") {
        if (late) throw new BookingMoveFailure("This late change needs a separate drop-in purchase. Your original booking is unchanged.");
        const funding = original.fundedByBookingId ? await tx.classBooking.findFirst({ where: { id: original.fundedByBookingId, workspaceId: args.workspaceId, memberId: args.memberId } }) : original;
        if (!funding?.dropInPaidAt || !funding.dropInProductId || !funding.dropInPriceCents || !funding.dropInCurrency) throw new BookingMoveFailure("This booking's payment is not confirmed.");
        const product = await tx.dropInProduct.findFirst({ where: { id: funding.dropInProductId, workspaceId: args.workspaceId }, include: { programRestrictions: true } });
        if (!product || !isProgramAllowed({ programId: target.programId, restrictionMode: product.restrictionMode, restrictions: product.programRestrictions })) throw new BookingMoveFailure("The paid drop-in does not cover this class.");
        paidFundingBookingId = funding.id;
        fundingOverride = { type: "drop_in", dropInProductId: product.id, productName: product.name, priceCents: funding.dropInPriceCents, currency: funding.dropInCurrency };
      }
      await tx.classBooking.update({ where: { id: original.id }, data: { status: "CANCELLED", ...(!late ? { consumedPunchCount: 0 } : {}) } });
      const result = await createAccessBackedBookingWithDb({ workspaceId: args.workspaceId, memberId: args.memberId, guardianId: original.guardianId, classTemplateId: args.targetClassTemplateId, scheduledForDate: args.targetDate, timezone: args.timezone, source: "MEMBER_PORTAL", allowDropIn: Boolean(paidFundingBookingId), trial: original.bookingType === "TRIAL", fundingOverride, punchCardOverrideId: original.memberPunchCardId ?? undefined, db: tx as unknown as AccessTransactionDatabase, now });
      if (result.status === "error") throw new BookingMoveFailure(result.message);
      if (result.status === "payment_required" && !paidFundingBookingId) throw new BookingMoveFailure("This move needs a separate purchase. Your original booking is unchanged.");
      if (paidFundingBookingId) {
        await tx.classBooking.update({ where: { id: result.bookingId }, data: { status: "BOOKED", fundedByBookingId: paidFundingBookingId, pendingPaymentExpiresAt: null } });
        await enqueueClassBookingConfirmationTx(tx, { workspaceId: args.workspaceId, bookingId: result.bookingId, now });
      }
      await tx.classBookingMove.create({ data: { id: mutationId, workspaceId: args.workspaceId, memberId: args.memberId, originalBookingId: original.id, targetBookingId: result.bookingId, lateCancellation: late } });
      await promoteWaitlistTx({ workspaceId: args.workspaceId, classTemplateId: original.classTemplateId, scheduledForDate: toDateOnlyString(original.scheduledForDate), timezone: args.timezone, db: tx as unknown as AccessTransactionDatabase, now, maxPromotions: Number.MAX_SAFE_INTEGER });
      return { status: "moved" as const, bookingId: result.bookingId };
}

export async function moveAccessBackedBooking(args: {
  workspaceId: string; memberId: string; bookingId: string; targetClassTemplateId: string; targetDate: string;
  timezone: string; mutationId?: string; db?: AccessDatabase; now?: Date;
}): Promise<{ status: "moved"; bookingId: string } | { status: "error"; message: string }> {
  const db = (args.db ?? prisma) as unknown as Prisma.TransactionClient & Pick<typeof prisma, "$transaction">;
  const now = args.now ?? new Date();
  const mutationId = args.mutationId ?? crypto.randomUUID();
  if (!/^[\da-f-]{36}$/i.test(mutationId)) return { status: "error", message: "Refresh the booking before moving it." };
  try {
    return await db.$transaction(tx => moveAccessBackedBookingTx(tx, args, now, mutationId));
  } catch (error) {
    if (error instanceof BookingMoveFailure) return { status: "error", message: error.message };
    throw error;
  }
}

export async function resolveBookingFormRecovery(args: {
  workspaceId: string; actorUserId: string; recoveryId: string; expectedVersion: number;
  choice: "CANCEL" | "REBOOK" | "REFUND_REVIEW" | "KEEP_BOOKING";
  targetClassTemplateId?: string; targetDate?: string; operationId: string;
  db?: PrismaClient; now?: Date;
}): Promise<{ status: "cancelled" | "moved" | "refund_review" | "retained"; bookingId: string; recoveryId: string; targetBookingId?: string } | { status: "error"; message: string }> {
  const db = args.db ?? prisma, now = args.now ?? new Date();
  if (!/^[\da-f-]{36}$/i.test(args.operationId) || !["CANCEL", "REBOOK", "REFUND_REVIEW", "KEEP_BOOKING"].includes(args.choice)) return { status: "error", message: "Reload the recovery before choosing a remedy." };
  const inputHash = formEvidenceHash({ recoveryId: args.recoveryId, expectedVersion: args.expectedVersion, choice: args.choice, targetClassTemplateId: args.targetClassTemplateId ?? null, targetDate: args.targetDate ?? null });
  try {
    return await formRequirementTransaction(db, async tx => {
      await lockClassSchedule(tx, args.workspaceId);
      // Actor/grant authority is rechecked before replay; a revoked caller cannot
      // use a formerly authorized idempotency key as continued booking access.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${args.workspaceId}`}))`;
      const prior = await tx.workspaceDataEvent.findFirst({ where: { workspaceId: args.workspaceId, kind: "FORM_RECOVERY_COMMAND", metadata: { path: ["operationId"], equals: args.operationId } } });
      const prepared = await requireBookingFormRecoveryTx(tx, { ...args, now, allowResolvedReplay: !!prior });
      const booking = prepared.booking;
      if (prior) {
        const metadata = prior.metadata as Prisma.JsonObject;
        if (prior.actorUserId !== args.actorUserId || metadata.inputHash !== inputHash) throw new FormRequirementError("This recovery request changed. Reload its current details.");
        return metadata.result as unknown as { status: "cancelled" | "moved" | "refund_review" | "retained"; bookingId: string; recoveryId: string; targetBookingId?: string };
      }
      const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "BOOKING", targetId: booking.id }, { targetKind: "BOOKING", targetId: booking.fundedByBookingId }, { targetKind: "MEMBERSHIP", targetId: booking.fundingMembershipId }, { targetKind: "PUNCH_CARD", targetId: booking.memberPunchCardId }], db: tx });
      if (held) throw new FormRequirementError(held);
      let targetBookingId: string | undefined;
      if (args.choice === "KEEP_BOOKING") {
        const decision = await evaluateBookingFormsTx(tx, { workspaceId: args.workspaceId, bookingId: booking.id, serviceAt: prepared.serviceAt, now, state: "PRESENT" });
        if (decision.kind !== "CLEAR") throw new FormRequirementError("Complete the exact required forms before confirming that you will keep this booking.");
      } else if (args.choice === "REBOOK") {
        if (!args.targetClassTemplateId || !args.targetDate) throw new FormRequirementError("Choose an available replacement class.");
        const moved = await moveAccessBackedBookingTx(tx, { workspaceId: args.workspaceId, memberId: booking.memberId, bookingId: booking.id, targetClassTemplateId: args.targetClassTemplateId, targetDate: args.targetDate, timezone: prepared.timezone }, now, args.operationId, { capability: formRecoveryCapability, recoveryId: prepared.recovery.id, bookingId: booking.id, fundingRevision: booking.fundingRevision });
        targetBookingId = moved.bookingId;
      } else {
        // Provider recovery releases the original reservation/allocation. It does
        // not mint a new period's allowance, credit balance or provider refund.
        const updated = await tx.classBooking.updateMany({ where: { id: booking.id, workspaceId: args.workspaceId, fundingRevision: booking.fundingRevision, status: booking.status }, data: { status: "CANCELLED", pendingPaymentExpiresAt: null } });
        if (updated.count !== 1) throw new FormRequirementError("The booking changed. Refresh its current state.");
        await settleMembershipAllowance({ workspaceId: args.workspaceId, bookingId: booking.id, outcome: "EXCUSED", db: tx });
        const pack = await settlePunchCardBooking({ workspaceId: args.workspaceId, bookingId: booking.id, outcome: "EXCUSED", db: tx });
        if (!pack.ok) throw new FormRequirementError(pack.message);
        await promoteWaitlistTx({ workspaceId: args.workspaceId, classTemplateId: booking.classTemplateId, scheduledForDate: toDateOnlyString(booking.scheduledForDate), timezone: prepared.timezone, db: tx as unknown as AccessTransactionDatabase, now, maxPromotions: Number.MAX_SAFE_INTEGER });
      }
      const recoveries = await tx.bookingFormRecovery.findMany({ where: { workspaceId: args.workspaceId, bookingId: booking.id, bookingFundingRevision: booking.fundingRevision, state: "OPEN" } });
      for (const recovery of recoveries) {
        if (args.choice === "REFUND_REVIEW" && recovery.id === prepared.recovery.id) {
          await openFormRefundReviewTx(tx, { workspaceId: args.workspaceId, recoveryId: recovery.id, expectedVersion: recovery.version, actorUserId: args.actorUserId, now });
        } else await transitionBookingFormRecoveryTx(tx, { workspaceId: args.workspaceId, recoveryId: recovery.id, expectedVersion: recovery.version, actorUserId: args.actorUserId, choice: args.choice === "KEEP_BOOKING" ? "SIGNED" : args.choice === "REBOOK" ? "REBOOK" : "CANCEL", replacementBookingId: targetBookingId, now });
      }
      const result = { status: args.choice === "KEEP_BOOKING" ? "retained" as const : args.choice === "REBOOK" ? "moved" as const : args.choice === "REFUND_REVIEW" ? "refund_review" as const : "cancelled" as const, bookingId: booking.id, recoveryId: prepared.recovery.id, ...(targetBookingId ? { targetBookingId } : {}) };
      await tx.workspaceDataEvent.create({ data: { workspaceId: args.workspaceId, actorUserId: args.actorUserId, kind: "FORM_RECOVERY_COMMAND", metadata: { operationId: args.operationId, inputHash, recoveryId: prepared.recovery.id, result } } });
      return result;
    });
  } catch (error) {
    if (error instanceof FormRequirementError || error instanceof BookingMoveFailure) return { status: "error", message: error.message };
    throw error;
  }
}

/** The verified public registration transaction owns the schedule lock and identity checks. */
export async function createVerifiedTrialBookingTx(args: { workspaceId: string; memberId: string; guardianId?: string | null; classTemplateId: string; scheduledForDate: string; timezone: string; db: Prisma.TransactionClient; now: Date }): Promise<CreateAccessBackedBookingResult> {
  return createAccessBackedBookingWithDb({ ...args, source: "PUBLIC_TRIAL", trial: true, allowDropIn: false, db: args.db as unknown as AccessTransactionDatabase });
}

/** Only the authorized staging importer calls this inside its locked transaction. Funding is explicit. */
export async function createImportedClassBookingTx(args: {
  workspaceId: string; memberId: string; guardianId?: string | null; classTemplateId: string;
  scheduledForDate: string; timezone: string; db: Prisma.TransactionClient; now: Date;
  sourceProof: { stagingRecordId: string; importJobId: string; sourceRowHash: string; actorId: string };
  funding: { type: "MEMBERSHIP" | "PUNCH_CARD" | "TRIAL" | "SOURCE_PAYMENT"; id?: string; productId?: string; amountCents?: number; currency?: string };
}): Promise<CreateAccessBackedBookingResult> {
  const reject = (message: string): CreateAccessBackedBookingResult => ({ status: "error", code: "NO_ACCESS", message });
  const workspace = await args.db.workspace.findUnique({ where: { id: args.workspaceId }, include: { migration: true } });
  if (!workspace || workspace.status === "ACTIVE" || !workspace.migration || workspace.migration.stage === "COMPLETE" || workspace.migration.ownerReviewAcknowledgedAt) return reject("Import reservations only while the workspace is in reviewed staging.");
  const proof = args.sourceProof;
  const row = proof && await args.db.stagingRecord.findFirst({ where: { id: proof.stagingRecordId, workspaceId: args.workspaceId, importJobId: proof.importJobId, recordKind: "FUTURE_BOOKING", isReadyForImport: true }, include: { importSourceFile: true, importJob: true } });
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)])) : value;
  if (!row?.importSourceFile?.fileSha256 || row.importSourceFile.workspaceId !== args.workspaceId || row.importSourceFile.importJobId !== proof.importJobId || createHash("sha256").update(JSON.stringify(canonical(row.mappedData))).digest("hex") !== proof.sourceRowHash || !proof.actorId.trim() || row.importJob.status !== "IMPORTING") return reject("The reviewed source row, checksum and claimed staging import are required.");
  const mapped = row.mappedData && typeof row.mappedData === "object" && !Array.isArray(row.mappedData) ? row.mappedData : {};
  const binding = async (kind: "MEMBER" | "SCHEDULE_TEMPLATE" | "GUARDIAN", externalId: unknown, model: string, targetId: string | null | undefined) => typeof externalId === "string" && !!targetId && !!await args.db.migrationImportedRecord.findFirst({ where: { workspaceId: args.workspaceId, recordKind: kind, externalId, importedModel: model, importedRecordId: targetId } });
  if (mapped.scheduledForDate !== args.scheduledForDate || !await binding("MEMBER", mapped.memberExternalId, "Member", args.memberId) || !await binding("SCHEDULE_TEMPLATE", mapped.templateExternalId, "ClassTemplate", args.classTemplateId) || (mapped.guardianExternalId ? !await binding("GUARDIAN", mapped.guardianExternalId, "Guardian", args.guardianId) : !!args.guardianId)) return reject("The destination participant, class date and guardian must match the exact reviewed source row.");
  const template = await getActiveTemplate({ ...args, db: args.db as unknown as AccessTransactionDatabase });
  if (!template || getOccurrenceStartsAt({ scheduledForDate: args.scheduledForDate, startTimeMinutes: template.startTimeMinutes, timezone: template.timezone ?? args.timezone }) <= args.now) return reject("The source reservation must be for an active future class.");
  if (await args.db.classBooking.findFirst({ where: { workspaceId: args.workspaceId, memberId: args.memberId, classTemplateId: args.classTemplateId, scheduledForDate: dateOnlyStringToUtcDate(args.scheduledForDate) } })) return reject("A destination booking already exists. Reconcile its source identity; do not recreate or overwrite it.");
  let fundingOverride: AccessResolution | undefined;
  if (args.funding.type === "MEMBERSHIP") {
    const membership = await getCurrentMembership({ ...args, db: args.db as unknown as AccessTransactionDatabase });
    if (!membership || membership.id !== args.funding.id || !membershipCanFundDate(membership, args.scheduledForDate, args.now) || !isMembershipProgramAllowed({ programId: template.programId, membership })) return reject("The named source contract does not cover this participant, program and class date.");
    fundingOverride = { type: "membership", membershipId: membership.id };
  } else if (args.funding.type === "PUNCH_CARD") {
    if (!args.funding.id) return reject("Name the source class pack funding this reservation.");
    fundingOverride = { type: "punch_card", memberPunchCardId: args.funding.id, productName: "Imported pack" };
  } else if(args.funding.type === "SOURCE_PAYMENT") {
    const product=await args.db.dropInProduct.findFirst({where:{id:args.funding.productId ?? "",workspaceId:args.workspaceId},include:{programRestrictions:true}});
    const evidence=await args.db.importedFinancialEvidence.findFirst({where:{id:args.funding.id ?? "",workspaceId:args.workspaceId,beneficiaryMemberId:args.memberId,sourceRecordKind:"PAYMENT",sourceStatus:"SUCCEEDED",billingOwner:"SOURCE",refundOwner:"SOURCE"}});
    if(!evidence || !product || !isProgramAllowed({programId:template.programId,restrictionMode:product.restrictionMode,restrictions:product.programRestrictions}) || !args.funding.amountCents || args.funding.amountCents<=0 || evidence.currency!==args.funding.currency) return reject("The mapped source payment and drop-in product do not cover this class.");
    const allocated=await args.db.importedBookingFunding.aggregate({where:{workspaceId:args.workspaceId,evidenceId:evidence.id},_sum:{amountCents:true}});
    if((allocated._sum.amountCents??0)+args.funding.amountCents>evidence.paidCents-evidence.refundedCents) return reject("Source paid funding is already allocated.");
    fundingOverride={type:"drop_in",dropInProductId:product.id,productName:product.name,priceCents:args.funding.amountCents,currency:args.funding.currency!};
  } else if (await args.db.classBooking.findFirst({ where: { workspaceId: args.workspaceId, memberId: args.memberId, bookingType: "TRIAL", status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] }, classTemplate: { programId: template.programId } } })) return reject("The participant already has a trial in this program. Review the source reservation.");
  const policyCheck = evaluateClassSchedulingPolicy({ revision: await readClassSchedulingPolicy(args.db, args.workspaceId, args.now), date: args.scheduledForDate, timezone: template.timezone ?? args.timezone, startTimeMinutes: template.startTimeMinutes, endTimeMinutes: template.endTimeMinutes!, bookingCutoffMinutes: template.bookingCutoffMinutes, now: args.now });
  if (!policyCheck.allowed) await args.db.validationIssue.create({ data: { workspaceId: args.workspaceId, importJobId: proof.importJobId, stagingRecordId: proof.stagingRecordId, severity: "WARNING", code: "SOURCE_SCHEDULING_POLICY_REVIEW", fieldName: "scheduledForDate", message: "The proven source reservation was retained outside the current class booking rules. Review its date and delivery commitment before go-live." } });
  return createAccessBackedBookingWithDb({ ...args, sourceRestoration: { sourceRowHash: proof.sourceRowHash }, source: "ADMIN", trial: args.funding.type === "TRIAL", allowDropIn: args.funding.type === "SOURCE_PAYMENT", fundingOverride, punchCardOverrideId: args.funding.type === "PUNCH_CARD" ? args.funding.id : undefined, db: args.db as unknown as AccessTransactionDatabase });
}

export class OwnerLateBookingError extends Error {}
export interface OwnerLateBookingInput {
  memberId: string;
  guardianId?: string | null;
  classTemplateId: string;
  scheduledForDate: string;
  bookingType: "ACCESS" | "TRIAL";
  reason: string;
  operationId: string;
}
export interface OwnerLateBookingReview {
  previewHash: string;
  memberId: string;
  memberName: string;
  classTemplateId: string;
  title: string;
  scheduledForDate: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  normalClosesAt: string;
  policyRevisionId: string;
  policyVersion: number;
  policyHash: string;
  capacity: number | null;
  occupied: number;
  fundingLabel: string;
  fundingDetail: string;
  queuedEntryCount: number;
  notificationRecipientCount: number;
}
type LateActor = { workspaceId: string; userId: string };
function lateFail(message: string): never {
  throw new OwnerLateBookingError(message);
}
const lateHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function lateInput(input: OwnerLateBookingInput): OwnerLateBookingInput {
  const result = {
    ...input,
    memberId: input.memberId.trim(),
    guardianId: input.guardianId?.trim() || null,
    classTemplateId: input.classTemplateId.trim(),
    scheduledForDate: input.scheduledForDate.trim(),
    reason: input.reason.trim(),
  };
  if (
    !result.memberId ||
    !result.classTemplateId ||
    !["ACCESS", "TRIAL"].includes(result.bookingType) ||
    !/^[A-Za-z0-9:_-]{16,150}$/.test(result.operationId) ||
    result.reason.length < 5 ||
    result.reason.length > 500 ||
    Array.from(result.reason).some((c) => c.charCodeAt(0) < 32)
  )
    lateFail(
      "Select the person and class date, and explain the exception using 5 to 500 characters. Reload before retrying an expired request.",
    );
  return result;
}
async function lateOwner(tx: Prisma.TransactionClient, actor: LateActor) {
  await lockStaffAuthorityTx(tx, actor);
  const owner = await tx.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      role: "OWNER",
      isActive: true,
    },
    include: {
      workspace: {
        include: { location: true, migration: true, setupActivation: true },
      },
    },
  });
  const workspace = owner?.workspace;
  if (
    !owner ||
    !workspace?.location ||
    !isWorkspaceOperationallyReady({
      workspaceStatus: workspace.status,
      setupActivation: workspace.setupActivation,
      migrationStage: workspace.migration?.stage,
      ownerReviewAcknowledgedAt: workspace.migration?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId:
        workspace.migration?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: workspace.migration?.operationallyReadyAt,
      operationallyReadyByUserId:
        workspace.migration?.operationallyReadyByUserId,
    })
  )
    lateFail(
      "Only the current active owner of an operational business can confirm a late booking.",
    );
  return owner!;
}
type LateReplayWitness = {
  workspaceId: string;
  actorUserId: string;
  operationId: string;
  receiptId: string;
  inputHash: string;
};
/** Shared inert parsing; this command retains its exact constraints and replay witness. */
function ownerLateRetryConflict(
  error: unknown,
): "SERIALIZATION" | "BOOKING_UNIQUE" | "RECEIPT_UNIQUE" | null {
  const failure = readDatabaseFailure(error);
  if (!failure || (failure.target && failure.target.length > 4)) return null;
  if (failure.code === "P2034") return "SERIALIZATION";
  if (failure.code !== "P2002" || !failure.target) return null;
  const fields = failure.target;
  const keys = new Set(fields);
  if (
    failure.modelName === "ClassBooking" &&
    fields.length === 4 &&
    keys.size === 4 &&
    keys.has("workspaceId") &&
    keys.has("memberId") &&
    keys.has("classTemplateId") &&
    keys.has("scheduledForDate")
  )
    return "BOOKING_UNIQUE";
  return failure.modelName === "WorkspaceDataEvent" &&
    fields.length === 1 &&
    fields[0] === "id"
    ? "RECEIPT_UNIQUE"
    : null;
}
/** A uniqueness conflict is replay evidence only for this committed exact owner operation. */
async function hasOwnerLateUniqueReplayWitness(
  db: PrismaClient,
  expected: LateReplayWitness | undefined,
): Promise<boolean> {
  if (!expected) return false;
  if (
    expected.receiptId !==
    `owner-late-booking:${expected.workspaceId}:${expected.operationId}`
  )
    return false;
  // The failed transaction has rolled back. This read is only a witness, never authorization.
  const receipt = await db.workspaceDataEvent
    .findUnique({ where: { id: expected.receiptId } })
    .catch(() => null);
  const proof = receipt?.metadata as Record<string, unknown> | null | undefined;
  return (
    !!receipt &&
    receipt.workspaceId === expected.workspaceId &&
    receipt.actorUserId === expected.actorUserId &&
    receipt.kind === "OWNER_LATE_BOOKING_CONFIRMED" &&
    proof?.schemaVersion === 1 &&
    proof.operationId === expected.operationId &&
    proof.inputHash === expected.inputHash &&
    typeof proof.bookingId === "string" &&
    proof.bookingId.length > 0 &&
    Number.isSafeInteger(proof.fundingRevision) &&
    Number(proof.fundingRevision) > 0
  );
}
async function lateTransaction<T>(
  db: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  expectedReplay?: LateReplayWitness,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(callback, {
        isolationLevel: "Serializable",
        timeout: 30000,
      });
    } catch (error) {
      if (attempt >= 3) throw error;
      const conflict = ownerLateRetryConflict(error);
      if (
        !conflict ||
        (conflict !== "SERIALIZATION" &&
          !(await hasOwnerLateUniqueReplayWitness(db, expectedReplay)))
      )
        throw error;
      // Repeat the complete callback: current owner authority, exact input, receipt and live booking are all rechecked.
    }
  }
}
async function lateReviewTx(
  tx: Prisma.TransactionClient,
  actor: LateActor,
  input: OwnerLateBookingInput,
  now: Date,
): Promise<OwnerLateBookingReview> {
  const owner = await lateOwner(tx, actor);
  const [member, rawTemplate, revision] = await Promise.all([
    tx.member.findFirst({
      where: { workspaceId: actor.workspaceId, id: input.memberId },
      select: {
        id: true,
        fullName: true,
        status: true,
        archivedAt: true,
        profileVersion: true,
        archiveVersion: true,
        dateOfBirth: true,
        tags: true,
        updatedAt: true,
      },
    }),
    tx.classTemplate.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        id: input.classTemplateId,
        archivedAt: null,
      },
      include: classOccurrenceInclude,
    }),
    readClassSchedulingPolicy(tx, actor.workspaceId, now),
  ]);
  if (!member || member.archivedAt)
    lateFail("Choose a current member in this business.");
  const template =
    rawTemplate &&
    resolveClassOccurrence({
      template: rawTemplate,
      scheduledForDate: input.scheduledForDate,
    });
  if (
    !template ||
    template.status !== "ACTIVE" ||
    template.program.archivedAt ||
    template.room.archivedAt ||
    template.room.isActive === false
  )
    lateFail("Choose an active dated class in this business.");
  await lockResolvedRoomCapacityTx(tx, actor.workspaceId, template!.roomId);
  const timezone = template!.timezone ?? owner.workspace.location!.timezone;
  const evaluationArgs = {
    revision,
    date: input.scheduledForDate,
    timezone,
    startTimeMinutes: template!.startTimeMinutes,
    endTimeMinutes: template!.endTimeMinutes,
    bookingCutoffMinutes: template!.bookingCutoffMinutes,
    now,
  };
  const ordinary = evaluateClassSchedulingPolicy(evaluationArgs);
  if (ordinary.allowed)
    lateFail(
      "Normal booking is still available for this class. Use the ordinary booking form.",
    );
  if (!ordinary.allowed && ordinary.code !== "CLOSED")
    lateFail(ordinary.message);
  const exception = evaluateClassSchedulingPolicy({
    ...evaluationArgs,
    allowLeadExceptionBeforeStart: true,
  });
  if (!exception.allowed)
    lateFail(
      "Late booking is unavailable once the class starts. This exception only waives the booking cutoff and minimum notice.",
    );
  const snapshot = exception.allowed
    ? exception.snapshot
    : lateFail("The scheduling review could not be completed.");
  if (
    input.guardianId &&
    !(await tx.familyLink.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        guardianId: input.guardianId,
        childMemberId: input.memberId,
        guardian: { workspaceId: actor.workspaceId },
      },
      select: { id: true },
    }))
  )
    lateFail("The selected guardian is not linked to this person.");
  const eligibility = await checkMemberClassEligibility({
    workspaceId: actor.workspaceId,
    memberId: input.memberId,
    scheduledForDate: input.scheduledForDate,
    occurrence: template!,
    db: tx,
  });
  if (!eligibility.eligible)
    lateFail(
      eligibility.reason ??
        "The class eligibility requirements must be resolved first.",
    );
  await tx.$queryRawUnsafe(
    'SELECT id FROM form_documents WHERE "workspaceId" = $1 ORDER BY id FOR SHARE',
    actor.workspaceId,
  );
  await tx.$queryRawUnsafe(
    'SELECT id FROM required_form_assignments WHERE "workspaceId" = $1 ORDER BY id FOR SHARE',
    actor.workspaceId,
  );
  const forms = await resolveRequiredFormStatusesForMember({
    workspaceId: actor.workspaceId,
    memberId: input.memberId,
    targets: ["TRIAL", "MEMBER", "GUARDIAN"],
    ensureRequests: false,
    db: tx as unknown as FormsDatabase,
    now,
  });
  const missing = forms.items.find((item) => item.status !== "SIGNED");
  if (missing)
    lateFail(
      `Complete the current required form before booking: ${missing.formName}.`,
    );
  const [bookings, queue, overlaps] = await Promise.all([
    tx.classBooking.findMany({
      where: {
        workspaceId: actor.workspaceId,
        classTemplateId: input.classTemplateId,
        scheduledForDate: dateOnlyStringToUtcDate(input.scheduledForDate),
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        memberId: true,
        status: true,
        bookingType: true,
        fundingRevision: true,
        updatedAt: true,
        pendingPaymentExpiresAt: true,
        dropInCheckoutSessionId: true,
        dropInPaymentIntentId: true,
        dropInPaidAt: true,
      },
    }),
    tx.waitlistEntry.findMany({
      where: {
        workspaceId: actor.workspaceId,
        classTemplateId: input.classTemplateId,
        scheduledForDate: dateOnlyStringToUtcDate(input.scheduledForDate),
        status: "ACTIVE",
      },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    }),
    tx.classBooking.findMany({
      where: {
        workspaceId: actor.workspaceId,
        memberId: input.memberId,
        scheduledForDate: dateOnlyStringToUtcDate(input.scheduledForDate),
        status: { in: ["BOOKED", "PENDING_PAYMENT"] },
        classTemplateId: { not: input.classTemplateId },
      },
      include: { classTemplate: { include: classOccurrenceInclude } },
      orderBy: { id: "asc" },
    }),
  ]);
  const prior = bookings.find((booking) => booking.memberId === input.memberId);
  if (prior && prior.status !== "CANCELLED")
    lateFail(
      "An existing booking or payment hold already owns this place. Open that record instead.",
    );
  if (
    prior &&
    (prior.bookingType === "DROP_IN" ||
      prior.dropInCheckoutSessionId ||
      prior.dropInPaymentIntentId ||
      prior.dropInPaidAt)
  )
    lateFail(
      "Review the existing payment-backed record first. A late exception cannot reuse or recreate a paid or pending-provider booking.",
    );
  const occupied = bookings.filter(
    (booking) =>
      booking.status === "BOOKED" ||
      (booking.status === "PENDING_PAYMENT" &&
        (!booking.pendingPaymentExpiresAt ||
          booking.pendingPaymentExpiresAt > now)),
  ).length;
  const capacity = template!.effectiveCapacity;
  if (capacity !== null && occupied >= capacity)
    lateFail("This class is full. A late exception cannot add capacity.");
  // Conservative FIFO: nobody is automatically funded after their agreed deadline.
  // Resolve an earlier person's queue entry separately rather than silently jumping it.
  if (queue.length && queue[0]!.memberId !== input.memberId)
    lateFail(
      "An earlier waitlist entry has priority. Resolve that queue entry before a late booking for another person.",
    );
  if (
    overlaps.some((booking) => {
      const other = resolveClassOccurrence({
        template: booking.classTemplate,
        scheduledForDate: input.scheduledForDate,
      });
      return (
        other &&
        other.status !== "CANCELLED" &&
        other.startTimeMinutes < template!.endTimeMinutes &&
        template!.startTimeMinutes < other.endTimeMinutes
      );
    })
  )
    lateFail("This member already has a booking at this time.");
  const funding =
    input.bookingType === "TRIAL"
      ? { type: "trial" as const }
      : await resolveBookingAccessForProgramWithDb({
          workspaceId: actor.workspaceId,
          memberId: input.memberId,
          programId: template!.programId,
          scheduledForDate: input.scheduledForDate,
          occurrenceStartsAt: new Date(snapshot.startsAt),
          now,
          allowDropIn: false,
          db: tx as unknown as AccessTransactionDatabase,
        });
  if (funding.type === "none") lateFail(funding.message);
  if (funding.type === "drop_in")
    lateFail(
      "Use the member's normal verified payment flow. A late exception cannot create a charge.",
    );
  let fundingEvidence: unknown = null,
    fundingLabel = "Trial",
    fundingDetail = "No purchase or card charge.";
  const targets: Array<{ targetKind: string; targetId: string }> = prior
    ? [{ targetKind: "BOOKING", targetId: prior.id }]
    : [];
  if (funding.type === "membership") {
    targets.push({ targetKind: "MEMBERSHIP", targetId: funding.membershipId });
    const allowance = await prepareMembershipAllowance({
      workspaceId: actor.workspaceId,
      memberId: input.memberId,
      membershipId: funding.membershipId,
      scheduledForDate: input.scheduledForDate,
      occurrenceStartsAt: new Date(snapshot.startsAt),
      timezone,
      db: tx,
    });
    if ("error" in allowance)
      lateFail(allowance.error ?? "Membership access is unavailable.");
    if (
      !("error" in allowance) &&
      allowance.windows.some((window) => window.remaining < 1)
    )
      lateFail("No accepted membership allowance remains for this class date.");
    const contract = await tx.memberMembership.findFirstOrThrow({
      where: {
        id: funding.membershipId,
        workspaceId: actor.workspaceId,
        memberId: input.memberId,
      },
      include: {
        billingState: true,
        sourceBillingEvidence: { orderBy: { id: "asc" } },
      },
    });
    fundingEvidence = { funding, allowance, contract };
    fundingLabel = "Membership";
    fundingDetail =
      "Uses the accepted membership allowance for this class date; no purchase or card charge.";
  } else if (funding.type === "punch_card") {
    targets.push({
      targetKind: "PUNCH_CARD",
      targetId: funding.memberPunchCardId,
    });
    fundingEvidence = await tx.memberPunchCard.findFirstOrThrow({
      where: {
        id: funding.memberPunchCardId,
        workspaceId: actor.workspaceId,
        memberId: input.memberId,
      },
      include: {
        punchCardProduct: {
          include: { programRestrictions: { orderBy: { id: "asc" } } },
        },
      },
    });
    fundingLabel = "Class pack";
    fundingDetail =
      "Reserves one eligible existing class-pack unit; no purchase or card charge.";
  }
  const holds = targets.length
    ? await tx.financialEntitlementHold.findMany({
        where: {
          workspaceId: actor.workspaceId,
          activeSlot: "ACTIVE",
          OR: targets,
        },
        orderBy: { id: "asc" },
      })
    : [];
  if (holds.length)
    lateFail(
      "This access is under financial review. A late exception cannot remove its hold.",
    );
  const recipients = (
    await memberNotificationRecipients(tx, actor.workspaceId, [input.memberId])
  ).sort((a, b) => a.email.localeCompare(b.email));
  const previewHash = lateHash({
    actor,
    input,
    owner: { id: owner.id, updatedAt: owner.updatedAt },
    member,
    rawTemplate,
    revision,
    bookings,
    occupied,
    queue,
    overlaps,
    funding,
    fundingEvidence,
    holds,
    forms,
    recipients,
  });
  return {
    previewHash,
    memberId: input.memberId,
    memberName: member!.fullName,
    classTemplateId: input.classTemplateId,
    title: template!.displayTitle,
    scheduledForDate: input.scheduledForDate,
    startsAt: snapshot.startsAt,
    endsAt: snapshot.endsAt,
    timezone,
    normalClosesAt: snapshot.closesAt!,
    policyRevisionId: snapshot.policyRevisionId!,
    policyVersion: snapshot.policyVersion!,
    policyHash: snapshot.policyHash!,
    capacity,
    occupied,
    fundingLabel,
    fundingDetail,
    queuedEntryCount: queue.length,
    notificationRecipientCount: recipients.length,
  };
}
export async function previewOwnerLateClassBooking(args: {
  actor: LateActor;
  input: OwnerLateBookingInput;
  db?: PrismaClient;
  now?: Date;
}): Promise<OwnerLateBookingReview> {
  const input = lateInput(args.input);
  return lateTransaction(args.db ?? prisma, async (tx) => {
    await lockClassSchedule(tx, args.actor.workspaceId);
    return lateReviewTx(tx, args.actor, input, args.now ?? new Date());
  });
}
export async function confirmOwnerLateClassBooking(args: {
  actor: LateActor;
  input: OwnerLateBookingInput;
  previewHash: string;
  confirmed: boolean;
  db?: PrismaClient;
  now?: Date;
}): Promise<{
  status: "created" | "restored" | "already_created";
  bookingId: string;
  receiptId: string;
}> {
  const input = lateInput(args.input);
  if (!args.confirmed)
    lateFail(
      "Explicitly confirm the named cutoff exception after reviewing this person and class.",
    );
  const receiptId = `owner-late-booking:${args.actor.workspaceId}:${input.operationId}`,
    inputHash = lateHash(input);
  return lateTransaction(
    args.db ?? prisma,
    async (tx) => {
      await lockClassSchedule(tx, args.actor.workspaceId);
      await lateOwner(tx, args.actor);
      const previous = await tx.workspaceDataEvent.findUnique({
        where: { id: receiptId },
      });
      if (previous) {
        const proof =
          previous.metadata &&
          typeof previous.metadata === "object" &&
          !Array.isArray(previous.metadata)
            ? previous.metadata
            : {};
        if (
          previous.workspaceId !== args.actor.workspaceId ||
          previous.actorUserId !== args.actor.userId ||
          previous.kind !== "OWNER_LATE_BOOKING_CONFIRMED" ||
          proof.inputHash !== inputHash ||
          typeof proof.bookingId !== "string" ||
          typeof proof.fundingRevision !== "number"
        )
          lateFail(
            "This request was already used for another booking. Reload and review a new request.",
          );
        const booking = await tx.classBooking.findFirst({
          where: {
            id: proof.bookingId as string,
            workspaceId: args.actor.workspaceId,
            memberId: input.memberId,
            classTemplateId: input.classTemplateId,
            scheduledForDate: dateOnlyStringToUtcDate(input.scheduledForDate),
            fundingRevision: proof.fundingRevision as number,
            status: { not: "CANCELLED" },
          },
          select: { id: true },
        });
        if (!booking)
          lateFail(
            "The original booking was cancelled or its funding changed. This receipt cannot restore a seat or spend another unit.",
          );
        return { status: "already_created", bookingId: booking!.id, receiptId };
      }
      const now = args.now ?? new Date(),
        review = await lateReviewTx(tx, args.actor, input, now);
      if (review.previewHash !== args.previewHash)
        lateFail(
          "The person, class, queue, capacity, access or booking rules changed. Preview the current request again.",
        );
      const booked = await createAccessBackedBookingWithDb({
        workspaceId: args.actor.workspaceId,
        memberId: input.memberId,
        guardianId: input.guardianId,
        classTemplateId: input.classTemplateId,
        scheduledForDate: input.scheduledForDate,
        timezone: review.timezone,
        source: "ADMIN",
        allowDropIn: false,
        trial: input.bookingType === "TRIAL",
        ownerLateBooking: {
          ownerUserId: args.actor.userId,
          receiptId,
          capability: ownerLateBookingCapability,
        },
        db: tx as unknown as AccessTransactionDatabase,
        now,
      });
      if (booked.status === "error") lateFail(booked.message);
      if (booked.status === "payment_required")
        lateFail("A late exception cannot start a payment.");
      const booking = await tx.classBooking.findUniqueOrThrow({
        where: { id: booked.bookingId },
        select: { id: true, fundingRevision: true },
      });
      await tx.workspaceDataEvent.create({
        data: {
          id: receiptId,
          workspaceId: args.actor.workspaceId,
          actorUserId: args.actor.userId,
          kind: "OWNER_LATE_BOOKING_CONFIRMED",
          metadata: {
            schemaVersion: 1,
            operationId: input.operationId,
            inputHash,
            previewHash: review.previewHash,
            bookingId: booking.id,
            fundingRevision: booking.fundingRevision,
            memberId: input.memberId,
            classTemplateId: input.classTemplateId,
            scheduledForDate: input.scheduledForDate,
            policyRevisionId: review.policyRevisionId,
            policyVersion: review.policyVersion,
            policyHash: review.policyHash,
            startsAt: review.startsAt,
            endsAt: review.endsAt,
            timezone: review.timezone,
            normalClosesAt: review.normalClosesAt,
            confirmedAt: now.toISOString(),
            overriddenRules: ["BOOKING_CUTOFF", "MINIMUM_LEAD"],
            notificationRecipientCount: review.notificationRecipientCount,
            reason: input.reason,
          },
        },
      });
      const recipients = await memberNotificationRecipients(
        tx,
        args.actor.workspaceId,
        [input.memberId],
      );
      for (const recipient of recipients)
        await enqueueNotificationJob({
          db: tx,
          now,
          input: {
            workspaceId: args.actor.workspaceId,
            templateKind: "BOOKING_CONFIRMATION",
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            subject: "Your class booking is confirmed",
            body: `Your place in ${review.title} on ${review.scheduledForDate} is confirmed. Sign in to review the class time and cancellation rules.`,
            context: { kind: "CLASS_BOOKING", bookingId: booking.id },
            dedupeKey: `owner-late-booking:${receiptId}:${recipient.email.toLowerCase()}`,
            expiresAt: new Date(review.startsAt),
          },
        });
      return { status: booked.status, bookingId: booking.id, receiptId };
    },
    {
      workspaceId: args.actor.workspaceId,
      actorUserId: args.actor.userId,
      operationId: input.operationId,
      receiptId,
      inputHash,
    },
  );
}


interface MemberClassCommandArgs {
  workspaceId: string;
  memberId: string;
  actor: MemberCommandActor;
  authorizationClock?: () => Date;
  db?: AccessDatabase;
}

/** Every member mutation authorizes inside its own transaction, before replay or effects. */
async function memberClassCommand<T>(args: MemberClassCommandArgs, work: (tx: AccessTransactionDatabase, authority: Awaited<ReturnType<typeof requireCurrentMemberBookingAuthorityTx>>) => Promise<T>): Promise<T | { status: "error"; message: string }> {
  const db = args.db ?? accessDatabase;
  try {
    return await db.$transaction(async tx => {
      await lockClassSchedule(tx, args.workspaceId);
      const authority = await requireCurrentMemberBookingAuthorityTx(tx as unknown as Prisma.TransactionClient, { workspaceId: args.workspaceId, memberId: args.memberId, actor: args.actor, authorizationClock: args.authorizationClock });
      return work(tx, authority);
    });
  } catch (error) {
    if (error instanceof MemberBookingAuthorityError) return { status: "error", message: error.message };
    throw error;
  }
}

export function cancelMemberClassBooking(args: Parameters<typeof cancelAccessBackedBooking>[0] & MemberClassCommandArgs) {
  return memberClassCommand(args, tx => cancelAccessBackedBookingTx(tx, args, args.now ?? new Date()));
}

export function joinMemberClassWaitlist(args: Omit<Parameters<typeof joinWaitlist>[0], "consentUserId"> & MemberClassCommandArgs) {
  return memberClassCommand(args, (tx, authority) => joinWaitlistTx(tx, { ...args, consentUserId: authority.actorUserId }, args.now ?? new Date()));
}

export function leaveMemberClassWaitlist(args: Parameters<typeof leaveWaitlist>[0] & MemberClassCommandArgs) {
  return memberClassCommand(args, tx => leaveWaitlistTx(tx, args));
}

export async function moveMemberClassBooking(args: Parameters<typeof moveAccessBackedBooking>[0] & MemberClassCommandArgs) {
  const mutationId = args.mutationId ?? crypto.randomUUID();
  if (!/^[\da-f-]{36}$/i.test(mutationId)) return { status: "error" as const, message: "Refresh the booking before moving it." };
  try {
    return await memberClassCommand(args, tx => moveAccessBackedBookingTx(tx as unknown as Prisma.TransactionClient, args, args.now ?? new Date(), mutationId));
  } catch (error) {
    if (error instanceof BookingMoveFailure) return { status: "error" as const, message: error.message };
    throw error;
  }
}
