import { createHash } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type WorkspaceDataEvent,
} from "@prisma/client";
import { prisma } from "./client.js";
import {
  classOccurrenceInclude,
  lockClassSchedule,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import {
  addDays,
  dateOnlyStringToUtcDate,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  toDateOnlyString,
} from "./occurrences.js";
import { resolveWorkspaceClockTimezone } from "./workspace-timezones.js";
import {
  requireActiveStaffAccessTx,
  StaffAccessError,
} from "./staff-access.js";

export class RoomCapacityError extends Error {}
type Actor = { workspaceId: string; userId: string };
type Options = { db?: PrismaClient; now?: Date };
type Tx = Prisma.TransactionClient;
export type RoomCapacityInput = {
  roomId: string;
  capacity: string;
  expectedVersion: string;
  reason: string;
  operationId: string;
};
const kind = "ROOM_DEFAULT_CAPACITY_CONFIRMED";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const requestPattern = /^[a-zA-Z0-9:_-]{16,150}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const roomSelect = {
  id: true,
  locationId: true,
  name: true,
  capacity: true,
  isActive: true,
  archivedAt: true,
  updatedAt: true,
} as const;
type RoomState = Prisma.RoomGetPayload<{ select: typeof roomSelect }>;
function fail(message: string): never {
  throw new RoomCapacityError(message);
}
export function parseRoomDefaultCapacity(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (
    !Number.isSafeInteger(Number(text)) ||
    Number(text) <= 0 ||
    Number(text) > 2147483647
  )
    return fail(
      "Default capacity must be a positive whole number, or blank for no room default limit.",
    );
  return Number(text);
}
function validCapacity(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value > 0 &&
      value <= 2147483647)
  );
}
function normalize(input: RoomCapacityInput) {
  const reason = input.reason.trim();
  if (
    !input.roomId ||
    input.roomId.length > 150 ||
    !requestPattern.test(input.operationId) ||
    !hashPattern.test(input.expectedVersion)
  )
    fail("Reload this room before reviewing its default capacity.");
  if (
    reason.length < 5 ||
    reason.length > 500 ||
    Array.from(reason).some(
      (c) => c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0)),
    )
  )
    fail("Explain the room default change in 5 to 500 characters.");
  return {
    ...input,
    capacity: parseRoomDefaultCapacity(input.capacity),
    reason,
  };
}
type Change = ReturnType<typeof normalize>;
type Receipt = {
  schemaVersion: 1;
  roomId: string;
  operationId: string;
  inputHash: string;
  previewHash: string;
  confirmedVersion: string;
  revision: number;
  previousRevision: number;
  previousCapacity: number | null;
  capacity: number | null;
  reason: string;
  actorWorkspaceUserId: string;
  actorNameSnapshot: string;
  affectedOccurrenceCount: number;
  reservationCount: number;
  pendingPaymentCount: number;
  queuedEntryCount: number;
};
function receipt(event: Pick<WorkspaceDataEvent, "metadata">): Receipt {
  const value = event.metadata;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("The room capacity history needs an owner review.");
  const r = value as Record<string, unknown>;
  if (
    r.schemaVersion !== 1 ||
    typeof r.roomId !== "string" ||
    !r.roomId ||
    typeof r.operationId !== "string" ||
    !requestPattern.test(r.operationId) ||
    ![r.inputHash, r.previewHash, r.confirmedVersion].every(
      (v) => typeof v === "string" && hashPattern.test(v),
    ) ||
    !Number.isSafeInteger(r.revision) ||
    Number(r.revision) < 1 ||
    !Number.isSafeInteger(r.previousRevision) ||
    Number(r.previousRevision) !== Number(r.revision) - 1 ||
    !validCapacity(r.previousCapacity) ||
    !validCapacity(r.capacity) ||
    typeof r.reason !== "string" ||
    r.reason.trim().length < 5 ||
    r.reason.length > 500 ||
    typeof r.actorWorkspaceUserId !== "string" ||
    !r.actorWorkspaceUserId ||
    typeof r.actorNameSnapshot !== "string" ||
    !r.actorNameSnapshot ||
    ![
      r.affectedOccurrenceCount,
      r.reservationCount,
      r.pendingPaymentCount,
      r.queuedEntryCount,
    ].every((v) => Number.isSafeInteger(v) && Number(v) >= 0)
  )
    return fail("The room capacity history needs an owner review.");
  return r as Receipt;
}
const versionFor = (
  room: RoomState,
  eventId: string | null,
  revision: number,
) => hash({ room, eventId, revision });
async function locked<T>(
  db: PrismaClient,
  workspaceId: string,
  work: (tx: Tx) => Promise<T>,
) {
  for (let attempt = 0; ; attempt++)
    try {
      return await db.$transaction(
        async (tx) => {
          await lockClassSchedule(tx, workspaceId);
          return work(tx);
        },
        { isolationLevel: "ReadCommitted", timeout: 30000 },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 3
      )
        throw error;
    }
}
async function state(tx: Tx, actor: Actor, roomId: string) {
  let staff;
  try {
    staff = await requireActiveStaffAccessTx(tx, {
      ...actor,
      capability: "OWNER",
    });
  } catch (error) {
    if (error instanceof StaffAccessError)
      return fail(
        "Only a current active owner can review this room's default capacity.",
      );
    throw error;
  }
  // Lock the exact identity, including inactive/archived rows, before filtering
  // current lifecycle state. Existing room-name/archive commands use this row.
  await tx.$queryRaw`SELECT r."id" FROM "rooms" r JOIN "locations" l ON l."id" = r."locationId" WHERE r."id" = ${roomId} AND l."workspaceId" = ${actor.workspaceId} FOR UPDATE OF r`;
  const room = await tx.room.findFirst({
    where: { id: roomId, location: { workspaceId: actor.workspaceId } },
    select: roomSelect,
  });
  if (!room) return fail("This room is unavailable in the current business.");
  const history = await tx.$queryRaw<WorkspaceDataEvent[]>(
    Prisma.sql`SELECT * FROM "workspace_data_events" WHERE "workspaceId" = ${actor.workspaceId} AND "kind" = ${kind} AND "metadata"->>'roomId' = ${roomId} ORDER BY ("metadata"->>'revision')::integer DESC LIMIT 10`,
  );
  const parsed = history.map((event) => ({ event, value: receipt(event) }));
  const head = parsed[0],
    revision = head?.value.revision ?? 0;
  const version = versionFor(room, head?.event.id ?? null, revision);
  return { room, staff, history: parsed, revision, version };
}
export async function getRoomCapacitySettings(
  actor: Actor,
  roomId: string,
  options: Options = {},
) {
  return locked(options.db ?? prisma, actor.workspaceId, async (tx) => {
    const current = await state(tx, actor, roomId);
    return {
      roomId,
      roomName: current.room.name,
      capacity: current.room.capacity,
      version: current.version,
      revision: current.revision,
      canChange: !current.room.archivedAt,
      history: current.history.map(({ event, value }) => ({
        revision: value.revision,
        previousCapacity: value.previousCapacity,
        capacity: value.capacity,
        actorName: value.actorNameSnapshot,
        reason: value.reason,
        at: event.createdAt.toISOString(),
      })),
    };
  });
}
export type RoomCapacitySettings = Awaited<
  ReturnType<typeof getRoomCapacitySettings>
>;
export interface RoomCapacityOccurrenceImpact {
  classTemplateId: string;
  date: string;
  title: string;
  startsAt: string;
  timezone: string;
  capacity: number | null;
  reservations: number;
  pendingPayments: number;
  waitlist: number;
}
export interface RoomCapacityReview {
  roomId: string;
  roomName: string;
  version: string;
  revision: number;
  previousCapacity: number | null;
  capacity: number | null;
  reason: string;
  previewHash: string;
  defaultDefinitionCount: number;
  explicitDefinitionCount: number;
  inherited: RoomCapacityOccurrenceImpact[];
  inheritedOccurrenceCount: number;
  explicitOverrideOccurrenceCount: number;
  explicitOverrides: RoomCapacityOccurrenceImpact[];
  errors: string[];
}
async function review(
  tx: Tx,
  actor: Actor,
  change: Change,
  now: Date,
  current: Awaited<ReturnType<typeof state>>,
): Promise<RoomCapacityReview> {
  if (current.room.archivedAt)
    return fail("Archived rooms cannot change their default capacity.");
  if (change.expectedVersion !== current.version)
    return fail(
      "Room settings changed. Reload and preview the current default again.",
    );
  if (change.capacity === current.room.capacity)
    return fail("Choose a different room default capacity before previewing.");
  const workspace = await tx.workspace.findUniqueOrThrow({
    where: { id: actor.workspaceId },
    select: {
      location: { select: { timezone: true } },
      timezoneRevisions: { orderBy: { version: "asc" } },
    },
  });
  const baselineTimezone = workspace.location?.timezone ?? "UTC";
  const clockTimezone = await resolveWorkspaceClockTimezone({
    workspaceId: actor.workspaceId,
    baselineTimezone,
    now,
    db: tx,
  });
  const from = dateOnlyStringToUtcDate(
    addDays(getWorkspaceDateString(now, clockTimezone), -2),
  );
  // Base room alone is insufficient: dated schedule revisions or independent
  // full overrides can move a class into/out of this room. Coach-only snapshots
  // must continue to inherit their schedule fields.
  const templates = await tx.classTemplate.findMany({
    where: {
      workspaceId: actor.workspaceId,
      OR: [
        { roomId: change.roomId },
        { scheduleRevisions: { some: { roomId: change.roomId } } },
        { classInstances: { some: { roomId: change.roomId } } },
      ],
    },
    include: classOccurrenceInclude,
    orderBy: { id: "asc" },
  });
  const ids = templates.map((t) => t.id);
  const [bookings, queue] = await Promise.all([
    tx.classBooking.groupBy({
      by: ["classTemplateId", "scheduledForDate", "status"],
      where: {
        workspaceId: actor.workspaceId,
        classTemplateId: { in: ids },
        scheduledForDate: { gte: from },
        OR: [
          { status: "BOOKED" },
          {
            status: "PENDING_PAYMENT",
            OR: [
              { pendingPaymentExpiresAt: null },
              { pendingPaymentExpiresAt: { gt: now } },
            ],
          },
        ],
      },
      _count: { _all: true },
      _max: { updatedAt: true },
      orderBy: [
        { classTemplateId: "asc" },
        { scheduledForDate: "asc" },
        { status: "asc" },
      ],
    }),
    tx.waitlistEntry.groupBy({
      by: ["classTemplateId", "scheduledForDate"],
      where: {
        workspaceId: actor.workspaceId,
        classTemplateId: { in: ids },
        scheduledForDate: { gte: from },
        status: "ACTIVE",
      },
      _count: { _all: true },
      _max: { updatedAt: true },
      orderBy: [{ classTemplateId: "asc" }, { scheduledForDate: "asc" }],
    }),
  ]);
  const grouped = new Map<
    string,
    {
      templateId: string;
      date: string;
      reservations: number;
      pendingPayments: number;
      waitlist: number;
    }
  >();
  const rowFor = (templateId: string, date: string) => {
    const key = `${templateId}:${date}`;
    if (!grouped.has(key))
      grouped.set(key, {
        templateId,
        date,
        reservations: 0,
        pendingPayments: 0,
        waitlist: 0,
      });
    return grouped.get(key)!;
  };
  for (const b of bookings) {
    const row = rowFor(b.classTemplateId, toDateOnlyString(b.scheduledForDate));
    row.reservations += b._count._all;
    if (b.status === "PENDING_PAYMENT") row.pendingPayments += b._count._all;
  }
  for (const q of queue)
    rowFor(q.classTemplateId, toDateOnlyString(q.scheduledForDate)).waitlist +=
      q._count._all;
  const byId = new Map(templates.map((t) => [t.id, t]));
  const inherited: RoomCapacityOccurrenceImpact[] = [],
    explicitOverrides: RoomCapacityOccurrenceImpact[] = [],
    errors: string[] = [];
  let defaultDefinitionCount = 0,
    explicitDefinitionCount = 0;
  for (const template of templates)
    for (const definition of [
      template,
      ...template.scheduleRevisions,
      ...template.classInstances.filter(
        (i) => i.isScheduleOverride && i.status === "ACTIVE",
      ),
    ]) {
      if (definition.roomId !== change.roomId) continue;
      if (definition.capacityOverride === null) defaultDefinitionCount++;
      else explicitDefinitionCount++;
    }
  const reduction =
    change.capacity !== null &&
    (current.room.capacity === null || change.capacity < current.room.capacity);
  for (const group of [...grouped.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.templateId.localeCompare(b.templateId),
  )) {
    const template = byId.get(group.templateId)!;
    const occurrence = resolveClassOccurrence({
      template,
      scheduledForDate: group.date,
    });
    if (!occurrence) {
      const possiblyInherits = [
        template,
        ...template.scheduleRevisions,
        ...template.classInstances.filter((i) => i.isScheduleOverride),
      ].some((d) => d.roomId === change.roomId && d.capacityOverride === null);
      if (reduction && group.reservations && possiblyInherits)
        errors.push(
          `${group.date}: A committed class date needs schedule review before reducing this room default.`,
        );
      continue;
    }
    if (occurrence.status !== "ACTIVE" || occurrence.roomId !== change.roomId)
      continue;
    const timezone = occurrence.timezone ?? baselineTimezone;
    const startsAt = getZonedDateTimeAsUtc({
      dateString: group.date,
      minutes: occurrence.startTimeMinutes,
      timezone,
    });
    if (startsAt <= now) continue;
    const impact: RoomCapacityOccurrenceImpact = {
      classTemplateId: template.id,
      date: group.date,
      title: occurrence.displayTitle,
      startsAt: startsAt.toISOString(),
      timezone,
      capacity: occurrence.capacityOverride,
      reservations: group.reservations,
      pendingPayments: group.pendingPayments,
      waitlist: group.waitlist,
    };
    if (occurrence.capacityOverride !== null) {
      explicitOverrides.push(impact);
      continue;
    }
    inherited.push({ ...impact, capacity: change.capacity });
    if (
      reduction &&
      change.capacity !== null &&
      group.reservations > change.capacity
    )
      errors.push(
        `${group.date}: ${occurrence.displayTitle} has ${group.reservations} existing reservations and needs at least that many places. Resolve those reservations before reducing the room default.`,
      );
  }
  const previewHash = hash({
    actor,
    change,
    version: current.version,
    timezone: baselineTimezone,
    timezoneHistory: workspace.timezoneRevisions,
    templates,
    bookings,
    queue,
    inherited,
    explicitOverrides,
    errors,
  });
  return {
    roomId: change.roomId,
    roomName: current.room.name,
    version: current.version,
    revision: current.revision,
    previousCapacity: current.room.capacity,
    capacity: change.capacity,
    reason: change.reason,
    previewHash,
    defaultDefinitionCount,
    explicitDefinitionCount,
    inherited,
    inheritedOccurrenceCount: inherited.length,
    explicitOverrideOccurrenceCount: explicitOverrides.length,
    explicitOverrides: explicitOverrides.slice(0, 20),
    errors,
  };
}
export async function previewRoomCapacityChange(
  actor: Actor,
  input: RoomCapacityInput,
  options: Options = {},
) {
  const change = normalize(input);
  return locked(options.db ?? prisma, actor.workspaceId, async (tx) =>
    review(
      tx,
      actor,
      change,
      options.now ?? new Date(),
      await state(tx, actor, change.roomId),
    ),
  );
}
export async function confirmRoomCapacityChange(
  actor: Actor,
  input: RoomCapacityInput,
  approval: { previewHash: string; confirmed: boolean },
  options: Options = {},
) {
  const change = normalize(input);
  if (!approval.confirmed)
    return fail(
      "Acknowledge the capacity effects and unchanged reservations before confirming.",
    );
  if (!hashPattern.test(approval.previewHash))
    return fail("Preview the current room default before confirming.");
  const inputHash = hash({ actor, change, previewHash: approval.previewHash });
  const eventId = `room-capacity:${hash([actor.workspaceId, change.operationId])}`;
  return locked(options.db ?? prisma, actor.workspaceId, async (tx) => {
    const current = await state(tx, actor, change.roomId);
    if (current.room.archivedAt)
      return fail("Archived rooms cannot change their default capacity.");
    const existing = await tx.workspaceDataEvent.findUnique({
      where: { id: eventId },
    });
    if (existing) {
      const saved = receipt(existing);
      if (
        existing.workspaceId !== actor.workspaceId ||
        existing.actorUserId !== actor.userId ||
        existing.kind !== kind ||
        saved.roomId !== change.roomId ||
        saved.inputHash !== inputHash
      )
        return fail(
          "This request was already used for a different room change. Reload and preview again.",
        );
      return {
        eventId: existing.id,
        revision: saved.revision,
        capacity: saved.capacity,
        confirmedVersion: saved.confirmedVersion,
        replayed: true,
      };
    }
    const next = await review(
      tx,
      actor,
      change,
      options.now ?? new Date(),
      current,
    );
    if (next.previewHash !== approval.previewHash)
      return fail(
        "Room use or reservations changed. Preview the current effects again.",
      );
    if (next.errors.length)
      return fail(
        "Resolve the capacity review blockers before confirming. No reservations have been changed.",
      );
    if (current.revision >= 2147483647)
      return fail(
        "This room history needs an owner review before another revision.",
      );
    const updated = await tx.room.update({
      where: { id: change.roomId },
      data: { capacity: change.capacity },
      select: roomSelect,
    });
    const revision = current.revision + 1,
      confirmedVersion = versionFor(updated, eventId, revision);
    const actorUser = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { fullName: true, email: true },
    });
    const metadata: Receipt = {
      schemaVersion: 1,
      roomId: change.roomId,
      operationId: change.operationId,
      inputHash,
      previewHash: next.previewHash,
      confirmedVersion,
      revision,
      previousRevision: current.revision,
      previousCapacity: current.room.capacity,
      capacity: change.capacity,
      reason: change.reason,
      actorWorkspaceUserId: current.staff.id,
      actorNameSnapshot: actorUser.fullName?.trim() || actorUser.email,
      affectedOccurrenceCount: next.inheritedOccurrenceCount,
      reservationCount: next.inherited.reduce(
        (sum, row) => sum + row.reservations,
        0,
      ),
      pendingPaymentCount: next.inherited.reduce(
        (sum, row) => sum + row.pendingPayments,
        0,
      ),
      queuedEntryCount: next.inherited.reduce(
        (sum, row) => sum + row.waitlist,
        0,
      ),
    };
    await tx.workspaceDataEvent.create({
      data: {
        id: eventId,
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        kind,
        metadata: metadata as unknown as Prisma.InputJsonObject,
        createdAt: options.now ?? new Date(),
      },
    });
    return {
      eventId,
      revision,
      capacity: change.capacity,
      confirmedVersion,
      replayed: false,
    };
  });
}
