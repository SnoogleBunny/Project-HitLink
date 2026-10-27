import { resolveWorkspaceClockTimezone } from "./workspace-timezones.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client.js";
import { readCoachingBookingPolicyTx } from "./coaching-booking-settings.js";
import {
  classOccurrenceInclude,
  isUnambiguousClassTime,
  lockClassSchedule,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import {
  addDays,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  parseDateOnlyString,
} from "./occurrences.js";

type Actor = { workspaceId: string; userId: string };
type Tx = Prisma.TransactionClient;
export type StaffLeaveConflict = {
  kind: string;
  label: string;
  startsAt: string;
  endsAt: string;
  href: string;
};
export class StaffLeaveError extends Error {
  constructor(
    message: string,
    public conflicts: StaffLeaveConflict[] = [],
  ) {
    super(message);
    this.name = "StaffLeaveError";
  }
}
async function owner(db: Tx, actor: Actor) {
  const staff = await db.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      role: "OWNER",
      isActive: true,
      workspace: { status: { not: "DISABLED" } },
    },
  });
  if (!staff)
    throw new StaffLeaveError(
      "Only an active gym owner can manage staff leave.",
    );
  return staff;
}
function reason(value: string) {
  const clean = value.trim();
  if (clean.length < 3 || clean.length > 500)
    throw new StaffLeaveError(
      "Enter a reason between 3 and 500 characters. Keep medical or other private details out of this record.",
    );
  return clean;
}
/** datetime-local inputs are interpreted in the gym timezone, never the browser timezone. */
export function parseStaffLeaveTime(value: string, timezone: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || parseDateOnlyString(match[1]).status !== "ok")
    throw new StaffLeaveError("Choose valid leave dates and times.");
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (
    Number(match[2]) > 23 ||
    Number(match[3]) > 59 ||
    !isUnambiguousClassTime(match[1]!, minutes, timezone)
  )
    throw new StaffLeaveError(
      "This time is missing or repeated because of daylight saving. Choose an unambiguous time.",
    );
  return getZonedDateTimeAsUtc({ dateString: match[1]!, minutes, timezone });
}

/** Call under lockClassSchedule for mutations. Endpoints are exclusive, so adjacent services are allowed. */
export async function assertStaffNotOnLeave(
  db: Tx,
  args: {
    workspaceId: string;
    coachWorkspaceUserId: string;
    startsAt: Date;
    endsAt: Date;
  },
) {
  const leave = await db.staffTimeOff.findFirst({
    where: {
      workspaceId: args.workspaceId,
      coachWorkspaceUserId: args.coachWorkspaceUserId,
      revokedAt: null,
      startsAt: { lt: args.endsAt },
      endsAt: { gt: args.startsAt },
    },
    select: { id: true },
  });
  if (leave)
    throw new StaffLeaveError(
      "This coach is on leave at that time, including any appointment buffer. Choose another time or ask an owner to review staff leave.",
    );
}

async function conflicts(
  db: Tx,
  args: {
    workspaceId: string;
    coachWorkspaceUserId: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
  },
) {
  const { workspaceId, coachWorkspaceUserId, startsAt, endsAt, timezone } =
    args;
  const results: StaffLeaveConflict[] = [];
  const add = (
    kind: string,
    label: string,
    from: Date,
    until: Date,
    href: string,
    buffer = 0,
  ) => {
    const blockedFrom = new Date(from.getTime() - buffer * 60000),
      blockedUntil = new Date(until.getTime() + buffer * 60000);
    if (blockedFrom < endsAt && blockedUntil > startsAt)
      results.push({
        kind,
        label,
        startsAt: blockedFrom.toISOString(),
        endsAt: blockedUntil.toISOString(),
        href,
      });
  };
  const appointmentPolicy=await readCoachingBookingPolicyTx(db,workspaceId);
  const minimumAvailabilityBuffer=appointmentPolicy?.policy.appointments.minimumBufferMinutes??0;
  const [templates, appointments, availability, lessons, events, leaves] =
    await Promise.all([
      db.classTemplate.findMany({
        where: { workspaceId, archivedAt: null },
        include: classOccurrenceInclude,
      }),
      db.$queryRaw<Array<{id:string;startsAt:Date;endsAt:Date;bufferMinutes:number}>>`SELECT id,"startsAt","endsAt","bufferMinutes" FROM coaching_appointments WHERE "workspaceId"=${workspaceId} AND "coachWorkspaceUserId"=${coachWorkspaceUserId} AND status IN ('HELD','BOOKED') AND "startsAt"-make_interval(mins=>"bufferMinutes")<${endsAt} AND "endsAt"+make_interval(mins=>"bufferMinutes")>${startsAt}`,
      db.$queryRaw<Array<{id:string;startsAt:Date;endsAt:Date;bufferMinutes:number}>>`SELECT id,"startsAt","endsAt",GREATEST("bufferMinutes",${minimumAvailabilityBuffer}::int) AS "bufferMinutes" FROM coaching_availability WHERE "workspaceId"=${workspaceId} AND "coachWorkspaceUserId"=${coachWorkspaceUserId} AND "withdrawnAt" IS NULL AND "startsAt"-make_interval(mins=>GREATEST("bufferMinutes",${minimumAvailabilityBuffer}::int))<${endsAt} AND "endsAt"+make_interval(mins=>GREATEST("bufferMinutes",${minimumAvailabilityBuffer}::int))>${startsAt}`,
      db.privateLessonSlot.findMany({
        where: {
          workspaceId,
          coachWorkspaceUserId,
          status: { in: ["OPEN", "BOOKED"] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      }),
      db.event.findMany({
        where: {
          workspaceId,
          coachWorkspaceUserId,
          status: "PUBLISHED",
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      }),
      db.staffTimeOff.findMany({
        where: {
          workspaceId,
          coachWorkspaceUserId,
          revokedAt: null,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      }),
    ]);
  for (
    let date = addDays(getWorkspaceDateString(startsAt, timezone), -2);
    date <= addDays(getWorkspaceDateString(endsAt, timezone), 2);
    date = addDays(date, 1)
  ) {
    for (const template of templates) {
      const item = resolveClassOccurrence({ template, scheduledForDate: date });
      if (
        !item ||
        item.status === "CANCELLED" ||
        item.coachWorkspaceUserId !== coachWorkspaceUserId
      )
        continue;
      add(
        "CLASS",
        item.displayTitle,
        getZonedDateTimeAsUtc({
          dateString: date,
          minutes: item.startTimeMinutes,
          timezone: item.timezone ?? timezone,
        }),
        getZonedDateTimeAsUtc({
          dateString: date,
          minutes: item.endTimeMinutes,
          timezone: item.timezone ?? timezone,
        }),
        `/dashboard/schedule?date=${date}`,
      );
    }
  }
  for (const item of appointments)
    add(
      "APPOINTMENT",
      "Booked coaching appointment (including buffer)",
      item.startsAt,
      item.endsAt,
      "/dashboard/coaching",
      item.bufferMinutes,
    );
  for (const item of availability)
    add(
      "AVAILABILITY",
      "Published coaching availability (including buffer)",
      item.startsAt,
      item.endsAt,
      "/dashboard/coaching",
      item.bufferMinutes,
    );
  for (const item of lessons)
    add(
      "PRIVATE_LESSON",
      "Private lesson — resolve the scheduled service with its owner",
      item.startsAt,
      item.endsAt,
      "/dashboard/schedule",
    );
  for (const item of events)
    add(
      "EVENT",
      "Published event — resolve the scheduled service with its owner",
      item.startsAt,
      item.endsAt,
      "/dashboard/schedule",
    );
  for (const item of leaves)
    add(
      "LEAVE",
      "Existing staff leave",
      item.startsAt,
      item.endsAt,
      "/dashboard/staff",
    );
  return results.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function createStaffLeave(
  actor: Actor,
  input: {
    requestId: string;
    coachWorkspaceUserId: string;
    startsAt: string;
    endsAt: string;
    reason: string;
  },
  options: { db?: typeof prisma; now?: Date } = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  return db.$transaction(
    async (tx) => {
      await lockClassSchedule(tx, actor.workspaceId);
      await owner(tx, actor);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          input.requestId,
        )
      )
        throw new StaffLeaveError("Reload the form before recording leave.");
      const location = await tx.location.findUniqueOrThrow({
        where: { workspaceId: actor.workspaceId },
      });
      location.timezone = await resolveWorkspaceClockTimezone({ workspaceId: actor.workspaceId, baselineTimezone: location.timezone, now, db: tx });
      const startsAt = parseStaffLeaveTime(input.startsAt, location.timezone),
        endsAt = parseStaffLeaveTime(input.endsAt, location.timezone),
        cleanReason = reason(input.reason);
      const prior = await tx.staffTimeOff.findUnique({
        where: { id: input.requestId },
      });
      if (prior) {
        if (
          prior.workspaceId !== actor.workspaceId ||
          prior.createdByUserId !== actor.userId ||
          prior.coachWorkspaceUserId !== input.coachWorkspaceUserId ||
          prior.startsAt.getTime() !== startsAt.getTime() ||
          prior.endsAt.getTime() !== endsAt.getTime() ||
          prior.reason !== cleanReason
        )
          throw new StaffLeaveError(
            "This request was already used for different leave details. Reload the form.",
          );
        return prior;
      }
      if (
        startsAt < now ||
        endsAt <= startsAt ||
        endsAt.getTime() - startsAt.getTime() > 366 * 86400000
      )
        throw new StaffLeaveError(
          "Choose a future leave period of up to one year, with the end after the start.",
        );
      const coach = await tx.workspaceUser.findFirst({
        where: {
          id: input.coachWorkspaceUserId,
          workspaceId: actor.workspaceId,
          isActive: true,
          role: { in: ["OWNER", "COACH"] },
        },
      });
      if (!coach)
        throw new StaffLeaveError(
          "Choose an active coach or owner in this gym.",
        );
      const blocked = await conflicts(tx, {
        workspaceId: actor.workspaceId,
        coachWorkspaceUserId: coach.id,
        startsAt,
        endsAt,
        timezone: location.timezone,
      });
      if (blocked.length)
        throw new StaffLeaveError(
          "Resolve these conflicts before recording leave. Reassign or cancel classes, move booked appointments, and withdraw published appointment times. Existing services stay unchanged.",
          blocked,
        );
      return tx.staffTimeOff.create({
        data: {
          id: input.requestId,
          workspaceId: actor.workspaceId,
          coachWorkspaceUserId: coach.id,
          startsAt,
          endsAt,
          reason: cleanReason,
          createdByUserId: actor.userId,
          createdAt: now,
        },
      });
    },
    { timeout: 20000 },
  );
}

export async function revokeStaffLeave(
  actor: Actor,
  input: { leaveId: string; reason: string },
  options: { db?: typeof prisma; now?: Date } = {},
) {
  const db = options.db ?? prisma;
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await owner(tx, actor);
    const leave = await tx.staffTimeOff.findFirst({
      where: { id: input.leaveId, workspaceId: actor.workspaceId },
    });
    if (!leave) throw new StaffLeaveError("Staff leave was not found.");
    const cleanReason = reason(input.reason);
    if (leave.revokedAt) {
      if (
        leave.revokedByUserId !== actor.userId ||
        leave.revocationReason !== cleanReason
      )
        throw new StaffLeaveError(
          "This leave has already been withdrawn. Refresh the page.",
        );
      return leave;
    }
    return tx.staffTimeOff.update({
      where: { id: leave.id },
      data: {
        revokedAt: options.now ?? new Date(),
        revokedByUserId: actor.userId,
        revocationReason: cleanReason,
      },
    });
  });
}

export async function getStaffLeave(actor: Actor, db: typeof prisma = prisma) {
  return db.$transaction(async (tx) => {
    await owner(tx, actor);
    const [staff, leave] = await Promise.all([
      tx.workspaceUser.findMany({
        where: {
          workspaceId: actor.workspaceId,
          role: { in: ["OWNER", "COACH"] },
        },
        select: {
          id: true,
          role: true,
          isActive: true,
          user: { select: { fullName: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      tx.staffTimeOff.findMany({
        where: { workspaceId: actor.workspaceId },
        orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      }),
    ]);
    return { staff, leave };
  });
}
