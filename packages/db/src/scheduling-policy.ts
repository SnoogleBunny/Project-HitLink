import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  getWeekdayForDateString,
  getZonedDateTimeAsUtc,
  parseDateOnlyString,
} from "./occurrences.js";
import { isUnambiguousClassTime } from "./class-occurrences.js";

export const schedulingWeekdays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
export interface ClassSchedulingPolicy {
  schemaVersion: 1;
  classes: {
    weeklyHours: Array<{
      weekday: (typeof schedulingWeekdays)[number];
      intervals: Array<{ startMinute: number; endMinute: number }>;
    }>;
    maxAdvanceMinutes: number;
    minimumLeadMinutes: number;
  };
}
export class SchedulingPolicyError extends Error {}
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => key in value);
const integer = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
/** Strict, bounded, canonical policy parsing. Missing rules never mean unrestricted access. */
export function parseClassSchedulingPolicy(
  value: unknown,
): ClassSchedulingPolicy {
  const root = object(value),
    classes = object(root?.classes);
  const invalid = () => {
    throw new SchedulingPolicyError(
      "Configure all seven days, valid opening intervals, a booking horizon and minimum notice.",
    );
  };
  if (
    !root ||
    !exact(root, ["schemaVersion", "classes"]) ||
    root.schemaVersion !== 1 ||
    !classes ||
    !exact(classes, [
      "weeklyHours",
      "maxAdvanceMinutes",
      "minimumLeadMinutes",
    ]) ||
    !integer(classes.maxAdvanceMinutes, 1, 527040) ||
    !integer(classes.minimumLeadMinutes, 0, 527039) ||
    classes.minimumLeadMinutes >= classes.maxAdvanceMinutes ||
    !Array.isArray(classes.weeklyHours) ||
    classes.weeklyHours.length !== 7
  )
    return invalid();
  const weeklyHours = schedulingWeekdays.map((weekday) => {
    const matches = (classes.weeklyHours as unknown[])
      .map(object)
      .filter((day) => day?.weekday === weekday);
    const day = matches[0];
    if (
      matches.length !== 1 ||
      !day ||
      !exact(day, ["weekday", "intervals"]) ||
      !Array.isArray(day.intervals) ||
      day.intervals.length > 4
    )
      return invalid();
    const intervals = day.intervals
      .map((value) => {
        const interval = object(value);
        if (
          !interval ||
          !exact(interval, ["startMinute", "endMinute"]) ||
          !integer(interval.startMinute, 0, 1439) ||
          !integer(interval.endMinute, 1, 1440) ||
          interval.startMinute >= interval.endMinute
        )
          return invalid();
        return {
          startMinute: interval.startMinute,
          endMinute: interval.endMinute,
        };
      })
      .sort((a, b) => a.startMinute - b.startMinute);
    if (
      intervals.some(
        (interval, i) =>
          i > 0 && interval.startMinute < intervals[i - 1]!.endMinute,
      )
    )
      return invalid();
    return { weekday, intervals };
  });
  return {
    schemaVersion: 1,
    classes: {
      weeklyHours,
      maxAdvanceMinutes: classes.maxAdvanceMinutes,
      minimumLeadMinutes: classes.minimumLeadMinutes,
    },
  };
}
export const schedulingPolicyHash = (policy: ClassSchedulingPolicy) =>
  createHash("sha256")
    .update(JSON.stringify(parseClassSchedulingPolicy(policy)))
    .digest("hex");
export interface SchedulingPolicyRevision {
  id: string;
  workspaceId: string;
  version: number;
  policy: unknown;
  policyHash: string;
  activatedAt: Date;
}
export interface SchedulingPolicyReader {
  workspaceSchedulingPolicyRevision?: {
    findFirst(
      args: Record<string, unknown>,
    ): Promise<SchedulingPolicyRevision | null>;
  };
}
export async function readClassSchedulingPolicy(
  db:
    | SchedulingPolicyReader
    | Pick<Prisma.TransactionClient, "workspaceSchedulingPolicyRevision">,
  workspaceId: string,
  now = new Date(),
): Promise<SchedulingPolicyRevision | null> {
  if (!db.workspaceSchedulingPolicyRevision) return null;
  const revision = await (
    db as SchedulingPolicyReader
  ).workspaceSchedulingPolicyRevision!.findFirst({
    where: { workspaceId, activatedAt: { lte: now } },
    orderBy: { version: "desc" },
  });
  if (!revision || revision.workspaceId !== workspaceId) return null;
  try {
    if (
      schedulingPolicyHash(parseClassSchedulingPolicy(revision.policy)) !==
      revision.policyHash
    )
      return null;
  } catch {
    return null;
  }
  return revision;
}
export interface SchedulingPolicySnapshot {
  schemaVersion: 1;
  mode: "LIVE" | "SOURCE_RESTORATION";
  policyRevisionId: string | null;
  policyVersion: number | null;
  policyHash: string | null;
  scheduledForDate: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  opensAt: string | null;
  closesAt: string | null;
  evaluatedAt: string;
  autoPromotionClosesAt?: string;
  sourceRowHash?: string;
  leadOverrideReceiptId?: string;
}
export type SchedulingPolicyEvaluation =
  | { allowed: true; snapshot: SchedulingPolicySnapshot }
  | {
      allowed: false;
      code:
        | "UNCONFIGURED"
        | "INVALID_TIME"
        | "OUTSIDE_HOURS"
        | "NOT_OPEN"
        | "CLOSED";
      message: string;
    };
export function evaluateClassSchedulingPolicy(args: {
  revision: SchedulingPolicyRevision | null;
  date: string;
  timezone: string;
  startTimeMinutes: number;
  endTimeMinutes: number;
  bookingCutoffMinutes: number;
  now: Date;
  /** Pure evaluation only. A booking writer must independently authorize a current owner. */
  allowLeadExceptionBeforeStart?: true;
}): SchedulingPolicyEvaluation {
  if (!args.revision)
    return {
      allowed: false,
      code: "UNCONFIGURED",
      message:
        "The owner must confirm class booking rules before new bookings or waitlist requests can be accepted.",
    };
  let policy: ClassSchedulingPolicy;
  try {
    policy = parseClassSchedulingPolicy(args.revision.policy);
    if (schedulingPolicyHash(policy) !== args.revision.policyHash)
      throw new Error();
  } catch {
    return {
      allowed: false,
      code: "UNCONFIGURED",
      message: "Class booking rules need owner review.",
    };
  }
  if (
    !Number.isFinite(args.now.getTime()) ||
    !integer(args.bookingCutoffMinutes, 0, 527040) ||
    parseDateOnlyString(args.date).status === "error" ||
    !integer(args.startTimeMinutes, 0, 1439) ||
    !integer(args.endTimeMinutes, 1, 1440) ||
    args.endTimeMinutes <= args.startTimeMinutes ||
    !isUnambiguousClassTime(args.date, args.startTimeMinutes, args.timezone) ||
    (args.endTimeMinutes < 1440 &&
      !isUnambiguousClassTime(args.date, args.endTimeMinutes, args.timezone))
  )
    return {
      allowed: false,
      code: "INVALID_TIME",
      message: "Choose a class with a valid, unambiguous local time.",
    };
  const day = policy.classes.weeklyHours.find(
    (day) => day.weekday === getWeekdayForDateString(args.date),
  );
  if (
    !day?.intervals.some(
      (interval) =>
        args.startTimeMinutes >= interval.startMinute &&
        args.endTimeMinutes <= interval.endMinute,
    )
  )
    return {
      allowed: false,
      code: "OUTSIDE_HOURS",
      message: "This class is outside the configured class opening hours.",
    };
  const startsAt = getZonedDateTimeAsUtc({
    dateString: args.date,
    minutes: args.startTimeMinutes,
    timezone: args.timezone,
  });
  const endsAt = getZonedDateTimeAsUtc({
    dateString: args.date,
    minutes: args.endTimeMinutes,
    timezone: args.timezone,
  });
  const opensAt = new Date(
    startsAt.getTime() - policy.classes.maxAdvanceMinutes * 60000,
  );
  const closesAt = new Date(
    startsAt.getTime() -
      Math.max(args.bookingCutoffMinutes, policy.classes.minimumLeadMinutes) *
        60000,
  );
  if (args.now < opensAt)
    return {
      allowed: false,
      code: "NOT_OPEN",
      message: `Bookings open at ${opensAt.toISOString()}.`,
    };
  if (
    args.now >= closesAt &&
    !(args.allowLeadExceptionBeforeStart && args.now < startsAt)
  )
    return {
      allowed: false,
      code: "CLOSED",
      message: "The class booking deadline has passed. Choose another class.",
    };
  return {
    allowed: true,
    snapshot: {
      schemaVersion: 1,
      mode: "LIVE",
      policyRevisionId: args.revision.id,
      policyVersion: args.revision.version,
      policyHash: args.revision.policyHash,
      scheduledForDate: args.date,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone: args.timezone,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      evaluatedAt: args.now.toISOString(),
    },
  };
}
export function readSchedulingPolicySnapshot(
  value: unknown,
): SchedulingPolicySnapshot | null {
  const snapshot = object(value);
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    !["LIVE", "SOURCE_RESTORATION"].includes(String(snapshot.mode)) ||
    typeof snapshot.scheduledForDate !== "string" ||
    typeof snapshot.timezone !== "string" ||
    typeof snapshot.startsAt !== "string" ||
    typeof snapshot.endsAt !== "string" ||
    typeof snapshot.evaluatedAt !== "string"
  )
    return null;
  if (
    ![
      snapshot.startsAt,
      snapshot.endsAt,
      snapshot.evaluatedAt,
      snapshot.opensAt,
      snapshot.closesAt,
      snapshot.autoPromotionClosesAt,
    ]
      .filter((v) => v != null)
      .every((v) => typeof v === "string" && Number.isFinite(Date.parse(v)))
  )
    return null;
  if (
    parseDateOnlyString(snapshot.scheduledForDate as string).status ===
      "error" ||
    Date.parse(snapshot.endsAt as string) <=
      Date.parse(snapshot.startsAt as string)
  )
    return null;
  if (
    snapshot.mode === "LIVE" &&
    (typeof snapshot.policyRevisionId !== "string" ||
      !snapshot.policyRevisionId ||
      !integer(snapshot.policyVersion, 1, Number.MAX_SAFE_INTEGER) ||
      typeof snapshot.policyHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(snapshot.policyHash) ||
      typeof snapshot.opensAt !== "string" ||
      typeof snapshot.closesAt !== "string" ||
      Date.parse(snapshot.opensAt) >= Date.parse(snapshot.closesAt))
  )
    return null;
  if (
    snapshot.autoPromotionClosesAt &&
    (snapshot.mode !== "LIVE" ||
      typeof snapshot.closesAt !== "string" ||
      Date.parse(snapshot.autoPromotionClosesAt as string) >
        Date.parse(snapshot.closesAt))
  )
    return null;
  return snapshot as unknown as SchedulingPolicySnapshot;
}
export async function recordClassSchedulingPolicyApplied(args: {
  db: Pick<Prisma.TransactionClient, "classBooking" | "workspaceDataEvent">;
  workspaceId: string;
  bookingId: string;
  fundingRevision: number;
  snapshot: SchedulingPolicySnapshot;
  actorUserId?: string;
}) {
  const metadata = {
    bookingId: args.bookingId,
    fundingRevision: args.fundingRevision,
    ...args.snapshot,
  };
  await args.db.classBooking.update({
    where: { id: args.bookingId },
    data: {
      schedulingPolicySnapshot:
        args.snapshot as unknown as Prisma.InputJsonValue,
    },
  });
  await args.db.workspaceDataEvent.create({
    data: {
      id: `scheduling:${args.bookingId}:${args.fundingRevision}`,
      workspaceId: args.workspaceId,
      actorUserId: args.actorUserId,
      kind: "SCHEDULING_POLICY_APPLIED",
      metadata,
    },
  });
}
