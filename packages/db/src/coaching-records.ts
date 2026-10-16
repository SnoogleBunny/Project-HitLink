import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  CoachingError,
  type CoachingActor,
  type CoachingCommand,
} from "./coaching.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { toDateOnlyString } from "./occurrences.js";
import { coachingExpectedDeliveryDates } from "./coaching-appointments.js";
import {
  financialRequestHash,
  lockFinancialAccount,
} from "./financial-operations.js";

const shared = globalThis as typeof globalThis & {
  coachingPrisma?: PrismaClient;
};
const prisma = shared.coachingPrisma ?? new PrismaClient({ log: [] });
shared.coachingPrisma = prisma;
type Tx = Prisma.TransactionClient;
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function fail(message: string): never {
  throw new CoachingError(message);
}
function required(value: unknown, label: string, max = 2000) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max)
    fail(`${label} is required and must be ${max} characters or fewer.`);
  return text;
}

async function context(
  tx: Tx,
  actor: CoachingActor,
  enrollmentId: string,
  additionallyAllowedStaffIds: string[] = [],
) {
  const [enrollment, staff, customer] = await Promise.all([
    tx.coachingEnrollment.findFirst({
      where: {
        id: enrollmentId,
        workspaceId: actor.workspaceId,
        workspace: { status: { not: "DISABLED" } },
      },
      include: {
        member: true,
        programVersion: { include: { program: true } },
        currentCoach: true,
      },
    }),
    tx.workspaceUser.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        isActive: true,
        role: { in: ["OWNER", "COACH"] },
      },
    }),
    tx.workspaceUser.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        isActive: true,
        role: "CUSTOMER",
      },
    }),
  ]);
  if (!enrollment) fail("Program not found.");
  const own = !!customer && enrollment.member.userId === actor.userId;
  const owner = staff?.role === "OWNER";
  const coach = !!staff && enrollment.currentCoachWorkspaceUserId === staff.id;
  if (
    !own &&
    !owner &&
    !coach &&
    (!staff || !additionallyAllowedStaffIds.includes(staff.id))
  )
    fail("This account cannot access the program records.");
  if (
    own &&
    enrollment.retrievalUntil &&
    enrollment.retrievalUntil < new Date()
  )
    fail(
      "The record retrieval window has ended. Contact the gym's records contact.",
    );
  return { enrollment, staff, own, owner, coach };
}

async function obligations(
  tx: Tx,
  enrollment: Awaited<ReturnType<typeof context>>["enrollment"],
) {
  const [appointments, notes, pauses, payment, holds, acceptedPlans] =
    await Promise.all([
      tx.coachingAppointment.findMany({
        where: {
          workspaceId: enrollment.workspaceId,
          enrollmentId: enrollment.id,
        },
        select: {
          id: true,
          status: true,
          unitState: true,
          startsAt: true,
          version: true,
        },
        orderBy: { id: "asc" },
      }),
      tx.coachingDailyNote.findMany({
        where: {
          enrollmentId: enrollment.id,
          publishedAt: { not: null },
          withdrawnAt: null,
        },
        select: { localDate: true },
        orderBy: { localDate: "asc" },
      }),
      tx.coachingEvent.findMany({
        where: {
          workspaceId: enrollment.workspaceId,
          enrollmentId: enrollment.id,
          kind: "pause",
        },
        select: { metadata: true },
      }),
      enrollment.paymentId
        ? tx.payment.findFirst({
            where: {
              id: enrollment.paymentId,
              workspaceId: enrollment.workspaceId,
              memberId: enrollment.memberId,
            },
            select: {
              id: true,
              status: true,
              amountCents: true,
              refundedAmountCents: true,
              currency: true,
            },
          })
        : null,
      tx.financialEntitlementHold.count({
        where: {
          workspaceId: enrollment.workspaceId,
          targetKind: "COACHING",
          targetId: enrollment.id,
          activeSlot: "ACTIVE",
        },
      }),
      tx.coachingAcceptedPlan.findMany({
        where: {
          workspaceId: enrollment.workspaceId,
          enrollmentId: enrollment.id,
        },
        select: {
          startsOn: true,
          endsOn: true,
          acceptedAt: true,
          snapshot: true,
        },
      }),
    ]);
  const ranges = pauses
    .map(
      (item) =>
        (item.metadata as { input?: { startsOn?: string; endsOn?: string } })
          ?.input,
    )
    .filter((item) => item?.startsOn && item.endsOn);
  const delivered = new Set(
    notes.map((note) => toDateOnlyString(note.localDate)),
  );
  const undeliveredDays = enrollment.acceptedAt
    ? coachingExpectedDeliveryDates({
        startsOn: enrollment.startsOn,
        endsOn: enrollment.endsOn,
        timezone: enrollment.timezone,
        weekdays: enrollment.programVersion.deliveryWeekdays,
        acceptedPlans,
        pauses: ranges.filter(
          (range): range is { startsOn: string; endsOn: string } =>
            !!range?.startsOn && !!range.endsOn,
        ),
      }).filter((day) => !delivered.has(day))
    : [];
  const usedUnits = appointments.filter(
    (item) => item.unitState === "CONSUMED",
  ).length;
  return {
    programVersionId: enrollment.programVersionId,
    startsOn: toDateOnlyString(enrollment.startsOn),
    endsOn: toDateOnlyString(enrollment.endsOn),
    includedUnits: enrollment.acceptedAt
      ? enrollment.programVersion.appointmentUnits
      : 0,
    usedUnits,
    unusedUnits: enrollment.acceptedAt
      ? Math.max(0, enrollment.programVersion.appointmentUnits - usedUnits)
      : 0,
    undeliveredDays,
    appointments,
    payment,
    pendingFinancialHolds: holds,
  };
}
function obligationFingerprint(
  snapshot: Awaited<ReturnType<typeof obligations>>,
) {
  return financialRequestHash({
    ...snapshot,
    pendingFinancialHolds: undefined,
    payment: snapshot.payment
      ? {
          id: snapshot.payment.id,
          status: snapshot.payment.status,
          amountCents: snapshot.payment.amountCents,
          currency: snapshot.payment.currency,
        }
      : null,
  });
}

export async function getCoachingSettlement(
  actor: CoachingActor,
  enrollmentId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const ctx = await context(tx, actor, enrollmentId);
    if (!ctx.owner && !ctx.own) return null;
    const snapshot = await obligations(tx, ctx.enrollment);
    const decisions = await tx.coachingSettlementDecision.findMany({
      where: { workspaceId: actor.workspaceId, enrollmentId },
      orderBy: { createdAt: "desc" },
    });
    return {
      snapshot,
      obligationHash: obligationFingerprint(snapshot),
      decisions,
      canPropose: !!ctx.owner,
      canAccept: ctx.own,
    };
  });
}

export async function executeCoachingSettlement(
  tx: Tx,
  actor: CoachingActor,
  command: CoachingCommand,
) {
  const {
    enrollment: e,
    owner,
    own,
  } = await context(tx, actor, command.enrollmentId ?? "");
  if (e.version !== command.expectedVersion)
    fail("The program changed. Reload its settlement before continuing.");
  if (!e.closedAt)
    fail(
      "Close program delivery before agreeing its final settlement. Closure does not decide money or record access.",
    );
  await lockFinancialAccount(tx, actor.workspaceId);
  const snapshot = await obligations(tx, e);
  const obligationHash = obligationFingerprint(snapshot);
  const input = command.input;
  const now = new Date();
  if (command.kind === "proposeSettlement") {
    if (!owner) fail("Only the owner can propose a commercial settlement.");
    if (input.obligationHash !== obligationHash)
      fail("The remaining obligations changed. Review them again.");
    const kind = required(input.settlementKind, "Settlement type", 30);
    if (!["NO_ADJUSTMENT", "REFUND", "ACCOUNT_CREDIT"].includes(kind))
      fail("Choose a settlement type.");
    const amountCents = Number(input.amountCents ?? 0);
    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents < 0 ||
      amountCents > 100000000 ||
      (kind === "NO_ADJUSTMENT" ? amountCents !== 0 : amountCents === 0)
    )
      fail(
        "Enter the agreed settlement amount in cents; no adjustment must be zero.",
      );
    await tx.coachingSettlementDecision.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        status: { in: ["PROPOSED", "ACCEPTED"] },
      },
      data: { status: "SUPERSEDED", supersededAt: now },
    });
    const decision = await tx.coachingSettlementDecision.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        kind,
        obligationHash,
        obligationSnapshot: json(snapshot),
        amountCents,
        currency: e.programVersion.currency,
        evidenceIds: [],
        reason: required(
          input.reason,
          "Commercial decision and remaining obligations",
        ),
        proposedByUserId: actor.userId,
      },
    });
    await tx.coachingEnrollment.update({
      where: { id: e.id },
      data: {
        settlementState: "AWAITING_CLIENT_ACCEPTANCE",
        settlementNote:
          "Review the proposed settlement in your program records.",
        version: { increment: 1 },
      },
    });
    return decision.id;
  }
  const decision =
    (await tx.coachingSettlementDecision.findFirst({
      where: {
        id: String(input.decisionId),
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
      },
    })) ?? fail("Settlement decision not found.");
  if (decision.status === "CONFIRMED") return decision.id;
  if (decision.supersededAt || decision.obligationHash !== obligationHash)
    fail(
      "The remaining obligations changed. The owner must propose a fresh settlement.",
    );
  if (command.kind === "acceptSettlement") {
    if (!own || input.confirmConsequences !== true)
      fail(
        "The adult client must review and accept the settlement from their own account.",
      );
    if (decision.status !== "PROPOSED")
      fail("This settlement is no longer awaiting acceptance.");
    await tx.coachingSettlementDecision.update({
      where: { id: decision.id },
      data: {
        status: "ACCEPTED",
        clientAcceptedAt: now,
        clientAcceptedByUserId: actor.userId,
      },
    });
    await tx.coachingEnrollment.update({
      where: { id: e.id },
      data: { settlementState: "AWAITING_EVIDENCE", version: { increment: 1 } },
    });
    return decision.id;
  }
  if (!owner || command.kind !== "confirmSettlement")
    fail("Only the owner can verify settlement evidence.");
  if (
    decision.status !== "ACCEPTED" ||
    !decision.clientAcceptedAt ||
    decision.clientAcceptedByUserId !== e.member.userId
  )
    fail("The client has not accepted this settlement.");
  if (
    snapshot.pendingFinancialHolds ||
    snapshot.appointments.some((item) =>
      ["HELD", "DISPUTED"].includes(item.unitState),
    )
  )
    fail(
      "Resolve held or disputed appointment units and pending financial changes first.",
    );
  if (
    e.programVersion.priceCents > 0 &&
    e.paymentState === "PAID" &&
    (!snapshot.payment || snapshot.payment.status !== "SUCCEEDED")
  )
    fail(
      "The original program payment needs verified evidence before settlement.",
    );
  const pending = await tx.financialOperation.count({
    where: {
      workspaceId: actor.workspaceId,
      OR: [
        { targetId: e.id },
        ...(e.paymentId ? [{ paymentId: e.paymentId }] : []),
      ],
      status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
    },
  });
  if (
    pending ||
    (e.paymentId &&
      (await tx.refund.count({
        where: {
          workspaceId: actor.workspaceId,
          paymentId: e.paymentId,
          status: "PENDING",
        },
      })))
  )
    fail(
      "A payment or refund is still pending. Verify its outcome before final settlement.",
    );
  if (
    (await tx.coachingRecordIncident.count({
      where: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        resolvedAt: null,
      },
    })) ||
    (await tx.coachingDeliveryException.count({
      where: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        status: "OPEN",
      },
    })) ||
    (e.paymentId &&
      (await tx.financialReviewCase.count({
        where: {
          workspaceId: actor.workspaceId,
          paymentId: e.paymentId,
          resolvedAt: null,
        },
      })))
  )
    fail(
      "Complete the assigned delivery, records and payment reviews before final settlement.",
    );
  const evidenceIds = [
    ...new Set(
      String(input.evidenceIds ?? "")
        .split(/[\s,]+/)
        .filter(Boolean),
    ),
  ];
  if (decision.kind === "NO_ADJUSTMENT") {
    if (evidenceIds.length)
      fail("No-adjustment settlement must not attach a money transfer.");
  } else {
    if (!evidenceIds.length || evidenceIds.length > 50)
      fail("Choose the verified records that satisfy the agreed amount.");
    const used = await tx.coachingSettlementDecision.count({
      where: {
        workspaceId: actor.workspaceId,
        id: { not: decision.id },
        status: "CONFIRMED",
        evidenceIds: { hasSome: evidenceIds },
      },
    });
    if (used) fail("This evidence already satisfies another settlement.");
    if (decision.kind === "REFUND") {
      if (!e.paymentId) fail("This program has no verified payment to refund.");
      const refunds = await tx.refund.findMany({
        where: {
          id: { in: evidenceIds },
          workspaceId: actor.workspaceId,
          paymentId: e.paymentId,
          status: "SUCCEEDED",
          currency: decision.currency,
          stripeRefundId: { not: null },
        },
      });
      if (
        refunds.length !== evidenceIds.length ||
        refunds.reduce((sum, row) => sum + row.amountCents, 0) !==
          decision.amountCents
      )
        fail(
          "Verified refunds for this exact program must equal the accepted amount.",
        );
    } else {
      const credits = await tx.financialOperation.findMany({
        where: {
          id: { in: evidenceIds },
          workspaceId: actor.workspaceId,
          kind: "ISSUE_CREDIT",
          status: "SUCCEEDED",
          currency: decision.currency,
          ...(e.payerAccountId
            ? { payerAccountId: e.payerAccountId }
            : { beneficiaryMemberId: e.memberId }),
        },
      });
      if (
        credits.length !== evidenceIds.length ||
        credits.reduce((sum, row) => sum + (row.amountCents ?? 0), 0) !==
          decision.amountCents
      )
        fail(
          "Verified credits for the authorized payer must equal the accepted amount.",
        );
      for (const credit of credits)
        if (
          !credit.targetId ||
          !(await tx.accountCredit.findFirst({
            where: {
              id: credit.targetId,
              workspaceId: actor.workspaceId,
              currency: decision.currency,
              originalAmountCents: credit.amountCents ?? -1,
            },
          }))
        )
          fail("The recorded credit is missing its account ledger.");
    }
  }
  await tx.coachingSettlementDecision.update({
    where: { id: decision.id },
    data: { status: "CONFIRMED", evidenceIds, confirmedAt: now },
  });
  await tx.coachingEnrollment.update({
    where: { id: e.id },
    data: {
      settlementState: "SETTLED",
      settlementNote: decision.reason,
      version: { increment: 1 },
    },
  });
  return decision.id;
}

export const coachingSettlementCommands = new Set([
  "proposeSettlement",
  "acceptSettlement",
  "confirmSettlement",
]);

/** A client archive is deliberately separate from the gym's operational export.
 * No query in this path selects a private note or an unpublished draft. */
export async function prepareCoachingRecordExport(
  actor: CoachingActor,
  enrollmentId: string,
) {
  const job = await prisma.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const ctx = await context(tx, actor, enrollmentId);
    if (!ctx.own)
      fail("Only the adult client can request this program archive.");
    return tx.coachingRecordExport.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId,
        requestedByUserId: actor.userId,
        resolverWorkspaceUserId: ctx.enrollment.caseOwnerWorkspaceUserId,
        expiresAt: new Date(Date.now() + 24 * 3600000),
      },
    });
  });
  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockClassSchedule(tx, actor.workspaceId);
        const { enrollment: e, own } = await context(tx, actor, enrollmentId);
        if (!own) fail("The client record authorization changed.");
        const [
          plans,
          intake,
          milestones,
          notes,
          appointments,
          agreements,
          decisions,
          payment,
        ] = await Promise.all([
          tx.coachingAcceptedPlan.findMany({
            where: { workspaceId: actor.workspaceId, enrollmentId },
            orderBy: { acceptedAt: "asc" },
          }),
          tx.coachingIntake.findUnique({
            where: { enrollmentId },
            select: {
              id: true,
              content: true,
              version: true,
              history: true,
              submittedAt: true,
              updatedAt: true,
            },
          }),
          tx.coachingMilestone.findMany({
            where: { enrollmentId },
            select: {
              id: true,
              title: true,
              dueOn: true,
              completedAt: true,
              version: true,
            },
          }),
          tx.coachingDailyNote.findMany({
            where: { enrollmentId, publishedAt: { not: null } },
            select: {
              id: true,
              localDate: true,
              publishedAt: true,
              withdrawnAt: true,
              revisions: {
                where: { withdrawnAt: null },
                select: {
                  id: true,
                  number: true,
                  body: true,
                  publishedAt: true,
                },
                orderBy: { number: "asc" },
              },
            },
            orderBy: { localDate: "asc" },
          }),
          tx.coachingAppointment.findMany({
            where: { workspaceId: actor.workspaceId, enrollmentId },
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,
              unitState: true,
              movedFromId: true,
              policySnapshot: true,
              events: {
                select: {
                  kind: true,
                  before: true,
                  after: true,
                  createdAt: true,
                },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { startsAt: "asc" },
          }),
          tx.coachingEvent.findMany({
            where: {
              workspaceId: actor.workspaceId,
              enrollmentId,
              kind: {
                in: [
                  "acceptPlan",
                  "acceptCoach",
                  "pause",
                  "resume",
                  "close",
                  "completeMilestone",
                ],
              },
            },
            select: { id: true, kind: true, metadata: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          }),
          tx.coachingSettlementDecision.findMany({
            where: { workspaceId: actor.workspaceId, enrollmentId },
            select: {
              id: true,
              kind: true,
              status: true,
              amountCents: true,
              currency: true,
              reason: true,
              evidenceIds: true,
              clientAcceptedAt: true,
              confirmedAt: true,
            },
            orderBy: { createdAt: "asc" },
          }),
          e.paymentId
            ? tx.payment.findFirst({
                where: {
                  id: e.paymentId,
                  workspaceId: actor.workspaceId,
                  memberId: e.memberId,
                },
                select: {
                  id: true,
                  status: true,
                  amountCents: true,
                  refundedAmountCents: true,
                  currency: true,
                  paidAt: true,
                  failedAt: true,
                  refunds: {
                    select: {
                      id: true,
                      status: true,
                      amountCents: true,
                      currency: true,
                      refundedAt: true,
                    },
                    orderBy: { createdAt: "asc" },
                  },
                },
              })
            : null,
        ]);
        const records = {
          formatVersion: 1,
          exportId: job.id,
          enrollmentId: e.id,
          program: e.programVersion.program.name,
          client: e.member.fullName,
          startDate: toDateOnlyString(e.startsOn),
          endDate: toDateOnlyString(e.endsOn),
          timezone: e.timezone,
          plan: e.programVersion,
          acceptedPlans: plans,
          acceptanceHistory: agreements,
          legacyAcceptance: plans.length
            ? null
            : {
                acceptedAt: e.acceptedAt,
                evidence:
                  "Current enrollment and retained acceptance events; no earlier plan snapshots have been invented.",
              },
          submittedIntake: intake,
          milestones,
          publishedNotes: notes.map((note) => ({
            id: note.id,
            date: toDateOnlyString(note.localDate),
            publishedAt: note.publishedAt,
            withdrawnAt: note.withdrawnAt,
            revisions: note.withdrawnAt ? [] : note.revisions,
          })),
          appointments,
          settlement: decisions,
          transactionHistory: payment ? [payment] : [],
          exportedAt: new Date().toISOString(),
          excluded: [
            "Private working notes",
            "Unpublished drafts",
            "Other people's financial records",
            "Authentication secrets",
          ],
        };
        const artifact = Buffer.from(JSON.stringify(records, null, 2), "utf8");
        if (artifact.length > 20 * 1024 * 1024)
          fail(
            "This archive exceeds the automatic download limit. The named records reviewer will arrange its scoped delivery.",
          );
        const checksum = createHash("sha256").update(artifact).digest("hex");
        await tx.coachingRecordExport.update({
          where: { id: job.id },
          data: { status: "READY", artifact, checksum },
        });
        await tx.coachingEnrollment.update({
          where: { id: e.id },
          data: { exportState: "READY" },
        });
        await tx.coachingRecordAccessEvent.create({
          data: {
            workspaceId: actor.workspaceId,
            enrollmentId,
            actorUserId: actor.userId,
            kind: "EXPORT_PREPARED",
            purpose: "Client requested their own scoped program archive",
            scope: { exportId: job.id, checksum },
          },
        });
        return { id: job.id, checksum, records };
      },
      { timeout: 20000 },
    );
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await lockClassSchedule(tx, actor.workspaceId);
      await tx.coachingRecordExport.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          failureCode: "SCOPED_EXPORT_REVIEW_REQUIRED",
          artifact: null,
        },
      });
      await tx.coachingEnrollment.update({
        where: { id: enrollmentId },
        data: { exportState: "FAILED_REVIEW_REQUIRED" },
      });
    });
    if (error instanceof CoachingError) throw error;
    fail(
      `The archive could not be prepared. Records review reference: ${job.id}.`,
    );
  }
}

export async function downloadCoachingRecordExport(
  actor: CoachingActor,
  enrollmentId: string,
  exportId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const { own } = await context(tx, actor, enrollmentId);
    if (!own) fail("Only the adult client can download this archive.");
    const job = await tx.coachingRecordExport.findFirst({
      where: {
        id: exportId,
        workspaceId: actor.workspaceId,
        enrollmentId,
        requestedByUserId: actor.userId,
      },
    });
    if (
      !job ||
      !["READY", "RECEIVED"].includes(job.status) ||
      !job.artifact ||
      !job.checksum ||
      job.expiresAt <= new Date()
    )
      fail("This archive is unavailable or expired. Prepare a new copy.");
    if (
      createHash("sha256").update(job.artifact).digest("hex") !== job.checksum
    )
      fail(
        "The archive checksum failed. Ask the records reviewer to prepare a new copy.",
      );
    await tx.coachingRecordExport.update({
      where: { id: job.id },
      data: { downloadedAt: new Date() },
    });
    await tx.coachingRecordAccessEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId,
        actorUserId: actor.userId,
        kind: "EXPORT_DOWNLOADED",
        purpose: "Client retrieved their own scoped archive",
        scope: { exportId: job.id, checksum: job.checksum },
      },
    });
    return { id: job.id, checksum: job.checksum, artifact: job.artifact };
  });
}

export async function getCoachingExportHistory(
  actor: CoachingActor,
  enrollmentId: string,
) {
  return prisma.$transaction(async (tx) => {
    const { owner, own } = await context(tx, actor, enrollmentId);
    if (!owner && !own) return [];
    return tx.coachingRecordExport.findMany({
      where: { workspaceId: actor.workspaceId, enrollmentId },
      select: {
        id: true,
        status: true,
        checksum: true,
        failureCode: true,
        resolverWorkspaceUserId: true,
        expiresAt: true,
        downloadedAt: true,
        receiptConfirmedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });
}

export async function confirmCoachingExportReceipt(
  actor: CoachingActor,
  enrollmentId: string,
  exportId: string,
  checksum: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const { own } = await context(tx, actor, enrollmentId);
    if (!own) fail("Only the client can confirm receipt of their archive.");
    const job = await tx.coachingRecordExport.findFirst({
      where: {
        id: exportId,
        workspaceId: actor.workspaceId,
        enrollmentId,
        requestedByUserId: actor.userId,
      },
    });
    if (
      !job ||
      !["READY", "RECEIVED"].includes(job.status) ||
      !job.artifact ||
      !job.downloadedAt ||
      job.checksum !== checksum ||
      job.expiresAt <= new Date()
    )
      fail("Download and check the current archive before confirming receipt.");
    await tx.coachingRecordExport.update({
      where: { id: job.id },
      data: {
        status: "RECEIVED",
        receiptConfirmedAt: job.receiptConfirmedAt ?? new Date(),
      },
    });
    await tx.coachingEnrollment.update({
      where: { id: enrollmentId },
      data: { exportState: "RECEIVED" },
    });
    return job.id;
  });
}

export async function expireCoachingRecordExports(now = new Date()) {
  return prisma.coachingRecordExport.updateMany({
    where: { expiresAt: { lte: now }, artifact: { not: null } },
    data: { artifact: null, status: "EXPIRED" },
  });
}

export const coachingIncidentCommands = new Set([
  "withdrawDailyNote",
  "resolveRecordIncident",
  "proposeRecordReview",
  "approveRecordReview",
  "revokeRecordReview",
]);
export async function executeCoachingIncident(
  tx: Tx,
  actor: CoachingActor,
  command: CoachingCommand,
) {
  const input = command.input;
  const grant = ["approveRecordReview", "revokeRecordReview"].includes(
    command.kind,
  )
    ? await tx.coachingRecordReviewGrant.findFirst({
        where: {
          id: String(input.grantId),
          workspaceId: actor.workspaceId,
          enrollmentId: command.enrollmentId,
        },
      })
    : null;
  const ctx = await context(
    tx,
    actor,
    command.enrollmentId ?? "",
    grant ? [grant.authorWorkspaceUserId, grant.reviewerWorkspaceUserId] : [],
  );
  const e = ctx.enrollment;
  if (e.version !== command.expectedVersion)
    fail("The program changed. Reload its record review before continuing.");
  const now = new Date();
  let resultId = e.id;
  if (command.kind === "withdrawDailyNote") {
    const note =
      (await tx.coachingDailyNote.findFirst({
        where: {
          enrollmentId: e.id,
          localDate: new Date(`${String(input.localDate)}T00:00:00Z`),
        },
        select: {
          id: true,
          authorWorkspaceUserId: true,
          publishedAt: true,
          version: true,
        },
      })) ?? fail("Published note not found.");
    if (
      !ctx.owner &&
      (!ctx.coach || note.authorWorkspaceUserId !== ctx.staff?.id)
    )
      fail("Only its current author or an owner can contain a publication.");
    if (!note.publishedAt || note.version !== Number(input.noteVersion))
      fail("This publication changed. Reload it before withdrawal.");
    const reason = required(
      input.reason,
      "Incident reason without private content",
      1000,
    );
    await tx.coachingDailyNote.update({
      where: { id: note.id },
      data: {
        status: "WITHDRAWN",
        withdrawnAt: now,
        version: { increment: 1 },
      },
    });
    await tx.coachingDailyNoteRevision.updateMany({
      where: { noteId: note.id, withdrawnAt: null },
      data: { withdrawnAt: now },
    });
    await tx.notificationJob.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        status: { in: ["PENDING", "FAILED"] },
        context: { path: ["noteId"], equals: note.id },
      },
      data: {
        status: "CANCELLED",
        nextAttemptAt: null,
        lastError: "Suppressed after publication withdrawal.",
      },
    });
    await tx.coachingRecordExport.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        artifact: { not: null },
      },
      data: { artifact: null, status: "WITHDRAWN_FOR_PRIVACY" },
    });
    const reviewer = ctx.owner
      ? ctx.staff!
      : ((await tx.workspaceUser.findFirst({
          where: {
            id: e.caseOwnerWorkspaceUserId,
            workspaceId: actor.workspaceId,
            role: "OWNER",
            isActive: true,
          },
        })) ??
        (await tx.workspaceUser.findFirst({
          where: {
            workspaceId: actor.workspaceId,
            role: "OWNER",
            isActive: true,
          },
          orderBy: { id: "asc" },
        })));
    if (!reviewer)
      fail(
        "Assign an active owner as records reviewer before containing this publication.",
      );
    const incident = await tx.coachingRecordIncident.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        noteId: note.id,
        reportedByUserId: actor.userId,
        reviewerWorkspaceUserId: reviewer.id,
        reason,
        status: "CONTAINED",
        containedAt: now,
      },
    });
    await tx.coachingEnrollment.update({
      where: { id: e.id },
      data: {
        settlementState: "REVIEW_REQUIRED",
        settlementNote:
          "A withdrawn publication needs a delivery and communication review. Previously viewed copies cannot be recalled.",
        exportState: "AVAILABLE",
        version: { increment: 1 },
      },
    });
    await tx.coachingRecordAccessEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        actorUserId: actor.userId,
        kind: "PUBLICATION_CONTAINED",
        purpose: "Withdraw published content and prepared archives",
        scope: { noteId: note.id, incidentId: incident.id },
      },
    });
    return incident.id;
  }
  if (command.kind === "resolveRecordIncident") {
    if (!ctx.owner)
      fail("The assigned owner must complete the incident review.");
    const incident =
      (await tx.coachingRecordIncident.findFirst({
        where: {
          id: String(input.incidentId),
          workspaceId: actor.workspaceId,
          enrollmentId: e.id,
        },
      })) ?? fail("Incident not found.");
    if (incident.reviewerWorkspaceUserId !== ctx.staff!.id)
      fail("Only the assigned records reviewer can close this incident.");
    await tx.coachingRecordIncident.update({
      where: { id: incident.id },
      data: {
        communicationReview: required(
          input.reason,
          "Recipient communication and follow-up review without private text",
        ),
        status: "RESOLVED",
        resolvedAt: now,
      },
    });
    resultId = incident.id;
  } else if (command.kind === "proposeRecordReview") {
    if (!ctx.owner)
      fail("Only an owner can propose exceptional record review.");
    const noteIds = [
      ...new Set(
        String(input.privateNoteIds ?? "")
          .split(/[\s,]+/)
          .filter(Boolean),
      ),
    ];
    if (!noteIds.length || noteIds.length > 20)
      fail(
        "Choose between one and twenty exact private-note records for this review.",
      );
    const notes = await tx.coachingPrivateNote.findMany({
      where: { id: { in: noteIds }, enrollmentId: e.id },
      select: { id: true, authorWorkspaceUserId: true },
    });
    if (
      notes.length !== noteIds.length ||
      new Set(notes.map((note) => note.authorWorkspaceUserId)).size !== 1
    )
      fail("Review one author's exact records from this program at a time.");
    const reviewer =
      (await tx.workspaceUser.findFirst({
        where: {
          id: String(input.reviewerId),
          workspaceId: actor.workspaceId,
          role: { in: ["OWNER", "COACH"] },
          isActive: true,
        },
      })) ?? fail("Choose an active named reviewer in this workspace.");
    const author = await tx.workspaceUser.findFirst({
      where: {
        id: notes[0]!.authorWorkspaceUserId,
        workspaceId: actor.workspaceId,
        isActive: true,
      },
    });
    if (!author)
      fail(
        "The author cannot consent through an active account. Keep this formal request in restricted review; ordinary owner access cannot replace authorization.",
      );
    const minutes = Number(input.expiresInMinutes ?? 30);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60)
      fail("Exceptional review can last from one to sixty minutes.");
    const created = await tx.coachingRecordReviewGrant.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        privateNoteIds: noteIds,
        reviewerWorkspaceUserId: reviewer.id,
        authorWorkspaceUserId: author.id,
        grantedByOwnerWorkspaceUserId: ctx.staff!.id,
        purpose: required(
          input.reason,
          "Specific review purpose without private content",
          500,
        ),
        expiresAt: new Date(now.getTime() + minutes * 60000),
      },
    });
    resultId = created.id;
  } else {
    if (!grant || grant.revokedAt || grant.expiresAt <= now)
      fail("This review authorization is expired or revoked.");
    if (command.kind === "approveRecordReview") {
      if (input.confirmConsequences !== true)
        fail(
          "Review the named person, exact scope, purpose and expiry before consenting.",
        );
      if (ctx.own)
        await tx.coachingRecordReviewGrant.update({
          where: { id: grant.id },
          data: { clientApprovedAt: now, clientApprovedByUserId: actor.userId },
        });
      else if (ctx.staff?.id === grant.authorWorkspaceUserId)
        await tx.coachingRecordReviewGrant.update({
          where: { id: grant.id },
          data: { authorApprovedAt: now, authorApprovedByUserId: actor.userId },
        });
      else fail("Only the client or author can provide the missing consent.");
    } else if (command.kind === "revokeRecordReview") {
      if (
        !ctx.own &&
        !ctx.owner &&
        ctx.staff?.id !== grant.authorWorkspaceUserId &&
        ctx.staff?.id !== grant.reviewerWorkspaceUserId
      )
        fail("This account cannot revoke the review.");
      await tx.coachingRecordReviewGrant.update({
        where: { id: grant.id },
        data: { revokedAt: now, revokedByUserId: actor.userId },
      });
    }
    resultId = grant.id;
  }
  await tx.coachingEnrollment.update({
    where: { id: e.id },
    data: { version: { increment: 1 } },
  });
  await tx.coachingRecordAccessEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      enrollmentId: e.id,
      actorUserId: actor.userId,
      kind: command.kind,
      purpose: "Restricted records review authorization or follow-up",
      scope: { recordId: resultId },
    },
  });
  return resultId;
}

export async function getCoachingRecordReview(
  actor: CoachingActor,
  enrollmentId: string,
) {
  return prisma.$transaction(async (tx) => {
    const ctx = await context(tx, actor, enrollmentId);
    const [withdrawals, incidents, grants, privateMetadata] = await Promise.all(
      [
        tx.coachingDailyNote.findMany({
          where: { enrollmentId, withdrawnAt: { not: null } },
          select: { id: true, localDate: true, withdrawnAt: true },
          orderBy: { localDate: "desc" },
        }),
        ctx.owner
          ? tx.coachingRecordIncident.findMany({
              where: { workspaceId: actor.workspaceId, enrollmentId },
              orderBy: { createdAt: "desc" },
            })
          : [],
        tx.coachingRecordReviewGrant.findMany({
          where: {
            workspaceId: actor.workspaceId,
            enrollmentId,
            ...(ctx.own || ctx.owner
              ? {}
              : {
                  OR: [
                    { authorWorkspaceUserId: ctx.staff!.id },
                    { reviewerWorkspaceUserId: ctx.staff!.id },
                  ],
                }),
          },
          orderBy: { createdAt: "desc" },
        }),
        ctx.owner
          ? tx.coachingPrivateNote.findMany({
              where: { enrollmentId },
              select: {
                id: true,
                localDate: true,
                authorWorkspaceUserId: true,
              },
              orderBy: { localDate: "desc" },
            })
          : [],
      ],
    );
    const publications = ctx.owner
      ? await tx.coachingDailyNote.findMany({
          where: {
            enrollmentId,
            publishedAt: { not: null },
            withdrawnAt: null,
          },
          select: { id: true, localDate: true, version: true },
          orderBy: { localDate: "desc" },
        })
      : [];
    return { withdrawals, incidents, grants, privateMetadata, publications };
  });
}

export async function readExceptionalCoachingNotes(
  actor: CoachingActor,
  grantId: string,
) {
  return prisma.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const grant =
      (await tx.coachingRecordReviewGrant.findFirst({
        where: {
          id: grantId,
          workspaceId: actor.workspaceId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          clientApprovedAt: { not: null },
          authorApprovedAt: { not: null },
          enrollment: { workspace: { status: { not: "DISABLED" } } },
        },
      })) ?? fail("This exceptional review is not currently authorized.");
    const [reviewer, author, owner, client, notes] = await Promise.all([
      tx.workspaceUser.findFirst({
        where: {
          id: grant.reviewerWorkspaceUserId,
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          role: { in: ["OWNER", "COACH"] },
          isActive: true,
        },
      }),
      tx.workspaceUser.findFirst({
        where: {
          id: grant.authorWorkspaceUserId,
          workspaceId: actor.workspaceId,
          userId: grant.authorApprovedByUserId ?? "",
          isActive: true,
        },
      }),
      tx.workspaceUser.findFirst({
        where: {
          id: grant.grantedByOwnerWorkspaceUserId,
          workspaceId: actor.workspaceId,
          role: "OWNER",
          isActive: true,
        },
      }),
      tx.member.findFirst({
        where: {
          coachingEnrollments: {
            some: { id: grant.enrollmentId, workspaceId: actor.workspaceId },
          },
          workspaceId: actor.workspaceId,
          userId: grant.clientApprovedByUserId,
          user: {
            workspaceUsers: {
              some: {
                workspaceId: actor.workspaceId,
                role: "CUSTOMER",
                isActive: true,
              },
            },
          },
        },
      }),
      tx.coachingPrivateNote.findMany({
        where: {
          id: { in: grant.privateNoteIds },
          enrollmentId: grant.enrollmentId,
          authorWorkspaceUserId: grant.authorWorkspaceUserId,
        },
        select: { id: true, localDate: true, body: true, history: true },
      }),
    ]);
    if (
      !reviewer ||
      !author ||
      !owner ||
      !client ||
      notes.length !== grant.privateNoteIds.length
    )
      fail(
        "A required authority or exact record scope has changed. The exceptional review is unavailable.",
      );
    await tx.coachingRecordAccessEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: grant.enrollmentId,
        actorUserId: actor.userId,
        kind: "EXCEPTIONAL_PRIVATE_READ",
        purpose: grant.purpose,
        reviewGrantId: grant.id,
        scope: { privateNoteIds: grant.privateNoteIds },
      },
    });
    return { purpose: grant.purpose, expiresAt: grant.expiresAt, notes };
  });
}

export async function getCoachingReviewInbox(actor: CoachingActor) {
  const staff = await prisma.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      isActive: true,
      role: { in: ["OWNER", "COACH"] },
      workspace: { status: { not: "DISABLED" } },
    },
  });
  if (!staff) fail("An active coaching staff account is required.");
  return prisma.coachingRecordReviewGrant.findMany({
    where: {
      workspaceId: actor.workspaceId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      OR: [
        { authorWorkspaceUserId: staff.id },
        { reviewerWorkspaceUserId: staff.id },
        { grantedByOwnerWorkspaceUserId: staff.id },
      ],
    },
    select: { id: true, purpose: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCoachingReviewAuthorization(
  actor: CoachingActor,
  grantId: string,
) {
  return prisma.$transaction(async (tx) => {
    const grant =
      (await tx.coachingRecordReviewGrant.findFirst({
        where: { id: grantId, workspaceId: actor.workspaceId },
      })) ?? fail("Review not found.");
    const ctx = await context(tx, actor, grant.enrollmentId, [
      grant.authorWorkspaceUserId,
      grant.reviewerWorkspaceUserId,
    ]);
    if (
      !ctx.own &&
      !ctx.owner &&
      ctx.staff?.id !== grant.authorWorkspaceUserId &&
      ctx.staff?.id !== grant.reviewerWorkspaceUserId
    )
      fail("This review is not addressed to this account.");
    const people = await tx.workspaceUser.findMany({
      where: {
        id: {
          in: [grant.authorWorkspaceUserId, grant.reviewerWorkspaceUserId],
        },
        workspaceId: actor.workspaceId,
      },
      select: { id: true, user: { select: { fullName: true } } },
    });
    const notes = await tx.coachingPrivateNote.findMany({
      where: {
        id: { in: grant.privateNoteIds },
        enrollmentId: grant.enrollmentId,
      },
      select: { id: true, localDate: true },
    });
    return {
      id: grant.id,
      enrollmentId: grant.enrollmentId,
      version: ctx.enrollment.version,
      purpose: grant.purpose,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
      clientApprovedAt: grant.clientApprovedAt,
      authorApprovedAt: grant.authorApprovedAt,
      reviewerName:
        people.find((person) => person.id === grant.reviewerWorkspaceUserId)
          ?.user.fullName ?? "Named reviewer",
      authorName:
        people.find((person) => person.id === grant.authorWorkspaceUserId)?.user
          .fullName ?? "Note author",
      notes,
      canConsent: ctx.own || ctx.staff?.id === grant.authorWorkspaceUserId,
      isReviewer: ctx.staff?.id === grant.reviewerWorkspaceUserId,
    };
  });
}
