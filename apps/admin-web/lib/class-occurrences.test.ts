import { describe, expect, it } from "vitest";
import { classScheduleReviewDates, resolveClassOccurrence, isUnambiguousClassTime, type ClassOccurrenceTemplate } from "@flowstate/db";
const day = (date: string) => new Date(`${date}T00:00:00Z`);
const coach = (id: string) => ({ id, user: { fullName: id, email: `${id}@example.com` } });
const base: ClassOccurrenceTemplate = { id: "class", workspaceId: "gym", title: "Muay Thai", weekday: "MONDAY", programId: "program", roomId: "mat", coachWorkspaceUserId: "sam", coachWorkspaceUser: coach("sam"), startTimeMinutes: 1080, endTimeMinutes: 1140, capacityOverride: 20, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 0, program: { id: "program", name: "Muay Thai" }, room: { id: "mat", name: "Main mat", capacity: 20 } };

describe("effective dated class schedule", () => {
  it("rejects skipped and repeated local times at daylight saving boundaries", () => {
    expect(isUnambiguousClassTime("2030-03-10", 150, "America/New_York")).toBe(false);
    expect(isUnambiguousClassTime("2030-11-03", 90, "America/New_York")).toBe(false);
    expect(isUnambiguousClassTime("2030-03-10", 450, "America/New_York")).toBe(true);
  });
  it("retains explicitly unassigned dates when future default coach and times change", () => {
    const template: ClassOccurrenceTemplate = { ...base, scheduleRevisions: [{ ...base, id: "revision", effectiveFrom: day("2030-01-07"), startDate: day("2030-01-07"), endDate: null, recurrence: "DAILY", weekdays: [], startTimeMinutes: 1140, endTimeMinutes: 1200, coachWorkspaceUserId: "jordan", coachWorkspaceUser: coach("jordan") }], classInstances: [{ ...base, id: "assignment", scheduledForDate: day("2030-01-08"), isScheduleOverride: false, coachAssignmentMode: "UNASSIGNED", coachWorkspaceUserId: null, coachWorkspaceUser: null, status: "ACTIVE" }] };
    expect(resolveClassOccurrence({ template, scheduledForDate: "2030-01-08" })).toMatchObject({ startTimeMinutes: 1140, coachWorkspaceUserId: null, coachAssignmentMode: "UNASSIGNED", defaultCoachWorkspaceUserId: "jordan", isScheduleOverride: false });
    expect(resolveClassOccurrence({ template, scheduledForDate: "2030-01-09" })).toMatchObject({ coachWorkspaceUserId: "jordan", coachAssignmentMode: "INHERIT" });
  });
  it("preserves dated schedule overrides and legacy teacher snapshots", () => {
    const template: ClassOccurrenceTemplate = { ...base, classInstances: [{ ...base, id: "exception", scheduledForDate: day("2030-01-08"), status: "ACTIVE", startTimeMinutes: 600 }] };
    expect(resolveClassOccurrence({ template, scheduledForDate: "2030-01-08" })).toMatchObject({ startTimeMinutes: 600, isScheduleOverride: true, coachAssignmentMode: "ASSIGNED", coachWorkspaceUserId: "sam" });
    expect(resolveClassOccurrence({ template: base, scheduledForDate: "2030-01-08" })).toBeNull();
  });
  it("does not let a coach-only override resurrect a removed recurrence date", () => {
    const template: ClassOccurrenceTemplate = { ...base, classInstances: [{ ...base, id: "assignment", scheduledForDate: day("2030-01-08"), status: "ACTIVE", isScheduleOverride: false, coachAssignmentMode: "ASSIGNED" }] };
    expect(resolveClassOccurrence({ template, scheduledForDate: "2030-01-08" })).toBeNull();
  });
  it("checks far future boundaries and every weekday of the ongoing final interval", () => {
    const template: ClassOccurrenceTemplate = { ...base, scheduleRevisions: [{ ...base, id: "far-future", effectiveFrom: day("2045-06-01"), startDate: day("2045-06-01"), endDate: null, recurrence: "WEEKLY", weekdays: ["FRIDAY"] }] };
    const dates = classScheduleReviewDates({ templates: [template], fromDate: "2030-01-07", recordedDates: ["2050-12-31"] });
    expect(dates).toContain("2045-06-01"); expect(dates).toContain("2045-06-07"); expect(dates).toContain("2050-12-31");
    expect(dates.length).toBeLessThan(100);
  });
  it("does not invent historical classes before a new series starts", () => {
    expect(resolveClassOccurrence({ template: { ...base, scheduleStartsOn: day("2030-01-14") }, scheduledForDate: "2030-01-07" })).toBeNull();
  });
});
