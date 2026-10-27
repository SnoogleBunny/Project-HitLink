import { createHash } from "node:crypto";

export const coachingBookingWeekdays = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;
export type CoachingBookingWeekday = (typeof coachingBookingWeekdays)[number];
export type CoachingServiceInterval = {
  startMinute: number;
  endMinute: number;
};
export type CoachingBookingPolicy = {
  schemaVersion: 1;
  appointments: {
    weeklyHours: Array<{
      weekday: CoachingBookingWeekday;
      intervals: CoachingServiceInterval[];
    }>;
    maxAdvanceMinutes: number;
    minimumLeadMinutes: number;
    minimumBufferMinutes: number;
    resolutionResponseHours: number;
  };
};
export type CoachingBookingPolicyEvaluation = {
  allowed: boolean;
  code:
    | "AVAILABLE"
    | "NOT_OPEN"
    | "CLOSED"
    | "OUTSIDE_SERVICE_HOURS"
    | "INVALID_TIME";
  opensAt: Date | null;
  closesAt: Date | null;
  effectiveBufferMinutes: number;
};
export class CoachingBookingPolicyError extends Error {}

const PG_INT_MAX = 2_147_483_647;
const DATE_LIMIT_MS = 8_640_000_000_000_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
function fail(message: string): never {
  throw new CoachingBookingPolicyError(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return fail(`${label} must be an explicit policy object.`);
  }
  return value as Record<string, unknown>;
}
function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const actual = Reflect.ownKeys(value);
  if (
    actual.length !== expected.length ||
    actual.some((key) => typeof key !== "string" || !expected.includes(key))
  ) {
    fail(`${label} must contain exactly ${expected.join(", ")}.`);
  }
}
function integer(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return fail(
      `${label} must be a whole number between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}
function responseHours(value: unknown, label: string): number {
  const hours = integer(value, label, 1);
  // This is a duration, not a Date. A command creating a response deadline must
  // also check addition to that command's actual receipt instant.
  if (!Number.isSafeInteger(hours * HOUR_MS))
    fail(`${label} exceed representable calendar arithmetic.`);
  return hours;
}

/** Strict independent appointment policy; never infer settings from class rules. */
export function parseCoachingBookingPolicy(
  value: unknown,
): CoachingBookingPolicy {
  const root = record(value, "Coaching booking policy");
  exactKeys(root, ["schemaVersion", "appointments"], "Coaching booking policy");
  if (root.schemaVersion !== 1)
    fail("Use coaching booking policy schemaVersion 1.");
  const source = record(root.appointments, "Appointment rules");
  exactKeys(
    source,
    [
      "weeklyHours",
      "maxAdvanceMinutes",
      "minimumLeadMinutes",
      "minimumBufferMinutes",
      "resolutionResponseHours",
    ],
    "Appointment rules",
  );
  if (!Array.isArray(source.weeklyHours) || source.weeklyHours.length !== 7)
    fail(
      "Explicitly configure all seven distinct weekdays; an empty interval list means closed.",
    );
  const byDay = new Map<CoachingBookingWeekday, CoachingServiceInterval[]>();
  for (const item of source.weeklyHours) {
    const day = record(item, "Service day");
    exactKeys(day, ["weekday", "intervals"], "Service day");
    if (
      !(coachingBookingWeekdays as readonly unknown[]).includes(day.weekday) ||
      byDay.has(day.weekday as CoachingBookingWeekday)
    )
      fail("Configure each weekday exactly once.");
    if (!Array.isArray(day.intervals))
      fail("Each service day needs an explicit interval list.");
    const intervals = Array.from(day.intervals, (entry) => {
      const interval = record(entry, "Service interval");
      exactKeys(interval, ["startMinute", "endMinute"], "Service interval");
      const startMinute = integer(
        interval.startMinute,
        "Service interval start",
        0,
        1440,
      );
      const endMinute = integer(
        interval.endMinute,
        "Service interval end",
        0,
        1440,
      );
      if (endMinute <= startMinute)
        fail(
          "Service intervals must have positive length; split crossing-midnight hours across their separate weekdays.",
        );
      return { startMinute, endMinute };
    }).sort(
      (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
    );
    for (let index = 1; index < intervals.length; index++) {
      if (intervals[index]!.startMinute < intervals[index - 1]!.endMinute)
        fail("Service intervals on the same weekday must not overlap.");
    }
    byDay.set(day.weekday as CoachingBookingWeekday, intervals);
  }
  const maxAdvanceMinutes = integer(
    source.maxAdvanceMinutes,
    "Maximum advance minutes",
    1,
  );
  const minimumLeadMinutes = integer(
    source.minimumLeadMinutes,
    "Minimum lead minutes",
  );
  if (maxAdvanceMinutes <= minimumLeadMinutes)
    fail("Maximum advance minutes must exceed minimum lead minutes.");
  const minimumBufferMinutes = integer(
    source.minimumBufferMinutes,
    "Minimum buffer minutes",
    0,
    PG_INT_MAX,
  );
  const resolutionResponseHours = responseHours(
    source.resolutionResponseHours,
    "Booking-help response hours",
  );
  return {
    schemaVersion: 1,
    appointments: {
      weeklyHours: coachingBookingWeekdays.map((weekday) => ({
        weekday,
        intervals: byDay.get(weekday)!,
      })),
      maxAdvanceMinutes,
      minimumLeadMinutes,
      minimumBufferMinutes,
      resolutionResponseHours,
    },
  };
}

/** Normalize day/interval order and object keys before producing a stable hash. */
export function hashCoachingBookingPolicy(
  policy: CoachingBookingPolicy,
): string {
  return createHash("sha256")
    .update(JSON.stringify(parseCoachingBookingPolicy(policy)))
    .digest("hex");
}

function validInstant(value: unknown): value is Date {
  return (
    value instanceof Date &&
    Number.isSafeInteger(value.getTime()) &&
    Math.abs(value.getTime()) <= DATE_LIMIT_MS
  );
}
function calendarAdd(instant: number, delta: number): number | null {
  const result = instant + delta;
  return Number.isSafeInteger(delta) &&
    Number.isSafeInteger(result) &&
    Math.abs(result) <= DATE_LIMIT_MS
    ? result
    : null;
}

/**
 * Exact half-open UTC resource interval [from, until). Buffers are elapsed
 * minutes, so crossing a DST gap/fold never changes their real duration.
 *
 * Use these endpoints directly for unbuffered leave/classes/coach-only events.
 * An existing appointment's OWN recorded buffers must also be expanded before
 * overlap comparison: raw service endpoints outside this candidate window can
 * still conflict. Do not append a guessed 240-minute query margin.
 *
 * This helper knows no resource identities and creates no room for an Event or
 * private lesson. Service-hour containment remains a separate policy check.
 */
export function coachingAppointmentResourceWindow(args: {
  startsAt: Date;
  endsAt: Date;
  beforeBufferMinutes: number;
  afterBufferMinutes: number;
}): { from: Date; until: Date } {
  if (!validInstant(args.startsAt) || !validInstant(args.endsAt))
    fail(
      "Choose representable appointment instants before checking resource buffers.",
    );
  const start = args.startsAt.getTime(),
    end = args.endsAt.getTime();
  if (end <= start || !Number.isSafeInteger(end - start))
    fail("Choose a positive, representable appointment interval.");
  const before = integer(
    args.beforeBufferMinutes,
    "Before buffer minutes",
    0,
    PG_INT_MAX,
  );
  const after = integer(
    args.afterBufferMinutes,
    "After buffer minutes",
    0,
    PG_INT_MAX,
  );
  const from = calendarAdd(start, -before * MINUTE_MS),
    until = calendarAdd(end, after * MINUTE_MS);
  if (from === null || until === null)
    fail("Appointment buffers exceed representable calendar bounds.");
  return { from: new Date(from), until: new Date(until) };
}

/** Preserve an explicit earlier booking-help promise; coach reply hours differ. */
export function resolveCoachingResolutionResponseHours(args: {
  currentResolutionResponseHours: number;
  acceptedResolutionResponseHours?: number;
}): number {
  const current = responseHours(
    args.currentResolutionResponseHours,
    "Current booking-help response hours",
  );
  if (args.acceptedResolutionResponseHours === undefined) return current;
  const accepted = responseHours(
    args.acceptedResolutionResponseHours,
    "Accepted booking-help response hours",
  );
  return Math.min(current, accepted);
}
function fullyOpen(intervals: CoachingServiceInterval[]) {
  if (!intervals.length || intervals[0]!.startMinute !== 0) return false;
  let end = 0;
  for (const interval of intervals) {
    if (interval.startMinute !== end) return false;
    end = interval.endMinute;
  }
  return end === 1440;
}

function serviceFitsHours(
  policy: CoachingBookingPolicy,
  start: number,
  end: number,
  formatter: Intl.DateTimeFormat,
): boolean {
  const hours = new Map(
    policy.appointments.weeklyHours.map((day) => [day.weekday, day.intervals]),
  );
  if (policy.appointments.weeklyHours.every((day) => fullyOpen(day.intervals)))
    return true;
  // ICU/IANA transitions and offset seconds fall on whole UTC seconds. Between
  // consecutive whole seconds, both the local weekday and minute classification
  // are constant. Inspect the first fractional second and every UTC second
  // boundary thereafter, so skipped/repeated local minutes are handled as real
  // instants rather than invented wall times. The service end is exclusive.
  // Buffers are intentionally absent: they protect recorded resource intervals,
  // not published service hours. Fully open weeks avoid an unbounded long scan.
  let cursor = start;
  while (cursor < end) {
    const parts = formatter.formatToParts(new Date(cursor));
    const day = parts
      .find((part) => part.type === "weekday")
      ?.value.toUpperCase() as CoachingBookingWeekday | undefined;
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    if (
      !day ||
      !Number.isInteger(hour) ||
      hour < 0 ||
      hour > 23 ||
      !Number.isInteger(minute) ||
      minute < 0 ||
      minute > 59
    )
      fail("The timezone calendar could not represent this service instant.");
    const localMinute = hour * 60 + minute;
    if (
      !hours
        .get(day)
        ?.some(
          (interval) =>
            interval.startMinute <= localMinute &&
            localMinute < interval.endMinute,
        )
    )
      return false;
    cursor = Math.floor(cursor / 1000) * 1000 + 1000;
  }
  return true;
}

/**
 * Program dates, accepted-enrollment timezone and resource conflicts belong to
 * the caller. `timezone` is the business timezone effective at the slot instant.
 * No accepted appointment or booking promise is changed by this pure check.
 */
export function evaluateCoachingBookingPolicy(args: {
  policy: CoachingBookingPolicy;
  startsAt: Date;
  endsAt: Date;
  now: Date;
  timezone: string;
  slotBufferMinutes?: number;
}): CoachingBookingPolicyEvaluation {
  let effectiveBufferMinutes = 0;
  const invalid = (): CoachingBookingPolicyEvaluation => ({
    allowed: false,
    code: "INVALID_TIME",
    opensAt: null,
    closesAt: null,
    effectiveBufferMinutes,
  });
  try {
    const policy = parseCoachingBookingPolicy(args.policy);
    const explicitBuffer =
      args.slotBufferMinutes === undefined
        ? 0
        : integer(args.slotBufferMinutes, "Slot buffer minutes", 0, PG_INT_MAX);
    effectiveBufferMinutes = Math.max(
      policy.appointments.minimumBufferMinutes,
      explicitBuffer,
    );
    if (
      !validInstant(args.startsAt) ||
      !validInstant(args.endsAt) ||
      !validInstant(args.now) ||
      args.endsAt.getTime() <= args.startsAt.getTime()
    )
      return invalid();
    if (typeof args.timezone !== "string" || !args.timezone.trim())
      return invalid();
    const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone: args.timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const start = args.startsAt.getTime(),
      end = args.endsAt.getTime();
    if (!Number.isSafeInteger(end - start)) return invalid();
    const opens = calendarAdd(
      start,
      -policy.appointments.maxAdvanceMinutes * MINUTE_MS,
    );
    const closes = calendarAdd(
      start,
      -policy.appointments.minimumLeadMinutes * MINUTE_MS,
    );
    if (opens === null || closes === null || opens >= closes) return invalid();
    coachingAppointmentResourceWindow({
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      beforeBufferMinutes: effectiveBufferMinutes,
      afterBufferMinutes: effectiveBufferMinutes,
    });
    const result = (
      code: CoachingBookingPolicyEvaluation["code"],
    ): CoachingBookingPolicyEvaluation => ({
      allowed: code === "AVAILABLE",
      code,
      opensAt: new Date(opens),
      closesAt: new Date(closes),
      effectiveBufferMinutes,
    });
    if (!serviceFitsHours(policy, start, end, formatter))
      return result("OUTSIDE_SERVICE_HOURS");
    if (args.now.getTime() < opens) return result("NOT_OPEN");
    if (args.now.getTime() >= closes) return result("CLOSED");
    return result("AVAILABLE");
  } catch {
    return invalid();
  }
}
