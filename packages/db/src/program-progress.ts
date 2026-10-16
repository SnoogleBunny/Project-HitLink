import { memberNotificationRecipients } from "./member-notification-recipients.js";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import {
  classOccurrenceInclude,
  lockClassSchedule,
  resolveClassOccurrence,
  type ClassOccurrenceTemplate,
  type ResolvedClassOccurrence,
} from "./class-occurrences.js";
import {
  dateOnlyStringToUtcDate,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  parseDateOnlyString,
  toDateOnlyString,
} from "./occurrences.js";
import {
  evaluateClassPrerequisites,
  parseClassPrerequisites,
  parseProgramRankPolicy,
  type ProgramRankPolicy,
} from "./program-progress-policy.js";
import { financialEntitlementHoldReason } from "./entitlement-holds.js";
import { settleMembershipAllowance } from "./membership-allowances.js";
import { settlePunchCardBooking } from "./punch-card-ledger.js";
export class ProgramProgressError extends Error {}
export interface ProgressActor {
  workspaceId: string;
  userId: string;
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function prerequisiteFingerprint(policy: unknown, rules: unknown) {
  return hash({
    policy: parseProgramRankPolicy(policy),
    rules: parseClassPrerequisites(rules),
  });
}
async function staff(
  db: Prisma.TransactionClient,
  actor: ProgressActor,
  capability: "canManageProgress" | "canOverridePrerequisites" | "owner",
) {
  const person = await db.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      isActive: true,
      role: { in: ["OWNER", "COACH"] },
    },
  });
  if (
    !person ||
    (person.role !== "OWNER" && (capability === "owner" || !person[capability]))
  )
    throw new ProgramProgressError(
      "You do not have permission to change this program's progress records.",
    );
  return person;
}
export async function checkMemberClassEligibility(args: {
  workspaceId: string;
  memberId: string;
  scheduledForDate: string;
  occurrence: Pick<ResolvedClassOccurrence, "classTemplateId" | "programId"> & {
    prerequisites?: unknown;
  };
  policyOverride?: ProgramRankPolicy;
  db?: Prisma.TransactionClient | PrismaClient;
  ignoreException?: boolean;
  prospectiveRank?: {
    rankKey: string;
    rankName: string;
    stripeCount: number;
    effectiveOn: string;
  };
}) {
  const db = args.db ?? prisma;
  const [member, program, promotion] = await Promise.all([
    db.member.findFirst({
      where: { id: args.memberId, workspaceId: args.workspaceId },
      select: { dateOfBirth: true, tags: true },
    }),
    db.program.findFirst({
      where: { id: args.occurrence.programId, workspaceId: args.workspaceId },
      select: { rankPolicy: true },
    }),
    db.programPromotion.findFirst({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        programId: args.occurrence.programId,
        effectiveOn: { lte: dateOnlyStringToUtcDate(args.scheduledForDate) },
      },
      orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
  ]);
  const policy = args.policyOverride ?? program?.rankPolicy,
    fingerprint = prerequisiteFingerprint(
      policy,
      args.occurrence.prerequisites,
    );
  if (!member || !program)
    return {
      eligible: false,
      reason: "Member or program is unavailable.",
      currentRank: "Unranked",
      fingerprint,
    };
  const rank =
    args.prospectiveRank &&
    args.prospectiveRank.effectiveOn <= args.scheduledForDate &&
    (!promotion ||
      args.prospectiveRank.effectiveOn >=
        toDateOnlyString(promotion.effectiveOn))
      ? args.prospectiveRank
      : promotion;
  const outcome = evaluateClassPrerequisites({
    policy,
    rules: args.occurrence.prerequisites,
    date: args.scheduledForDate,
    dateOfBirth: member.dateOfBirth,
    tags: member.tags,
    rank,
  });
  if (!outcome.eligible && !args.ignoreException) {
    const exception = await db.classPrerequisiteException.findUnique({
      where: {
        workspaceId_classTemplateId_memberId_scheduledForDate_policyFingerprint:
          {
            workspaceId: args.workspaceId,
            classTemplateId: args.occurrence.classTemplateId,
            memberId: args.memberId,
            scheduledForDate: dateOnlyStringToUtcDate(args.scheduledForDate),
            policyFingerprint: fingerprint,
          },
      },
    });
    if (exception)
      return {
        eligible: true,
        reason: "The gym approved an exception for this class date.",
        currentRank: outcome.currentRank,
        fingerprint,
      };
  }
  return { ...outcome, fingerprint };
}
export interface IneligibleClassBooking {
  bookingId: string;
  classTemplateId: string;
  memberId: string;
  memberName: string;
  date: string;
  title: string;
  reason: string;
  fingerprint: string;
}
export async function resolveIneligibleClassBookingsTx(args: {
  db: Prisma.TransactionClient;
  actor: ProgressActor;
  affected: IneligibleClassBooking[];
  resolution: "CANCEL" | "EXCEPTION";
  reason: string;
  now: Date;
}) {
  if (!args.affected.length) return;
  if (args.reason.trim().length < 5)
    throw new ProgramProgressError(
      "Explain why these bookings are being cancelled or granted an exception.",
    );
  const actor = await staff(
    args.db,
    args.actor,
    args.resolution === "EXCEPTION" ? "canOverridePrerequisites" : "owner",
  );
  for (const item of args.affected) {
    const booking = await args.db.classBooking.findFirst({
      where: {
        id: item.bookingId,
        workspaceId: args.actor.workspaceId,
        memberId: item.memberId,
        status: "BOOKED",
      },
    });
    if (!booking)
      throw new ProgramProgressError(
        "A booking changed. Review the affected bookings again.",
      );
    const held = await financialEntitlementHoldReason({
      workspaceId: args.actor.workspaceId,
      targets: [
        { targetKind: "BOOKING", targetId: booking.id },
        { targetKind: "BOOKING", targetId: booking.fundedByBookingId },
        { targetKind: "MEMBERSHIP", targetId: booking.fundingMembershipId },
        { targetKind: "PUNCH_CARD", targetId: booking.memberPunchCardId },
      ],
      db: args.db,
    });
    if (held) throw new ProgramProgressError(held);
    if (args.resolution === "EXCEPTION") {
      await args.db.classPrerequisiteException.upsert({
        where: {
          workspaceId_classTemplateId_memberId_scheduledForDate_policyFingerprint:
            {
              workspaceId: args.actor.workspaceId,
              classTemplateId: item.classTemplateId,
              memberId: item.memberId,
              scheduledForDate: booking.scheduledForDate,
              policyFingerprint: item.fingerprint,
            },
        },
        update: {},
        create: {
          workspaceId: args.actor.workspaceId,
          classTemplateId: item.classTemplateId,
          memberId: item.memberId,
          scheduledForDate: booking.scheduledForDate,
          policyFingerprint: item.fingerprint,
          actorWorkspaceUserId: actor.id,
          reason: args.reason.trim(),
        },
      });
    } else {
      const pack = await settlePunchCardBooking({
        workspaceId: args.actor.workspaceId,
        bookingId: booking.id,
        outcome: "PROVIDER_CANCEL",
        actorWorkspaceUserId: actor.id,
        db: args.db,
      });
      if (!pack.ok) throw new ProgramProgressError(pack.message);
      await settleMembershipAllowance({
        workspaceId: args.actor.workspaceId,
        bookingId: booking.id,
        outcome: "PROVIDER_CANCEL",
        actorWorkspaceUserId: actor.id,
        db: args.db,
      });
      const original = booking.fundedByBookingId
        ? await args.db.classBooking.findFirst({
            where: {
              id: booking.fundedByBookingId,
              workspaceId: args.actor.workspaceId,
            },
          })
        : booking;
      if (original?.dropInPaidAt) {
        const sourceFunding = await args.db.importedBookingFunding.findUnique({
          where: { bookingId: original.id },
          include: { evidence: { include: { payment: true } } },
        });
        const payment = original.dropInPaymentIntentId
          ? await args.db.payment.findFirst({
              where: {
                workspaceId: args.actor.workspaceId,
                stripePaymentIntentId: original.dropInPaymentIntentId,
              },
            })
          : sourceFunding?.evidence.payment;
        await args.db.financialReviewCase.upsert({
          where: {
            workspaceId_sourceKey: {
              workspaceId: args.actor.workspaceId,
              sourceKey: `eligibility-cancel:${booking.id}:${booking.fundingRevision}`,
            },
          },
          update: {},
          create: {
            workspaceId: args.actor.workspaceId,
            sourceKey: `eligibility-cancel:${booking.id}:${booking.fundingRevision}`,
            reason: sourceFunding
              ? "Gym changed eligibility — arrange source-system refund or agreed credit"
              : "Gym changed eligibility — arrange refund or agreed credit",
            memberId: booking.memberId,
            bookingId: booking.id,
            paymentId: payment?.id,
            payerAccountId: payment?.payerAccountId,
            amountCents: original.dropInPriceCents,
            currency: original.dropInCurrency,
          },
        });
      }
      await args.db.classBooking.update({
        where: { id: booking.id },
        data: {
          status: "CANCELLED",
          consumedPunchCount: 0,
          providerChangedAt: args.now,
        },
      });
    }
    const recipients = await memberNotificationRecipients(
      args.db,
      args.actor.workspaceId,
      [item.memberId],
    );
    for (const { email, name } of recipients)
      await args.db.notificationJob.create({
        data: {
          workspaceId: args.actor.workspaceId,
          templateKind: "ANNOUNCEMENT",
          recipientEmail: email,
          recipientName: name,
          subject: "Class booking update",
          body: `${item.date}: ${args.resolution === "CANCEL" ? "The gym cancelled a booking after changing class eligibility. Any class allowance or pack unit was restored." : "The gym approved an eligibility exception for a booking."} Open your member portal for details.`,
          status: "PENDING",
          nextAttemptAt: args.now,
          context: { kind: "MEMBER_ACCESS", memberId: item.memberId },
        },
      });
  }
}
async function inspectProgramPolicy(
  db: Prisma.TransactionClient,
  actor: ProgressActor,
  programId: string,
  policy: ProgramRankPolicy,
  now: Date,
) {
  await staff(db, actor, "owner");
  const program = await db.program.findFirst({
    where: { id: programId, workspaceId: actor.workspaceId, archivedAt: null },
  });
  if (!program) throw new ProgramProgressError("Program not found.");
  const current = parseProgramRankPolicy(program.rankPolicy);
  const canonical = parseProgramRankPolicy({
    ...policy,
    version: (current?.version ?? 0) + 1,
  });
  if (!canonical)
    throw new ProgramProgressError(
      "Choose a mode and ordered, uniquely named ranks with valid stripe limits.",
    );
  const promotions = await db.programPromotion.findMany({
    where: { workspaceId: actor.workspaceId, programId },
  });
  if (
    promotions.some(
      (entry) =>
        !canonical.ranks.some(
          (rank) =>
            rank.key === entry.rankKey && rank.maxStripes >= entry.stripeCount,
        ),
    )
  )
    throw new ProgramProgressError(
      "Keep ranks and stripe limits that are used in promotion history. Turn the module off to hide it without erasing history.",
    );
  const timezone = (await db.location.findUnique({
    where: { workspaceId: actor.workspaceId },
  }))!.timezone;
  const bookings = await db.classBooking.findMany({
    where: {
      workspaceId: actor.workspaceId,
      status: { in: ["BOOKED", "PENDING_PAYMENT"] },
      scheduledForDate: {
        gte: dateOnlyStringToUtcDate(getWorkspaceDateString(now, timezone)),
      },
    },
    include: {
      classTemplate: { include: classOccurrenceInclude },
      member: { select: { fullName: true } },
    },
  });
  const affected: IneligibleClassBooking[] = [];
  for (const booking of bookings) {
    const date = toDateOnlyString(booking.scheduledForDate),
      occurrence = resolveClassOccurrence({
        template: booking.classTemplate as unknown as ClassOccurrenceTemplate,
        scheduledForDate: date,
      });
    if (
      !occurrence ||
      occurrence.programId !== programId ||
      getZonedDateTimeAsUtc({
        dateString: date,
        minutes: occurrence.startTimeMinutes,
        timezone,
      }) <= now
    )
      continue;
    const result = await checkMemberClassEligibility({
      workspaceId: actor.workspaceId,
      memberId: booking.memberId,
      scheduledForDate: date,
      occurrence,
      policyOverride: canonical,
      db,
    });
    if (!result.eligible) {
      if (booking.status === "PENDING_PAYMENT")
        throw new ProgramProgressError(
          "Resolve pending class payments before changing eligibility rules.",
        );
      affected.push({
        bookingId: booking.id,
        classTemplateId: booking.classTemplateId,
        memberId: booking.memberId,
        memberName: booking.member.fullName,
        date,
        title: occurrence.displayTitle,
        reason: result.reason!,
        fingerprint: result.fingerprint,
      });
    }
  }
  return {
    policy: canonical,
    affected,
    token: hash({ program, promotions, bookings, canonical, affected }),
  };
}
export async function reviewProgramRankPolicy(
  actor: ProgressActor,
  args: {
    programId: string;
    policy: ProgramRankPolicy;
    db?: PrismaClient;
    now?: Date;
  },
) {
  return (args.db ?? prisma).$transaction((db) =>
    inspectProgramPolicy(
      db,
      actor,
      args.programId,
      args.policy,
      args.now ?? new Date(),
    ),
  );
}
export async function saveProgramRankPolicy(
  actor: ProgressActor,
  args: {
    programId: string;
    policy: ProgramRankPolicy;
    reviewToken: string;
    operationKey: string;
    reason: string;
    resolution?: "CANCEL" | "EXCEPTION";
    db?: PrismaClient;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  return (args.db ?? prisma).$transaction(async (db) => {
    await lockClassSchedule(db, actor.workspaceId);
    const owner = await staff(db, actor, "owner");
    const replay = await db.programRankChange.findUnique({
      where: {
        workspaceId_operationKey: {
          workspaceId: actor.workspaceId,
          operationKey: args.operationKey,
        },
      },
    });
    if (replay) {
      if (
        replay.programId !== args.programId ||
        JSON.stringify({
          mode: parseProgramRankPolicy(replay.after)?.mode,
          ranks: parseProgramRankPolicy(replay.after)?.ranks,
        }) !==
          JSON.stringify({ mode: args.policy.mode, ranks: args.policy.ranks })
      )
        throw new ProgramProgressError(
          "This request belongs to another program.",
        );
      return replay;
    }
    const review = await inspectProgramPolicy(
      db,
      actor,
      args.programId,
      args.policy,
      now,
    );
    if (review.token !== args.reviewToken)
      throw new ProgramProgressError(
        "The program or its bookings changed. Review again before saving.",
      );
    if (review.affected.length && !args.resolution)
      throw new ProgramProgressError(
        "Choose how to resolve the affected bookings before saving.",
      );
    if (!args.reason.trim())
      throw new ProgramProgressError("Record a reason for this policy change.");
    await resolveIneligibleClassBookingsTx({
      db,
      actor,
      affected: review.affected,
      resolution: args.resolution ?? "CANCEL",
      reason: args.reason,
      now,
    });
    const previous = await db.program.findUniqueOrThrow({
      where: { id: args.programId },
    });
    await db.program.update({
      where: { id: args.programId },
      data: {
        rankPolicy: review.policy as unknown as Prisma.InputJsonValue,
        progressTrackingEnabled: review.policy.mode !== "OFF",
      },
    });
    return db.programRankChange.create({
      data: {
        workspaceId: actor.workspaceId,
        programId: args.programId,
        actorWorkspaceUserId: owner.id,
        before: previous.rankPolicy ?? Prisma.JsonNull,
        after: review.policy as unknown as Prisma.InputJsonValue,
        reason: args.reason.trim(),
        operationKey: args.operationKey,
      },
    });
  });
}
export async function recordProgramPromotion(
  actor: ProgressActor,
  args: {
    programId: string;
    memberId: string;
    rankKey: string;
    stripeCount: number;
    effectiveOn: string;
    awardedByWorkspaceUserId: string;
    internalNote?: string;
    publicNote?: string;
    operationKey: string;
    db?: PrismaClient;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  return (args.db ?? prisma).$transaction(async (db) => {
    await lockClassSchedule(db, actor.workspaceId);
    const recorder = await staff(db, actor, "canManageProgress");
    const replay = await db.programPromotion.findUnique({
      where: {
        workspaceId_operationKey: {
          workspaceId: actor.workspaceId,
          operationKey: args.operationKey,
        },
      },
    });
    if (replay) {
      if (
        replay.memberId !== args.memberId ||
        replay.programId !== args.programId ||
        replay.rankKey !== args.rankKey ||
        replay.stripeCount !== args.stripeCount
      )
        throw new ProgramProgressError(
          "This request was already used for another promotion.",
        );
      return replay;
    }
    const [program, member, awarder, location] = await Promise.all([
      db.program.findFirst({
        where: {
          id: args.programId,
          workspaceId: actor.workspaceId,
          archivedAt: null,
        },
      }),
      db.member.findFirst({
        where: { id: args.memberId, workspaceId: actor.workspaceId },
      }),
      db.workspaceUser.findFirst({
        where: {
          id: args.awardedByWorkspaceUserId,
          workspaceId: actor.workspaceId,
          isActive: true,
          role: { in: ["OWNER", "COACH"] },
        },
      }),
      db.location.findUnique({ where: { workspaceId: actor.workspaceId } }),
    ]);
    const policy = parseProgramRankPolicy(program?.rankPolicy),
      rank = policy?.ranks.find((rank) => rank.key === args.rankKey);
    if (
      !member ||
      !program ||
      !awarder ||
      !policy ||
      policy.mode === "OFF" ||
      !rank ||
      !Number.isInteger(args.stripeCount) ||
      args.stripeCount < 0 ||
      args.stripeCount > rank.maxStripes
    )
      throw new ProgramProgressError(
        "Choose a member, configured rank, stripe count, and awarding coach in this gym.",
      );
    if (
      parseDateOnlyString(args.effectiveOn).status === "error" ||
      args.effectiveOn > getWorkspaceDateString(now, location!.timezone)
    )
      throw new ProgramProgressError("Use today or an earlier promotion date.");
    if (
      (args.internalNote?.length ?? 0) > 2000 ||
      (args.publicNote?.length ?? 0) > 2000
    )
      throw new ProgramProgressError(
        "Keep promotion notes under 2,000 characters.",
      );
    const bookings = await db.classBooking.findMany({
      where: {
        workspaceId: actor.workspaceId,
        memberId: args.memberId,
        status: { in: ["BOOKED", "PENDING_PAYMENT"] },
        scheduledForDate: {
          gte: dateOnlyStringToUtcDate(
            getWorkspaceDateString(now, location!.timezone),
          ),
        },
      },
      include: { classTemplate: { include: classOccurrenceInclude } },
    });
    for (const booking of bookings) {
      const date = toDateOnlyString(booking.scheduledForDate),
        occurrence = resolveClassOccurrence({
          template: booking.classTemplate as unknown as ClassOccurrenceTemplate,
          scheduledForDate: date,
        });
      if (!occurrence || occurrence.programId !== args.programId) continue;
      const result = await checkMemberClassEligibility({
        workspaceId: actor.workspaceId,
        memberId: args.memberId,
        scheduledForDate: date,
        occurrence,
        prospectiveRank: {
          rankKey: rank.key,
          rankName: rank.name,
          stripeCount: args.stripeCount,
          effectiveOn: args.effectiveOn,
        },
        db,
      });
      if (!result.eligible)
        throw new ProgramProgressError(
          `This would make the ${date} ${occurrence.displayTitle} booking ineligible. Grant a reasoned exception or cancel it without penalty before recording the correction.`,
        );
    }
    return db.programPromotion.create({
      data: {
        workspaceId: actor.workspaceId,
        programId: args.programId,
        memberId: args.memberId,
        rankKey: rank.key,
        rankName: rank.name,
        stripeCount: args.stripeCount,
        effectiveOn: dateOnlyStringToUtcDate(args.effectiveOn),
        awardedByWorkspaceUserId: awarder.id,
        recordedByWorkspaceUserId: recorder.id,
        internalNote: args.internalNote?.trim() || null,
        publicNote: args.publicNote?.trim() || null,
        operationKey: args.operationKey,
      },
    });
  });
}
export async function getMemberProgramProgress(
  actor: ProgressActor,
  memberId: string,
  db: PrismaClient | Prisma.TransactionClient = prisma,
) {
  const [viewer, member, grant] = await Promise.all([
    db.workspaceUser.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        isActive: true,
      },
    }),
    db.member.findFirst({
      where: { id: memberId, workspaceId: actor.workspaceId },
    }),
    db.memberPortalGrant.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        memberId,
        userId: actor.userId,
        revokedAt: null,
        guardian: {
          familyLinks: {
            some: { workspaceId: actor.workspaceId, childMemberId: memberId },
          },
        },
      },
    }),
  ]);
  const internal =
    viewer?.role === "OWNER" ||
    (viewer?.role === "COACH" && viewer.canManageProgress);
  if (
    !viewer ||
    !member ||
    (!internal &&
      !(viewer.role === "COACH" && viewer.canOverridePrerequisites) &&
      member.userId !== actor.userId &&
      !grant)
  )
    throw new ProgramProgressError(
      "You do not have access to this member's progress.",
    );
  const programs = await db.program.findMany({
    where: { workspaceId: actor.workspaceId, archivedAt: null },
    include: {
      programPromotions: {
        where: { memberId },
        include: {
          awardedBy: { select: { user: { select: { fullName: true } } } },
        },
        orderBy: [
          { effectiveOn: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
      },
    },
    orderBy: { name: "asc" },
  });
  return programs.flatMap((program) => {
    const policy = parseProgramRankPolicy(program.rankPolicy);
    if (!policy || policy.mode === "OFF") return [];
    return [
      {
        id: program.id,
        name: program.name,
        policy,
        canRecord: Boolean(internal),
        history: program.programPromotions.map((entry) => ({
          id: entry.id,
          rankKey: entry.rankKey,
          rankName: entry.rankName,
          stripeCount: entry.stripeCount,
          effectiveOn: toDateOnlyString(entry.effectiveOn),
          awardedBy: entry.awardedBy.user.fullName ?? "Coach",
          publicNote: entry.publicNote,
          ...(internal ? { internalNote: entry.internalNote } : {}),
        })),
      },
    ];
  });
}
export async function setProgressCapabilities(
  actor: ProgressActor,
  args: {
    workspaceUserId: string;
    canManageProgress: boolean;
    canOverridePrerequisites: boolean;
    db?: PrismaClient;
  },
) {
  return (args.db ?? prisma).$transaction(async (db) => {
    await staff(db, actor, "owner");
    const changed = await db.workspaceUser.updateMany({
      where: {
        id: args.workspaceUserId,
        workspaceId: actor.workspaceId,
        role: "COACH",
        isActive: true,
      },
      data: {
        canManageProgress: args.canManageProgress,
        canOverridePrerequisites: args.canOverridePrerequisites,
      },
    });
    if (changed.count !== 1)
      throw new ProgramProgressError("Choose an active coach in this gym.");
    await db.workspaceDataEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        kind: "PROGRESS_CAPABILITIES_CHANGED",
        metadata: {
          workspaceUserId: args.workspaceUserId,
          canManageProgress: args.canManageProgress,
          canOverridePrerequisites: args.canOverridePrerequisites,
        },
      },
    });
  });
}

export async function grantClassEligibilityException(
  actor: ProgressActor,
  args: {
    memberId: string;
    classTemplateId: string;
    date: string;
    reason: string;
    db?: PrismaClient;
  },
) {
  return (args.db ?? prisma).$transaction(async (db) => {
    await lockClassSchedule(db, actor.workspaceId);
    const person = await staff(db, actor, "canOverridePrerequisites");
    if (
      args.reason.trim().length < 5 ||
      args.reason.length > 1000 ||
      parseDateOnlyString(args.date).status === "error"
    )
      throw new ProgramProgressError(
        "Choose a class date and explain the exception.",
      );
    const template = await db.classTemplate.findFirst({
      where: {
        id: args.classTemplateId,
        workspaceId: actor.workspaceId,
        archivedAt: null,
      },
      include: classOccurrenceInclude,
    });
    const occurrence =
      template &&
      resolveClassOccurrence({
        template: template as unknown as ClassOccurrenceTemplate,
        scheduledForDate: args.date,
      });
    if (!occurrence || occurrence.status !== "ACTIVE")
      throw new ProgramProgressError(
        "Choose an active class date in this gym.",
      );
    const member = await db.member.findFirst({
      where: { id: args.memberId, workspaceId: actor.workspaceId },
      select: { id: true },
    });
    if (!member) throw new ProgramProgressError("Member not found.");
    const result = await checkMemberClassEligibility({
      workspaceId: actor.workspaceId,
      memberId: args.memberId,
      scheduledForDate: args.date,
      occurrence,
      db,
      ignoreException: true,
    });
    return db.classPrerequisiteException.upsert({
      where: {
        workspaceId_classTemplateId_memberId_scheduledForDate_policyFingerprint:
          {
            workspaceId: actor.workspaceId,
            classTemplateId: args.classTemplateId,
            memberId: args.memberId,
            scheduledForDate: dateOnlyStringToUtcDate(args.date),
            policyFingerprint: result.fingerprint,
          },
      },
      update: {},
      create: {
        workspaceId: actor.workspaceId,
        classTemplateId: args.classTemplateId,
        memberId: args.memberId,
        scheduledForDate: dateOnlyStringToUtcDate(args.date),
        policyFingerprint: result.fingerprint,
        actorWorkspaceUserId: person.id,
        reason: args.reason.trim(),
      },
    });
  });
}
