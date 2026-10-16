import { memberNotificationRecipients } from "@flowstate/db";
import { checkMemberClassEligibility, parseClassPrerequisites, parseProgramRankPolicy, resolveIneligibleClassBookingsTx, type ClassPrerequisites, type IneligibleClassBooking } from "@flowstate/db";
import { settleMembershipAllowance, settlePunchCardBooking } from "@flowstate/db";
import { createHash } from "node:crypto";
import {
  addDays, classOccurrenceInclude, classScheduleReviewDates, dateOnlyStringToUtcDate,
  formatMinutesAsTime, getWeekdayForDateString, getWorkspaceDateString,
  getZonedDateTimeAsUtc, isUnambiguousClassTime, lockClassSchedule, parseDateOnlyString, prisma,
  resolveClassOccurrence, toDateOnlyString, WEEKDAY_ORDER,
  type ClassOccurrenceTemplate, type ClassScheduleFields, type ClassScheduleRevisionRecord,
  type CoachAssignmentMode, type ClassRecurrence, type Prisma, type ResolvedClassOccurrence, type Weekday,
} from "@flowstate/db";
import { parseTimeToMinutes } from "./class-templates";

export interface ClassScheduleAccess { workspaceId: string; workspaceUserId: string; locationId: string; timezone: string; role: "OWNER" | "COACH" }
export interface ClassScheduleInput {
  prerequisites?: ClassPrerequisites;
  ineligibleResolution?: "CANCEL" | "EXCEPTION" | "";
  templateId: string | null;
  scope: "new" | "occurrence" | "future" | "coach" | "cancel";
  date: string;
  title: string;
  programId: string;
  roomId: string;
  coachWorkspaceUserId: string;
  coachAssignmentMode: CoachAssignmentMode;
  startTime: string;
  endTime: string;
  capacity: string;
  bookingCutoffMinutes: string;
  cancellationCutoffMinutes: string;
  recurrence: ClassRecurrence;
  weekdays: Weekday[];
  endDate: string;
  reason: string;
}
export interface ClassScheduleReview {
  ok: boolean;
  errors: string[];
  token: string;
  version: number;
  input: ClassScheduleInput;
  ongoing: boolean;
  previewThrough: string;
  affected: Array<{ date: string; before: string | null; after: string | null; bookings: number; waitlist: number }>;
  bookedCount: number;
  waitlistCount: number;
  notificationCount: number;
  preservedDates: string[];
  ineligibleBookings?: IneligibleClassBooking[];
}
type ScheduleTransaction = Prisma.TransactionClient;
type ScheduleDatabase = typeof prisma;
const activeStatuses = ["BOOKED", "PENDING_PAYMENT", "ATTENDED", "ABSENT", "NO_SHOW"] as const;
const snapshotFields = ["title", "programId", "roomId", "coachWorkspaceUserId", "startTimeMinutes", "endTimeMinutes", "capacityOverride", "bookingCutoffMinutes", "cancellationCutoffMinutes"] as const;
function snapshot(value: ClassScheduleFields) { return { ...(Object.fromEntries(snapshotFields.map((key) => [key, value[key]])) as Pick<ClassScheduleFields, typeof snapshotFields[number]>), prerequisites: parseClassPrerequisites(value.prerequisites) as unknown as Prisma.InputJsonValue }; }
function publicDetails(item: ResolvedClassOccurrence | null) {
  return item && item.status !== "CANCELLED" ? `${item.displayTitle} · ${formatMinutesAsTime(item.startTimeMinutes)}–${formatMinutesAsTime(item.endTimeMinutes)} · ${item.room.name} · ${item.coachDisplayName}` : null;
}
function equal(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
function publishedChanged(a: ResolvedClassOccurrence | null, b: ResolvedClassOccurrence | null) {
  return a?.status !== b?.status || !equal(a && snapshot(a), b && snapshot(b));
}
function noticeChanged(a: ResolvedClassOccurrence | null, b: ResolvedClassOccurrence | null) { return publicDetails(a) !== publicDetails(b); }
function overlaps(a: ClassScheduleFields, b: ClassScheduleFields) { return a.startTimeMinutes < b.endTimeMinutes && a.endTimeMinutes > b.startTimeMinutes; }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function whole(value: string) { const n = Number(value); return value.trim() !== "" && Number.isInteger(n) && n >= 0 ? n : null; }

export function scheduleInputFromForm(formData: FormData): ClassScheduleInput {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  let prerequisites: ClassPrerequisites | undefined;
  try { prerequisites = text("prerequisites") ? JSON.parse(text("prerequisites")) : undefined; } catch { prerequisites = {} as ClassPrerequisites; }
  return { prerequisites, ineligibleResolution: text("ineligibleResolution") as ClassScheduleInput["ineligibleResolution"], templateId: text("templateId") || null, scope: text("scope") as ClassScheduleInput["scope"], date: text("date"), title: text("title"), programId: text("programId"), roomId: text("roomId"), coachWorkspaceUserId: text("coachWorkspaceUserId"), coachAssignmentMode: text("coachAssignmentMode") as CoachAssignmentMode, startTime: text("startTime"), endTime: text("endTime"), capacity: text("capacity"), bookingCutoffMinutes: text("bookingCutoffMinutes"), cancellationCutoffMinutes: text("cancellationCutoffMinutes"), recurrence: text("recurrence") as ClassRecurrence, weekdays: formData.getAll("weekdays").map(String) as Weekday[], endDate: text("endDate"), reason: text("reason") };
}

async function inspectSchedule(args: { access: ClassScheduleAccess; input: ClassScheduleInput; db: ScheduleTransaction; now: Date }) {
  const { access, input, db, now } = args;
  const errors: string[] = [];
  const empty: ClassScheduleReview = { ok: false, errors, token: "", version: 0, input, ongoing: false, previewThrough: "", affected: [], bookedCount: 0, waitlistCount: 0, notificationCount: 0, preservedDates: [] };
  const actor = await db.workspaceUser.findFirst({ where: { id: access.workspaceUserId, workspaceId: access.workspaceId, role: "OWNER", isActive: true }, select: { id: true } });
  if (access.role !== "OWNER" || !actor) { errors.push("Only an active workspace owner can change classes."); return { review: empty }; }
  if (!input || ["scope", "date", "title", "programId", "roomId", "coachWorkspaceUserId", "coachAssignmentMode", "startTime", "endTime", "capacity", "bookingCutoffMinutes", "cancellationCutoffMinutes", "recurrence", "endDate", "reason"].some((key) => typeof input[key as keyof ClassScheduleInput] !== "string") || !Array.isArray(input.weekdays) || !["new", "occurrence", "future", "coach", "cancel"].includes(input.scope) || parseDateOnlyString(input.date).status === "error") { errors.push("Choose valid class details, date and edit scope."); return { review: empty }; }
  if (input.date < getWorkspaceDateString(now, access.timezone)) { errors.push("Past classes cannot be changed."); return { review: empty }; }
  const rawTemplates = await db.classTemplate.findMany({ where: { workspaceId: access.workspaceId, archivedAt: null }, include: classOccurrenceInclude, orderBy: { id: "asc" } });
  const templates = rawTemplates as unknown as ClassOccurrenceTemplate[];
  const current = templates.find((item) => item.id === input.templateId);
  const previous = current ? resolveClassOccurrence({ template: current, scheduledForDate: input.date }) : null;
  if (input.scope !== "new" && (!current || !previous || previous.status !== "ACTIVE")) { errors.push("This class date is no longer available to edit."); return { review: empty }; }
  if (input.scope === "new" && input.templateId) { errors.push("A new class cannot replace an existing class."); return { review: empty }; }
  const simple = input.scope === "coach" || input.scope === "cancel";
  const [program, room, coach] = await Promise.all([
    simple ? Promise.resolve(previous!.program) : db.program.findFirst({ where: { id: input.programId, workspaceId: access.workspaceId, archivedAt: null } }),
    simple ? Promise.resolve(previous!.room) : db.room.findFirst({ where: { id: input.roomId, locationId: access.locationId, isActive: true, archivedAt: null } }),
    input.coachWorkspaceUserId ? db.workspaceUser.findFirst({ where: { id: input.coachWorkspaceUserId, workspaceId: access.workspaceId, role: { in: ["OWNER", "COACH"] }, isActive: true }, include: { user: true } }) : Promise.resolve(null),
  ]);
  const start = simple ? previous!.startTimeMinutes : parseTimeToMinutes(input.startTime);
  const end = simple ? previous!.endTimeMinutes : parseTimeToMinutes(input.endTime);
  const capacity = simple ? previous!.capacityOverride : input.capacity ? whole(input.capacity) : null;
  const bookingCutoff = simple ? previous!.bookingCutoffMinutes : whole(input.bookingCutoffMinutes);
  const cancellationCutoff = simple ? previous!.cancellationCutoffMinutes : whole(input.cancellationCutoffMinutes);
  if (!program || !room) errors.push("Choose an active program and room in this workspace.");
  if (input.coachWorkspaceUserId && !coach) errors.push("Choose an active coach in this workspace.");
  if (start === null || end === null || end <= start) errors.push("End time must be after start time on the same day.");
  if (!simple && input.capacity && (!capacity || capacity < 1)) errors.push("Capacity must be a positive whole number.");
  if (bookingCutoff === null || cancellationCutoff === null) errors.push("Cutoffs must be zero or a positive number of minutes.");
  if (input.title.length > 100 || input.reason.length > 1000) errors.push("Keep the class title under 100 characters and reason under 1,000.");
  const perDate = ["coach", "occurrence", "cancel"].includes(input.scope);
  if (perDate && !["INHERIT", "ASSIGNED", "UNASSIGNED"].includes(input.coachAssignmentMode)) errors.push("Choose the coach assignment for this date.");
  if (perDate && input.coachAssignmentMode === "ASSIGNED" && !coach && input.scope !== "cancel") errors.push("Choose a coach or leave the date unassigned.");
  if (!perDate) {
    if (!["ONCE", "DAILY", "WEEKLY"].includes(input.recurrence)) errors.push("Choose a repeat pattern.");
    if (input.recurrence === "WEEKLY" && (!input.weekdays.length || input.weekdays.some((day) => !WEEKDAY_ORDER.includes(day)))) errors.push("Choose at least one valid weekday.");
    if (input.endDate && (parseDateOnlyString(input.endDate).status === "error" || input.endDate < input.date)) errors.push("Repeat until must be on or after the first date.");
  }
  if (input.scope === "cancel" && !input.reason) errors.push("Enter a reason for cancelling this class.");
  const prerequisites = parseClassPrerequisites(simple ? previous!.prerequisites : input.prerequisites);
  if (!prerequisites) errors.push("Choose valid class eligibility rules.");
  const rankPolicy = parseProgramRankPolicy(program && "rankPolicy" in program ? program.rankPolicy : undefined);
  if (!simple && prerequisites?.minimumRankKey && (rankPolicy?.mode !== "PREREQUISITES" || !rankPolicy.ranks.some((rank) => rank.key === prerequisites.minimumRankKey && rank.maxStripes >= prerequisites.minimumStripes))) errors.push("Choose a configured rank and stripe count for this program, or remove the rank requirement.");

  if (errors.length) return { review: empty };
  const fields: ClassScheduleFields = { prerequisites: prerequisites!, title: simple ? previous!.title : input.title || null, programId: program!.id, roomId: room!.id, coachWorkspaceUserId: coach?.id ?? null, startTimeMinutes: start!, endTimeMinutes: end!, capacityOverride: capacity, bookingCutoffMinutes: bookingCutoff!, cancellationCutoffMinutes: cancellationCutoff!, program: program!, room: room!, coachWorkspaceUser: coach };
  const revision: ClassScheduleRevisionRecord = { ...fields, id: "candidate", effectiveFrom: dateOnlyStringToUtcDate(input.date), startDate: dateOnlyStringToUtcDate(input.date), endDate: input.recurrence === "ONCE" ? dateOnlyStringToUtcDate(input.date) : input.endDate ? dateOnlyStringToUtcDate(input.endDate) : null, recurrence: input.recurrence, weekdays: [...new Set(input.weekdays)] };
  const candidate: ClassOccurrenceTemplate = current ? { ...current, scheduleRevisions: [...(current.scheduleRevisions ?? [])], classInstances: [...(current.classInstances ?? [])] } : { ...fields, id: "new", workspaceId: access.workspaceId, weekday: getWeekdayForDateString(input.date), scheduleStartsOn: dateOnlyStringToUtcDate(input.date), scheduleVersion: 0, scheduleRevisions: [], classInstances: [] };
  if (!perDate) candidate.scheduleRevisions = [...(candidate.scheduleRevisions ?? []).filter((item) => toDateOnlyString(item.effectiveFrom) < input.date), revision];
  else {
    const existing = candidate.classInstances!.find((item) => toDateOnlyString(item.scheduledForDate) === input.date);
    candidate.classInstances = candidate.classInstances!.filter((item) => toDateOnlyString(item.scheduledForDate) !== input.date);
    candidate.classInstances.push({ ...previous!, ...(input.scope === "occurrence" ? fields : {}), id: existing?.id ?? "candidate", scheduledForDate: dateOnlyStringToUtcDate(input.date), status: input.scope === "cancel" ? "CANCELLED" : "ACTIVE", cancellationReason: input.scope === "cancel" ? input.reason : existing?.cancellationReason, isScheduleOverride: input.scope === "occurrence" || input.scope === "cancel" || (!!existing && existing.isScheduleOverride !== false), coachAssignmentMode: input.scope === "cancel" ? previous!.coachAssignmentMode : input.coachAssignmentMode, coachWorkspaceUserId: input.scope === "cancel" ? previous!.coachWorkspaceUserId : coach?.id ?? null, coachWorkspaceUser: input.scope === "cancel" ? previous!.coachWorkspaceUser : coach });
  }
  const recordedWhere = { workspaceId: access.workspaceId, classTemplateId: input.templateId ?? "new", scheduledForDate: perDate ? dateOnlyStringToUtcDate(input.date) : { gte: dateOnlyStringToUtcDate(input.date) } };
  const [bookings, waitlist, attendance, lessons, events, appointments, staffLeave] = await Promise.all([
    db.classBooking.findMany({ where: { ...recordedWhere, status: { in: [...activeStatuses] } }, include: { member: { include: { familyLinks: { include: { guardian: true } } } }, guardian: true } }),
    db.waitlistEntry.findMany({ where: { ...recordedWhere, status: "ACTIVE" }, include: { member: { include: { familyLinks: { include: { guardian: true } } } } } }),
    db.attendanceRecord.findMany({ where: recordedWhere }),
    db.privateLessonSlot.findMany({ where: { workspaceId: access.workspaceId, status: { in: ["OPEN", "BOOKED"] }, endsAt: { gte: now } } }),
    db.event.findMany({ where: { workspaceId: access.workspaceId, status: "PUBLISHED", endsAt: { gte: now } } }),
    db.coachingAppointment.findMany({ where: { workspaceId: access.workspaceId, status: { in: ["HELD", "BOOKED"] } } }),
    db.staffTimeOff.findMany({ where: { workspaceId: access.workspaceId, revokedAt: null, endsAt: { gt: now } }, orderBy: { id: "asc" } }),
  ]);
  const entitlementHolds = await db.financialEntitlementHold.findMany({ where: { workspaceId: access.workspaceId, activeSlot: "ACTIVE" } });
  for (const booking of bookings) {
    if (entitlementHolds.some((hold) => (hold.targetKind === "BOOKING" && [booking.id, booking.fundedByBookingId].includes(hold.targetId)) || (hold.targetKind === "PUNCH_CARD" && hold.targetId === booking.memberPunchCardId) || (hold.targetKind === "MEMBERSHIP" && hold.targetId === booking.fundingMembershipId))) errors.push(`${toDateOnlyString(booking.scheduledForDate)}: A booking has a refund in progress. Resolve it before changing this class.`);
  }
  const recordedDates = [...bookings, ...waitlist, ...attendance].map((item) => toDateOnlyString(item.scheduledForDate));
  const blockedAppointments = appointments.map((item) => ({ ...item, startsAt: new Date(item.startsAt.getTime() - item.bufferMinutes * 60000), endsAt: new Date(item.endsAt.getTime() + item.bufferMinutes * 60000) }));
  const resourceDates: string[] = [];
  for (const item of [...lessons, ...events, ...blockedAppointments, ...staffLeave]) {
    const endDate = getWorkspaceDateString(item.endsAt, access.timezone);
    for (let date = getWorkspaceDateString(item.startsAt, access.timezone); date <= endDate; date = addDays(date, 1)) resourceDates.push(date);
  }
  const dates = perDate ? [input.date] : classScheduleReviewDates({ templates: [...templates, candidate], fromDate: input.date, recordedDates: [...recordedDates, ...resourceDates] });
  const affected: ClassScheduleReview["affected"] = [];
  const ineligibleBookings: IneligibleClassBooking[] = [];
  const notices: Array<{ date: string; before: ResolvedClassOccurrence; after: ResolvedClassOccurrence | null }> = [];
  let bookedCount = 0, waitlistCount = 0;
  for (const date of dates) {
    const before = current ? resolveClassOccurrence({ template: current, scheduledForDate: date }) : null;
    const after = resolveClassOccurrence({ template: candidate, scheduledForDate: date });
    const changed = publishedChanged(before, after);
    const modeChanged = before?.coachAssignmentMode !== after?.coachAssignmentMode;
    if (!changed && !modeChanged) continue;
    const booked = bookings.filter((item) => toDateOnlyString(item.scheduledForDate) === date);
    const queued = waitlist.filter((item) => toDateOnlyString(item.scheduledForDate) === date);
    const attended = attendance.some((item) => toDateOnlyString(item.scheduledForDate) === date);
    if (attended) errors.push(`${date}: Attendance is already recorded. This class must stay unchanged.`);
    if ((before || after) && getZonedDateTimeAsUtc({ dateString: date, minutes: (before ?? after)!.startTimeMinutes, timezone: access.timezone }) <= now) errors.push(`${date}: This class has already started.`);
    if (booked.some((item) => item.status === "PENDING_PAYMENT" && (!item.pendingPaymentExpiresAt || item.pendingPaymentExpiresAt > now))) errors.push(`${date}: Resolve the pending booking payment before changing this class.`);
    if (!after && (booked.length || queued.length)) errors.push(`${date}: Keep this booked or waitlisted date, or cancel it separately first.`);
    if (after && after.status !== "CANCELLED" && after.effectiveCapacity !== null && booked.length > after.effectiveCapacity) errors.push(`${date}: Capacity cannot be below ${booked.length} existing reservations.`);
    if (before && after && booked.length && before.programId !== after.programId) errors.push(`${date}: Program cannot change while reservations exist.`);
    if (after && after.status === "ACTIVE") for (const booking of booked) {
      const eligibility = await checkMemberClassEligibility({ workspaceId: access.workspaceId, memberId: booking.memberId, scheduledForDate: date, occurrence: after, db });
      if (!eligibility.eligible) ineligibleBookings.push({ bookingId: booking.id, classTemplateId: booking.classTemplateId, memberId: booking.memberId, memberName: booking.member.fullName, date, title: after.displayTitle, reason: eligibility.reason!, fingerprint: eligibility.fingerprint });
    }
    if (changed) {
      bookedCount += booked.length; waitlistCount += queued.length;
      affected.push({ date, before: publicDetails(before), after: publicDetails(after), bookings: booked.length, waitlist: queued.length });
      if (before && noticeChanged(before, after) && booked.length + queued.length) notices.push({ date, before, after });
    }
    if (!after || after.status === "CANCELLED" || !changed) continue;
    const startAt = getZonedDateTimeAsUtc({ dateString: date, minutes: after.startTimeMinutes, timezone: access.timezone });
    const endAt = getZonedDateTimeAsUtc({ dateString: date, minutes: after.endTimeMinutes, timezone: access.timezone });
    if (after.coachWorkspaceUserId && staffLeave.some((leave) => leave.coachWorkspaceUserId === after.coachWorkspaceUserId && leave.startsAt < endAt && leave.endsAt > startAt)) errors.push(`${date}: This coach is on leave. Assign another coach, leave this date unassigned, or review leave under Settings → Coaches and staff.`);
    if (!isUnambiguousClassTime(date, after.startTimeMinutes, access.timezone) || !isUnambiguousClassTime(date, after.endTimeMinutes, access.timezone)) errors.push(`${date}: This local time is missing or ambiguous because of daylight saving. Choose an unambiguous time.`);
    for (const otherTemplate of templates) {
      if (otherTemplate.id === candidate.id) continue;
      const other = resolveClassOccurrence({ template: otherTemplate, scheduledForDate: date });
      if (!other || other.status === "CANCELLED" || !overlaps(after, other)) continue;
      for (const field of ["roomId", "coachWorkspaceUserId"] as const) {
        if (!after[field] || after[field] !== other[field]) continue;
        if (before && before[field] === after[field] && before.startTimeMinutes === after.startTimeMinutes && before.endTimeMinutes === after.endTimeMinutes && overlaps(before, other)) continue;
        errors.push(`${date}: ${field === "roomId" ? "Room" : "Coach"} overlaps ${other.displayTitle} at ${formatMinutesAsTime(other.startTimeMinutes)}.`);
      }
    }
    for (const appointment of [...lessons, ...events, ...blockedAppointments]) {
      if (appointment.startsAt >= endAt || appointment.endsAt <= startAt) continue;
      if (after.coachWorkspaceUserId && appointment.coachWorkspaceUserId === after.coachWorkspaceUserId) errors.push(`${date}: Coach has another appointment or event at this time, including its buffer.`);
      if ("roomId" in appointment && appointment.roomId && appointment.roomId === after.roomId) errors.push(`${date}: Room has a coaching appointment at this time, including its buffer.`);
    }
  }
  if (!previous && !affected.length) errors.push("No class dates match these repeat settings.");
  if (ineligibleBookings.length && (!["CANCEL", "EXCEPTION"].includes(input.ineligibleResolution ?? "") || input.reason.trim().length < 5)) errors.push("Review the members who no longer qualify. Choose cancellation without penalty or an exception, and give a reason.");
  const previewThrough = input.endDate && input.endDate < addDays(input.date, 41) ? input.endDate : addDays(input.date, 41);
  const verifiedRecipients = await memberNotificationRecipients(db, access.workspaceId, [...bookings, ...waitlist].map((record) => record.memberId));
  const token = digest({ input, ineligibleBookings, templates: rawTemplates, bookings, waitlist, attendance, lessons, events, appointments, staffLeave, entitlementHolds, verifiedRecipients });
  const recipients = (noticeDate: string) => {
    const memberIds = new Set([...bookings, ...waitlist].filter((item) => toDateOnlyString(item.scheduledForDate) === noticeDate).map((item) => item.memberId));
    return verifiedRecipients.filter((recipient) => memberIds.has(recipient.memberId));
  };
  const review: ClassScheduleReview = { ...empty, ineligibleBookings, ok: errors.length === 0, errors: [...new Set(errors)], token, version: current?.scheduleVersion ?? 0, ongoing: !perDate && input.recurrence !== "ONCE" && !input.endDate, previewThrough, affected: affected.filter((item) => item.date <= previewThrough || item.bookings || item.waitlist), bookedCount, waitlistCount, notificationCount: notices.reduce((sum, item) => sum + recipients(item.date).length, 0), preservedDates: !perDate ? (current?.classInstances ?? []).filter((item) => item.isScheduleOverride !== false && toDateOnlyString(item.scheduledForDate) >= input.date).map((item) => toDateOnlyString(item.scheduledForDate)) : [] };
  return { review, candidate, current, revision, notices, recipients, bookings, waitlist };
}

export async function reviewClassSchedule(args: { access: ClassScheduleAccess; input: ClassScheduleInput; db?: ScheduleDatabase; now?: Date }): Promise<ClassScheduleReview> {
  return (await inspectSchedule({ ...args, db: args.db ?? prisma, now: args.now ?? new Date() })).review;
}

export async function commitClassSchedule(args: { access: ClassScheduleAccess; input: ClassScheduleInput; reviewToken: string; mutationId: string; db?: ScheduleDatabase; now?: Date }): Promise<{ status: "saved"; templateId: string } | { status: "error"; message: string; review?: ClassScheduleReview }> {
  const db = args.db ?? prisma;
  if (!/^[\da-f-]{36}$/i.test(args.mutationId)) return { status: "error", message: "Reload the class editor before saving." };
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, args.access.workspaceId);
    const actor = await tx.workspaceUser.findFirst({ where: { id: args.access.workspaceUserId, workspaceId: args.access.workspaceId, role: "OWNER", isActive: true } });
    if (args.access.role !== "OWNER" || !actor) return { status: "error" as const, message: "Only an active owner can change classes." };
    const prior = await tx.classScheduleChange.findFirst({ where: { id: args.mutationId, workspaceId: args.access.workspaceId, actorWorkspaceUserId: args.access.workspaceUserId } });
    if (prior) return { status: "saved" as const, templateId: prior.classTemplateId };
    const inspected = await inspectSchedule({ ...args, db: tx, now: args.now ?? new Date() });
    const { review, candidate, current, revision } = inspected;
    if (!review.ok || !candidate || !revision) return { status: "error" as const, message: review.errors[0] ?? "Review this change again.", review };
    if (review.token !== args.reviewToken) return { status: "error" as const, message: "The schedule or reservations changed after your review. Review the latest details before saving.", review };
    await resolveIneligibleClassBookingsTx({ db: tx, actor: { workspaceId: args.access.workspaceId, userId: actor.userId }, affected: review.ineligibleBookings ?? [], resolution: args.input.ineligibleResolution === "EXCEPTION" ? "EXCEPTION" : "CANCEL", reason: args.input.reason, now: args.now ?? new Date() });
    let templateId = current?.id;
    if (!templateId) {
      const created = await tx.classTemplate.create({ data: { workspaceId: args.access.workspaceId, ...snapshot(candidate), weekday: candidate.weekday, scheduleStartsOn: dateOnlyStringToUtcDate(args.input.date), scheduleVersion: 1 } });
      templateId = created.id;
    } else {
      const claimed = await tx.classTemplate.updateMany({ where: { id: templateId, workspaceId: args.access.workspaceId, scheduleVersion: review.version }, data: { scheduleVersion: { increment: 1 } } });
      if (!claimed.count) return { status: "error" as const, message: "The class changed. Review it again." };
    }
    if (args.input.scope === "new" || args.input.scope === "future") {
      await tx.classScheduleRevision.deleteMany({ where: { workspaceId: args.access.workspaceId, classTemplateId: templateId, effectiveFrom: { gte: dateOnlyStringToUtcDate(args.input.date) } } });
      await tx.classScheduleRevision.create({ data: { workspaceId: args.access.workspaceId, classTemplateId: templateId, ...snapshot(revision), effectiveFrom: revision.effectiveFrom, startDate: revision.startDate, endDate: revision.endDate, recurrence: revision.recurrence, weekdays: revision.weekdays } });
    } else {
      const instance = candidate.classInstances!.find((item) => toDateOnlyString(item.scheduledForDate) === args.input.date)!;
      const data = { ...snapshot(instance), status: instance.status, cancellationReason: instance.cancellationReason ?? null, isScheduleOverride: instance.isScheduleOverride ?? true, coachAssignmentMode: instance.coachAssignmentMode ?? "INHERIT" };
      await tx.classInstance.upsert({ where: { workspaceId_classTemplateId_scheduledForDate: { workspaceId: args.access.workspaceId, classTemplateId: templateId, scheduledForDate: instance.scheduledForDate } }, create: { workspaceId: args.access.workspaceId, classTemplateId: templateId, scheduledForDate: instance.scheduledForDate, ...data }, update: data });
      if (args.input.scope === "cancel") {
        for (const booking of inspected.bookings ?? []) {
          if (booking.bookingType === "DROP_IN") {
            const funding = booking.fundedByBookingId ? await tx.classBooking.findFirst({ where: { id: booking.fundedByBookingId, workspaceId: args.access.workspaceId, memberId: booking.memberId } }) : booking;
            if (funding?.dropInPaidAt) {
              const imported = await tx.importedBookingFunding.findFirst({where:{workspaceId:args.access.workspaceId,bookingId:funding.id},include:{evidence:{include:{payment:true}}}});
              const payment = imported?.evidence.payment ?? (funding.dropInPaymentIntentId ? await tx.payment.findFirst({ where: { workspaceId: args.access.workspaceId, stripePaymentIntentId: funding.dropInPaymentIntentId } }) : null);
              const sourceKey = `gym-cancel:${booking.id}:${booking.fundingRevision}`;
              await tx.financialReviewCase.upsert({ where: { workspaceId_sourceKey: { workspaceId: args.access.workspaceId, sourceKey } }, update: {}, create: { workspaceId: args.access.workspaceId, sourceKey, reason: imported ? "Gym cancelled source-paid class — refund through the original source and attach its receipt" : "Gym cancelled paid class — arrange refund or agreed credit", memberId: booking.memberId, bookingId: booking.id, paymentId: payment?.id, payerAccountId: payment?.payerAccountId, amountCents: funding.dropInPriceCents, currency: funding.dropInCurrency } });
            }
          }
          const punchSettlement = await settlePunchCardBooking({ workspaceId: args.access.workspaceId, bookingId: booking.id, outcome: "PROVIDER_CANCEL", db: tx, actorWorkspaceUserId: args.access.workspaceUserId });
          if (!punchSettlement.ok) throw new Error(punchSettlement.message);
          await settleMembershipAllowance({ workspaceId: args.access.workspaceId, bookingId: booking.id, outcome: "PROVIDER_CANCEL", db: tx, actorWorkspaceUserId: args.access.workspaceUserId });
          await tx.classBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", consumedPunchCount: 0, pendingPaymentExpiresAt: null } });
        }
        await tx.waitlistEntry.updateMany({ where: { workspaceId: args.access.workspaceId, classTemplateId: templateId, scheduledForDate: dateOnlyStringToUtcDate(args.input.date), status: "ACTIVE" }, data: { status: "CANCELLED" } });
      }
    }
    for (const notice of inspected.notices ?? []) await tx.classBooking.updateMany({ where: { workspaceId: args.access.workspaceId, classTemplateId: templateId, scheduledForDate: dateOnlyStringToUtcDate(notice.date), status: "BOOKED" }, data: { providerChangedAt: args.now ?? new Date() } });
    for (const notice of inspected.notices ?? []) for (const recipient of inspected.recipients!(notice.date)) {
      await tx.notificationJob.create({ data: { workspaceId: args.access.workspaceId, templateKind: "ANNOUNCEMENT", context: { kind: "MEMBER_ACCESS", memberId: recipient.memberId }, dedupeKey: `class-change:${args.mutationId}:${notice.date}:${recipient.memberId}:${recipient.email.toLowerCase()}`, recipientEmail: recipient.email, recipientName: recipient.name, subject: notice.after?.status === "CANCELLED" ? "Class cancelled" : "Your class has changed", body: `${notice.date}\nPreviously: ${publicDetails(notice.before)}\n${publicDetails(notice.after) ? `Now: ${publicDetails(notice.after)}` : `Cancelled: ${args.input.reason}`}\nOpen your member portal to review your booking.`, status: "PENDING", nextAttemptAt: args.now ?? new Date() } });
    }
    const beforeAudit = current ? { scheduleVersion: current.scheduleVersion, definition: snapshot(current), revisions: current.scheduleRevisions?.map((item) => ({ ...snapshot(item), effectiveFrom: item.effectiveFrom, startDate: item.startDate, endDate: item.endDate, recurrence: item.recurrence, weekdays: item.weekdays })), instances: current.classInstances?.map((item) => ({ ...snapshot(item), scheduledForDate: item.scheduledForDate, status: item.status, coachAssignmentMode: item.coachAssignmentMode, isScheduleOverride: item.isScheduleOverride })) } : {};
    await tx.classScheduleChange.create({ data: { id: args.mutationId, workspaceId: args.access.workspaceId, classTemplateId: templateId, scheduledForDate: dateOnlyStringToUtcDate(args.input.date), scope: args.input.scope, actorWorkspaceUserId: args.access.workspaceUserId, before: JSON.parse(JSON.stringify(beforeAudit)), after: JSON.parse(JSON.stringify({ input: args.input, review })) } });
    return { status: "saved" as const, templateId };
  });
}
