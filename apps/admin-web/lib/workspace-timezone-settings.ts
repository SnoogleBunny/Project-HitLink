import { createHash } from "node:crypto";
import {
  addDays, canonicalWorkspaceTimezone, classOccurrenceInclude, classScheduleReviewDates, dateOnlyStringToUtcDate,
  getWorkspaceDateString, getZonedDateTimeAsUtc, isUnambiguousClassTime,
  lockClassSchedule, parseDateOnlyString, prisma, resolveClassOccurrence,
  timezoneAtInstant, timezoneForOccurrenceDate, toDateOnlyString,
  type ClassOccurrenceTemplate, type Prisma, type PrismaClient, type TimezoneRevision,
} from "@flowstate/db";

export class WorkspaceTimezoneError extends Error {}
export interface WorkspaceTimezoneInput { timezone: string; effectiveFromDate: string; expectedVersion: number }
export interface WorkspaceTimezoneReview {
  ok: boolean; errors: string[]; previewHash: string; version: number;
  previousTimezone: string; timezone: string; effectiveFromDate: string; effectiveAt: string;
  earliestSafeDate: string; previewThrough: string;
  blockers: Array<{ date: string; title: string; bookings: number; attendance: number; waitlist: number }>;
  affected: Array<{ date: string; title: string; previousTimezone: string; timezone: string; previousStartsAt: string; startsAt: string }>;
}
type Actor = { workspaceId: string; userId: string };
type Db = Prisma.TransactionClient;

async function settings(tx: Db, actor: Actor, now: Date) {
  if (!await tx.workspaceUser.findFirst({ where: { ...actor, role: "OWNER", isActive: true }, select: { id: true } })) throw new WorkspaceTimezoneError("Only the owner can change the business timezone.");
  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId }, include: { location: true, timezoneRevisions: { orderBy: { version: "asc" } } } });
  if (!workspace.location) throw new WorkspaceTimezoneError("Complete business setup before changing the timezone.");
  const baselineTimezone = workspace.location.timezone;
  return { baselineTimezone, currentTimezone: timezoneAtInstant(baselineTimezone, workspace.timezoneRevisions, now), history: workspace.timezoneRevisions, version: workspace.timezoneRevisions.at(-1)?.version ?? 0 };
}

export async function getWorkspaceTimezoneSettings(actor: Actor, db: PrismaClient = prisma, now = new Date()) {
  return db.$transaction(tx => settings(tx, actor, now));
}

async function inspectTimezoneChange(tx: Db, actor: Actor, input: WorkspaceTimezoneInput, now: Date): Promise<WorkspaceTimezoneReview> {
  const current = await settings(tx, actor, now);
  const timezone = canonicalWorkspaceTimezone(input.timezone);
  if (!timezone) throw new WorkspaceTimezoneError("Choose a valid IANA timezone, such as America/Vancouver.");
  if (parseDateOnlyString(input.effectiveFromDate).status === "error") throw new WorkspaceTimezoneError("Choose a valid future effective date.");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion !== current.version) throw new WorkspaceTimezoneError("Timezone settings changed. Reload and preview the change again.");
  const date = input.effectiveFromDate;
  const lastDate = current.history.at(-1)?.effectiveFromDate;
  if (lastDate && date <= toDateOnlyString(lastDate)) throw new WorkspaceTimezoneError("Choose an effective date after the last scheduled timezone change.");
  const previousTimezone = timezoneForOccurrenceDate(current.baselineTimezone, current.history, date);
  if (timezone === previousTimezone) throw new WorkspaceTimezoneError("Choose a different timezone.");
  const today = [getWorkspaceDateString(now, current.currentTimezone), getWorkspaceDateString(now, timezone)].sort().at(-1)!;
  if (date <= today) throw new WorkspaceTimezoneError("The effective date must be a future date in both the current and new timezones.");
  if (!isUnambiguousClassTime(date, 0, timezone)) throw new WorkspaceTimezoneError("Midnight on this effective date is missing or ambiguous. Choose another effective date.");
  const effectiveAt = getZonedDateTimeAsUtc({ dateString: date, minutes: 0, timezone });
  if (current.history.at(-1) && effectiveAt <= current.history.at(-1)!.effectiveAt) throw new WorkspaceTimezoneError("Choose a later date so this change begins after the last confirmed timezone change.");
  const candidate: TimezoneRevision = { version: current.version + 1, previousTimezone, timezone, effectiveFromDate: date, effectiveAt };
  const nextHistory = [...current.history, candidate];
  const [templates, bookings, attendance, waitlist, events, lessons, appointments, availability, leave] = await Promise.all([
    tx.classTemplate.findMany({ where: { workspaceId: actor.workspaceId, archivedAt: null }, include: classOccurrenceInclude, orderBy: { id: "asc" } }),
    tx.classBooking.findMany({ where: { workspaceId: actor.workspaceId, scheduledForDate: { gte: dateOnlyStringToUtcDate(addDays(date, -2)) }, status: { not: "CANCELLED" } }, orderBy: { id: "asc" } }),
    tx.attendanceRecord.findMany({ where: { workspaceId: actor.workspaceId, scheduledForDate: { gte: dateOnlyStringToUtcDate(addDays(date, -2)) } }, orderBy: { id: "asc" } }),
    tx.waitlistEntry.findMany({ where: { workspaceId: actor.workspaceId, scheduledForDate: { gte: dateOnlyStringToUtcDate(addDays(date, -2)) }, status: "ACTIVE" }, orderBy: { id: "asc" } }),
    tx.event.findMany({ where: { workspaceId: actor.workspaceId, status: "PUBLISHED", endsAt: { gt: now } }, orderBy: { id: "asc" } }),
    tx.privateLessonSlot.findMany({ where: { workspaceId: actor.workspaceId, status: { in: ["OPEN", "BOOKED"] }, endsAt: { gt: now } }, orderBy: { id: "asc" } }),
    tx.coachingAppointment.findMany({ where: { workspaceId: actor.workspaceId, status: { in: ["HELD", "BOOKED"] }, endsAt: { gt: now } }, orderBy: { id: "asc" } }),
    tx.coachingAvailability.findMany({ where: { workspaceId: actor.workspaceId, withdrawnAt: null, endsAt: { gt: now } }, orderBy: { id: "asc" } }),
    tx.staffTimeOff.findMany({ where: { workspaceId: actor.workspaceId, revokedAt: null, endsAt: { gt: now } }, orderBy: { id: "asc" } }),
  ]);
  const errors = new Set<string>();
  const blockers = new Map<string, WorkspaceTimezoneReview["blockers"][number]>();
  let earliestSafeDate = addDays(today, 1);
  for (const [kind, records] of [["bookings", bookings], ["attendance", attendance], ["waitlist", waitlist]] as const) for (const record of records) {
    const day = toDateOnlyString(record.scheduledForDate);
    const template = templates.find(item => item.id === record.classTemplateId);
    const occurrence = template && resolveClassOccurrence({ template, scheduledForDate: day });
    const oldZone = timezoneForOccurrenceDate(current.baselineTimezone, current.history, day);
    const endsAt = occurrence ? getZonedDateTimeAsUtc({ dateString: day, minutes: occurrence.endTimeMinutes, timezone: oldZone }) : null;
    if (day < date && (!endsAt || endsAt < effectiveAt)) continue;
    const key = `${record.classTemplateId}:${day}`;
    const blocker = blockers.get(key) ?? { date: day, title: occurrence?.displayTitle ?? "Recorded class", bookings: 0, attendance: 0, waitlist: 0 };
    blocker[kind]++; blockers.set(key, blocker);
    let safe = addDays(day, 1);
    if (endsAt) safe = [safe, addDays(getWorkspaceDateString(endsAt, timezone), 1)].sort().at(-1)!;
    if (safe > earliestSafeDate) earliestSafeDate = safe;
  }
  if (blockers.size) errors.add("Choose an effective date after the committed class dates below. Bookings, attendance and active waitlists keep their existing dates and funding.");
  const previewThrough = addDays(date, 399);
  const dates = new Set<string>(classScheduleReviewDates({ templates: templates as ClassOccurrenceTemplate[], fromDate: addDays(date, -2) }));
  // Weekly schedules repeat between definition boundaries. Check those ranges
  // plus every offset transition in a full calendar cycle, instead of scanning
  // every class on every ordinary day while holding the booking lock.
  let previousNoon = getZonedDateTimeAsUtc({ dateString: addDays(date, -1), minutes: 720, timezone });
  for (let day = date; day <= previewThrough; day = addDays(day, 1)) {
    const noon = getZonedDateTimeAsUtc({ dateString: day, minutes: 720, timezone });
    if (+noon - +previousNoon !== 86_400_000) for (let offset = -2; offset <= 2; offset++) dates.add(addDays(day, offset));
    previousNoon = noon;
  }
  for (const template of templates) {
    for (const instance of template.classInstances) if (toDateOnlyString(instance.scheduledForDate) >= date) dates.add(toDateOnlyString(instance.scheduledForDate));
    for (const revision of template.scheduleRevisions) if (toDateOnlyString(revision.effectiveFrom) >= date) for (let offset = 0; offset < 7; offset++) dates.add(addDays(toDateOnlyString(revision.effectiveFrom), offset));
  }
  const resources = [...events, ...lessons, ...appointments, ...availability, ...leave].map(item => ({ ...item, roomId: "roomId" in item ? item.roomId : null, bufferMinutes: "bufferMinutes" in item ? item.bufferMinutes : 0 }));
  for (const resource of resources) for (const zone of [previousTimezone, timezone]) {
    for (const boundary of [resource.startsAt, resource.endsAt]) for (let offset = -1; offset <= 1; offset++) {
      const day = addDays(getWorkspaceDateString(boundary, zone), offset); if (day >= date) dates.add(day);
    }
  }
  const affected: WorkspaceTimezoneReview["affected"] = [];
  const intervals: Array<{ id: string; date: string; roomId: string; coachId: string | null; startsAt: Date; endsAt: Date }> = [];
  for (const day of [...dates].sort()) for (const template of templates) {
    const occurrence = resolveClassOccurrence({ template, scheduledForDate: day });
    if (!occurrence || occurrence.status === "CANCELLED") continue;
    const oldZone = timezoneForOccurrenceDate(current.baselineTimezone, current.history, day), newZone = timezoneForOccurrenceDate(current.baselineTimezone, nextHistory, day);
    const startsAt = getZonedDateTimeAsUtc({ dateString: day, minutes: occurrence.startTimeMinutes, timezone: newZone });
    const endsAt = getZonedDateTimeAsUtc({ dateString: day, minutes: occurrence.endTimeMinutes, timezone: newZone });
    intervals.push({ id: template.id, date: day, roomId: occurrence.roomId, coachId: occurrence.coachWorkspaceUserId, startsAt, endsAt });
    if (day < date) continue;
    if (!isUnambiguousClassTime(day, occurrence.startTimeMinutes, newZone) || !isUnambiguousClassTime(day, occurrence.endTimeMinutes, newZone)) errors.add(`${day}: ${occurrence.displayTitle} has a missing or ambiguous time in ${newZone}. Resolve this dated class before confirming.`);
    if (affected.length < 14) affected.push({ date: day, title: occurrence.displayTitle, previousTimezone: oldZone, timezone: newZone, previousStartsAt: getZonedDateTimeAsUtc({ dateString: day, minutes: occurrence.startTimeMinutes, timezone: oldZone }).toISOString(), startsAt: startsAt.toISOString() });
    for (const resource of resources) if ((occurrence.coachWorkspaceUserId && resource.coachWorkspaceUserId === occurrence.coachWorkspaceUserId) || (resource.roomId && resource.roomId === occurrence.roomId)) {
      if (resource.startsAt.getTime() - resource.bufferMinutes * 60_000 < +endsAt && resource.endsAt.getTime() + resource.bufferMinutes * 60_000 > +startsAt) errors.add(`${day}: ${occurrence.displayTitle} would overlap an existing appointment, availability, event, lesson or staff leave. Resolve it before confirming.`);
    }
  }
  intervals.sort((a, b) => +a.startsAt - +b.startsAt);
  for (let index = 0; index < intervals.length; index++) for (let next = index + 1; next < intervals.length && intervals[next]!.startsAt < intervals[index]!.endsAt; next++) {
    const a = intervals[index]!, b = intervals[next]!;
    if ((a.date >= date || b.date >= date) && (a.roomId === b.roomId || (a.coachId && a.coachId === b.coachId))) errors.add(`${b.date}: Classes would overlap across the timezone change. Resolve the dated schedule first.`);
  }
  const previewHash = createHash("sha256").update(JSON.stringify({ actor, input: { ...input, timezone }, current, templates, bookings, attendance, waitlist, events, lessons, appointments, availability, leave })).digest("hex");
  return { ok: errors.size === 0, errors: [...errors], previewHash, version: current.version, previousTimezone, timezone, effectiveFromDate: date, effectiveAt: effectiveAt.toISOString(), earliestSafeDate, previewThrough, blockers: [...blockers.values()].sort((a, b) => a.date.localeCompare(b.date)), affected };
}

export async function previewWorkspaceTimezoneChange(args: { actor: Actor; input: WorkspaceTimezoneInput; db?: PrismaClient; now?: Date }) {
  return (args.db ?? prisma).$transaction(async tx => { await lockClassSchedule(tx, args.actor.workspaceId); return inspectTimezoneChange(tx, args.actor, args.input, args.now ?? new Date()); }, { timeout: 20_000 });
}

export async function commitWorkspaceTimezoneChange(args: { actor: Actor; input: WorkspaceTimezoneInput; previewHash: string; confirmed: boolean; db?: PrismaClient; now?: Date }) {
  if (!args.confirmed) throw new WorkspaceTimezoneError("Confirm the reviewed timezone change before saving.");
  return (args.db ?? prisma).$transaction(async tx => {
    await lockClassSchedule(tx, args.actor.workspaceId);
    const review = await inspectTimezoneChange(tx, args.actor, args.input, args.now ?? new Date());
    if (!review.ok) throw new WorkspaceTimezoneError(review.errors[0] ?? "Resolve the preview before saving.");
    if (!args.previewHash || review.previewHash !== args.previewHash) throw new WorkspaceTimezoneError("The schedule or reservations changed. Preview the timezone change again.");
    return tx.workspaceTimezoneRevision.create({ data: { workspaceId: args.actor.workspaceId, version: review.version + 1, previousTimezone: review.previousTimezone, timezone: review.timezone, effectiveFromDate: dateOnlyStringToUtcDate(review.effectiveFromDate), effectiveAt: new Date(review.effectiveAt), actorUserId: args.actor.userId, previewHash: review.previewHash } });
  // Acquire the shared lock before fresh READ COMMITTED snapshots. A waiting
  // SERIALIZABLE transaction could otherwise retain a pre-lock read snapshot.
  }, { isolationLevel: "ReadCommitted", timeout: 20_000 });
}
