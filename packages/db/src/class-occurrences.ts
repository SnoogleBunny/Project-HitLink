import type { Prisma, Weekday } from "@prisma/client";
import { prisma } from "./client.js";
import { addDays, getWeekdayForDateString, getZonedDateTimeAsUtc, parseDateOnlyString, toDateOnlyString } from "./occurrences.js";

export type CoachAssignmentMode = "INHERIT" | "ASSIGNED" | "UNASSIGNED";
export type ClassRecurrence = "ONCE" | "DAILY" | "WEEKLY";
export interface ClassCoach {
  id: string;
  isActive?: boolean;
  role?: string;
  user: { fullName: string | null; email: string };
}
export interface ClassScheduleFields {
  prerequisites?: unknown;
  title: string | null;
  programId: string;
  roomId: string;
  coachWorkspaceUserId: string | null;
  startTimeMinutes: number;
  endTimeMinutes: number;
  capacityOverride: number | null;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  program: { id: string; name: string; archivedAt?: Date | null; rankPolicy?: unknown };
  room: { id: string; name: string; capacity: number | null; isActive?: boolean; archivedAt?: Date | null };
  coachWorkspaceUser: ClassCoach | null;
}
export interface ClassScheduleRevisionRecord extends ClassScheduleFields {
  id: string;
  effectiveFrom: Date;
  startDate: Date | null;
  endDate: Date | null;
  recurrence: ClassRecurrence;
  weekdays: Weekday[];
  updatedAt?: Date;
}
export interface ClassInstanceRecord extends ClassScheduleFields {
  id: string;
  scheduledForDate: Date;
  status: "ACTIVE" | "CANCELLED";
  isScheduleOverride?: boolean;
  coachAssignmentMode?: CoachAssignmentMode;
  cancellationReason?: string | null;
  updatedAt?: Date;
}
export interface ClassOccurrenceTemplate extends ClassScheduleFields {
  id: string;
  workspaceId: string;
  weekday: Weekday;
  archivedAt?: Date | null;
  scheduleStartsOn?: Date | null;
  scheduleVersion?: number;
  updatedAt?: Date;
  scheduleRevisions?: ClassScheduleRevisionRecord[];
  classInstances?: ClassInstanceRecord[];
}
export interface ResolvedClassOccurrence extends ClassScheduleFields {
  id: string;
  classTemplateId: string;
  classInstanceId: string | null;
  workspaceId: string;
  scheduledForDate: string;
  weekday: Weekday;
  status: "ACTIVE" | "CANCELLED";
  isScheduleOverride: boolean;
  coachAssignmentMode: CoachAssignmentMode;
  defaultCoachWorkspaceUserId: string | null;
  defaultCoach: ClassCoach | null;
  scheduleVersion: number;
  effectiveCapacity: number | null;
  displayTitle: string;
  coachDisplayName: string;
}

const resourceInclude = { program: true, room: true, coachWorkspaceUser: { include: { user: { select: { fullName: true, email: true } } } } } as const;
export const classOccurrenceInclude = {
  ...resourceInclude,
  scheduleRevisions: { include: resourceInclude, orderBy: { effectiveFrom: "asc" } },
  classInstances: { include: resourceInclude, orderBy: { scheduledForDate: "asc" } },
} as const;

export function classScheduleDefinitionForDate(template: ClassOccurrenceTemplate, date: string): ClassScheduleRevisionRecord | ClassOccurrenceTemplate {
  return [...(template.scheduleRevisions ?? [])]
    .filter((item) => toDateOnlyString(item.effectiveFrom) <= date)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? template;
}

export function resolveClassOccurrence(args: {
  template: ClassOccurrenceTemplate;
  scheduledForDate: string;
}): ResolvedClassOccurrence | null {
  const { template, scheduledForDate: date } = args;
  if (parseDateOnlyString(date).status === "error") return null;
  if (template.scheduleStartsOn && date < toDateOnlyString(template.scheduleStartsOn)) return null;
  const definition = classScheduleDefinitionForDate(template, date);
  const revision = "recurrence" in definition ? definition : null;
  const instance = template.classInstances?.find((item) => toDateOnlyString(item.scheduledForDate) === date);
  const weekday = getWeekdayForDateString(date);
  const inRange = !revision || ((!revision.startDate || date >= toDateOnlyString(revision.startDate)) && (!revision.endDate || date <= toDateOnlyString(revision.endDate)));
  const matches = inRange && (revision
    ? revision.recurrence === "DAILY" || (revision.recurrence === "ONCE" ? date === toDateOnlyString(revision.startDate ?? revision.effectiveFrom) : revision.weekdays.includes(weekday))
    : template.weekday === weekday);
  const isScheduleOverride = !!instance && instance.isScheduleOverride !== false;
  if (!matches && !isScheduleOverride) return null;
  const schedule = isScheduleOverride ? instance! : definition;
  const mode = instance?.coachAssignmentMode ?? (instance ? "ASSIGNED" : "INHERIT");
  const coach = mode === "UNASSIGNED" ? null : mode === "ASSIGNED" ? instance?.coachWorkspaceUser ?? null : definition.coachWorkspaceUser ?? null;
  const coachId = mode === "UNASSIGNED" ? null : mode === "ASSIGNED" ? instance?.coachWorkspaceUserId ?? null : definition.coachWorkspaceUserId ?? null;
  return {
    ...schedule,
    id: template.id,
    classTemplateId: template.id,
    classInstanceId: instance?.id ?? null,
    workspaceId: template.workspaceId,
    scheduledForDate: date,
    weekday,
    status: instance?.status ?? "ACTIVE",
    isScheduleOverride,
    coachAssignmentMode: mode,
    coachWorkspaceUserId: coachId,
    coachWorkspaceUser: coach,
    defaultCoachWorkspaceUserId: definition.coachWorkspaceUserId ?? null,
    defaultCoach: definition.coachWorkspaceUser ?? null,
    scheduleVersion: template.scheduleVersion ?? 0,
    effectiveCapacity: schedule.capacityOverride ?? schedule.room.capacity,
    displayTitle: schedule.title || schedule.program.name,
    coachDisplayName: coach?.user.fullName?.trim() || coach?.user.email || "Coach to be confirmed",
  };
}

export interface ClassOccurrenceDatabase {
  classTemplate: {
    findFirst(args: Record<string, unknown>): Promise<ClassOccurrenceTemplate | null>;
    findMany(args: Record<string, unknown>): Promise<ClassOccurrenceTemplate[]>;
  };
}
export async function getClassOccurrence(args: {
  workspaceId: string;
  classTemplateId: string;
  scheduledForDate: string;
  includeArchived?: boolean;
  db?: Pick<ClassOccurrenceDatabase, "classTemplate"> | typeof prisma | Prisma.TransactionClient;
}): Promise<ResolvedClassOccurrence | null> {
  const db = (args.db ?? prisma) as unknown as ClassOccurrenceDatabase;
  const template = await db.classTemplate.findFirst({
    where: { id: args.classTemplateId, workspaceId: args.workspaceId, ...(args.includeArchived ? {} : { archivedAt: null }) },
    include: classOccurrenceInclude,
  });
  if (!template || template.workspaceId !== args.workspaceId) return null;
  return resolveClassOccurrence({ template, scheduledForDate: args.scheduledForDate });
}

export async function listClassOccurrences(args: {
  workspaceId: string;
  fromDate: string;
  toDate: string;
  includeCancelled?: boolean;
  includeArchived?: boolean;
  db?: ClassOccurrenceDatabase | typeof prisma | Prisma.TransactionClient;
}): Promise<ResolvedClassOccurrence[]> {
  if (parseDateOnlyString(args.fromDate).status === "error" || parseDateOnlyString(args.toDate).status === "error" || args.toDate < args.fromDate) return [];
  // Listing bounds are explicit, never a silent truncation of a schedule review.
  if (args.toDate > addDays(args.fromDate, 366)) throw new Error("Choose a schedule view of one year or less.");
  const db = (args.db ?? prisma) as unknown as ClassOccurrenceDatabase;
  const templates = await db.classTemplate.findMany({ where: { workspaceId: args.workspaceId, ...(args.includeArchived ? {} : { archivedAt: null }) }, include: classOccurrenceInclude });
  const result: ResolvedClassOccurrence[] = [];
  for (let date = args.fromDate; date <= args.toDate; date = addDays(date, 1)) {
    for (const template of templates) {
      if (template.workspaceId !== args.workspaceId) continue;
      const occurrence = resolveClassOccurrence({ template, scheduledForDate: date });
      if (occurrence && (args.includeCancelled || occurrence.status === "ACTIVE")) result.push(occurrence);
    }
  }
  return result.sort((a, b) => a.scheduledForDate.localeCompare(b.scheduledForDate) || a.startTimeMinutes - b.startTimeMinutes || a.displayTitle.localeCompare(b.displayTitle));
}

export interface ClassScheduleLockDatabase {
  $queryRawUnsafe?: (query: string, ...values: unknown[]) => Promise<unknown>;
}

export function isUnambiguousClassTime(date: string, minutes: number, timezone: string): boolean {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440 || parseDateOnlyString(date).status === "error") return false;
  const instant = getZonedDateTimeAsUtc({ dateString: date, minutes, timezone });
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const local = (value: Date) => Object.fromEntries(formatter.formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const parts = local(instant);
  const expectedDate = `${parts.year}-${parts.month}-${parts.day}`;
  const expectedMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (expectedDate !== date || expectedMinutes !== minutes) return false;
  const key = formatter.format(instant);
  return ![-120, -90, -60, -30, 30, 60, 90, 120].some((offset) => formatter.format(new Date(instant.getTime() + offset * 60000)) === key);
}
/** Call inside the same transaction as every schedule, seat or attendance write. */
export async function lockClassSchedule(db: ClassScheduleLockDatabase, workspaceId: string): Promise<void> {
  if (db.$queryRawUnsafe) await db.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))::text", `class-schedule:${workspaceId}`);
}

/**
 * Between recurrence boundaries the schedule repeats every seven days. Checking
 * one full week per interval proves recurring resource conflicts for the whole
 * interval, including the unbounded final interval. Exceptions split intervals;
 * booked dates are also checked explicitly for capacity/history protections.
 */
export function classScheduleReviewDates(args: { templates: ClassOccurrenceTemplate[]; fromDate: string; recordedDates?: string[] }): string[] {
  const boundaries = new Set<string>([args.fromDate]);
  for (const template of args.templates) {
    if (template.scheduleStartsOn) boundaries.add(toDateOnlyString(template.scheduleStartsOn));
    for (const revision of template.scheduleRevisions ?? []) {
      boundaries.add(toDateOnlyString(revision.effectiveFrom));
      if (revision.startDate) boundaries.add(toDateOnlyString(revision.startDate));
      if (revision.endDate) boundaries.add(addDays(toDateOnlyString(revision.endDate), 1));
      if (revision.recurrence === "ONCE") boundaries.add(addDays(toDateOnlyString(revision.startDate ?? revision.effectiveFrom), 1));
    }
    for (const instance of template.classInstances ?? []) {
      const date = toDateOnlyString(instance.scheduledForDate);
      boundaries.add(date); boundaries.add(addDays(date, 1));
    }
  }
  const sorted = [...boundaries].filter((date) => date >= args.fromDate).sort();
  const dates = new Set((args.recordedDates ?? []).filter((date) => date >= args.fromDate));
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!;
    const next = sorted[i + 1];
    for (let day = 0; day < 7; day++) {
      const date = addDays(start, day);
      if (next && date >= next) break;
      dates.add(date);
    }
  }
  for (let day = 0; day < 42; day++) dates.add(addDays(args.fromDate, day));
  return [...dates].sort();
}
