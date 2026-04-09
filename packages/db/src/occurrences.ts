import type { Weekday } from "@prisma/client";

export const WEEKDAY_ORDER: Weekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

const weekdayByUtcDay: Record<number, Weekday> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

export interface TemplateForOccurrenceDates {
  id: string;
  weekday: Weekday;
  startTimeMinutes: number;
}

export interface OccurrenceDateOption {
  classTemplateId: string;
  scheduledForDate: string;
  startsAt: Date;
  label: string;
}

export interface TemplateWithOccurrenceDates<TTemplate> {
  template: TTemplate;
  dateOptions: OccurrenceDateOption[];
}

export type OccurrenceDateDirection = "future" | "past" | "any";

export type OccurrenceDateValidationResult =
  | {
      status: "ok";
      date: Date;
      dateString: string;
    }
  | {
      status: "error";
      reason: "invalid-date" | "wrong-weekday" | "past-date" | "future-date";
    };

export function toDateOnlyString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function dateOnlyStringToUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function parseDateOnlyString(
  value: string | undefined,
): { status: "ok"; date: Date; dateString: string } | { status: "error" } {
  const dateString = value?.trim() ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return {
      status: "error",
    };
  }

  const parsed = dateOnlyStringToUtcDate(dateString);

  if (Number.isNaN(parsed.getTime()) || toDateOnlyString(parsed) !== dateString) {
    return {
      status: "error",
    };
  }

  return {
    status: "ok",
    date: parsed,
    dateString,
  };
}

export function addDays(dateString: string, days: number): string {
  const date = dateOnlyStringToUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);

  return toDateOnlyString(date);
}

export function getWeekdayForDateString(dateString: string): Weekday {
  const date = dateOnlyStringToUtcDate(dateString);

  return weekdayByUtcDay[date.getUTCDay()] ?? "SUNDAY";
}

function getZonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

export function getWorkspaceDateString(value: Date, timezone: string): string {
  const parts = getZonedParts(value, timezone);

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function getTimezoneOffsetMs(timezone: string, value: Date): number {
  const parts = getZonedParts(value, timezone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return zonedAsUtc - value.getTime();
}

export function getZonedDateTimeAsUtc(args: {
  dateString: string;
  minutes: number;
  timezone: string;
}): Date {
  const [year = 0, month = 1, day = 1] = args.dateString
    .split("-")
    .map(Number);
  const hour = Math.floor(args.minutes / 60);
  const minute = args.minutes % 60;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const firstOffset = getTimezoneOffsetMs(args.timezone, utcGuess);
  const firstResult = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimezoneOffsetMs(args.timezone, firstResult);

  if (secondOffset === firstOffset) {
    return firstResult;
  }

  return new Date(utcGuess.getTime() - secondOffset);
}

export function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHourValue = hours % 12 || 12;

  return `${twelveHourValue}:${String(remainder).padStart(2, "0")} ${suffix}`;
}

export function formatOccurrenceDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(dateOnlyStringToUtcDate(dateString));
}

export function formatOccurrenceLabel(args: {
  weekday: Weekday;
  dateString: string;
  startTimeMinutes: number;
}): string {
  return `${WEEKDAY_LABELS[args.weekday]}, ${formatOccurrenceDate(args.dateString)} at ${formatMinutesAsTime(args.startTimeMinutes)}`;
}

export function validateOccurrenceDate(args: {
  scheduledForDate: string;
  templateWeekday: Weekday;
  timezone: string;
  now: Date;
  direction: OccurrenceDateDirection;
}): OccurrenceDateValidationResult {
  const parsed = parseDateOnlyString(args.scheduledForDate);

  if (parsed.status === "error") {
    return {
      status: "error",
      reason: "invalid-date",
    };
  }

  if (getWeekdayForDateString(parsed.dateString) !== args.templateWeekday) {
    return {
      status: "error",
      reason: "wrong-weekday",
    };
  }

  const today = getWorkspaceDateString(args.now, args.timezone);

  if (args.direction === "future" && parsed.dateString < today) {
    return {
      status: "error",
      reason: "past-date",
    };
  }

  if (args.direction === "past" && parsed.dateString > today) {
    return {
      status: "error",
      reason: "future-date",
    };
  }

  return parsed;
}

export function buildUpcomingOccurrenceDateOptions<
  TTemplate extends TemplateForOccurrenceDates,
>(args: {
  templates: TTemplate[];
  timezone: string;
  now: Date;
  occurrenceCount?: number;
  maxDayWindow?: number;
}): Array<TemplateWithOccurrenceDates<TTemplate>> {
  const occurrenceCount = args.occurrenceCount ?? 4;
  const maxDayWindow = args.maxDayWindow ?? 42;
  const today = getWorkspaceDateString(args.now, args.timezone);

  return args.templates
    .map((template) => {
      const dateOptions: OccurrenceDateOption[] = [];

      for (
        let dayOffset = 0;
        dateOptions.length < occurrenceCount && dayOffset < maxDayWindow;
        dayOffset += 1
      ) {
        const dateString = addDays(today, dayOffset);
        const validation = validateOccurrenceDate({
          scheduledForDate: dateString,
          templateWeekday: template.weekday,
          timezone: args.timezone,
          now: args.now,
          direction: "future",
        });

        if (validation.status === "error") {
          continue;
        }

        dateOptions.push({
          classTemplateId: template.id,
          scheduledForDate: validation.dateString,
          startsAt: getZonedDateTimeAsUtc({
            dateString: validation.dateString,
            minutes: template.startTimeMinutes,
            timezone: args.timezone,
          }),
          label: formatOccurrenceLabel({
            weekday: template.weekday,
            dateString: validation.dateString,
            startTimeMinutes: template.startTimeMinutes,
          }),
        });
      }

      return {
        template,
        dateOptions,
      };
    })
    .filter((template) => template.dateOptions.length > 0);
}
