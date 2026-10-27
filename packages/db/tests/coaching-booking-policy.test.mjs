import test from "node:test";
import assert from "node:assert/strict";
import { coachingBookingWeekdays, parseCoachingBookingPolicy, hashCoachingBookingPolicy, evaluateCoachingBookingPolicy, coachingAppointmentResourceWindow, resolveCoachingResolutionResponseHours } from "../src/coaching-booking-policy.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
function policy(days = {}, overrides = {}) {
  return parseCoachingBookingPolicy({ schemaVersion: 1, appointments: {
    weeklyHours: coachingBookingWeekdays.map((weekday) => ({ weekday, intervals: days[weekday] ?? [] })),
    maxAdvanceMinutes: 30 * 24 * 60, minimumLeadMinutes: 60, minimumBufferMinutes: 15, resolutionResponseHours: 24, ...overrides,
  } });
}
const interval = (startMinute, endMinute) => ({ startMinute, endMinute });
const monday = () => policy({ MONDAY: [interval(9 * 60, 17 * 60)] });
const openWeek = (overrides = {}) => policy(Object.fromEntries(coachingBookingWeekdays.map((day) => [day, [interval(0, 1440)]])), overrides);
function evaluate(p = monday(), more = {}) {
  return evaluateCoachingBookingPolicy({ policy: p, startsAt: new Date("2026-11-02T09:00:00Z"), endsAt: new Date("2026-11-02T10:00:00Z"), now: new Date("2026-11-01T12:00:00Z"), timezone: "UTC", ...more });
}

test("all seven explicit days and closed days parse without inferring legacy defaults", () => {
  const value = policy();
  assert.deepEqual(value.appointments.weeklyHours.map((day) => day.weekday), coachingBookingWeekdays);
  assert.ok(value.appointments.weeklyHours.every((day) => day.intervals.length === 0));
  assert.equal(evaluate(value).code, "OUTSIDE_SERVICE_HOURS");
});

test("canonical parsing and hash ignore input key/day/interval ordering without mutating input", () => {
  const source = clone(policy({ MONDAY: [interval(0, 60), interval(120, 180)] }));
  source.appointments.weeklyHours.reverse();
  source.appointments.weeklyHours.find((day) => day.weekday === "MONDAY").intervals.reverse();
  const before = clone(source), canonical = parseCoachingBookingPolicy(source);
  assert.deepEqual(source, before);
  assert.deepEqual(canonical.appointments.weeklyHours[0].intervals, [interval(0, 60), interval(120, 180)]);
  assert.equal(hashCoachingBookingPolicy(source), hashCoachingBookingPolicy(canonical));
  assert.match(hashCoachingBookingPolicy(canonical), /^[a-f0-9]{64}$/);
  const changed = clone(canonical); changed.appointments.minimumBufferMinutes++;
  assert.notEqual(hashCoachingBookingPolicy(changed), hashCoachingBookingPolicy(canonical));
});

test("strict parser rejects independent class policy, unexpected fields, missing settings and exotic objects", () => {
  for (const source of [null, [], "policy", new Date(), Object.create({ schemaVersion: 1 }), { schemaVersion: 1, classes: {} }, { schemaVersion: 1, appointments: {}, classes: {} }]) assert.throws(() => parseCoachingBookingPolicy(source));
  for (const mutate of [
    (p) => { p.schemaVersion = 2; }, (p) => { p.extra = true; },
    (p) => { p.appointments.bookingHorizonDays = 30; },
    (p) => { delete p.appointments.minimumBufferMinutes; },
    (p) => { p.appointments.weeklyHours[0].label = "Monday"; },
    (p) => { p.appointments.weeklyHours[0].intervals = [{ startMinute: 0, endMinute: 60, label: "Open" }]; },
    (p) => { p[Symbol("unexpected")] = true; },
    (p) => { p.appointments.weeklyHours[0].intervals = Array(1); },
  ]) { const value = clone(monday()); mutate(value); assert.throws(() => parseCoachingBookingPolicy(value)); }
});

test("each weekday must occur exactly once with an explicit interval list", () => {
  for (const mutate of [
    (p) => p.appointments.weeklyHours.pop(),
    (p) => p.appointments.weeklyHours.push({ weekday: "MONDAY", intervals: [] }),
    (p) => { p.appointments.weeklyHours[1].weekday = "MONDAY"; },
    (p) => { p.appointments.weeklyHours[0].weekday = "monday"; },
    (p) => { p.appointments.weeklyHours[0].intervals = null; },
  ]) { const value = clone(monday()); mutate(value); assert.throws(() => parseCoachingBookingPolicy(value)); }
});

test("local intervals reject rollover/cross-midnight, overlap and malformed endpoints", () => {
  for (const intervals of [[interval(1380, 60)], [interval(60, 60)], [interval(-1, 60)], [interval(0, 1441)], [interval(0.5, 60)], [interval(0, "60")], [interval(0, 60), interval(59, 120)]]) {
    assert.throws(() => policy({ MONDAY: intervals }));
  }
  assert.doesNotThrow(() => policy({ MONDAY: [interval(0, 60), interval(60, 1440)] }));
});

test("no arbitrary interval count is imposed on valid adjacent minute intervals", () => {
  const intervals = Array.from({ length: 1440 }, (_, index) => interval(index, index + 1));
  assert.equal(policy({ MONDAY: intervals }).appointments.weeklyHours[0].intervals.length, 1440);
});

test("horizon exceeds lead and settings reject non-integers, unsafe numbers and storage overflow", () => {
  for (const overrides of [
    { maxAdvanceMinutes: 0 }, { maxAdvanceMinutes: 60, minimumLeadMinutes: 60 }, { minimumLeadMinutes: -1 },
    { maxAdvanceMinutes: 1.5 }, { maxAdvanceMinutes: Number.MAX_SAFE_INTEGER + 1 }, { maxAdvanceMinutes: Infinity },
    { minimumLeadMinutes: NaN }, { minimumBufferMinutes: -1 }, { minimumBufferMinutes: 2_147_483_648 },
    { minimumBufferMinutes: 1.1 }, { resolutionResponseHours: 0 }, { resolutionResponseHours: "24" },
    { resolutionResponseHours: Number.MAX_SAFE_INTEGER },
  ]) assert.throws(() => openWeek(overrides));
  assert.doesNotThrow(() => openWeek({ maxAdvanceMinutes: Number.MAX_SAFE_INTEGER, minimumBufferMinutes: 2_147_483_647, resolutionResponseHours: 2_450_000_000 }));
});

test("a visible future slot is not open before the exact horizon boundary and opens inclusively", () => {
  const p = monday(), start = new Date("2026-11-02T09:00:00Z");
  const opening = new Date(start.getTime() - p.appointments.maxAdvanceMinutes * 60_000);
  assert.equal(evaluate(p, { now: new Date(opening.getTime() - 1) }).code, "NOT_OPEN");
  const value = evaluate(p, { now: opening });
  assert.equal(value.code, "AVAILABLE"); assert.equal(value.allowed, true);
  assert.equal(value.opensAt.toISOString(), opening.toISOString());
  assert.equal(value.closesAt.toISOString(), "2026-11-02T08:00:00.000Z");
});

test("the lead boundary closes exclusively, including explicit zero lead at service start", () => {
  assert.equal(evaluate(monday(), { now: new Date("2026-11-02T07:59:59.999Z") }).code, "AVAILABLE");
  assert.equal(evaluate(monday(), { now: new Date("2026-11-02T08:00:00Z") }).code, "CLOSED");
  assert.equal(evaluate(monday(), { now: new Date("2026-11-03T08:00:00Z") }).code, "CLOSED");
  const p = monday(); p.appointments.minimumLeadMinutes = 0;
  assert.equal(evaluate(p, { now: new Date("2026-11-02T08:59:59.999Z") }).code, "AVAILABLE");
  assert.equal(evaluate(p, { now: new Date("2026-11-02T09:00:00Z") }).code, "CLOSED");
});

test("service interval boundaries are half-open down to the final millisecond", () => {
  const p = policy({ MONDAY: [interval(9 * 60, 10 * 60)] });
  assert.equal(evaluate(p).code, "AVAILABLE");
  assert.equal(evaluate(p, { startsAt: new Date("2026-11-02T08:59:59.999Z") }).code, "OUTSIDE_SERVICE_HOURS");
  assert.equal(evaluate(p, { endsAt: new Date("2026-11-02T10:00:00.001Z") }).code, "OUTSIDE_SERVICE_HOURS");
  assert.equal(evaluate(p, { startsAt: new Date("2026-11-02T09:59:59.999Z") }).code, "AVAILABLE");
});

test("service hours do not contain buffers and retain the larger explicit buffer above 240 minutes", () => {
  const p = policy({ MONDAY: [interval(9 * 60, 10 * 60)] }, { minimumBufferMinutes: 1000 });
  assert.equal(evaluate(p).effectiveBufferMinutes, 1000);
  assert.equal(evaluate(p).code, "AVAILABLE");
  assert.equal(evaluate(p, { slotBufferMinutes: 5000 }).effectiveBufferMinutes, 5000);
  assert.equal(evaluate(p, { slotBufferMinutes: 30 }).effectiveBufferMinutes, 1000);
  assert.equal(evaluate(openWeek({ minimumBufferMinutes: 0 }), { slotBufferMinutes: 0 }).effectiveBufferMinutes, 0);
});

test("open endpoints cannot bridge a closed lunch interval", () => {
  const p = policy({ MONDAY: [interval(9 * 60, 12 * 60), interval(13 * 60, 17 * 60)] });
  assert.equal(evaluate(p, { startsAt: new Date("2026-11-02T11:00:00Z"), endsAt: new Date("2026-11-02T14:00:00Z") }).code, "OUTSIDE_SERVICE_HOURS");
});

test("cross-midnight services require all actual instants on both explicit local days", () => {
  const p = policy({ MONDAY: [interval(22 * 60, 1440)], TUESDAY: [interval(0, 2 * 60)] });
  const times = { startsAt: new Date("2026-11-02T23:00:00Z"), endsAt: new Date("2026-11-03T01:00:00Z") };
  assert.equal(evaluate(p, times).code, "AVAILABLE");
  p.appointments.weeklyHours[1].intervals = [];
  assert.equal(evaluate(p, times).code, "OUTSIDE_SERVICE_HOURS");
});

test("the business timezone at the supplied slot instant determines weekday and hours", () => {
  const p = policy({ MONDAY: [interval(0, 60)] });
  const times = { startsAt: new Date("2026-11-01T15:00:00Z"), endsAt: new Date("2026-11-01T16:00:00Z"), now: new Date("2026-10-31T00:00:00Z") };
  assert.equal(evaluate(p, { ...times, timezone: "Asia/Seoul" }).code, "AVAILABLE");
  assert.equal(evaluate(p, { ...times, timezone: "UTC" }).code, "OUTSIDE_SERVICE_HOURS");
});

test("DST spring gap does not invent nonexistent service instants", () => {
  const p = policy({ SUNDAY: [interval(90, 120), interval(180, 210)] });
  const times = { startsAt: new Date("2026-03-08T06:30:00Z"), endsAt: new Date("2026-03-08T07:30:00Z"), now: new Date("2026-03-01T00:00:00Z"), timezone: "America/New_York" };
  assert.equal(evaluate(p, times).code, "AVAILABLE");
  p.appointments.weeklyHours[6].intervals[0].endMinute = 105;
  assert.equal(evaluate(p, times).code, "OUTSIDE_SERVICE_HOURS");
});

test("DST fall fold checks the repeated hour rather than trusting equal local endpoints", () => {
  const times = { startsAt: new Date("2026-11-01T05:30:00Z"), endsAt: new Date("2026-11-01T06:30:00Z"), now: new Date("2026-10-31T00:00:00Z"), timezone: "America/New_York" };
  assert.equal(evaluate(policy({ SUNDAY: [interval(90, 120)] }), times).code, "OUTSIDE_SERVICE_HOURS");
  assert.equal(evaluate(policy({ SUNDAY: [interval(60, 120)] }), { ...times, startsAt: new Date("2026-11-01T05:00:00Z"), endsAt: new Date("2026-11-01T07:00:00Z") }).code, "AVAILABLE");
});

test("historical timezone offset seconds cannot skip a short real closed interval", () => {
  // Paris mean time was UTC+00:09:21. A UTC-minute sampling loop can miss a
  // local minute boundary near the service endpoint; actual-second checks do not.
  const p = openWeek();
  for (const day of p.appointments.weeklyHours) day.intervals = [interval(9 * 60, 10 * 60)];
  assert.equal(evaluate(p, { startsAt: new Date("1890-01-06T08:50:39Z"), endsAt: new Date("1890-01-06T09:50:39Z"), now: new Date("1890-01-05T00:00:00Z"), timezone: "Europe/Paris" }).code, "AVAILABLE");
  assert.equal(evaluate(p, { startsAt: new Date("1890-01-06T08:50:39Z"), endsAt: new Date("1890-01-06T09:50:39.001Z"), now: new Date("1890-01-05T00:00:00Z"), timezone: "Europe/Paris" }).code, "OUTSIDE_SERVICE_HOURS");
});

test("a horizon beyond one year and service duration beyond one day have no product cap", () => {
  const p = openWeek({ maxAdvanceMinutes: 2 * 366 * 24 * 60, minimumLeadMinutes: 0 });
  assert.equal(evaluate(p, { startsAt: new Date("2027-07-01T09:00:00Z"), endsAt: new Date("2030-07-01T09:00:00Z"), now: new Date("2026-01-01T00:00:00Z") }).code, "AVAILABLE");
});

test("invalid instants, timezone, duration and explicit buffers fail closed", () => {
  for (const times of [
    { startsAt: new Date(NaN) }, { endsAt: new Date(NaN) }, { now: new Date(NaN) },
    { startsAt: "2026-11-02T09:00:00Z" }, { endsAt: new Date("2026-11-02T09:00:00Z") },
    { endsAt: new Date("2026-11-02T08:00:00Z") }, { timezone: "Unknown/Timezone" }, { timezone: "" },
    { slotBufferMinutes: -1 }, { slotBufferMinutes: 1.5 }, { slotBufferMinutes: 2_147_483_648 }, { slotBufferMinutes: "30" },
  ]) { const value = evaluate(openWeek(), times); assert.equal(value.allowed, false); assert.equal(value.code, "INVALID_TIME"); assert.equal(value.opensAt, null); assert.equal(value.closesAt, null); }
});

test("safe-integer settings still reject arithmetic/calendar overflow at the actual candidate", () => {
  assert.equal(evaluate(openWeek({ maxAdvanceMinutes: Number.MAX_SAFE_INTEGER })).code, "INVALID_TIME");
  const p = openWeek({ maxAdvanceMinutes: 2, minimumLeadMinutes: 0, minimumBufferMinutes: 0 });
  assert.equal(evaluate(p, { startsAt: new Date(-8_640_000_000_000_000 + 60_000), endsAt: new Date(-8_640_000_000_000_000 + 120_000), now: new Date(-8_640_000_000_000_000) }).code, "INVALID_TIME");
  assert.equal(evaluate(p, { startsAt: new Date(8_640_000_000_000_000 - 120_000), endsAt: new Date(8_640_000_000_000_000), now: new Date(8_640_000_000_000_000 - 180_000), slotBufferMinutes: 1 }).code, "INVALID_TIME");
  assert.equal(evaluate(p, { startsAt: new Date(-8_640_000_000_000_000 + 120_000), endsAt: new Date(8_640_000_000_000_000 - 120_000), now: new Date(-8_640_000_000_000_000) }).code, "INVALID_TIME");
});

test("resource window uses the exact asymmetric buffer, including buffers spanning days", () => {
  const value = coachingAppointmentResourceWindow({ startsAt: new Date("2026-11-02T09:00:00Z"), endsAt: new Date("2026-11-02T10:00:00Z"), beforeBufferMinutes: 3 * 1440 + 1, afterBufferMinutes: 5000 });
  assert.equal(value.from.toISOString(), "2026-10-30T08:59:00.000Z");
  assert.equal(value.until.toISOString(), "2026-11-05T21:20:00.000Z");
  const largest = coachingAppointmentResourceWindow({ startsAt: new Date(0), endsAt: new Date(1000), beforeBufferMinutes: 2_147_483_647, afterBufferMinutes: 2_147_483_647 });
  assert.equal(largest.from.getTime(), -2_147_483_647 * 60000);
  assert.equal(largest.until.getTime(), 1000 + 2_147_483_647 * 60000);
});

test("zero-buffer resource endpoints preserve millisecond precision without sharing mutable Dates", () => {
  const startsAt = new Date("2026-11-02T09:00:00.123Z"), endsAt = new Date("2026-11-02T09:01:00.456Z");
  const value = coachingAppointmentResourceWindow({ startsAt, endsAt, beforeBufferMinutes: 0, afterBufferMinutes: 0 });
  assert.equal(value.from.getTime(), startsAt.getTime()); assert.equal(value.until.getTime(), endsAt.getTime());
  assert.notEqual(value.from, startsAt); assert.notEqual(value.until, endsAt);
  value.from.setTime(0);
  assert.equal(startsAt.toISOString(), "2026-11-02T09:00:00.123Z");
});

test("half-open resource endpoints allow exact adjacency but include another row's long recorded buffer", () => {
  const window = (start, end, before = 0, after = 0) => coachingAppointmentResourceWindow({ startsAt: new Date(start), endsAt: new Date(end), beforeBufferMinutes: before, afterBufferMinutes: after });
  const overlaps = (left, right) => left.from < right.until && right.from < left.until;
  const candidate = window("2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z", 15, 30);
  assert.equal(overlaps(candidate, window("2026-11-02T08:00:00Z", "2026-11-02T08:45:00Z")), false);
  assert.equal(overlaps(candidate, window("2026-11-02T10:30:00Z", "2026-11-02T11:00:00Z")), false);
  assert.equal(overlaps(candidate, window("2026-11-02T10:29:59.999Z", "2026-11-02T11:00:00Z")), true);
  const otherService = window("2026-11-01T22:00:00Z", "2026-11-01T23:00:00Z");
  assert.equal(overlaps(candidate, otherService), false);
  assert.equal(overlaps(candidate, window("2026-11-01T22:00:00Z", "2026-11-01T23:00:00Z", 0, 600)), true);
});

test("resource buffers measure actual elapsed minutes across DST gaps and folds", () => {
  const gap = coachingAppointmentResourceWindow({ startsAt: new Date("2026-03-08T07:30:00Z"), endsAt: new Date("2026-03-08T08:00:00Z"), beforeBufferMinutes: 90, afterBufferMinutes: 30 });
  assert.equal(gap.from.toISOString(), "2026-03-08T06:00:00.000Z");
  assert.equal(gap.until.toISOString(), "2026-03-08T08:30:00.000Z");
  const fold = coachingAppointmentResourceWindow({ startsAt: new Date("2026-11-01T05:30:00Z"), endsAt: new Date("2026-11-01T06:30:00Z"), beforeBufferMinutes: 30, afterBufferMinutes: 120 });
  assert.equal(fold.from.toISOString(), "2026-11-01T05:00:00.000Z");
  assert.equal(fold.until.toISOString(), "2026-11-01T08:30:00.000Z");
});

test("resource-window failure rejects invalid instants/storage and actual calendar overflow", () => {
  const source = { startsAt: new Date("2026-11-02T09:00:00Z"), endsAt: new Date("2026-11-02T10:00:00Z"), beforeBufferMinutes: 0, afterBufferMinutes: 0 };
  for (const more of [
    { startsAt: new Date(NaN) }, { endsAt: new Date(NaN) }, { startsAt: "2026-11-02T09:00:00Z" },
    { endsAt: source.startsAt }, { endsAt: new Date("2026-11-02T08:00:00Z") },
    { beforeBufferMinutes: -1 }, { afterBufferMinutes: 0.5 }, { afterBufferMinutes: "30" },
    { beforeBufferMinutes: 2_147_483_648 }, { afterBufferMinutes: Number.MAX_SAFE_INTEGER },
    { startsAt: new Date(-8_640_000_000_000_000), endsAt: new Date(-8_640_000_000_000_000 + 1000), beforeBufferMinutes: 1 },
    { startsAt: new Date(8_640_000_000_000_000 - 1000), endsAt: new Date(8_640_000_000_000_000), afterBufferMinutes: 1 },
  ]) assert.throws(() => coachingAppointmentResourceWindow({ ...source, ...more }));
});

test("booking-help resolution keeps a faster explicit accepted promise when current policy slows", () => {
  assert.equal(resolveCoachingResolutionResponseHours({ currentResolutionResponseHours: 48, acceptedResolutionResponseHours: 8 }), 8);
  assert.equal(resolveCoachingResolutionResponseHours({ currentResolutionResponseHours: 4, acceptedResolutionResponseHours: 8 }), 4);
  assert.equal(resolveCoachingResolutionResponseHours({ currentResolutionResponseHours: 8, acceptedResolutionResponseHours: 8 }), 8);
  assert.equal(resolveCoachingResolutionResponseHours({ currentResolutionResponseHours: 48 }), 48);
  assert.equal(resolveCoachingResolutionResponseHours({ currentResolutionResponseHours: 2_450_000_000, acceptedResolutionResponseHours: 2_440_000_000 }), 2_440_000_000);
});

test("a malformed explicit accepted booking-help promise is rejected instead of silently replaced", () => {
  for (const hours of [0, -1, 1.5, null, "8", Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => resolveCoachingResolutionResponseHours({ currentResolutionResponseHours: 48, acceptedResolutionResponseHours: hours }));
    assert.throws(() => resolveCoachingResolutionResponseHours({ currentResolutionResponseHours: hours }));
  }
});
