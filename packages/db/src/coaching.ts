import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { assertStaffNotOnLeave, StaffLeaveError } from "./staff-leave.js";
import {
  Prisma,
  PrismaClient,
  type CoachingEnrollment,
  type CoachingProgramVersion,
} from "@prisma/client";
import {
  classOccurrenceInclude,
  lockClassSchedule,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import {
  addDays,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  parseDateOnlyString,
  toDateOnlyString,
} from "./occurrences.js";
import {
  coachingSettlementCommands,
  executeCoachingSettlement,
  prepareCoachingRecordExport,
  coachingIncidentCommands,
  executeCoachingIncident,
} from "./coaching-records.js";
import {
  recordCoachingAppointmentEvent,
  releaseCoachingAppointmentsTx,
} from "./coaching-appointments.js";
import {
  coachingPayerCommands,
  executeCoachingPayer,
} from "./coaching-payer.js";

export interface CoachingActor {
  workspaceId: string;
  userId: string;
}
// Prisma error logging can include rejected input values. Coaching uses a quiet
// client so private record contents cannot enter the shared application logs.
const globalCoaching = globalThis as typeof globalThis & {
  coachingPrisma?: PrismaClient;
};
const prisma = globalCoaching.coachingPrisma ?? new PrismaClient({ log: [] });
globalCoaching.coachingPrisma = prisma;
type Tx = Prisma.TransactionClient;
type Enrollment = CoachingEnrollment & {
  programVersion: CoachingProgramVersion;
  currentCoach?: { isActive: boolean } | null;
};
export class CoachingError extends Error {}
function fail(message: string): never {
  throw new CoachingError(message);
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const text = (value: unknown, label: string, max = 12000) => {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > max)
    fail(`${label} is required and must be ${max} characters or fewer.`);
  return result;
};
const integer = (value: unknown, min: number, max: number, label: string) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    fail(`${label} must be between ${min} and ${max}.`);
  return number;
};
const dateOnly = (value: unknown): Date => {
  const result = parseDateOnlyString(String(value ?? ""));
  return result.status === "ok"
    ? result.date
    : fail("Choose a valid calendar date.");
};
const instant = (value: unknown): Date => {
  const raw = String(value ?? "");
  if (!/(Z|[+-]\d\d:\d\d)$/.test(raw))
    fail("Appointment time must include a timezone offset.");
  const result = new Date(raw);
  return Number.isNaN(result.getTime())
    ? fail("Choose a valid appointment time.")
    : result;
};
export function isCoachingAdult(
  dateOfBirth: Date | null,
  localDate: string,
): boolean {
  if (!dateOfBirth) return false;
  const birthday = toDateOnlyString(dateOfBirth);
  const eighteenth = `${Number(birthday.slice(0, 4)) + 18}${birthday.slice(4)}`;
  return eighteenth <= localDate;
}
export function coachingStatus(
  enrollment: Enrollment,
  now = new Date(),
): string {
  if (enrollment.closedAt) return "CLOSED";
  if (enrollment.status === "AWAITING_REPLACEMENT")
    return "AWAITING_REPLACEMENT";
  if (enrollment.currentCoach && !enrollment.currentCoach.isActive)
    return "AWAITING_REPLACEMENT";
  if (
    !enrollment.acceptedAt ||
    !enrollment.contactVerifiedAt ||
    !enrollment.currentCoachWorkspaceUserId
  )
    return "ONBOARDING";
  if (enrollment.paymentState === "REVIEW_REQUIRED") return "PAYMENT_REVIEW";
  if (enrollment.paymentState !== "PAID") return "PAYMENT_PENDING";
  const today = getWorkspaceDateString(now, enrollment.timezone);
  if (today < toDateOnlyString(enrollment.startsOn)) return "SCHEDULED";
  if (today > toDateOnlyString(enrollment.endsOn)) return "END_REVIEW";
  if (
    enrollment.pauseStartsOn &&
    enrollment.pauseEndsOn &&
    today >= toDateOnlyString(enrollment.pauseStartsOn) &&
    today <= toDateOnlyString(enrollment.pauseEndsOn)
  )
    return "PAUSED";
  return "ACTIVE";
}
export function countCoachingDeliveryDays(
  start: string,
  end: string,
  weekdays: number[],
): number {
  if (end < start) fail("Pause end must be on or after its start.");
  const span =
    (dateOnly(end).getTime() - dateOnly(start).getTime()) / 86400000 + 1;
  if (span > 3660) fail("The pause period is too long.");
  let count = 0;
  for (let day = start; day <= end; day = addDays(day, 1))
    if (weekdays.includes(dateOnly(day).getUTCDay())) count++;
  return count;
}

async function identity(db: Tx, actor: CoachingActor) {
  const [staff, member] = await Promise.all([
    db.workspaceUser.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        isActive: true,
        role: { in: ["OWNER", "COACH"] },
        workspace: { status: { not: "DISABLED" } },
      },
    }),
    db.member.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        workspace: { status: { not: "DISABLED" } },
        user: {
          workspaceUsers: {
            some: {
              workspaceId: actor.workspaceId,
              userId: actor.userId,
              role: "CUSTOMER",
              isActive: true,
            },
          },
        },
      },
      include: { user: { select: { email: true } } },
    }),
  ]);
  if (!staff && !member)
    fail("You do not have access to coaching in this workspace.");
  return { staff, member };
}
async function requireCoach(db: Tx, id: string, workspaceId: string) {
  return (
    (await db.workspaceUser.findFirst({
      where: {
        id,
        workspaceId,
        isActive: true,
        role: { in: ["OWNER", "COACH"] },
      },
    })) ?? fail("Choose an active coach in this workspace.")
  );
}
async function access(db: Tx, actor: CoachingActor, enrollmentId: string) {
  const who = await identity(db, actor);
  const enrollment =
    (await db.coachingEnrollment.findFirst({
      where: { id: enrollmentId, workspaceId: actor.workspaceId },
      include: { programVersion: true, currentCoach: true },
    })) ?? fail("Program not found.");
  const own = who.member?.id === enrollment.memberId;
  const coach =
    !!who.staff &&
    who.staff.id === enrollment.currentCoachWorkspaceUserId &&
    !!enrollment.currentCoach?.isActive;
  const owner = who.staff?.role === "OWNER";
  if (!own && !coach && !owner) fail("You do not have access to this program.");
  if (
    own &&
    enrollment.retrievalUntil &&
    enrollment.retrievalUntil < new Date()
  )
    fail(
      "The record retrieval window has ended. Contact the gym's records contact.",
    );
  return { ...who, enrollment, own, coach, owner };
}
function expected(actual: number, version: unknown) {
  if (!Number.isSafeInteger(Number(version)) || actual !== Number(version))
    fail("This record changed. Reload it before trying again.");
}
async function notifyClient(
  db: Tx,
  enrollment: CoachingEnrollment,
  subject: string,
  context?: Prisma.InputJsonObject,
) {
  const member = await db.member.findUnique({
    where: { id: enrollment.memberId },
    select: { user: { select: { email: true } } },
  });
  if (!member?.user) return;
  await db.notificationJob.create({
    data: {
      workspaceId: enrollment.workspaceId,
      templateKind: "ANNOUNCEMENT",
      recipientEmail: member.user.email,
      subject,
      body: "There is an update to your coaching program. Sign in to your HitLink member portal to review it.",
      status: "PENDING",
      nextAttemptAt: new Date(),
      ...(context
        ? { context, dedupeKey: `coaching-note:${String(context.revisionId)}` }
        : { context: { kind: "COACHING_UPDATE", enrollmentId: enrollment.id } }),
    },
  });
}

export interface CoachingCommand {
  kind:
    | "createProgram"
    | "reviseProgram"
    | "enroll"
    | "sendVerification"
    | "verifyContact"
    | "acceptCoach"
    | "declineCoach"
    | "acceptPlan"
    | "submitIntake"
    | "saveDailyNote"
    | "publishDailyNote"
    | "withdrawDailyNote"
    | "savePrivateNote"
    | "completeMilestone"
    | "createAvailability"
    | "withdrawAvailability"
    | "bookAppointment"
    | "moveAppointment"
    | "cancelAppointment"
    | "completeAppointment"
    | "disputeAppointment"
    | "resolveAppointment"
    | "resolveDeliveryException"
    | "inviteCoachingPayer"
    | "sendPayerVerification"
    | "verifyPayerContact"
    | "acceptPayerTerms"
    | "revokeCoachingPayer"
    | "pause"
    | "resume"
    | "proposeCoach"
    | "revokeCoach"
    | "proposePlan"
    | "close"
    | "proposeSettlement"
    | "acceptSettlement"
    | "confirmSettlement"
    | "resolveRecordIncident"
    | "proposeRecordReview"
    | "approveRecordReview"
    | "revokeRecordReview"
    | "recordSettlement";
  operationId: string;
  enrollmentId?: string;
  expectedVersion?: number;
  input: Record<string, unknown>;
}

/** Every command is authenticated again inside the transaction. Audit metadata never contains private content. */
export async function runCoachingCommand(
  actor: CoachingActor,
  command: CoachingCommand,
): Promise<{ id: string; replayed?: boolean }> {
  if (!/^[a-zA-Z0-9:_-]{16,150}$/.test(command.operationId))
    fail("The request identifier is invalid. Reload the form.");
  const inputHash = hash(
    JSON.stringify({ ...command, operationId: undefined }),
  );
  const transact = () =>
    prisma.$transaction(
      async (db) => {
        await lockClassSchedule(db, actor.workspaceId);
        const who = await identity(db, actor);
        const prior = await db.coachingEvent.findUnique({
          where: {
            workspaceId_operationId: {
              workspaceId: actor.workspaceId,
              operationId: command.operationId,
            },
          },
        });
        if (prior) {
          if (
            prior.actorUserId !== actor.userId ||
            prior.inputHash !== inputHash
          )
            fail(
              "This request identifier has already been used for another change.",
            );
          return { id: prior.resultId ?? prior.id, replayed: true };
        }
        const before = command.enrollmentId
          ? await db.coachingEnrollment.findFirst({
              where: {
                id: command.enrollmentId,
                workspaceId: actor.workspaceId,
              },
              select: {
                version: true,
                status: true,
                programVersionId: true,
                currentCoachWorkspaceUserId: true,
                startsOn: true,
                endsOn: true,
              },
            })
          : null;
        const resultId = await execute(db, actor, who, command);
        const safeInput = Object.fromEntries(
          Object.entries(command.input).filter(([key]) =>
            [
              "programId",
              "programVersionId",
              "coachId",
              "memberId",
              "startsOn",
              "endsOn",
              "historyFromDate",
              "localDate",
              "noteVersion",
              "milestoneId",
              "appointmentId",
              "appointmentVersion",
              "availabilityId",
              "startsAt",
              "endsAt",
              "bufferMinutes",
              "roomId",
              "unitState",
              "noShow",
            ].includes(key),
          ),
        );
        await db.coachingEvent.create({
          data: {
            workspaceId: actor.workspaceId,
            enrollmentId:
              command.enrollmentId ??
              (command.kind === "enroll" ? resultId : undefined),
            operationId: command.operationId,
            actorUserId: actor.userId,
            kind: command.kind,
            inputHash,
            resultId,
            metadata: JSON.parse(
              JSON.stringify({ before, input: safeInput }),
            ) as Prisma.InputJsonObject,
          },
        });
        return { id: resultId };
      },
      { isolationLevel: "Serializable", timeout: 20000 },
    );
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await transact();
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2034", "P2002"].includes(error.code) ||
        attempt === 2
      )
        throw error;
    }
  }
  return fail("The record changed repeatedly. Reload before trying again.");
}

function programInput(input: Record<string, unknown>) {
  const weekdays = [
    ...new Set(
      text(input.deliveryWeekdays, "Note delivery weekdays", 20)
        .split(",")
        .map(Number),
    ),
  ];
  if (
    !weekdays.length ||
    weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    fail("Select at least one note delivery day.");
  const currency = text(input.currency, "Currency", 3).toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) fail("Enter a three-letter currency code.");
  return {
    durationDays: integer(input.durationDays, 1, 3660, "Program length"),
    deliveryWeekdays: weekdays,
    responseHours: integer(input.responseHours, 1, 720, "Response window"),
    goals: text(input.goals, "Program goals"),
    milestones: text(input.milestones, "Milestones")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    appointmentUnits: integer(
      input.appointmentUnits ?? 0,
      0,
      1000,
      "Included appointments",
    ),
    appointmentMinutes: integer(
      input.appointmentMinutes ?? 60,
      10,
      480,
      "Appointment length",
    ),
    cancellationHours: integer(
      input.cancellationHours ?? 24,
      0,
      720,
      "Cancellation notice",
    ),
    noShowGraceMinutes: integer(
      input.noShowGraceMinutes ?? 15,
      0,
      480,
      "No-show grace in minutes",
    ),
    priceCents: integer(input.priceCents, 0, 100000000, "Price in cents"),
    currency,
    terms: text(input.terms, "Exit and refund terms"),
    retrievalDays: integer(
      input.retrievalDays ?? 90,
      1,
      3660,
      "Record retrieval days",
    ),
  };
}

async function execute(
  db: Tx,
  actor: CoachingActor,
  who: Awaited<ReturnType<typeof identity>>,
  command: CoachingCommand,
): Promise<string> {
  const { input, kind } = command;
  const now = new Date();
  if (kind === "createProgram" || kind === "reviseProgram") {
    if (who.staff?.role !== "OWNER")
      fail("Only the owner can publish program terms.");
    const data = programInput(input);
    if (kind === "createProgram") {
      return (
        await db.coachingProgram.create({
          data: {
            workspaceId: actor.workspaceId,
            name: text(input.name, "Program name", 160),
            versions: { create: { ...data, number: 1 } },
          },
        })
      ).id;
    }
    const program =
      (await db.coachingProgram.findFirst({
        where: { id: String(input.programId), workspaceId: actor.workspaceId },
        include: { versions: true },
      })) ?? fail("Program not found.");
    expected(program.version, command.expectedVersion);
    await db.coachingProgram.update({
      where: { id: program.id },
      data: { version: { increment: 1 } },
    });
    return (
      await db.coachingProgramVersion.create({
        data: {
          ...data,
          programId: program.id,
          number: Math.max(...program.versions.map((v) => v.number)) + 1,
        },
      })
    ).id;
  }
  if (kind === "enroll") {
    if (who.staff?.role !== "OWNER")
      fail("Only the owner can offer a program.");
    const member =
      (await db.member.findFirst({
        where: { id: String(input.memberId), workspaceId: actor.workspaceId },
        include: { user: true },
      })) ?? fail("Client not found.");
    const location =
      (await db.location.findUnique({
        where: { workspaceId: actor.workspaceId },
      })) ?? fail("Set the workspace timezone first.");
    if (
      !member.user ||
      !isCoachingAdult(
        member.dateOfBirth,
        getWorkspaceDateString(now, location.timezone),
      )
    )
      fail(
        "The client must be 18 or older and have their own member login before a program is offered.",
      );
    const version =
      (await db.coachingProgramVersion.findFirst({
        where: {
          id: String(input.programVersionId),
          program: { workspaceId: actor.workspaceId, archivedAt: null },
        },
      })) ?? fail("Choose a current program version.");
    const coach = await requireCoach(
      db,
      String(input.coachId),
      actor.workspaceId,
    );
    const startsOn = dateOnly(input.startsOn);
    if (
      toDateOnlyString(startsOn) <
      getWorkspaceDateString(now, location.timezone)
    )
      fail("A new program cannot start in the past.");
    const enrollment = await db.coachingEnrollment.create({
      data: {
        workspaceId: actor.workspaceId,
        memberId: member.id,
        programVersionId: version.id,
        startsOn,
        endsOn: dateOnly(
          addDays(toDateOnlyString(startsOn), version.durationDays - 1),
        ),
        timezone: location.timezone,
        proposedCoachWorkspaceUserId: coach.id,
        caseOwnerWorkspaceUserId: who.staff.id,
        milestones: { create: version.milestones.map((title) => ({ title })) },
      },
    });
    await notifyClient(
      db,
      enrollment,
      "Your coaching program is ready to review",
    );
    return enrollment.id;
  }
  if (kind === "createAvailability" || kind === "withdrawAvailability") {
    if (!who.staff) fail("Coach access is required.");
    if (kind === "withdrawAvailability") {
      const slot =
        (await db.coachingAvailability.findFirst({
          where: {
            id: String(input.availabilityId),
            workspaceId: actor.workspaceId,
            coachWorkspaceUserId: who.staff.id,
          },
        })) ?? fail("Appointment time not found.");
      if (
        await db.coachingAppointment.count({
          where: {
            availabilityId: slot.id,
            status: { in: ["HELD", "BOOKED"] },
          },
        })
      )
        fail("Resolve the booked appointment before withdrawing this time.");
      await db.coachingAvailability.update({
        where: { id: slot.id },
        data: { withdrawnAt: now },
      });
      return slot.id;
    }
    const startsAt = instant(input.startsAt),
      endsAt = instant(input.endsAt);
    if (
      startsAt <= now ||
      endsAt <= startsAt ||
      endsAt.getTime() - startsAt.getTime() > 8 * 3600000
    )
      fail("Choose a future appointment lasting up to eight hours.");
    const roomId = input.roomId ? String(input.roomId) : null;
    if (
      roomId &&
      !(await db.room.findFirst({
        where: {
          id: roomId,
          isActive: true,
          archivedAt: null,
          location: { workspaceId: actor.workspaceId },
        },
      }))
    )
      fail("Choose an active room in this workspace.");
    let virtualUrl: string | null = null;
    if (input.virtualUrl) {
      const url = new URL(String(input.virtualUrl));
      if (url.protocol !== "https:") fail("Use an HTTPS meeting link.");
      virtualUrl = url.href;
    }
    if (!roomId && !virtualUrl)
      fail("Choose a room or provide a private meeting link.");
    const bufferMinutes = integer(input.bufferMinutes ?? 0, 0, 240, "Buffer");
    await ensureAppointmentFree(db, actor.workspaceId, { coachWorkspaceUserId: who.staff.id, roomId, startsAt, endsAt, bufferMinutes });
    return (
      await db.coachingAvailability.create({
        data: {
          workspaceId: actor.workspaceId,
          coachWorkspaceUserId: who.staff.id,
          startsAt,
          endsAt,
          roomId,
          virtualUrl,
          bufferMinutes,
        },
      })
    ).id;
  }
  if (coachingIncidentCommands.has(kind))
    return executeCoachingIncident(db, actor, command);
  if (coachingPayerCommands.has(kind))
    return executeCoachingPayer(db, actor, command);
  const ctx = await access(db, actor, command.enrollmentId ?? "");
  const e = ctx.enrollment;
  expected(e.version, command.expectedVersion);
  if (coachingSettlementCommands.has(kind))
    return executeCoachingSettlement(db, actor, command);
  const affectsEntitlement = [
    "acceptPlan",
    "saveDailyNote",
    "publishDailyNote",
    "savePrivateNote",
    "completeMilestone",
    "bookAppointment",
    "moveAppointment",
    "cancelAppointment",
    "completeAppointment",
    "disputeAppointment",
    "resolveAppointment",
    "pause",
    "resume",
    "proposePlan",
  ];
  if (
    affectsEntitlement.includes(kind) &&
    (await db.financialEntitlementHold.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        targetKind: "COACHING",
        targetId: e.id,
        activeSlot: "ACTIVE",
      },
      select: { id: true },
    }))
  ) {
    fail(
      "A refund or credit is being reconciled for this program. Delivery and appointment changes are held until its outcome is known.",
    );
  }
  const bump = async (
    data: Prisma.CoachingEnrollmentUncheckedUpdateInput = {},
  ) =>
    db.coachingEnrollment.update({
      where: { id: e.id, version: e.version },
      data: { ...data, version: { increment: 1 } },
    });
  const content = () => {
    if (!ctx.coach)
      fail(
        "Only the client's currently accepted coach can change coaching content.",
      );
  };
  const own = () => {
    if (!ctx.own)
      fail("The client must make this choice from their own account.");
  };
  const owner = () => {
    if (!ctx.owner) fail("Only the owner can manage this operational change.");
  };
  const open = () => {
    if (e.closedAt)
      fail("This program is closed. Propose a new plan to reopen it.");
  };

  if (kind === "sendVerification") {
    own();
    open();
    if (
      e.verificationSentAt &&
      now.getTime() - e.verificationSentAt.getTime() < 60000
    )
      fail("Please wait one minute before requesting another email.");
    const token = randomBytes(24).toString("hex");
    const email =
      ctx.member?.user?.email ?? fail("Your account has no email address.");
    await bump({
      verificationHash: hash(token),
      verificationExpiresAt: new Date(now.getTime() + 30 * 60000),
      verificationSentAt: now,
    });
    await db.notificationJob.create({
      data: {
        workspaceId: actor.workspaceId,
        templateKind: "ANNOUNCEMENT",
        recipientEmail: email,
        subject: "Verify your coaching contact",
        body: `Enter this one-use code in your signed-in HitLink coaching page: ${token}\nIt expires in 30 minutes.`,
        status: "PENDING",
        nextAttemptAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60000),
        context: {
          kind: "COACHING_VERIFICATION",
          enrollmentId: e.id,
          verificationHash: hash(token),
          issuedAt: now.toISOString(),
        },
        dedupeKey: `coaching-verification:${e.id}:${now.toISOString()}`,
      },
    });
    return e.id;
  }
  if (kind === "verifyContact") {
    own();
    open();
    const candidate = hash(String(input.code ?? ""));
    if (
      !e.verificationHash ||
      !e.verificationExpiresAt ||
      e.verificationExpiresAt < now ||
      !timingSafeEqual(Buffer.from(candidate), Buffer.from(e.verificationHash))
    )
      fail("This verification code is invalid or expired.");
    await bump({
      contactVerifiedAt: now,
      verificationHash: null,
      verificationExpiresAt: null,
    });
    return e.id;
  }
  if (kind === "acceptCoach") {
    own();
    open();
    if (!e.contactVerifiedAt) fail("Verify your own contact email first.");
    if (!e.proposedCoachWorkspaceUserId)
      fail("There is no coach proposal to accept.");
    await requireCoach(db, e.proposedCoachWorkspaceUserId, actor.workspaceId);
    const from = dateOnly(
      input.historyFromDate ?? toDateOnlyString(e.startsOn),
    );
    if (
      from < e.startsOn ||
      (from > dateOnly(getWorkspaceDateString(now, e.timezone)) &&
        from > e.startsOn)
    )
      fail("Choose a history start within your program up to today.");
    await db.coachingAssignment.updateMany({
      where: { enrollmentId: e.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await db.coachingAssignment.create({
      data: {
        enrollmentId: e.id,
        coachWorkspaceUserId: e.proposedCoachWorkspaceUserId,
        acceptedAt: now,
        historyFromDate: from,
      },
    });
    await bump({
      currentCoachWorkspaceUserId: e.proposedCoachWorkspaceUserId,
      proposedCoachWorkspaceUserId: null,
      historyFromDate: from,
      status: "ONBOARDING",
    });
    return e.id;
  }
  if (kind === "declineCoach") {
    own();
    open();
    await bump({ proposedCoachWorkspaceUserId: null });
    return e.id;
  }
  if (kind === "acceptPlan") {
    own();
    if (
      e.closedAt &&
      (!e.proposedProgramVersionId || e.settlementState === "SETTLED")
    )
      fail(
        "A closed program needs an explicit owner proposal before restart. A settled program needs a new enrollment.",
      );
    if (
      e.closedAt &&
      e.paymentId &&
      (await db.payment.findFirst({
        where: {
          id: e.paymentId,
          workspaceId: actor.workspaceId,
          OR: [
            { refundedAmountCents: { gt: 0 } },
            { status: { not: "SUCCEEDED" } },
          ],
        },
      }))
    )
      fail(
        "The previous payment was refunded or is unresolved. Start a separately purchased program.",
      );
    if (!e.contactVerifiedAt || !e.currentCoachWorkspaceUserId)
      fail("Verify your contact and accept your named coach first.");
    if (
      !(await db.coachingIntake.findUnique({
        where: { enrollmentId: e.id },
        select: { id: true },
      }))
    )
      fail("Submit your intake before accepting the program.");
    const version = e.proposedProgramVersionId
      ? await db.coachingProgramVersion.findUniqueOrThrow({
          where: { id: e.proposedProgramVersionId },
        })
      : e.programVersion;
    if (input.acceptTerms !== true)
      fail("Read and accept the plan and its terms before continuing.");
    const startsOn = e.proposedStartsOn ?? e.startsOn,
      endsOn = e.proposedEndsOn ?? e.endsOn;
    if (e.proposedProgramVersionId) {
      const existing = await db.coachingMilestone.findMany({
        where: { enrollmentId: e.id },
        select: { title: true },
      });
      const added = version.milestones.filter(
        (title) => !existing.some((item) => item.title === title),
      );
      if (added.length)
        await db.coachingMilestone.createMany({
          data: added.map((title) => ({ enrollmentId: e.id, title })),
        });
    }
    await bump({
      acceptedAt: now,
      programVersionId: version.id,
      proposedProgramVersionId: null,
      proposedStartsOn: null,
      proposedEndsOn: null,
      startsOn,
      endsOn,
      closedAt: null,
      retrievalUntil: null,
      status: "ONBOARDING",
      ...(version.priceCents === 0 ? { paymentState: "PAID" } : {}),
    });
    const acceptedIntake = await db.coachingIntake.findUniqueOrThrow({
      where: { enrollmentId: e.id },
    });
    await db.coachingAcceptedPlan.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        programVersionId: version.id,
        clientUserId: actor.userId,
        operationId: command.operationId,
        startsOn,
        endsOn,
        timezone: e.timezone,
        snapshot: JSON.parse(JSON.stringify(version)),
        agreement: {
          acceptedTerms: true,
          acceptedAt: now.toISOString(),
          coachWorkspaceUserId: e.currentCoachWorkspaceUserId,
          historyFromDate: e.historyFromDate?.toISOString() ?? null,
          intakeId: acceptedIntake.id,
          intakeVersion: acceptedIntake.version,
          intakeContentHash: hash(acceptedIntake.content),
        },
        acceptedAt: now,
      },
    });
    return e.id;
  }
  if (kind === "submitIntake") {
    own();
    open();
    if (!e.contactVerifiedAt || !e.currentCoachWorkspaceUserId)
      fail(
        "Accept your named intake reviewer and verify your contact before sharing intake details.",
      );
    const prior = await db.coachingIntake.findUnique({
      where: { enrollmentId: e.id },
    });
    const body = text(input.body, "Intake");
    const history = prior
      ? [
          ...(Array.isArray(prior.history) ? prior.history : []),
          {
            content: prior.content,
            version: prior.version,
            submittedAt: prior.updatedAt.toISOString(),
          },
        ]
      : [];
    await db.coachingIntake.upsert({
      where: { enrollmentId: e.id },
      create: { enrollmentId: e.id, content: body },
      update: { content: body, version: { increment: 1 }, history },
    });
    await bump();
    return e.id;
  }
  if (
    kind === "saveDailyNote" ||
    kind === "publishDailyNote" ||
    kind === "savePrivateNote"
  ) {
    content();
    open();
    const localDate = dateOnly(input.localDate);
    if (localDate < e.startsOn || localDate > e.endsOn)
      fail("Choose a date in this program.");
    if (kind === "savePrivateNote") {
      const key = {
        enrollmentId: e.id,
        authorWorkspaceUserId: ctx.staff!.id,
        localDate,
      };
      const prior = await db.coachingPrivateNote.findUnique({
        where: { enrollmentId_authorWorkspaceUserId_localDate: key },
      });
      expected(prior?.version ?? -1, input.noteVersion ?? -1);
      await db.coachingPrivateNote.upsert({
        where: { enrollmentId_authorWorkspaceUserId_localDate: key },
        create: { ...key, body: text(input.body, "Private note") },
        update: {
          body: text(input.body, "Private note"),
          version: { increment: 1 },
          history: prior
            ? [
                ...(Array.isArray(prior.history) ? prior.history : []),
                {
                  body: prior.body,
                  version: prior.version,
                  savedAt: prior.updatedAt.toISOString(),
                },
              ]
            : [],
        },
      });
      await bump();
      return e.id;
    }
    const prior = await db.coachingDailyNote.findUnique({
      where: { enrollmentId_localDate: { enrollmentId: e.id, localDate } },
    });
    expected(prior?.version ?? -1, input.noteVersion ?? -1);
    if (prior && prior.authorWorkspaceUserId !== ctx.staff!.id)
      fail(
        "Another coach authored this date's note. You cannot read or reuse their draft.",
      );
    if (kind === "saveDailyNote") {
      await db.coachingDailyNote.upsert({
        where: { enrollmentId_localDate: { enrollmentId: e.id, localDate } },
        create: {
          enrollmentId: e.id,
          localDate,
          authorWorkspaceUserId: ctx.staff!.id,
          draftBody: text(input.body, "Client note"),
        },
        update: {
          draftBody: text(input.body, "Client note"),
          version: { increment: 1 },
          ...(prior?.withdrawnAt ? { status: "CORRECTION_DRAFT" } : {}),
        },
      });
    } else if (kind === "publishDailyNote") {
      if (!prior || (prior.withdrawnAt && prior.status !== "CORRECTION_DRAFT"))
        fail("Save a client note before publishing it.");
      if (coachingStatus(e, now) !== "ACTIVE")
        fail("Notes can be published only while this program is active.");
      if (toDateOnlyString(localDate) > getWorkspaceDateString(now, e.timezone))
        fail("A future note cannot be published early.");
      if (input.confirmClientId !== e.memberId || input.confirmPublish !== true)
        fail("Preview the named client and note, then confirm publication.");
      const number =
        (await db.coachingDailyNoteRevision.count({
          where: { noteId: prior.id },
        })) + 1;
      const publishedRevision = await db.coachingDailyNoteRevision.create({
        data: {
          noteId: prior.id,
          number,
          body: prior.draftBody,
          authorWorkspaceUserId: ctx.staff!.id,
        },
      });
      await db.coachingDailyNote.update({
        where: { id: prior.id },
        data: {
          status: number === 1 ? "PUBLISHED" : "AMENDED",
          publishedAt: now,
          withdrawnAt: null,
          version: { increment: 1 },
        },
      });
      await notifyClient(db, e, "A coaching note is ready", {
        kind: "COACHING_NOTE",
        enrollmentId: e.id,
        noteId: prior.id,
        revisionId: publishedRevision.id,
        revisionNumber: number,
      });
    }
    await bump();
    return e.id;
  }
  if (kind === "completeMilestone") {
    content();
    open();
    const milestone =
      (await db.coachingMilestone.findFirst({
        where: { id: String(input.milestoneId), enrollmentId: e.id },
      })) ?? fail("Milestone not found.");
    await db.coachingMilestone.update({
      where: { id: milestone.id },
      data: {
        completedAt: input.complete === false ? null : now,
        version: { increment: 1 },
      },
    });
    await bump();
    return e.id;
  }
  if (kind === "bookAppointment" || kind === "moveAppointment") {
    if (!ctx.own && !ctx.coach && !(ctx.owner && kind === "moveAppointment"))
      fail(
        "Only the client or accepted coach can book; an owner can review a move.",
      );
    open();
    const state = coachingStatus(e, now);
    if (state !== "ACTIVE" && state !== "SCHEDULED")
      fail("Finish program acceptance and payment before booking.");
    if (!e.programVersion.appointmentUnits)
      fail("This program has no appointments.");
    const slot =
      (await db.coachingAvailability.findFirst({
        where: {
          id: String(input.availabilityId),
          workspaceId: actor.workspaceId,
          coachWorkspaceUserId: e.currentCoachWorkspaceUserId!,
          withdrawnAt: null,
        },
      })) ?? fail("That appointment time is no longer available.");
    if (
      slot.startsAt <= now ||
      slot.endsAt.getTime() - slot.startsAt.getTime() !==
        e.programVersion.appointmentMinutes * 60000
    )
      fail("Choose an available time with the program's appointment length.");
    const localDate = getWorkspaceDateString(slot.startsAt, e.timezone);
    if (
      localDate < toDateOnlyString(e.startsOn) ||
      localDate > toDateOnlyString(e.endsOn)
    )
      fail("The appointment must fall within the program dates.");
    if (
      e.pauseStartsOn &&
      e.pauseEndsOn &&
      localDate >= toDateOnlyString(e.pauseStartsOn) &&
      localDate <= toDateOnlyString(e.pauseEndsOn)
    )
      fail("The program is paused on that date.");
    const previous =
      kind === "moveAppointment"
        ? ((await db.coachingAppointment.findFirst({
            where: {
              id: String(input.appointmentId),
              enrollmentId: e.id,
              status: "BOOKED",
              unitState: "HELD",
            },
          })) ?? fail("Appointment not found."))
        : null;
    const priorPolicy = previous?.policySnapshot as {
      cancellationHours?: number;
    } | null;
    const late =
      !!previous &&
      previous.startsAt.getTime() - now.getTime() <
        (priorPolicy?.cancellationHours ?? e.programVersion.cancellationHours) *
          3600000;
    const waiver = late && ctx.owner && input.waiveLatePenalty === true;
    const reason = previous
      ? text(
          input.reason ?? "Client requested a new appointment time.",
          "Move reason",
          1000,
        )
      : undefined;
    if (previous && input.appointmentVersion !== undefined)
      expected(previous.version, input.appointmentVersion);
    if (input.waiveLatePenalty === true && !waiver)
      fail(
        "Only an owner can waive a late-move penalty with a recorded reason.",
      );
    if (late && !waiver && input.confirmConsequences !== true)
      fail(
        "A late move consumes the original unit and reserves another. Confirm this before moving.",
      );
    if (
      (!previous || (late && !waiver)) &&
      (await db.coachingAppointment.count({
        where: {
          enrollmentId: e.id,
          unitState: { in: ["HELD", "CONSUMED", "DISPUTED"] },
        },
      })) >= e.programVersion.appointmentUnits
    )
      fail("All included appointment units are used or reserved.");
    await ensureAppointmentFree(db, actor.workspaceId, slot, previous?.id);
    const data = {
      availabilityId: slot.id,
      coachWorkspaceUserId: slot.coachWorkspaceUserId,
      roomId: slot.roomId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      bufferMinutes: slot.bufferMinutes,
      virtualUrl: slot.virtualUrl,
      policySnapshot: {
        programVersionId: e.programVersionId,
        cancellationHours: e.programVersion.cancellationHours,
        noShowGraceMinutes: e.programVersion.noShowGraceMinutes,
        appointmentMinutes: e.programVersion.appointmentMinutes,
      },
    };
    if (previous) {
      const retired = await db.coachingAppointment.update({
        where: { id: previous.id },
        data: {
          status: late && !waiver ? "LATE_MOVED" : "MOVED",
          unitState: late && !waiver ? "CONSUMED" : "RELEASED",
          reason,
          version: { increment: 1 },
        },
      });
      await recordCoachingAppointmentEvent(db, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        operationId: command.operationId,
        kind: waiver ? "OWNER_WAIVED_LATE_MOVE" : retired.status,
        before: previous,
        after: retired,
        reason,
      });
    }
    const appointment = await db.coachingAppointment.create({
      data: {
        ...data,
        workspaceId: actor.workspaceId,
        enrollmentId: e.id,
        movedFromId: previous?.id,
      },
    });
    await recordCoachingAppointmentEvent(db, {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      operationId: command.operationId,
      kind: previous ? "MOVE_RESERVED" : "BOOKED",
      after: appointment,
      reason,
    });
    await bump();
    await notifyClient(db, e, "Your coaching appointment was updated");
    return appointment.id;
  }
  if (
    [
      "cancelAppointment",
      "completeAppointment",
      "disputeAppointment",
      "resolveAppointment",
    ].includes(kind)
  ) {
    const appointment =
      (await db.coachingAppointment.findFirst({
        where: { id: String(input.appointmentId), enrollmentId: e.id },
      })) ?? fail("Appointment not found.");
    expected(appointment.version, input.appointmentVersion);
    const reason = text(input.reason, "Reason", 1000);
    if (kind === "disputeAppointment") {
      if (!ctx.own && !ctx.coach)
        fail("Only the client or accepted coach can dispute this appointment.");
      if (appointment.unitState === "RELEASED")
        fail("This unit has already been returned.");
      const after = await db.coachingAppointment.update({
        where: { id: appointment.id },
        data: { unitState: "DISPUTED", reason, version: { increment: 1 } },
      });
      await recordCoachingAppointmentEvent(db, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        operationId: command.operationId,
        kind,
        before: appointment,
        after,
        reason,
      });
      await bump({ settlementState: "REVIEW_REQUIRED" });
      return appointment.id;
    }
    if (kind === "resolveAppointment") {
      owner();
      if (appointment.unitState !== "DISPUTED")
        fail("Only a disputed appointment can be resolved here.");
      if (input.unitState !== "RELEASED" && input.unitState !== "CONSUMED")
        fail("Choose whether the unit is returned or consumed.");
      await db.coachingAppointment.update({
        where: { id: appointment.id },
        data: {
          status: "RESOLVED",
          unitState: input.unitState,
          reason,
          version: { increment: 1 },
        },
      });
    } else if (kind === "completeAppointment") {
      content();
      const acceptedPolicy = appointment.policySnapshot as {
        noShowGraceMinutes?: number;
      } | null;
      const earliest =
        input.noShow === true
          ? new Date(
              appointment.startsAt.getTime() +
                (acceptedPolicy?.noShowGraceMinutes ??
                  e.programVersion.noShowGraceMinutes) *
                  60000,
            )
          : appointment.endsAt;
      if (
        appointment.status !== "BOOKED" ||
        earliest > now ||
        appointment.unitState !== "HELD"
      )
        fail(
          "Confirm attendance after the appointment ends, or no-show only after its accepted grace period.",
        );
      const status = input.noShow === true ? "NO_SHOW" : "ATTENDED";
      await db.coachingAppointment.update({
        where: { id: appointment.id },
        data: {
          status,
          unitState: "CONSUMED",
          reason,
          version: { increment: 1 },
        },
      });
    } else {
      if (!ctx.own && !ctx.coach && !ctx.owner)
        fail("You cannot cancel this appointment.");
      if (appointment.status !== "BOOKED" || appointment.unitState !== "HELD")
        fail("This appointment has already been resolved.");
      const timely =
        appointment.startsAt.getTime() - now.getTime() >=
        ((appointment.policySnapshot as { cancellationHours?: number } | null)
          ?.cancellationHours ?? e.programVersion.cancellationHours) *
          3600000;
      const providerCancellation = !ctx.own;
      await db.coachingAppointment.update({
        where: { id: appointment.id },
        data: {
          status: providerCancellation
            ? "PROVIDER_CANCELLED"
            : timely
              ? "CANCELLED"
              : "LATE_CANCELLED",
          unitState: providerCancellation || timely ? "RELEASED" : "CONSUMED",
          reason,
          version: { increment: 1 },
        },
      });
    }
    const after = await db.coachingAppointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    await recordCoachingAppointmentEvent(db, {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      operationId: command.operationId,
      kind,
      before: appointment,
      after,
      reason,
    });
    await bump();
    await notifyClient(db, e, "Your coaching appointment was updated");
    return appointment.id;
  }
  if (kind === "pause") {
    if (!ctx.own && !ctx.owner)
      fail("The client or owner must approve a pause.");
    open();
    const start = dateOnly(input.startsOn),
      end = dateOnly(input.endsOn);
    const today = dateOnly(getWorkspaceDateString(now, e.timezone));
    if (
      start < today ||
      start < e.startsOn ||
      end > e.endsOn ||
      (e.pauseEndsOn && e.pauseEndsOn >= today)
    )
      fail(
        "Choose one future pause inside the program, after any existing pause ends.",
      );
    const days = countCoachingDeliveryDays(
      toDateOnlyString(start),
      toDateOnlyString(end),
      e.programVersion.deliveryWeekdays,
    );
    if (input.confirmConsequences !== true)
      fail(
        "Review the extended end date and appointment changes before confirming.",
      );
    const startsAt = getZonedDateTimeAsUtc({
      dateString: toDateOnlyString(start),
      minutes: 0,
      timezone: e.timezone,
    });
    const endsAt = getZonedDateTimeAsUtc({
      dateString: addDays(toDateOnlyString(end), 1),
      minutes: 0,
      timezone: e.timezone,
    });
    await releaseCoachingAppointmentsTx(db, {
      workspaceId: actor.workspaceId,
      enrollmentId: e.id,
      actorUserId: actor.userId,
      operationId: command.operationId,
      status: "PAUSE_CANCELLED",
      reason: "Program paused; appointment unit returned.",
      startsAt: { gte: startsAt, lt: endsAt },
    });
    await bump({
      pauseStartsOn: start,
      pauseEndsOn: end,
      pausedDeliveryDays: { increment: days },
      endsOn: dateOnly(addDays(toDateOnlyString(e.endsOn), days)),
    });
    await notifyClient(db, e, "Your coaching pause is confirmed");
    return e.id;
  }
  if (kind === "resume") {
    if (!ctx.own && !ctx.owner)
      fail("The client or owner must approve resuming.");
    open();
    if (!e.currentCoachWorkspaceUserId || !e.acceptedAt)
      fail("Accept a coach and plan before resuming.");
    if (
      e.pauseEndsOn &&
      toDateOnlyString(e.pauseEndsOn) >= getWorkspaceDateString(now, e.timezone)
    )
      fail(
        "A finite pause resumes automatically after its agreed end. Propose a revised plan for an earlier return.",
      );
    await bump({ pauseStartsOn: null, pauseEndsOn: null });
    return e.id;
  }
  if (kind === "proposeCoach" || kind === "revokeCoach") {
    owner();
    open();
    const coach =
      kind === "proposeCoach"
        ? await requireCoach(db, String(input.coachId), actor.workspaceId)
        : null;
    text(input.reason, "Reason", 1000);
    await db.coachingAssignment.updateMany({
      where: { enrollmentId: e.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await releaseCoachingAppointmentsTx(db, {
      workspaceId: actor.workspaceId,
      enrollmentId: e.id,
      actorUserId: actor.userId,
      operationId: command.operationId,
      status: "PROVIDER_CANCELLED",
      reason: "Coach assignment ended; unit returned.",
      startsAt: { gt: now },
    });
    await bump({
      currentCoachWorkspaceUserId: null,
      proposedCoachWorkspaceUserId: coach?.id ?? null,
      historyFromDate: null,
      status: "AWAITING_REPLACEMENT",
    });
    await notifyClient(db, e, "Your coaching assignment needs review");
    return e.id;
  }
  if (kind === "proposePlan") {
    owner();
    if (e.checkoutSessionId && e.paymentState !== "PAID")
      fail(
        "Resolve the pending checkout before proposing a different program version.",
      );
    const version =
      (await db.coachingProgramVersion.findFirst({
        where: {
          id: String(input.programVersionId),
          program: { workspaceId: actor.workspaceId },
        },
      })) ?? fail("Program version not found.");
    if (
      version.currency !== e.programVersion.currency ||
      version.priceCents !== e.programVersion.priceCents ||
      version.appointmentUnits < e.programVersion.appointmentUnits
    )
      fail(
        "Price, currency or reduced unit changes need a separately purchased program; existing paid entitlements cannot be overwritten.",
      );
    const startsOn = dateOnly(input.startsOn),
      endsOn = dateOnly(input.endsOn);
    if (
      endsOn < startsOn ||
      endsOn < dateOnly(getWorkspaceDateString(now, e.timezone))
    )
      fail("Choose valid revised dates ending today or later.");
    await bump({
      proposedProgramVersionId: version.id,
      proposedStartsOn: startsOn,
      proposedEndsOn: endsOn,
    });
    await notifyClient(db, e, "Review your proposed coaching plan");
    return e.id;
  }
  if (kind === "close") {
    if (!ctx.own && !ctx.owner)
      fail("The client or owner must close a program.");
    open();
    text(input.reason, "Closure reason", 1000);
    if (input.confirmConsequences !== true)
      fail(
        "Review the remaining appointment units and settlement before closing.",
      );
    await releaseCoachingAppointmentsTx(db, {
      workspaceId: actor.workspaceId,
      enrollmentId: e.id,
      actorUserId: actor.userId,
      operationId: command.operationId,
      status: "PROGRAM_CLOSED",
      reason: "Program closed; obligation retained for settlement.",
      startsAt: { gt: now },
    });
    await bump({
      closedAt: now,
      status: "CLOSED",
      retrievalUntil: new Date(
        now.getTime() + e.programVersion.retrievalDays * 86400000,
      ),
      settlementState: "REVIEW_REQUIRED",
      exportState: "AVAILABLE",
    });
    await notifyClient(db, e, "Your coaching service is closed");
    return e.id;
  }
  if (kind === "recordSettlement") {
    owner();
    if (!e.closedAt && coachingStatus(e) !== "END_REVIEW")
      fail("Settlement review is available at program end or closure.");
    // A case note records a decision; it never asserts a provider refund succeeded.
    await bump({
      settlementState: "REVIEW_RECORDED",
      settlementNote: text(input.reason, "Settlement decision", 2000),
    });
    return e.id;
  }
  if (kind === "resolveDeliveryException") {
    owner();
    const issue =
      (await db.coachingDeliveryException.findFirst({
        where: {
          id: String(input.exceptionId),
          enrollmentId: e.id,
          workspaceId: actor.workspaceId,
        },
      })) ?? fail("Delivery exception not found.");
    if (issue.reviewerWorkspaceUserId !== ctx.staff!.id)
      fail("The assigned owner must review this delivery exception.");
    await db.coachingDeliveryException.update({
      where: { id: issue.id },
      data: {
        status: "RESOLVED",
        resolution: text(
          input.reason,
          "Agreed replacement delivery or money review",
          2000,
        ),
        resolvedAt: now,
      },
    });
    await bump();
    return issue.id;
  }
  return fail("Unsupported coaching action.");
}

async function ensureAppointmentFree(
  db: Tx,
  workspaceId: string,
  slot: {
    coachWorkspaceUserId: string;
    roomId: string | null;
    startsAt: Date;
    endsAt: Date;
    bufferMinutes: number;
  },
  excludedId?: string,
) {
  const from = new Date(slot.startsAt.getTime() - slot.bufferMinutes * 60000),
    until = new Date(slot.endsAt.getTime() + slot.bufferMinutes * 60000);
  try {
    await assertStaffNotOnLeave(db, { workspaceId, coachWorkspaceUserId: slot.coachWorkspaceUserId, startsAt: from, endsAt: until });
  } catch (error) {
    if (error instanceof StaffLeaveError) fail(error.message);
    throw error;
  }
  const conflicts = await db.coachingAppointment.findMany({
    where: {
      workspaceId,
      id: excludedId ? { not: excludedId } : undefined,
      status: { in: ["HELD", "BOOKED"] },
      OR: [
        { coachWorkspaceUserId: slot.coachWorkspaceUserId },
        ...(slot.roomId ? [{ roomId: slot.roomId }] : []),
      ],
      startsAt: { lt: new Date(until.getTime() + 240 * 60000) },
      endsAt: { gt: new Date(from.getTime() - 240 * 60000) },
    },
  });
  if (
    conflicts.some(
      (item) =>
        item.startsAt.getTime() - item.bufferMinutes * 60000 <
          until.getTime() &&
        item.endsAt.getTime() + item.bufferMinutes * 60000 > from.getTime(),
    )
  )
    fail(
      "The coach or room was booked for another appointment. Choose another time.",
    );
  const location = await db.location.findUniqueOrThrow({
    where: { workspaceId },
  });
  const templates = await db.classTemplate.findMany({
    where: { workspaceId, archivedAt: null },
    include: classOccurrenceInclude,
  });
  for (
    let day = getWorkspaceDateString(from, location.timezone);
    day <= getWorkspaceDateString(until, location.timezone);
    day = addDays(day, 1)
  ) {
    for (const template of templates) {
      const occurrence = resolveClassOccurrence({
        template,
        scheduledForDate: day,
      });
      if (
        !occurrence ||
        occurrence.status === "CANCELLED" ||
        (occurrence.coachWorkspaceUserId !== slot.coachWorkspaceUserId &&
          (!slot.roomId || occurrence.roomId !== slot.roomId))
      )
        continue;
      const startsAt = getZonedDateTimeAsUtc({
        dateString: day,
        minutes: occurrence.startTimeMinutes,
        timezone: location.timezone,
      });
      const endsAt = getZonedDateTimeAsUtc({
        dateString: day,
        minutes: occurrence.endTimeMinutes,
        timezone: location.timezone,
      });
      if (startsAt < until && endsAt > from)
        fail("The coach or room has a class at that time.");
    }
  }
  const lesson = await db.privateLessonSlot.findFirst({
    where: {
      workspaceId,
      coachWorkspaceUserId: slot.coachWorkspaceUserId,
      status: { not: "CANCELLED" },
      startsAt: { lt: until },
      endsAt: { gt: from },
    },
  });
  if (lesson) fail("The coach has a private lesson at that time.");
}

/** Narrow DTOs keep owner operations, member records and author drafts physically separate. */
export async function getCoachingWorkspace(actor: CoachingActor) {
  return prisma.$transaction(async (db) => {
    const who = await identity(db, actor);
    const isOwner = who.staff?.role === "OWNER";
    const where: Prisma.CoachingEnrollmentWhereInput = {
      workspaceId: actor.workspaceId,
      ...(who.staff
        ? isOwner
          ? {}
          : { currentCoachWorkspaceUserId: who.staff.id }
        : { memberId: who.member!.id }),
    };
    const enrollments = await db.coachingEnrollment.findMany({
      where,
      include: {
        member: { select: { fullName: true } },
        programVersion: { include: { program: { select: { name: true } } } },
        currentCoach: {
          select: {
            isActive: true,
            user: { select: { fullName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const programs = who.staff
      ? await db.coachingProgram.findMany({
          where: { workspaceId: actor.workspaceId },
          include: { versions: { orderBy: { number: "desc" } } },
        })
      : [];
    const coaches = who.staff
      ? await db.workspaceUser.findMany({
          where: {
            workspaceId: actor.workspaceId,
            isActive: true,
            role: { in: ["OWNER", "COACH"] },
          },
          select: {
            id: true,
            user: { select: { fullName: true, email: true } },
          },
        })
      : [];
    const members = isOwner
      ? await db.member.findMany({
          where: { workspaceId: actor.workspaceId, userId: { not: null } },
          select: { id: true, fullName: true, dateOfBirth: true },
        })
      : [];
    const rooms = who.staff
      ? await db.room.findMany({
          where: {
            location: { workspaceId: actor.workspaceId },
            isActive: true,
            archivedAt: null,
          },
          select: { id: true, name: true },
        })
      : [];
    const availability = who.staff
      ? await db.coachingAvailability.findMany({
          where: {
            workspaceId: actor.workspaceId,
            coachWorkspaceUserId: who.staff.id,
            withdrawnAt: null,
            startsAt: { gt: new Date() },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            room: { select: { name: true } },
          },
          orderBy: { startsAt: "asc" },
        })
      : [];
    return {
      isOwner,
      isStaff: !!who.staff,
      programs,
      coaches,
      members,
      rooms,
      availability,
      enrollments: enrollments.map((e) => ({
        id: e.id,
        memberName: e.member.fullName,
        programName: e.programVersion.program.name,
        status: coachingStatus(e),
        startsOn: e.startsOn,
        endsOn: e.endsOn,
        timezone: e.timezone,
        coachName:
          e.currentCoach?.user.fullName ??
          e.currentCoach?.user.email ??
          "Awaiting coach",
        paymentState: e.paymentState,
        settlementState: e.settlementState,
      })),
    };
  });
}

export async function getCoachingDetail(
  actor: CoachingActor,
  enrollmentId: string,
) {
  return prisma.$transaction(async (db) => {
    const ctx = await access(db, actor, enrollmentId);
    const e = ctx.enrollment;
    const canRead = ctx.own || ctx.coach;
    const meta = await db.coachingEnrollment.findUniqueOrThrow({
      where: { id: e.id },
      select: {
        member: { select: { fullName: true } },
        currentCoach: {
          select: { user: { select: { fullName: true, email: true } } },
        },
        proposedCoach: {
          select: { user: { select: { fullName: true, email: true } } },
        },
        programVersion: { select: { program: { select: { name: true } } } },
      },
    });
    const published = canRead
      ? await db.coachingDailyNote.findMany({
          where: {
            enrollmentId: e.id,
            publishedAt: { not: null },
            withdrawnAt: null,
            ...(ctx.coach && e.historyFromDate
              ? { localDate: { gte: e.historyFromDate } }
              : {}),
          },
          select: {
            id: true,
            localDate: true,
            status: true,
            publishedAt: true,
            revisions: {
              where: { withdrawnAt: null },
              select: { number: true, body: true, publishedAt: true },
              orderBy: { number: "desc" },
            },
          },
          orderBy: { localDate: "desc" },
        })
      : [];
    const drafts = ctx.coach
      ? await db.coachingDailyNote.findMany({
          where: { enrollmentId: e.id, authorWorkspaceUserId: ctx.staff!.id },
          select: {
            id: true,
            localDate: true,
            draftBody: true,
            version: true,
            status: true,
            publishedAt: true,
            withdrawnAt: true,
          },
          orderBy: { localDate: "desc" },
        })
      : [];
    const privateNotes = ctx.coach
      ? await db.coachingPrivateNote.findMany({
          where: { enrollmentId: e.id, authorWorkspaceUserId: ctx.staff!.id },
          select: { id: true, localDate: true, body: true, version: true },
          orderBy: { localDate: "desc" },
        })
      : [];
    const intake = canRead
      ? await db.coachingIntake.findUnique({
          where: { enrollmentId: e.id },
          select: { content: true, version: true, updatedAt: true },
        })
      : null;
    const milestones = canRead
      ? await db.coachingMilestone.findMany({ where: { enrollmentId: e.id } })
      : [];
    const appointments = await db.coachingAppointment.findMany({
      where: { enrollmentId: e.id },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        room: { select: { name: true } },
        status: true,
        unitState: true,
        version: true,
        virtualUrl: canRead,
        reason: true,
        policySnapshot: true,
        movedFromId: true,
        events: {
          select: { id: true, kind: true, reason: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { startsAt: "desc" },
    });
    const availability =
      (canRead || ctx.owner) &&
      e.currentCoachWorkspaceUserId &&
      e.programVersion.appointmentUnits > 0 &&
      !e.closedAt
        ? await db.coachingAvailability.findMany({
            where: {
              workspaceId: actor.workspaceId,
              coachWorkspaceUserId: e.currentCoachWorkspaceUserId,
              withdrawnAt: null,
              startsAt: { gt: new Date() },
              appointments: { none: { status: { in: ["BOOKED", "HELD"] } } },
            },
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              room: { select: { name: true } },
            },
            orderBy: { startsAt: "asc" },
          })
        : [];
    const deliveryExceptions = ctx.owner
      ? await db.coachingDeliveryException.findMany({
          where: { workspaceId: actor.workspaceId, enrollmentId: e.id },
          orderBy: { localDate: "desc" },
        })
      : [];
    const proposedPlan =
      canRead && e.proposedProgramVersionId
        ? await db.coachingProgramVersion.findUnique({
            where: { id: e.proposedProgramVersionId },
          })
        : null;
    if (canRead)
      await db.coachingRecordAccessEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          enrollmentId: e.id,
          actorUserId: actor.userId,
          kind: ctx.own ? "CLIENT_RECORD_READ" : "COACH_RECORD_READ",
          purpose: "Read authorized program records",
          scope: {
            publishedNoteIds: published.map((note) => note.id),
            privateNoteIds: privateNotes.map((note) => note.id),
            intake: !!intake,
          },
        },
      });
    // Do not spread the database enrollment: verification hashes, draft text and commercial internals stay server-side.
    return {
      id: e.id,
      version: e.version,
      memberId: e.memberId,
      memberName: meta.member.fullName,
      programName: meta.programVersion.program.name,
      coachName:
        meta.currentCoach?.user.fullName ??
        meta.currentCoach?.user.email ??
        "Awaiting coach",
      proposedCoachName:
        meta.proposedCoach?.user.fullName ??
        meta.proposedCoach?.user.email ??
        null,
      own: ctx.own,
      coach: ctx.coach,
      owner: ctx.owner,
      status: coachingStatus(e),
      startsOn: e.startsOn,
      endsOn: e.endsOn,
      timezone: e.timezone,
      contactVerified: !!e.contactVerifiedAt,
      accepted: !!e.acceptedAt,
      coachAccepted:
        !!e.currentCoachWorkspaceUserId && !!e.currentCoach?.isActive,
      plan: canRead ? e.programVersion : null,
      proposedPlan,
      proposedStartsOn: e.proposedStartsOn,
      proposedEndsOn: e.proposedEndsOn,
      paymentState: e.paymentState,
      checkoutAvailable: !!e.checkoutSessionId,
      payerGrantId: ctx.own ? e.currentPayerGrantId : null,
      closedAt: e.closedAt,
      retrievalUntil: e.retrievalUntil,
      settlementState: e.settlementState,
      settlementNote: e.settlementNote,
      exportState: e.exportState,
      pauseStartsOn: e.pauseStartsOn,
      pauseEndsOn: e.pauseEndsOn,
      published,
      drafts,
      privateNotes,
      intake,
      milestones,
      appointments,
      deliveryExceptions,
      availability,
      includedUnits: e.programVersion.appointmentUnits,
      reservedOrUsedUnits: appointments.filter((a) =>
        ["HELD", "CONSUMED", "DISPUTED"].includes(a.unitState),
      ).length,
    };
  });
}

export async function exportCoachingRecords(
  actor: CoachingActor,
  enrollmentId: string,
) {
  return (await prepareCoachingRecordExport(actor, enrollmentId)).records;
}

/** Call inside the caller's transaction after acquiring lockClassSchedule first.
 * Provider settlement is checked independently; this helper never reads notes. */
export async function applyCoachingRefundDisposition(
  db: Prisma.TransactionClient,
  args: {
    workspaceId: string;
    enrollmentId: string;
    refundId: string;
    actorUserId: string;
    disposition: "REVOKE_UNUSED_ACCESS" | "RETAIN_ACCESS";
  },
) {
  const enrollment =
    (await db.coachingEnrollment.findFirst({
      where: { id: args.enrollmentId, workspaceId: args.workspaceId },
      include: { programVersion: { select: { retrievalDays: true } } },
    })) ?? fail("Coaching program not found.");
  const refund = await db.refund.findFirst({
    where: {
      id: args.refundId,
      workspaceId: args.workspaceId,
      paymentId: enrollment.paymentId ?? "",
      status: "SUCCEEDED",
    },
  });
  if (!refund) fail("The provider has not confirmed this program's refund.");
  const operationId = `refund:${refund.id}`;
  if (
    await db.coachingEvent.findUnique({
      where: {
        workspaceId_operationId: { workspaceId: args.workspaceId, operationId },
      },
    })
  )
    return;
  const now = new Date();
  if (args.disposition === "REVOKE_UNUSED_ACCESS") {
    await db.coachingAppointment.updateMany({
      where: {
        enrollmentId: enrollment.id,
        status: "BOOKED",
        startsAt: { gt: now },
        unitState: "HELD",
      },
      data: {
        status: "REFUND_CANCELLED",
        unitState: "RELEASED",
        reason: "Unused service withdrawn after verified refund.",
        version: { increment: 1 },
      },
    });
    await db.coachingEnrollment.update({
      where: { id: enrollment.id },
      data: {
        closedAt: enrollment.closedAt ?? now,
        status: "CLOSED",
        retrievalUntil:
          enrollment.retrievalUntil ??
          new Date(
            now.getTime() + enrollment.programVersion.retrievalDays * 86400000,
          ),
        exportState: "AVAILABLE",
        settlementState: "REVIEW_REQUIRED",
        settlementNote:
          "The provider confirmed a refund. Review any remaining delivery or appointment obligations.",
        version: { increment: 1 },
      },
    });
  }
  await db.coachingEvent.create({
    data: {
      workspaceId: args.workspaceId,
      enrollmentId: enrollment.id,
      operationId,
      actorUserId: args.actorUserId,
      kind: "REFUND_VERIFIED",
      inputHash: refund.id,
      resultId: refund.id,
      metadata: {
        disposition: args.disposition,
        amountCents: refund.amountCents,
      },
    },
  });
}
