import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import {
  lockClassSchedule,
  classOccurrenceInclude,
} from "./class-occurrences.js";
import {
  lockStaffAuthorityTx,
  normalizeAuthoritySerializationError,
} from "./staff-access.js";
import { resolveWorkspaceClockTimezone } from "./workspace-timezones.js";
import {
  parseCoachingBookingPolicy,
  hashCoachingBookingPolicy,
  evaluateCoachingBookingPolicy,
  CoachingBookingPolicyError,
  type CoachingBookingPolicy,
} from "./coaching-booking-policy.js";

type Tx = Prisma.TransactionClient;
type Actor = { workspaceId: string; userId: string };
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const coachingPolicyEventKind = "COACHING_BOOKING_POLICY_CONFIRMED";
export type CoachingPolicyHead = {
  id: string;
  workspaceId: string;
  version: number;
  policy: CoachingBookingPolicy;
  policyHash: string;
  currentEventId: string;
};
export async function readCoachingBookingPolicyTx(
  tx: Tx,
  workspaceId: string,
): Promise<CoachingPolicyHead | null> {
  try {
    await tx.$queryRaw`SELECT id FROM coaching_booking_policies WHERE "workspaceId"=${workspaceId} FOR SHARE`;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
  const row = await tx.coachingBookingPolicy.findUnique({
    where: { workspaceId },
  });
  if (!row) return null;
  try {
    const policy = parseCoachingBookingPolicy(row.policy);
    if (hashCoachingBookingPolicy(policy) !== row.policyHash) return null;
    return { ...row, policy };
  } catch {
    return null;
  }
}
export async function coachingPolicyForSlotTx(
  tx: Tx,
  workspaceId: string,
  slot: { startsAt: Date; endsAt: Date; bufferMinutes: number },
  now: Date,
  head?: CoachingPolicyHead | null,
) {
  const current =
    head === undefined
      ? await readCoachingBookingPolicyTx(tx, workspaceId)
      : head;
  if (!current)
    throw new CoachingBookingPolicyError(
      "The owner must confirm appointment booking rules before publishing or booking new appointment times.",
    );
  const location = await tx.location.findUnique({ where: { workspaceId } });
  if (!location)
    throw new CoachingBookingPolicyError(
      "The gym must configure its business timezone first.",
    );
  const timezone = await resolveWorkspaceClockTimezone({
    workspaceId,
    baselineTimezone: location.timezone,
    now: slot.startsAt,
    db: tx,
  });
  const result = evaluateCoachingBookingPolicy({
    policy: current.policy,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    slotBufferMinutes: slot.bufferMinutes,
    timezone,
    now,
  });
  return { head: current, timezone, result };
}
export async function requireCoachingPolicySlotTx(
  tx: Tx,
  workspaceId: string,
  slot: { startsAt: Date; endsAt: Date; bufferMinutes: number },
  now: Date,
) {
  const evaluated = await coachingPolicyForSlotTx(tx, workspaceId, slot, now);
  if (!evaluated.result.allowed)
    throw new CoachingBookingPolicyError(
      evaluated.result.code === "NOT_OPEN"
        ? "This appointment is not open for booking yet."
        : evaluated.result.code === "OUTSIDE_SERVICE_HOURS"
          ? "Choose an appointment inside the confirmed appointment service hours."
          : "This appointment is outside the current booking window or needs its time reviewed.",
    );
  return {
    bufferMinutes: evaluated.result.effectiveBufferMinutes,
    bookingRules: {
      schemaVersion: 1,
      policyEventId: evaluated.head.currentEventId,
      policyVersion: evaluated.head.version,
      policyHash: evaluated.head.policyHash,
      timezone: evaluated.timezone,
      evaluatedAt: now.toISOString(),
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      effectiveBufferMinutes: evaluated.result.effectiveBufferMinutes,
      opensAt: evaluated.result.opensAt!.toISOString(),
      closesAt: evaluated.result.closesAt!.toISOString(),
    },
  };
}
async function owner(tx: Tx, actor: Actor) {
  await lockStaffAuthorityTx(tx, actor);
  const staff = await tx.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      role: "OWNER",
      isActive: true,
      workspace: { status: { not: "DISABLED" } },
    },
    include: { user: { select: { fullName: true, email: true } } },
  });
  if (!staff)
    throw new CoachingBookingPolicyError(
      "Only a current active owner can confirm appointment booking rules.",
    );
  return staff;
}
function inputTerms(input: {
  policy: unknown;
  reason: string;
  expectedVersion: number;
  operationId: string;
}) {
  const policy = parseCoachingBookingPolicy(input.policy),
    reason = input.reason.trim();
  if (!reason || reason.length > 500 || Array.from(reason).some(character => character.charCodeAt(0) < 32))
    throw new CoachingBookingPolicyError(
      "Record a reason using 500 characters or fewer.",
    );
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    !/^[A-Za-z0-9:_-]{16,150}$/.test(input.operationId)
  )
    throw new CoachingBookingPolicyError(
      "Reload the appointment rule editor before continuing.",
    );
  return {
    policy,
    reason,
    expectedVersion: input.expectedVersion,
    operationId: input.operationId,
  };
}
export interface CoachingBookingPolicyReview {
  version: number;
  policy: CoachingBookingPolicy;
  reason: string;
  previewHash: string;
  affectedAvailabilityCount: number;
  retainedAppointmentCount: number;
}
async function review(
  tx: Tx,
  actor: Actor,
  input: ReturnType<typeof inputTerms>,
  now: Date,
): Promise<CoachingBookingPolicyReview> {
  const head = await tx.coachingBookingPolicy.findUnique({
    where: { workspaceId: actor.workspaceId },
  });
  if (input.expectedVersion !== (head?.version ?? 0))
    throw new CoachingBookingPolicyError(
      "Appointment rules changed. Reload and preview this change again.",
    );
  const [
    location,
    slots,
    appointments,
    classes,
    lessons,
    events,
    leave,
    staff,
    zones,
  ] = await Promise.all([
    tx.location.findUnique({ where: { workspaceId: actor.workspaceId } }),
    tx.coachingAvailability.findMany({
      where: {
        workspaceId: actor.workspaceId,
        withdrawnAt: null,
        endsAt: { gt: now },
      },
      select: {
        id: true,
        coachWorkspaceUserId: true,
        roomId: true,
        startsAt: true,
        endsAt: true,
        bufferMinutes: true,
      },
      orderBy: { id: "asc" },
    }),
    tx.coachingAppointment.findMany({
      where: {
        workspaceId: actor.workspaceId,
        status: { in: ["BOOKED", "HELD"] },
        endsAt: { gt: now },
      },
      select: {
        id: true,
        coachWorkspaceUserId: true,
        roomId: true,
        startsAt: true,
        endsAt: true,
        bufferMinutes: true,
        status: true,
        unitState: true,
        version: true,
      },
      orderBy: { id: "asc" },
    }),
    tx.classTemplate.findMany({
      where: { workspaceId: actor.workspaceId, archivedAt: null },
      include: classOccurrenceInclude,
      orderBy: { id: "asc" },
    }),
    tx.privateLessonSlot.findMany({
      where: { workspaceId: actor.workspaceId, endsAt: { gt: now } },
      select: {
        id: true,
        coachWorkspaceUserId: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
      orderBy: { id: "asc" },
    }),
    tx.event.findMany({
      where: { workspaceId: actor.workspaceId, endsAt: { gt: now } },
      select: {
        id: true,
        coachWorkspaceUserId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    tx.staffTimeOff.findMany({
      where: {
        workspaceId: actor.workspaceId,
        revokedAt: null,
        endsAt: { gt: now },
      },
      select: {
        id: true,
        coachWorkspaceUserId: true,
        startsAt: true,
        endsAt: true,
      },
      orderBy: { id: "asc" },
    }),
    tx.workspaceUser.findMany({
      where: { workspaceId: actor.workspaceId },
      select: { id: true, role: true, isActive: true },
      orderBy: { id: "asc" },
    }),
    tx.workspaceTimezoneRevision.findMany({
      where: { workspaceId: actor.workspaceId },
      orderBy: { version: "asc" },
    }),
  ]);
  if (!location)
    throw new CoachingBookingPolicyError(
      "Complete business timezone setup first.",
    );
  const rooms = await tx.room.findMany({
    where: { locationId: location.id },
    select: { id: true, isActive: true, archivedAt: true, capacity: true },
    orderBy: { id: "asc" },
  });
  let affectedAvailabilityCount = 0;
  for (const slot of slots) {
    const timezone = await resolveWorkspaceClockTimezone({
      workspaceId: actor.workspaceId,
      baselineTimezone: location.timezone,
      now: slot.startsAt,
      db: tx,
    });
    if (
      !evaluateCoachingBookingPolicy({
        policy: input.policy,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        now,
        timezone,
        slotBufferMinutes: slot.bufferMinutes,
      }).allowed
    )
      affectedAvailabilityCount++;
  }
  return {
    version: head?.version ?? 0,
    policy: input.policy,
    reason: input.reason,
    affectedAvailabilityCount,
    retainedAppointmentCount: appointments.length,
    previewHash: digest({
      input,
      head,
      slots,
      appointments,
      classes,
      lessons,
      events,
      leave,
      staff,
      rooms,
      location,
      zones,
      affectedAvailabilityCount,
    }),
  };
}
export async function getCoachingBookingSettings(
  actor: Actor,
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await owner(tx, actor);
    const head = await readCoachingBookingPolicyTx(tx, actor.workspaceId);
    const history = await tx.workspaceDataEvent.findMany({
      where: { workspaceId: actor.workspaceId, kind: coachingPolicyEventKind },
      select: { id: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { head, history };
  });
}
export async function previewCoachingBookingPolicy(args: {
  actor: Actor;
  input: {
    policy: unknown;
    reason: string;
    expectedVersion: number;
    operationId: string;
  };
  db?: PrismaClient;
  now?: Date;
}) {
  const input = inputTerms(args.input);
  return (args.db ?? prisma).$transaction(
    async (tx) => {
      await lockClassSchedule(tx, args.actor.workspaceId);
      await owner(tx, args.actor);
      return review(tx, args.actor, input, args.now ?? new Date());
    },
    { timeout: 30000 },
  );
}
export async function confirmCoachingBookingPolicy(args: {
  actor: Actor;
  input: {
    policy: unknown;
    reason: string;
    expectedVersion: number;
    operationId: string;
  };
  previewHash: string;
  confirmed: boolean;
  db?: PrismaClient;
  now?: Date;
}) {
  const input = inputTerms(args.input),
    inputHash = digest(input);
  return (args.db ?? prisma).$transaction(
    async (tx) => {
      await lockClassSchedule(tx, args.actor.workspaceId);
      const staff = await owner(tx, args.actor);
      const prior = await tx.workspaceDataEvent.findFirst({
        where: {
          workspaceId: args.actor.workspaceId,
          kind: coachingPolicyEventKind,
          metadata: { path: ["operationId"], equals: input.operationId },
        },
      });
      if (prior) {
        const metadata = prior.metadata as Prisma.JsonObject;
        if (
          prior.actorUserId !== args.actor.userId ||
          metadata.inputHash !== inputHash
        )
          throw new CoachingBookingPolicyError(
            "This request was already used for another policy change.",
          );
        return {
          id: prior.id,
          version: Number(metadata.version),
          replayed: true,
        };
      }
      if (!args.confirmed)
        throw new CoachingBookingPolicyError(
          "Confirm that accepted appointments and units will remain unchanged.",
        );
      await tx.$queryRaw`SELECT id FROM coaching_booking_policies WHERE "workspaceId"=${args.actor.workspaceId} FOR UPDATE`;
      const current = await tx.coachingBookingPolicy.findUnique({
          where: { workspaceId: args.actor.workspaceId },
        }),
        preview = await review(tx, args.actor, input, args.now ?? new Date());
      if (preview.previewHash !== args.previewHash)
        throw new CoachingBookingPolicyError(
          "The reviewed policy or schedule changed. Preview the current effects again.",
        );
      const version = (current?.version ?? 0) + 1,
        policyHash = hashCoachingBookingPolicy(input.policy);
      const event = await tx.workspaceDataEvent.create({
        data: {
          workspaceId: args.actor.workspaceId,
          actorUserId: args.actor.userId,
          kind: coachingPolicyEventKind,
          metadata: {
            schemaVersion: 1,
            version,
            previousVersion: current?.version ?? 0,
            previousEventId: current?.currentEventId ?? null,
            previousPolicyHash: current?.policyHash ?? null,
            policyHash,
            policy: input.policy as unknown as Prisma.InputJsonObject,
            operationId: input.operationId,
            inputHash,
            previewHash: preview.previewHash,
            reason: input.reason,
            actorWorkspaceUserId: staff.id,
            actorNameSnapshot: staff.user.fullName ?? staff.user.email,
            affectedAvailabilityCount: preview.affectedAvailabilityCount,
            retainedAppointmentCount: preview.retainedAppointmentCount,
          },
        },
      });
      // Native INSERT ... ON CONFLICT runs BEFORE INSERT guards even for an
      // existing head. Use the exact locked current identity for a real UPDATE.
      const data = {
        version,
        policy: input.policy as unknown as Prisma.InputJsonObject,
        policyHash,
        currentEventId: event.id,
      };
      if (current)
        await tx.coachingBookingPolicy.update({
          where: { id: current.id },
          data,
        });
      else
        await tx.coachingBookingPolicy.create({
          data: { workspaceId: args.actor.workspaceId, ...data },
        });
      return { id: event.id, version, replayed: false };
    },
    { timeout: 30000 },
  );
}
