import { Prisma, PrismaClient, type CoachingAppointment } from "@prisma/client";
import { lockClassSchedule } from "./class-occurrences.js";
import {
  addDays,
  getWorkspaceDateString,
  toDateOnlyString,
} from "./occurrences.js";

const shared = globalThis as typeof globalThis & {
  coachingPrisma?: PrismaClient;
};
const prisma = shared.coachingPrisma ?? new PrismaClient({ log: [] });
shared.coachingPrisma = prisma;
type Tx = Prisma.TransactionClient;
/** Revisions change future promises; earlier accepted delivery dates remain in the settlement. */
export function coachingExpectedDeliveryDates(input: {
  startsOn: Date;
  endsOn: Date;
  timezone: string;
  weekdays: number[];
  acceptedPlans: {
    startsOn: Date;
    endsOn: Date;
    acceptedAt: Date;
    snapshot: unknown;
  }[];
  pauses: { startsOn?: string; endsOn?: string }[];
}) {
  const plans = [...input.acceptedPlans].sort(
    (a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime(),
  );
  const first = [
    toDateOnlyString(input.startsOn),
    ...plans.map((plan) => toDateOnlyString(plan.startsOn)),
  ].sort()[0]!;
  const last = [
    toDateOnlyString(input.endsOn),
    ...plans.map((plan) => toDateOnlyString(plan.endsOn)),
  ]
    .sort()
    .at(-1)!;
  const result: string[] = [];
  let inspected = 0;
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (++inspected > 10000)
      throw new Error(
        "The accepted delivery history needs a bounded records review.",
      );
    const plan =
      [...plans]
        .reverse()
        .find(
          (item) =>
            getWorkspaceDateString(item.acceptedAt, input.timezone) <= day,
        ) ?? plans[0];
    const latest = !plan || plan === plans.at(-1);
    const start = latest ? input.startsOn : plan.startsOn,
      end = latest ? input.endsOn : plan.endsOn;
    const captured = (
      plan?.snapshot as { deliveryWeekdays?: unknown } | undefined
    )?.deliveryWeekdays;
    const weekdays =
      Array.isArray(captured) &&
      captured.every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 6,
      )
        ? (captured as number[])
        : input.weekdays;
    if (
      day < toDateOnlyString(start) ||
      day > toDateOnlyString(end) ||
      !weekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()) ||
      input.pauses.some(
        (range) =>
          range.startsOn &&
          range.endsOn &&
          range.startsOn <= day &&
          range.endsOn >= day,
      )
    )
      continue;
    result.push(day);
  }
  return result;
}
const snapshot = (row: CoachingAppointment) =>
  JSON.parse(
    JSON.stringify({
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      availabilityId: row.availabilityId,
      coachWorkspaceUserId: row.coachWorkspaceUserId,
      roomId: row.roomId,
      status: row.status,
      unitState: row.unitState,
      version: row.version,
      policySnapshot: row.policySnapshot,
      movedFromId: row.movedFromId,
    }),
  ) as Prisma.InputJsonValue;

export async function recordCoachingAppointmentEvent(
  tx: Tx,
  input: {
    workspaceId: string;
    actorUserId: string;
    operationId: string;
    kind: string;
    before?: CoachingAppointment | null;
    after: CoachingAppointment;
    reason?: string;
  },
) {
  return tx.coachingAppointmentEvent.create({
    data: {
      workspaceId: input.workspaceId,
      appointmentId: input.after.id,
      actorUserId: input.actorUserId,
      operationId: input.operationId,
      kind: input.kind,
      before: input.before ? snapshot(input.before) : Prisma.JsonNull,
      after: snapshot(input.after),
      reason: input.reason,
    },
  });
}

/** Caller holds class-schedule lock and checked the affected enrollment's financial hold. */
export async function releaseCoachingAppointmentsTx(
  tx: Tx,
  input: {
    workspaceId: string;
    enrollmentId: string;
    actorUserId: string;
    operationId: string;
    reason: string;
    status: string;
    startsAt?: Prisma.DateTimeFilter;
  },
) {
  const appointments = await tx.coachingAppointment.findMany({
    where: {
      workspaceId: input.workspaceId,
      enrollmentId: input.enrollmentId,
      status: { in: ["BOOKED", "HELD"] },
      unitState: "HELD",
      ...(input.startsAt ? { startsAt: input.startsAt } : {}),
    },
  });
  for (const before of appointments) {
    const after = await tx.coachingAppointment.update({
      where: { id: before.id },
      data: {
        status: input.status,
        unitState: "RELEASED",
        reason: input.reason,
        version: { increment: 1 },
      },
    });
    await recordCoachingAppointmentEvent(tx, {
      ...input,
      before,
      after,
      kind: input.status,
    });
  }
  return appointments.length;
}

/** Maintenance only: no money, no auto-consumption and no rebooking. */
export async function reconcileCoachingDelivery(
  workspaceId: string,
  now = new Date(),
) {
  return prisma.$transaction(
    async (tx) => {
      await lockClassSchedule(tx, workspaceId);
      const owner = await tx.workspaceUser.findFirst({
        where: {
          workspaceId,
          role: "OWNER",
          isActive: true,
          workspace: { status: { not: "DISABLED" } },
        },
        orderBy: { id: "asc" },
      });
      if (!owner) return { exceptions: 0, releasedAppointments: 0 };
      const enrollments = await tx.coachingEnrollment.findMany({
        where: { workspaceId, closedAt: null, acceptedAt: { not: null } },
        include: { currentCoach: true, programVersion: true },
      });
      let exceptions = 0,
        releasedAppointments = 0;
      for (const e of enrollments) {
        const today = getWorkspaceDateString(now, e.timezone);
        const reviewer =
          (await tx.workspaceUser.findFirst({
            where: {
              id: e.caseOwnerWorkspaceUserId,
              workspaceId,
              role: "OWNER",
              isActive: true,
            },
          })) ?? owner;
        if (
          e.currentCoachWorkspaceUserId &&
          !e.currentCoach?.isActive &&
          !(await tx.financialEntitlementHold.count({
            where: {
              workspaceId,
              targetKind: "COACHING",
              targetId: e.id,
              activeSlot: "ACTIVE",
            },
          }))
        ) {
          releasedAppointments += await releaseCoachingAppointmentsTx(tx, {
            workspaceId,
            enrollmentId: e.id,
            actorUserId: reviewer.userId,
            operationId: `inactive-coach:${e.id}:${e.currentCoachWorkspaceUserId}`,
            status: "PROVIDER_CANCELLED",
            reason:
              "Accepted coach is inactive; unit returned and owner recovery required.",
            startsAt: { gt: now },
          });
          await tx.coachingAssignment.updateMany({
            where: { enrollmentId: e.id, revokedAt: null },
            data: { revokedAt: now },
          });
          await tx.coachingEnrollment.update({
            where: { id: e.id },
            data: {
              currentCoachWorkspaceUserId: null,
              historyFromDate: null,
              status: "AWAITING_REPLACEMENT",
              version: { increment: 1 },
            },
          });
          const key = {
            enrollmentId: e.id,
            localDate: new Date(`${today}T00:00:00Z`),
            kind: "COACH_UNAVAILABLE",
          };
          await tx.coachingDeliveryException.upsert({
            where: { enrollmentId_localDate_kind: key },
            create: {
              ...key,
              workspaceId,
              reviewerWorkspaceUserId: reviewer.id,
            },
            update: {},
          });
          const client = await tx.member.findFirst({
            where: {
              id: e.memberId,
              workspaceId,
              user: {
                workspaceUsers: {
                  some: { workspaceId, role: "CUSTOMER", isActive: true },
                },
              },
            },
            select: { user: { select: { email: true } } },
          });
          if (client?.user)
            await tx.notificationJob.upsert({
              where: {
                workspaceId_dedupeKey: {
                  workspaceId,
                  dedupeKey: `coaching-recovery:${e.id}:${e.currentCoachWorkspaceUserId}`,
                },
              },
              create: {
                workspaceId,
                dedupeKey: `coaching-recovery:${e.id}:${e.currentCoachWorkspaceUserId}`,
                templateKind: "ANNOUNCEMENT",
                recipientEmail: client.user.email,
                subject: "Your coaching assignment needs review",
                body: "Your gym is reviewing coaching availability. Sign in to HitLink to review your program. Future appointment units have been returned; a replacement coach requires your acceptance.",
                status: "PENDING",
                nextAttemptAt: now,
                context: { kind: "COACHING_UPDATE", enrollmentId: e.id },
              },
              update: {},
            });
          exceptions++;
        }
        if (e.paymentState !== "PAID") continue;
        const [published, pauses, acceptedPlans] = await Promise.all([
          tx.coachingDailyNote.findMany({
            where: {
              enrollmentId: e.id,
              withdrawnAt: null,
              publishedAt: { not: null },
            },
            select: { localDate: true },
          }),
          tx.coachingEvent.findMany({
            where: { enrollmentId: e.id, workspaceId, kind: "pause" },
            select: { metadata: true },
          }),
          tx.coachingAcceptedPlan.findMany({
            where: { enrollmentId: e.id, workspaceId },
            select: {
              startsOn: true,
              endsOn: true,
              acceptedAt: true,
              snapshot: true,
            },
          }),
        ]);
        const delivered = new Set(
          published.map((note) => toDateOnlyString(note.localDate)),
        );
        const ranges = pauses
          .map(
            (event) =>
              (
                event.metadata as {
                  input?: { startsOn?: string; endsOn?: string };
                }
              )?.input,
          )
          .filter((range) => range?.startsOn && range.endsOn);
        const missing = coachingExpectedDeliveryDates({
          startsOn: e.startsOn,
          endsOn: e.endsOn,
          timezone: e.timezone,
          weekdays: e.programVersion.deliveryWeekdays,
          acceptedPlans,
          pauses: ranges.filter(
            (range): range is { startsOn: string; endsOn: string } =>
              !!range?.startsOn && !!range.endsOn,
          ),
        }).filter((day) => day < today && !delivered.has(day));
        const created = await tx.coachingDeliveryException.createMany({
          data: missing.map((day) => ({
            enrollmentId: e.id,
            localDate: new Date(`${day}T00:00:00Z`),
            kind: "MISSED_NOTE",
            workspaceId,
            reviewerWorkspaceUserId: reviewer.id,
          })),
          skipDuplicates: true,
        });
        exceptions += created.count;
      }
      return { exceptions, releasedAppointments };
    },
    { timeout: 30000 },
  );
}
