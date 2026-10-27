import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, classOccurrenceInclude, createAccessBackedBooking, getMembershipAllowanceSummary, getOccurrenceStartsAt, lockClassSchedule, resolveClassOccurrence, resolveWorkspaceClockTimezone, snapshotMembershipTerms } from "@flowstate/db";
import { commitWorkspaceTimezoneChange, getWorkspaceTimezoneSettings, previewWorkspaceTimezoneChange } from "./workspace-timezone-settings";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("reviewed effective-dated timezone changes", () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const workspaces: string[] = [], users: string[] = [];
  const now = new Date("2030-01-01T12:00:00Z");
  let workspaceId: string, userId: string, staffId: string, memberId: string, memberUserId: string, templateId: string, membershipId: string;
  beforeEach(async () => {
    const workspace = await db.workspace.create({ data: { name: `timezone-${randomUUID()}`, location: { create: { name: "Gym", timezone: "UTC" } } } }); workspaceId = workspace.id; workspaces.push(workspaceId);
    await createFixtureClassSchedulingPolicy(db, workspaceId);
    const owner = await db.user.create({ data: { email: `${randomUUID()}@timezone.test`, workspaceUsers: { create: { workspaceId, role: "OWNER" } } }, include: { workspaceUsers: true } }); userId = owner.id; staffId = owner.workspaceUsers[0]!.id; users.push(userId);
    const account = await db.user.create({ data: { email: `${randomUUID()}@timezone.test`, workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } } } }); memberUserId = account.id; users.push(account.id);
    memberId = (await db.member.create({ data: { workspaceId, userId: account.id, fullName: "Participant", status: "ACTIVE", dateOfBirth: new Date("1990-01-01") } })).id;
    const location = await db.location.findUniqueOrThrow({ where: { workspaceId } });
    const room = await db.room.create({ data: { locationId: location.id, name: "Mat", capacity: 4 } });
    const program = await db.program.create({ data: { workspaceId, name: "Muay Thai" } });
    templateId = (await db.classTemplate.create({ data: { workspaceId, roomId: room.id, programId: program.id, weekday: "MONDAY", startTimeMinutes: 1080, endTimeMinutes: 1140, bookingCutoffMinutes: 60, cancellationCutoffMinutes: 120 } })).id;
    const plan = await db.membershipPlan.create({ data: { workspaceId, name: "One weekly class", monthlyPriceCents: 12000, weeklyClassLimit: 1 } });
    membershipId = (await db.memberMembership.create({ data: { workspaceId, memberId, membershipPlanId: plan.id, status: "ACTIVE", startedAt: new Date("2029-12-01"), allowanceAnchorDate: new Date("2030-01-01"), allowanceTimezone: "UTC", acceptedTerms: JSON.parse(JSON.stringify(snapshotMembershipTerms(plan))) } })).id;
  });
  afterAll(async () => {
    for (const id of workspaces) {
      await db.coachingAcceptedPlan.deleteMany({ where: { workspaceId: id } });
      await db.coachingEnrollment.deleteMany({ where: { workspaceId: id } });
      await db.coachingProgramVersion.deleteMany({ where: { program: { workspaceId: id } } });
      await db.waitlistEntry.deleteMany({ where: { workspaceId: id } });
      await db.attendanceRecord.deleteMany({ where: { workspaceId: id } });
      await db.classBooking.deleteMany({ where: { workspaceId: id } });
      await db.classTemplate.deleteMany({ where: { workspaceId: id } });
      await db.workspace.delete({ where: { id } });
    }
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  });
  const actor = () => ({ workspaceId, userId });
  const input = (effectiveFromDate = "2030-01-08", timezone = "America/Los_Angeles", expectedVersion = 0) => ({ effectiveFromDate, timezone, expectedVersion });
  const preview = (value = input()) => previewWorkspaceTimezoneChange({ actor: actor(), input: value, db, now });
  const confirm = (previewHash: string, value = input()) => commitWorkspaceTimezoneChange({ actor: actor(), input: value, previewHash, confirmed: true, db, now });
  const book = (date = "2030-01-14") => createAccessBackedBooking({ workspaceId, memberId, classTemplateId: templateId, scheduledForDate: date, timezone: "UTC", source: "MEMBER_PORTAL", db: db as never, now });

  it("previews without mutation, appends immutable history and keeps old occurrence instants", async () => {
    expect((await book("2030-01-07")).status).toBe("created");
    const oldFunding = await db.membershipAllowanceAllocation.findMany({ where: { workspaceId } });
    const review = await preview(); expect(review.ok).toBe(true); expect(review.affected.length).toBeGreaterThan(0);
    expect(await db.workspaceTimezoneRevision.count({ where: { workspaceId } })).toBe(0);
    await confirm(review.previewHash);
    expect(await db.membershipAllowanceAllocation.findMany({ where: { workspaceId } })).toEqual(oldFunding);
    expect((await db.location.findUniqueOrThrow({ where: { workspaceId } })).timezone).toBe("UTC");
    const template = await db.classTemplate.findUniqueOrThrow({ where: { id: templateId }, include: classOccurrenceInclude });
    const old = resolveClassOccurrence({ template, scheduledForDate: "2030-01-07" })!, future = resolveClassOccurrence({ template, scheduledForDate: "2030-01-14" })!;
    expect(getOccurrenceStartsAt({ scheduledForDate: old.scheduledForDate, startTimeMinutes: old.startTimeMinutes, timezone: old.timezone! }).toISOString()).toBe("2030-01-07T18:00:00.000Z");
    expect(getOccurrenceStartsAt({ scheduledForDate: future.scheduledForDate, startTimeMinutes: future.startTimeMinutes, timezone: future.timezone! }).toISOString()).toBe("2030-01-15T02:00:00.000Z");
    expect(await resolveWorkspaceClockTimezone({ workspaceId, baselineTimezone: "UTC", db, now: new Date("2030-01-08T07:59:59Z") })).toBe("UTC");
    expect(await resolveWorkspaceClockTimezone({ workspaceId, baselineTimezone: "UTC", db, now: new Date("2030-01-08T08:00:00Z") })).toBe("America/Los_Angeles");
    const revision = await db.workspaceTimezoneRevision.findFirstOrThrow({ where: { workspaceId } });
    await expect(db.workspaceTimezoneRevision.update({ where: { id: revision.id }, data: { timezone: "Asia/Tokyo" } })).rejects.toThrow("immutable");
    await expect(db.workspaceTimezoneRevision.delete({ where: { id: revision.id } })).rejects.toThrow("immutable");
  });
  it("appends later changes without rewriting earlier dates or accepting an old version", async () => {
    await confirm((await preview()).previewHash);
    await expect(preview(input("2030-01-22", "Asia/Seoul", 0))).rejects.toThrow("settings changed");
    const next = input("2030-01-22", "Asia/Seoul", 1), review = await preview(next);
    expect(review.ok).toBe(true); await confirm(review.previewHash, next);
    const template = await db.classTemplate.findUniqueOrThrow({ where: { id: templateId }, include: classOccurrenceInclude });
    expect(resolveClassOccurrence({ template, scheduledForDate: "2030-01-07" })!.timezone).toBe("UTC");
    expect(resolveClassOccurrence({ template, scheduledForDate: "2030-01-14" })!.timezone).toBe("America/Los_Angeles");
    expect(resolveClassOccurrence({ template, scheduledForDate: "2030-01-28" })!.timezone).toBe("Asia/Seoul");
    expect((await getWorkspaceTimezoneSettings(actor(), db, now)).history).toHaveLength(2);
  });
  it("requires current owner authority, a future date and explicit reviewed confirmation", async () => {
    await expect(previewWorkspaceTimezoneChange({ actor: { workspaceId, userId: memberUserId }, input: input(), db, now })).rejects.toThrow("Only the owner");
    await expect(preview(input("2030-01-01"))).rejects.toThrow("future date");
    const review = await preview();
    await expect(commitWorkspaceTimezoneChange({ actor: actor(), input: input(), previewHash: review.previewHash, confirmed: false, db, now })).rejects.toThrow("Confirm");
    await db.workspaceUser.update({ where: { id: staffId }, data: { isActive: false } });
    await expect(confirm(review.previewHash)).rejects.toThrow("Only the owner");
    expect(await db.workspaceTimezoneRevision.count({ where: { workspaceId } })).toBe(0);
  });
  it("names booking, attendance and queue blockers and an actionable later date", async () => {
    expect((await book()).status).toBe("created");
    await db.attendanceRecord.create({ data: { workspaceId, memberId, classTemplateId: templateId, scheduledForDate: new Date("2030-01-14"), state: "PRESENT", coachWorkspaceUserId: staffId } });
    await db.waitlistEntry.create({ data: { workspaceId, memberId, classTemplateId: templateId, scheduledForDate: new Date("2030-01-21") } });
    const review = await preview();
    expect(review.ok).toBe(false); expect(review.earliestSafeDate).toBe("2030-01-22");
    expect(review.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ date: "2030-01-14", bookings: 1, attendance: 1 }), expect.objectContaining({ date: "2030-01-21", waitlist: 1 })]));
    await expect(confirm(review.previewHash)).rejects.toThrow("committed class dates");
    expect((await preview(input("2030-01-22"))).ok).toBe(true);
  });
  it("rejects a stale preview after a schedule edit without writing a partial change", async () => {
    const review = await preview();
    await db.classTemplate.update({ where: { id: templateId }, data: { endTimeMinutes: 1170 } });
    await expect(confirm(review.previewHash)).rejects.toThrow("changed");
    expect(await db.workspaceTimezoneRevision.count({ where: { workspaceId } })).toBe(0);
  });
  it("rechecks a new booking committed while timezone confirmation waits for the schedule lock", async () => {
    const review = await preview();
    let locked!: () => void, release!: () => void, attempted!: () => void;
    const held = new Promise<void>(resolve => { locked = resolve; }), proceed = new Promise<void>(resolve => { release = resolve; }), reached = new Promise<void>(resolve => { attempted = resolve; });
    const booking = db.$transaction(async tx => { await lockClassSchedule(tx, workspaceId); locked(); await proceed; await tx.classBooking.create({ data: { workspaceId, memberId, classTemplateId: templateId, scheduledForDate: new Date("2030-01-14"), bookingType: "TRIAL" } }); });
    await held;
    const observed = { $transaction: (callback: (tx: unknown) => Promise<unknown>, options: { timeout: number; isolationLevel: "ReadCommitted" }) => db.$transaction(tx => callback(new Proxy(tx, { get(target, key) { if (key === "$queryRawUnsafe") return (query: string, ...values: unknown[]) => { const pending = target.$queryRawUnsafe(query, ...values).then(value => value); if (query.includes("pg_advisory_xact_lock")) attempted(); return pending; }; return Reflect.get(target, key); } })), options) };
    const confirmation = commitWorkspaceTimezoneChange({ actor: actor(), input: input(), previewHash: review.previewHash, confirmed: true, db: observed as never, now });
    try { await reached; } finally { release(); }
    await booking;
    await expect(confirmation).rejects.toThrow("committed class dates");
    expect(await db.workspaceTimezoneRevision.count({ where: { workspaceId } })).toBe(0);
    expect(await db.classBooking.count({ where: { workspaceId } })).toBe(1);
  });
  it("blocks newly ambiguous DST times and collisions with fixed absolute appointments", async () => {
    await db.classTemplate.update({ where: { id: templateId }, data: { weekday: "SUNDAY", startTimeMinutes: 150, endTimeMinutes: 210 } });
    expect((await preview()).errors.some(error => error.includes("ambiguous"))).toBe(true);
    await db.classTemplate.update({ where: { id: templateId }, data: { weekday: "MONDAY", startTimeMinutes: 1080, endTimeMinutes: 1140, coachWorkspaceUserId: staffId } });
    await db.privateLessonSlot.create({ data: { workspaceId, coachWorkspaceUserId: staffId, startsAt: new Date("2030-01-15T02:00:00Z"), endsAt: new Date("2030-01-15T03:00:00Z") } });
    expect((await preview()).errors.some(error => error.includes("overlap"))).toBe(true);
  });
  it("uses the class instant for old allowance periods while preserving accepted membership and coaching zones", async () => {
    const program = await db.coachingProgram.create({ data: { workspaceId, name: "Coaching" } });
    const version = await db.coachingProgramVersion.create({ data: { programId: program.id, number: 1, durationDays: 30, deliveryWeekdays: [1], responseHours: 24, goals: "Fixture", milestones: [], priceCents: 10000, currency: "cad", terms: "Fixture accepted terms" } });
    const enrollment = await db.coachingEnrollment.create({ data: { workspaceId, memberId, programVersionId: version.id, startsOn: new Date("2030-01-01"), endsOn: new Date("2030-01-30"), timezone: "UTC", caseOwnerWorkspaceUserId: staffId } });
    await db.coachingAcceptedPlan.create({ data: { workspaceId, enrollmentId: enrollment.id, programVersionId: version.id, clientUserId: memberUserId, operationId: randomUUID(), startsOn: enrollment.startsOn, endsOn: enrollment.endsOn, timezone: "UTC", snapshot: {}, agreement: {}, acceptedAt: now } });
    const before = await db.memberMembership.findUniqueOrThrow({ where: { id: membershipId } });
    await confirm((await preview()).previewHash);
    const allowance = await getMembershipAllowanceSummary({ workspaceId, memberId, scheduledForDate: "2030-01-14", occurrenceStartsAt: new Date("2030-01-15T02:00:00Z"), timezone: "America/Los_Angeles", db });
    expect(allowance?.windows).toEqual([expect.objectContaining({ startsOn: "2030-01-15", remaining: 1 })]);
    expect((await book()).status).toBe("created");
    const allocations = await db.membershipAllowanceAllocation.findMany({ where: { workspaceId } });
    expect(allocations).toHaveLength(1); expect(allocations[0]!.periodStart.toISOString().slice(0, 10)).toBe("2030-01-15");
    const after = await db.memberMembership.findUniqueOrThrow({ where: { id: membershipId } });
    expect(after.allowanceTimezone).toBe("UTC"); expect(after.allowanceAnchorDate).toEqual(before.allowanceAnchorDate); expect(after.acceptedTerms).toEqual(before.acceptedTerms);
    expect((await db.coachingEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).timezone).toBe("UTC");
    expect((await db.coachingAcceptedPlan.findFirstOrThrow({ where: { workspaceId } })).timezone).toBe("UTC");
    expect((await getWorkspaceTimezoneSettings(actor(), db, now)).history).toHaveLength(1);
  });
});
