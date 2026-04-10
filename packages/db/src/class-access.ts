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

const blockedMembershipStatuses: MemberMembershipStatus[] = [
  "FROZEN",
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
  membershipPlan: {
    programRestrictions: AccessRestrictionRecord[];
  };
}

interface AccessPunchCardRecord {
  id: string;
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
  id: string;
  workspaceId: string;
  programId: string;
  title: string | null;
  weekday: string;
  startTimeMinutes: number;
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

interface AccessTransactionDatabase {
  classTemplate: {
    findFirst(args: Record<string, unknown>): Promise<AccessTemplateSummary | null>;
  };
  classBooking: {
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
  const restrictions = args.membership.membershipPlan.programRestrictions;

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

  if (lateCancellation && args.bookingType !== "PUNCH_CARD") {
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
  workspaceId: string;
  classTemplateId: string;
  db: AccessTransactionDatabase;
}): Promise<AccessTemplateSummary | null> {
  return args.db.classTemplate.findFirst({
    where: {
      id: args.classTemplateId,
      workspaceId: args.workspaceId,
      archivedAt: null,
      program: {
        archivedAt: null,
      },
      room: {
        archivedAt: null,
        isActive: true,
      },
    },
    include: {
      program: {
        select: {
          id: true,
          name: true,
        },
      },
      room: {
        select: {
          name: true,
          capacity: true,
        },
      },
    },
  });
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
    punchCards.find((punchCard) =>
      isProgramAllowed({
        programId: args.programId,
        restrictionMode: punchCard.punchCardProduct.restrictionMode,
        restrictions: punchCard.punchCardProduct.programRestrictions,
      }),
    ) ?? null
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

async function resolveBookingAccessForProgramWithDb(args: {
  workspaceId: string;
  memberId: string;
  programId: string;
  allowDropIn: boolean;
  db: AccessTransactionDatabase;
}): Promise<AccessResolution> {
  const membership = await getCurrentMembership({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db: args.db,
  });

  if (membership && !blockedMembershipStatuses.includes(membership.status)) {
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
        reason: blockedMembershipStatuses.includes(membership.status)
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

  if (membership && blockedMembershipStatuses.includes(membership.status)) {
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
  allowDropIn?: boolean;
  db?: AccessResolutionDatabase;
}): Promise<AccessResolution> {
  const db = (args.db ?? accessDatabase) as AccessTransactionDatabase;

  return resolveBookingAccessForProgramWithDb({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    programId: args.programId,
    allowDropIn: args.allowDropIn ?? true,
    db,
  });
}

export interface AccessResolutionDatabase
  extends Pick<
    AccessTransactionDatabase,
    "memberMembership" | "memberPunchCard" | "dropInProduct"
  > {}

async function debitPunchCard(args: {
  workspaceId: string;
  memberId: string;
  programId: string;
  db: AccessTransactionDatabase;
}): Promise<{ memberPunchCardId: string } | null> {
  const punchCard = await pickOldestEligiblePunchCard({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    programId: args.programId,
    db: args.db,
  });

  if (!punchCard) {
    return null;
  }

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
    workspaceId: args.workspaceId,
    classTemplateId,
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
    },
  });

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

  const access = await resolveBookingAccessForProgramWithDb({
    workspaceId: args.workspaceId,
    memberId,
    programId: template.programId,
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
    const booking = existingBooking
      ? await args.db.classBooking.update({
          where: {
            id: existingBooking.id,
          },
          data: {
            guardianId,
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

    return {
      status: existingBooking ? "restored" : "created",
      bookingId: booking.id,
      bookingType: "MEMBERSHIP",
    };
  }

  if (access.type === "punch_card") {
    const debit = await debitPunchCard({
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
            classTemplateId,
            scheduledForDate: dateOnlyStringToUtcDate(occurrence.dateString),
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
          classTemplateId,
          scheduledForDate: dateOnlyStringToUtcDate(occurrence.dateString),
          bookingType: "DROP_IN",
          status: "PENDING_PAYMENT",
          source: args.source,
          dropInProductId: access.dropInProductId,
          dropInPriceCents: access.priceCents,
          dropInCurrency: access.currency,
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
  db?: AccessDatabase;
  now?: Date;
}): Promise<CreateAccessBackedBookingResult> {
  const db = args.db ?? accessDatabase;

  return db.$transaction((tx) =>
    createAccessBackedBookingWithDb({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      guardianId: args.guardianId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: args.scheduledForDate,
      timezone: args.timezone,
      allowDropIn: args.allowDropIn ?? true,
      source: args.source,
      db: tx,
      now: args.now ?? new Date(),
    }),
  );
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
    const booking = await tx.classBooking.findFirst({
      where: {
        id: args.bookingId,
        workspaceId: args.workspaceId,
        memberId: args.memberId,
      },
      include: {
        classTemplate: {
          select: {
            startTimeMinutes: true,
            cancellationCutoffMinutes: true,
          },
        },
      },
    } as Record<string, unknown>) as (AccessBookingRecord & {
      classTemplate: {
        startTimeMinutes: number;
        cancellationCutoffMinutes: number;
      };
      scheduledForDate: Date;
    }) | null;

    if (!booking) {
      return {
        status: "error",
        message: "Booking not found.",
      } satisfies CancelAccessBackedBookingResult;
    }

    const scheduledForDate = toDateOnlyString(booking.scheduledForDate);
    const cancellationState = canCancelClassBooking({
      bookingType: booking.bookingType,
      bookingStatus: booking.status,
      scheduledForDate,
      startTimeMinutes: booking.classTemplate.startTimeMinutes,
      cancellationCutoffMinutes:
        booking.classTemplate.cancellationCutoffMinutes,
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

    let punchRefunded = false;

    if (
      booking.bookingType === "PUNCH_CARD" &&
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
    const template = await getActiveTemplate({
      workspaceId: args.workspaceId,
      classTemplateId: args.classTemplateId,
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

    const access = await resolveBookingAccessForProgramWithDb({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      programId: template.programId,
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
  const result = await db.waitlistEntry.updateMany({
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
      status: "error",
      message: "Waitlist entry not found.",
    };
  }

  return {
    status: "cancelled",
    waitlistEntryId: args.waitlistEntryId,
  };
}

export async function removeWaitlistEntry(args: {
  workspaceId: string;
  waitlistEntryId: string;
  db?: AccessDatabase;
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
  const result = await db.waitlistEntry.updateMany({
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
      status: "error",
      message: "Waitlist entry not found.",
    };
  }

  return {
    status: "removed",
    waitlistEntryId: args.waitlistEntryId,
  };
}

export async function promoteNextWaitlistEntry(args: {
  workspaceId: string;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  source: ClassBookingSource;
  db?: AccessDatabase;
  now?: Date;
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
    const template = await getActiveTemplate({
      workspaceId: args.workspaceId,
      classTemplateId: args.classTemplateId,
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

    const nextEntry = waitlistEntries[0];

    if (!nextEntry) {
      return {
        status: "error",
        message: "No active waitlist entries are available.",
      };
    }

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
      return {
        status: "error",
        message: booking.message,
      };
    }

    if (booking.status === "payment_required") {
      return {
        status: "error",
        message: "Waitlist promotion does not support drop-ins in this slice.",
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
  });
}

export async function finalizeDropInBookingPayment(args: {
  workspaceId: string;
  bookingId: string;
  checkoutSessionId: string;
  paymentIntentId?: string | null;
  expiresAt?: Date | null;
  db?: AccessDatabase;
  now?: Date;
}): Promise<"booked" | "already_booked" | "missing"> {
  const db = args.db ?? accessDatabase;
  const now = args.now ?? new Date();

  return db.$transaction(async (tx) => {
    const booking = await tx.classBooking.findFirst({
      where: {
        id: args.bookingId,
        workspaceId: args.workspaceId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!booking) {
      return "missing" as const;
    }

    if (booking.status === "BOOKED") {
      return "already_booked" as const;
    }

    await tx.classBooking.update({
      where: {
        id: booking.id,
      },
      data: {
        status: "BOOKED",
        dropInCheckoutSessionId: args.checkoutSessionId,
        dropInPaymentIntentId: cleanNullable(args.paymentIntentId),
        dropInPaidAt: now,
        pendingPaymentExpiresAt: args.expiresAt ?? null,
      },
      select: {
        id: true,
      },
    });

    return "booked" as const;
  });
}

export async function expireDropInBookingPayment(args: {
  workspaceId: string;
  bookingId: string;
  checkoutSessionId: string;
  db?: AccessDatabase;
}): Promise<"cancelled" | "missing"> {
  const db = args.db ?? accessDatabase;
  const result = await db.classBooking.updateMany({
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
}

export async function finalizePunchCardCheckoutPurchase(args: {
  workspaceId: string;
  memberId: string;
  punchCardProductId: string;
  originalPunches: number;
  priceCents: number;
  currency: string;
  checkoutSessionId: string;
  db?: AccessDatabase;
  now?: Date;
}): Promise<{ status: "created" | "already_exists"; memberPunchCardId: string | null }> {
  const db = args.db ?? accessDatabase;
  const now = args.now ?? new Date();
  const existing = await db.memberPunchCard.findFirst({
    where: {
      workspaceId: args.workspaceId,
      stripeCheckoutSessionId: args.checkoutSessionId,
    },
    select: {
      id: true,
      remainingPunches: true,
      status: true,
      purchasedAt: true,
      createdAt: true,
      punchCardProduct: {
        select: {
          id: true,
          name: true,
          restrictionMode: true,
          programRestrictions: {
            select: {
              programId: true,
            },
          },
        },
      },
    },
  });

  if (existing) {
    return {
      status: "already_exists",
      memberPunchCardId: existing.id,
    };
  }

  const record = await db.memberPunchCard.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      punchCardProductId: args.punchCardProductId,
      originalPunches: args.originalPunches,
      remainingPunches: args.originalPunches,
      status: "ACTIVE",
      purchasePriceCents: args.priceCents,
      purchaseCurrency: args.currency,
      purchasedAt: now,
      stripeCheckoutSessionId: args.checkoutSessionId,
    },
    select: {
      id: true,
    },
  });

  return {
    status: "created",
    memberPunchCardId: record.id,
  };
}
