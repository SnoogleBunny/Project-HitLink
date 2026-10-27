import { projectMembershipGraceReceipt } from "./membership-grace-projection.js";
import { projectCoachingBookingPolicyReceipt } from "./coaching-booking-export-projection.js";
import {
  exportedFormEventKinds,
  projectFormEvent,
} from "./form-export-projection.js";
type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const project = (value: unknown, keys: readonly string[]) =>
  Object.fromEntries(
    Object.entries(object(value)).filter(
      ([key, item]) =>
        keys.includes(key) &&
        (item === null ||
          typeof item === "string" ||
          typeof item === "boolean" ||
          (typeof item === "number" && Number.isFinite(item))),
    ),
  );
const weekdays = new Set([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);
const snapshotKeys = [
  "schemaVersion",
  "mode",
  "policyRevisionId",
  "policyVersion",
  "policyHash",
  "scheduledForDate",
  "startsAt",
  "endsAt",
  "timezone",
  "opensAt",
  "closesAt",
  "evaluatedAt",
  "autoPromotionClosesAt",
  "sourceRowHash",
  "leadOverrideReceiptId",
] as const;

export function projectSchedulingPolicy(value: unknown) {
  const raw = object(value),
    classes = object(raw.classes);
  const weeklyHours = Array.isArray(classes.weeklyHours)
    ? classes.weeklyHours.flatMap((item) => {
        const day = object(item);
        if (typeof day.weekday !== "string" || !weekdays.has(day.weekday))
          return [];
        return [
          {
            weekday: day.weekday,
            intervals: Array.isArray(day.intervals)
              ? day.intervals.flatMap((item) => {
                  const interval = object(item),
                    start = interval.startMinute,
                    end = interval.endMinute;
                  return typeof start === "number" &&
                    typeof end === "number" &&
                    Number.isInteger(start) &&
                    Number.isInteger(end) &&
                    start >= 0 &&
                    end <= 1440 &&
                    start < end
                    ? [{ startMinute: start, endMinute: end }]
                    : [];
                })
              : [],
          },
        ];
      })
    : [];
  return {
    schemaVersion: raw.schemaVersion === 1 ? 1 : null,
    classes: {
      ...project(classes, ["maxAdvanceMinutes", "minimumLeadMinutes"]),
      weeklyHours,
    },
  };
}

export function projectSchedulingSnapshot(value: unknown) {
  return project(value, snapshotKeys);
}

export function projectWaitlistHistory(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) =>
        project(entry, [
          "kind",
          "at",
          "userId",
          "allowPunchCardFunding",
          "policy",
          "schedulingPolicyHash",
          "autoPromotionClosesAt",
          "reason",
          "bookingId",
        ]),
      )
    : [];
}

/** Owner records retain the reviewed effect, never replay tokens or arbitrary JSON. */
export function projectRoomCapacityReceipt(value: unknown) {
  const raw = object(value);
  const count = (key: string, minimum = 0) =>
    Number.isSafeInteger(raw[key]) &&
    Number(raw[key]) >= minimum &&
    Number(raw[key]) <= 2147483647
      ? Number(raw[key])
      : null;
  const capacity = (key: string) => (raw[key] === null ? null : count(key, 1));
  const text = (key: string) =>
    typeof raw[key] === "string" ? raw[key] : null;
  return {
    schemaVersion: raw.schemaVersion === 1 ? 1 : null,
    roomId: text("roomId"),
    revision: count("revision", 1),
    previousRevision: count("previousRevision"),
    previousCapacity: capacity("previousCapacity"),
    capacity: capacity("capacity"),
    reason: text("reason"),
    actorWorkspaceUserId: text("actorWorkspaceUserId"),
    actorNameSnapshot: text("actorNameSnapshot"),
    affectedOccurrenceCount: count("affectedOccurrenceCount"),
    reservationCount: count("reservationCount"),
    pendingPaymentCount: count("pendingPaymentCount"),
    queuedEntryCount: count("queuedEntryCount"),
  };
}

export const exportedWorkspaceEventKinds = [
  ...exportedFormEventKinds,
  "COACHING_BOOKING_POLICY_CONFIRMED",
  "CLASS_SCHEDULING_POLICY_CONFIRMED",
  "SCHEDULING_POLICY_APPLIED",
  "OWNER_LATE_BOOKING_CONFIRMED",
  "ROOM_DEFAULT_CAPACITY_CONFIRMED",
  "MEMBERSHIP_GRACE_BOOKING_RELEASED",
  "PAYMENT_CONFIRMATION_CREATED",
  "PAYMENT_CONFIRMATION_COPY_QUEUED",
  "NOTIFICATION_RETRY_REQUESTED",
] as const;

/** Query only these known kinds before projecting their narrowly defined metadata. */
export function projectExportedWorkspaceEvent(kind: string, value: unknown) {
  if ((exportedFormEventKinds as readonly string[]).includes(kind))
    return projectFormEvent(kind, value);
  switch (kind) {
    case "MEMBERSHIP_GRACE_BOOKING_RELEASED":
      return projectMembershipGraceReceipt(value);
    case "COACHING_BOOKING_POLICY_CONFIRMED":
      return projectCoachingBookingPolicyReceipt(value);
    case "ROOM_DEFAULT_CAPACITY_CONFIRMED":
      return projectRoomCapacityReceipt(value);
    case "OWNER_LATE_BOOKING_CONFIRMED": {
      const raw = object(value);
      return {
        ...project(raw, [
          "schemaVersion",
          "operationId",
          "bookingId",
          "fundingRevision",
          "memberId",
          "classTemplateId",
          "scheduledForDate",
          "policyRevisionId",
          "policyVersion",
          "policyHash",
          "startsAt",
          "endsAt",
          "timezone",
          "normalClosesAt",
          "confirmedAt",
          "notificationRecipientCount",
          "reason",
        ]),
        overriddenRules: Array.isArray(raw.overriddenRules)
          ? raw.overriddenRules.filter(
              (rule) => rule === "BOOKING_CUTOFF" || rule === "MINIMUM_LEAD",
            )
          : [],
      };
    }
    case "SCHEDULING_POLICY_APPLIED":
      return project(value, ["bookingId", "fundingRevision", ...snapshotKeys]);
    case "CLASS_SCHEDULING_POLICY_CONFIRMED":
      return project(value, [
        "policyRevisionId",
        "policyVersion",
        "policyHash",
        "previousPolicyHash",
        "retainedBookingCount",
        "queuedEntryCount",
      ]);
    case "PAYMENT_CONFIRMATION_CREATED":
      return project(value, [
        "confirmationId",
        "paymentId",
        "payerAccountId",
        "snapshotHash",
      ]);
    case "PAYMENT_CONFIRMATION_COPY_QUEUED":
      return project(value, [
        "operationId",
        "confirmationId",
        "notificationJobId",
        "snapshotHash",
      ]);
    case "NOTIFICATION_RETRY_REQUESTED":
      return project(value, [
        "operationId",
        "notificationJobId",
        "previousAttempts",
        "attemptLimit",
        "reason",
      ]);
    default:
      return {};
  }
}
