import { checkMemberClassEligibility } from "./program-progress.js";
import { financialEntitlementHoldReason } from "./entitlement-holds.js";
import { readPunchCardTerms, ensurePunchCardLedger, recordPunchCardReservation, settlePunchCardBooking } from "./punch-card-ledger.js";
import type { Prisma } from "@prisma/client";
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
  validateOccurrenceDate,
} from "./occurrences.js";
import { prisma } from "./client.js";
import { classOccurrenceInclude, resolveClassOccurrence, isUnambiguousClassTime, lockClassSchedule, type ClassOccurrenceTemplate, type ClassScheduleLockDatabase } from "./class-occurrences.js";

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

interface AccessRestrictionRecord {
  programId: string;
}

interface AccessMembershipRecord {
  id: string;
  status: MemberMembershipStatus;
  acceptedTerms?: unknown;
  frozenFrom?: Date | null;
  frozenUntil?: Date | null;
  billingState?: { status: string; gracePeriodEndsAt: Date | null } | null;
  membershipPlan: {
    programRestrictions: AccessRestrictionRecord[];
  };
}

interface AccessPunchCardRecord {
  id: string;
  acceptedTerms?: unknown;
  remainingPunches: number;
  status: "ACTIVE" | "DEPLETED" | "ARCHIVED";
  purchasedAt: Date;
  createdAt: Date;
  punchCardProduct: {
    id: string;
    name: string;
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
  member: {
    fullName: string;
    email: string | null;
    phone: string | null;
    status: string;
  };
}

interface AccessTransactionDatabase extends ClassScheduleLockDatabase {
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

export type AccessResolution =
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
    };

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
  if (!isUnambiguousClassTime(args.scheduledForDate, occurrence.startTimeMinutes, args.timezone) || !isUnambiguousClassTime(args.scheduledForDate, occurrence.endTimeMinutes, args.timezone)) return null;
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

export async function pickOldestEligiblePunchCard(args: {
  workspaceId: string;
  memberId: string;
  programId: string;
  db?: Pick<AccessTransactionDatabase, "memberPunchCard">;
}): Promise<AccessPunchCardRecord | null> {
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

  return (
    punchCards.find((card) => isPunchCardProgramAllowed(card, args.programId)) ?? null
  );
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

function membershipCanFundDate(membership: Pick<AccessMembershipRecord, "status" | "frozenFrom" | "frozenUntil" | "billingState">, date: string | undefined, now: Date): boolean {
  const outsideFreeze = membership.status === "FROZEN" && !!date && !!membership.frozenFrom && !!membership.frozenUntil && (date < toDateOnlyString(membership.frozenFrom) || date >= toDateOnlyString(membership.frozenUntil));
  const billing = membership.billingState;
  const debtAllowed = billing?.gracePeriodEndsAt ? billing.gracePeriodEndsAt > now : !billing || !["GRACE_PERIOD", "PAST_DUE", "PAYMENT_FAILED"].includes(billing.status);
  const statusAllowed = membership.status === "ACTIVE" || (membership.status === "PAST_DUE" && !!billing?.gracePeriodEndsAt && billing.gracePeriodEndsAt > now) || outsideFreeze;
  return statusAllowed && debtAllowed;
}

async function resolveBookingAccessForProgramWithDb(args: {
  workspaceId: string;
  memberId: string;
  programId: string;
  scheduledForDate?: string;
  now?: Date;
  allowDropIn: boolean;
  db: AccessTransactionDatabase;
}): Promise<AccessResolution> {
  const membership = await getCurrentMembership({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db: args.db,
  });

  if (membership) { const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "MEMBERSHIP", targetId: membership.id }], db: args.db }); if (held) return { type: "none", reason: "membership_blocked", message: held }; }
  const membershipAllowed = !!membership && membershipCanFundDate(membership, args.scheduledForDate, args.now ?? new Date());
  if (membership && membershipAllowed) {
    if (isMembershipProgramAllowed({ programId: args.programId, membership })) {
      return {
        type: "membership",
        membershipId: membership.id,
      };
    }
  }

  const punchCard = await pickOldestEligiblePunchCard({
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
    };
  }

  if (!args.allowDropIn) {
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
    };
  }

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
  now?: Date;
  allowDropIn?: boolean;
  db?: AccessResolutionDatabase;
}): Promise<AccessResolution> {
  const db = (args.db ?? accessDatabase) as AccessTransactionDatabase;

  return resolveBookingAccessForProgramWithDb({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    programId: args.programId,
    scheduledForDate: args.scheduledForDate, now: args.now,
    allowDropIn: args.allowDropIn ?? true,
    db,
  });
}

export type AccessResolutionDatabase = Pick<
  AccessTransactionDatabase,
  "memberMembership" | "memberPunchCard" | "dropInProduct" | "financialEntitlementHold"
>;

async function debitPunchCard(args: {
  punchCardId?: string;
  workspaceId: string;
  memberId: string;
  programId: string;
  db: AccessTransactionDatabase;
}): Promise<{ memberPunchCardId: string } | null> {
  const punchCard = args.punchCardId ? await args.db.memberPunchCard.findFirst({ where: { id: args.punchCardId, workspaceId: args.workspaceId, memberId: args.memberId, status: "ACTIVE", remainingPunches: { gt: 0 } }, include: { punchCardProduct: { include: { programRestrictions: true } } } }) : await pickOldestEligiblePunchCard({ workspaceId: args.workspaceId, memberId: args.memberId, programId: args.programId, db: args.db });

  if (!punchCard || !isPunchCardProgramAllowed(punchCard, args.programId)) {
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
}): Promise<CreateAccessBackedBookingResult> {
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

  if (args.source === "MEMBER_PORTAL" || args.source === "PUBLIC_TRIAL") {
    const startsAt = getOccurrenceStartsAt({
      scheduledForDate: occurrence.dateString,
      startTimeMinutes: template.startTimeMinutes,
      timezone: args.timezone,
    });
    const cutoffAt =
      startsAt.getTime() - template.bookingCutoffMinutes * 60_000;

    if (args.now.getTime() >= cutoffAt) {
      return {
        status: "error",
        code: "INVALID",
        message: "Choose a valid upcoming date for this class.",
      };
    }
  }

  if (args.db.programPromotion) {
    const eligibility = await checkMemberClassEligibility({ workspaceId: args.workspaceId, memberId, scheduledForDate: occurrence.dateString, occurrence: { ...template, classTemplateId: template.id }, db: args.db as unknown as Prisma.TransactionClient });
    if (!eligibility.eligible) return { status: "error", code: "NO_ACCESS", message: eligibility.reason ?? "This class has eligibility requirements." };
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
    return { status: existingBooking ? "restored" : "created", bookingId: booking.id, bookingType: "TRIAL" };
  }

  const access = args.fundingOverride ?? await resolveBookingAccessForProgramWithDb({
    workspaceId: args.workspaceId,
    memberId,
    programId: template.programId,
    scheduledForDate: occurrence.dateString, now: args.now,
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
    const allowance = args.db.membershipAllowanceAllocation ? await prepareMembershipAllowance({ workspaceId: args.workspaceId, memberId, membershipId: access.membershipId, scheduledForDate: occurrence.dateString, timezone: args.timezone, db: args.db as unknown as Prisma.TransactionClient }) : null;
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
      punchCardId: args.punchCardOverrideId,
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

  return {
    status: "payment_required",
    bookingId: booking.id,
    dropInProductId: access.dropInProductId,
    priceCents: access.priceCents,
    currency: access.currency,
  };
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

  return db.$transaction(async (tx) => {
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
      timezone: args.timezone,
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

    return {
      status: "cancelled",
      bookingId: booking.id,
      punchRefunded,
      lateCancellation: cancellationState.lateCancellation,
    } satisfies CancelAccessBackedBookingResult;
  });
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
    })),
  };
}

export async function joinWaitlist(args: {
  workspaceId: string;
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  source: "MEMBER_PORTAL";
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

  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
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

    if (args.source === "MEMBER_PORTAL" || args.source === "PUBLIC_TRIAL") {
      const startsAt = getOccurrenceStartsAt({
        scheduledForDate: occurrence.dateString,
        startTimeMinutes: template.startTimeMinutes,
        timezone: args.timezone,
      });
      const cutoffAt =
        startsAt.getTime() - template.bookingCutoffMinutes * 60_000;

      if (now.getTime() >= cutoffAt) {
        return {
          status: "error",
          message: "Choose a valid upcoming class date.",
        };
      }
    }

    if (tx.programPromotion) {
      const eligibility = await checkMemberClassEligibility({ workspaceId: args.workspaceId, memberId: args.memberId, scheduledForDate: occurrence.dateString, occurrence: { ...template, classTemplateId: template.id }, db: tx as unknown as Prisma.TransactionClient });
      if (!eligibility.eligible) return { status: "error", message: eligibility.reason ?? "This class has eligibility requirements." };
    }

    const access = await resolveBookingAccessForProgramWithDb({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      programId: template.programId,
      scheduledForDate: occurrence.dateString, now: args.now,
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
      },
      select: {
        id: true,
      },
    });

    return {
      status: "joined",
      waitlistEntryId: entry.id,
    };
  });
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
  return db.$transaction(async (tx) => {
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
  });
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

export async function promoteNextWaitlistEntry(args: {
  workspaceId: string;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  source: ClassBookingSource;
  db?: AccessDatabase;
  now?: Date;
  authorize?: (tx: AccessTransactionDatabase) => Promise<boolean>;
}): Promise<
  | {
      status: "promoted";
      waitlistEntryId: string;
      bookingId: string;
      bookingType: ClassBookingType;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const db = args.db ?? accessDatabase;
  const now = args.now ?? new Date();

  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    if (args.authorize && !await args.authorize(tx)) return { status: "error", message: "Class roster not found." };
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

    const effectiveCapacity = getEffectiveCapacity({
      capacityOverride: template.capacityOverride,
      roomCapacity: template.room.capacity,
    });

    if (effectiveCapacity === null) {
      return {
        status: "error",
        message: "This class does not use a waitlist.",
      };
    }

    const activeBookingCount = await countActiveOccurrenceBookings({
      workspaceId: args.workspaceId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: occurrence.dateString,
      db: tx,
      now,
    });

    if (activeBookingCount >= effectiveCapacity) {
      return {
        status: "error",
        message: "No booking spot is available for promotion yet.",
      };
    }

    const waitlistEntries = await tx.waitlistEntry.findMany({
      where: {
        workspaceId: args.workspaceId,
        classTemplateId: args.classTemplateId,
        scheduledForDate: occurrence.date,
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

    for (const nextEntry of waitlistEntries) {
    const booking = await createAccessBackedBookingWithDb({
      workspaceId: args.workspaceId,
      memberId: nextEntry.memberId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: occurrence.dateString,
      timezone: args.timezone,
      allowDropIn: false,
      source: args.source,
      db: tx,
      now,
    });

    if (booking.status === "error") {
      if (booking.code === "NO_ACCESS" || booking.code === "DUPLICATE") continue;
      return { status: "error", message: booking.message };
    }

    if (booking.status === "payment_required") {
      return {
        status: "error",
        message: "Waitlist promotion does not support drop-ins yet.",
      };
    }

    await tx.waitlistEntry.update({
      where: {
        id: nextEntry.id,
      },
      data: {
        status: "PROMOTED",
        promotedAt: now,
        promotedBookingId: booking.bookingId,
      },
      select: {
        id: true,
      },
    });

    return {
      status: "promoted",
      waitlistEntryId: nextEntry.id,
      bookingId: booking.bookingId,
      bookingType: booking.bookingType,
    };
    }
    return { status: "error", message: "No eligible waitlisted member can take this place. Their positions are kept." };
  });
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
    const timezone = booking.workspace.location?.timezone;
    if (!occurrence || occurrence.status !== "ACTIVE" || booking.classTemplate.archivedAt || occurrence.program.archivedAt || occurrence.room.archivedAt || !timezone || getOccurrenceStartsAt({ scheduledForDate: date, startTimeMinutes: occurrence.startTimeMinutes, timezone }) <= now) return "review_required";
    const seats = await countActiveOccurrenceBookings({ workspaceId: args.workspaceId, classTemplateId: booking.classTemplateId, scheduledForDate: date, db: tx as unknown as CountActiveOccurrenceBookingsDatabase, now });
    if (occurrence.effectiveCapacity !== null && seats > occurrence.effectiveCapacity) return "review_required";
    await tx.classBooking.update({ where: { id: booking.id }, data: { status: "BOOKED", dropInPaymentIntentId: cleanNullable(args.paymentIntentId), dropInPaidAt: now, pendingPaymentExpiresAt: null } });
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
    const member = await tx.member.findFirst({ where: { id: args.memberId, workspaceId: args.workspaceId }, select: { id: true } });
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


class BookingMoveFailure extends Error {}
/** A move is one transaction: failure restores the original reservation and every funding hold. */
export async function moveAccessBackedBooking(args: {
  workspaceId: string; memberId: string; bookingId: string; targetClassTemplateId: string; targetDate: string;
  timezone: string; mutationId?: string; db?: AccessDatabase; now?: Date;
}): Promise<{ status: "moved"; bookingId: string } | { status: "error"; message: string }> {
  const db = (args.db ?? prisma) as unknown as Prisma.TransactionClient & Pick<typeof prisma, "$transaction">;
  const now = args.now ?? new Date();
  const mutationId = args.mutationId ?? crypto.randomUUID();
  if (!/^[\da-f-]{36}$/i.test(mutationId)) return { status: "error", message: "Refresh the booking before moving it." };
  try {
    return await db.$transaction(async (tx) => {
      await lockClassSchedule(tx, args.workspaceId);
      const prior = await tx.classBookingMove.findFirst({ where: { id: mutationId, workspaceId: args.workspaceId, memberId: args.memberId, originalBookingId: args.bookingId } });
      if (prior) return { status: "moved" as const, bookingId: prior.targetBookingId };
      const original = await tx.classBooking.findFirst({ where: { id: args.bookingId, workspaceId: args.workspaceId, memberId: args.memberId }, include: { classTemplate: { include: classOccurrenceInclude }, fundingMembership: { include: { billingState: true } } } });
      if (!original || original.status !== "BOOKED") throw new BookingMoveFailure("This booking can no longer be moved. Refresh your classes.");
      const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "BOOKING", targetId: original.id }, { targetKind: "BOOKING", targetId: original.fundedByBookingId }, { targetKind: "PUNCH_CARD", targetId: original.memberPunchCardId }, { targetKind: "MEMBERSHIP", targetId: original.fundingMembershipId }], db: tx });
      if (held) throw new BookingMoveFailure(held);
      if (original.classTemplateId === args.targetClassTemplateId && toDateOnlyString(original.scheduledForDate) === args.targetDate) throw new BookingMoveFailure("Choose a different class.");
      const oldOccurrence = resolveClassOccurrence({ template: original.classTemplate as unknown as ClassOccurrenceTemplate, scheduledForDate: toDateOnlyString(original.scheduledForDate) });
      const target = await getActiveTemplate({ timezone: args.timezone, workspaceId: args.workspaceId, classTemplateId: args.targetClassTemplateId, scheduledForDate: args.targetDate, db: tx as unknown as AccessTransactionDatabase });
      if (!oldOccurrence || oldOccurrence.status === "CANCELLED" || !target) throw new BookingMoveFailure("A class changed. Refresh your classes before moving this booking.");
      if (getOccurrenceStartsAt({ scheduledForDate: toDateOnlyString(original.scheduledForDate), startTimeMinutes: oldOccurrence.startTimeMinutes, timezone: args.timezone }) <= now) throw new BookingMoveFailure("A class that has started cannot be moved.");
      const late = !original.providerChangedAt && isPastCancellationCutoff({ scheduledForDate: toDateOnlyString(original.scheduledForDate), startTimeMinutes: oldOccurrence.startTimeMinutes, cancellationCutoffMinutes: oldOccurrence.cancellationCutoffMinutes, timezone: args.timezone, now });
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
      if (paidFundingBookingId) await tx.classBooking.update({ where: { id: result.bookingId }, data: { status: "BOOKED", fundedByBookingId: paidFundingBookingId, pendingPaymentExpiresAt: null } });
      await tx.classBookingMove.create({ data: { id: mutationId, workspaceId: args.workspaceId, memberId: args.memberId, originalBookingId: original.id, targetBookingId: result.bookingId, lateCancellation: late } });
      return { status: "moved" as const, bookingId: result.bookingId };
    });
  } catch (error) {
    if (error instanceof BookingMoveFailure) return { status: "error", message: error.message };
    throw error;
  }
}

/** The verified public registration transaction owns the schedule lock and identity checks. */
export async function createVerifiedTrialBookingTx(args: { workspaceId: string; memberId: string; guardianId?: string | null; classTemplateId: string; scheduledForDate: string; timezone: string; db: Prisma.TransactionClient; now: Date }): Promise<CreateAccessBackedBookingResult> {
  return createAccessBackedBookingWithDb({ ...args, source: "PUBLIC_TRIAL", trial: true, allowDropIn: false, db: args.db as unknown as AccessTransactionDatabase });
}
