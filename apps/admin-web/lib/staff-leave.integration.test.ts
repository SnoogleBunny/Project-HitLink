import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@flowstate/db";
import { createFixtureCoachingBookingPolicy, deleteFixtureCoachingWorkspace } from "../../../packages/db/tests/coaching-booking-policy-fixture.js";
import {
  commitClassSchedule,
  reviewClassSchedule,
  type ClassScheduleAccess,
  type ClassScheduleInput,
} from "./class-schedule";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite("staff leave and shared scheduling", () => {
  let db: PrismaClient, api: typeof import("@flowstate/db");
  const workspaces: string[] = [],
    users: string[] = [];
  let actor: { workspaceId: string; userId: string }, coachActor: typeof actor;
  let access: ClassScheduleAccess,
    input: ClassScheduleInput,
    coachId: string,
    memberId: string;
  const now = new Date("2030-01-01T00:00:00Z");
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    api = await import("@flowstate/db");
    db = api.prisma;
  });
  beforeEach(async () => {
    // The fixture uses an explicit 2030 command clock. Mock Date alone so real
    // advisory waits, pool timeouts and PostgreSQL transactions keep real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const workspace = await db.workspace.create({
      data: { name: `staff-leave-${randomUUID()}` },
    });
    workspaces.push(workspace.id);
    const location = await db.location.create({
      data: { workspaceId: workspace.id, name: "Gym", timezone: "UTC" },
    });
    const owner = await db.user.create({
      data: { email: `${randomUUID()}@leave.test`, fullName: "Owner" },
    });
    users.push(owner.id);
    const coach = await db.user.create({
      data: { email: `${randomUUID()}@leave.test`, fullName: "Coach" },
    });
    users.push(coach.id);
    const ownerStaff = await db.workspaceUser.create({
      data: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" },
    });
    coachId = (
      await db.workspaceUser.create({
        data: { workspaceId: workspace.id, userId: coach.id, role: "COACH" },
      })
    ).id;
    actor = { workspaceId: workspace.id, userId: owner.id };
    coachActor = { workspaceId: workspace.id, userId: coach.id };
    const program = await db.program.create({
      data: { workspaceId: workspace.id, name: "Muay Thai" },
    });
    const room = await db.room.create({
      data: { locationId: location.id, name: "Main mat", capacity: 20 },
    });
    const template = await db.classTemplate.create({
      data: {
        workspaceId: workspace.id,
        programId: program.id,
        roomId: room.id,
        coachWorkspaceUserId: ownerStaff.id,
        title: "Evening class",
        weekday: "MONDAY",
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
      },
    });
    memberId = (
      await db.member.create({
        data: {
          workspaceId: workspace.id,
          fullName: "Member",
          dateOfBirth: new Date("1990-01-01"),
        },
      })
    ).id;
    access = {
      workspaceId: workspace.id,
      workspaceUserId: ownerStaff.id,
      locationId: location.id,
      timezone: "UTC",
      role: "OWNER",
    };
    input = {
      templateId: template.id,
      scope: "coach",
      date: "2030-01-07",
      title: "Evening class",
      programId: program.id,
      roomId: room.id,
      coachWorkspaceUserId: coachId,
      coachAssignmentMode: "ASSIGNED",
      startTime: "18:00",
      endTime: "19:00",
      capacity: "20",
      bookingCutoffMinutes: "0",
      cancellationCutoffMinutes: "0",
      recurrence: "WEEKLY",
      weekdays: ["MONDAY"],
      endDate: "",
      reason: "Substitute",
    };
    await createFixtureCoachingBookingPolicy(db, workspace.id, owner.id, now);
  });
  afterEach(() => { vi.useRealTimers(); });
  afterAll(async () => {
    if (!db) return;
    for (const workspaceId of workspaces)
      await deleteFixtureCoachingWorkspace(db, workspaceId);
    await db.user.deleteMany({ where: { id: { in: users } } });
  }, 600000);
  const leaveInput = (overrides = {}) => ({
    requestId: randomUUID(),
    coachWorkspaceUserId: coachId,
    startsAt: "2030-01-07T17:00",
    endsAt: "2030-01-07T20:00",
    reason: "Annual leave",
    ...overrides,
  });
  const leave = (overrides = {}) =>
    api.createStaffLeave(actor, leaveInput(overrides), { db, now });
  async function saveClass(value = input) {
    const review = await reviewClassSchedule({ access, input: value, db, now });
    return commitClassSchedule({
      access,
      input: value,
      reviewToken: review.token,
      mutationId: randomUUID(),
      db,
      now,
    });
  }
  it("authorizes fresh active owners and exact gym staff; retries and withdrawal preserve audit", async () => {
    const data = leaveInput();
    await expect(
      api.createStaffLeave(coachActor, data, { db, now }),
    ).rejects.toThrow("Only an active gym owner");
    await expect(
      leave({ coachWorkspaceUserId: "foreign-coach" }),
    ).rejects.toThrow("active coach");
    const [a, b] = await Promise.all([
      api.createStaffLeave(actor, data, { db, now }),
      api.createStaffLeave(actor, data, { db, now }),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await db.staffTimeOff.count({
        where: { workspaceId: actor.workspaceId },
      }),
    ).toBe(1);
    await expect(
      api.createStaffLeave(
        actor,
        { ...data, reason: "Changed reason" },
        { db, now },
      ),
    ).rejects.toThrow("different leave details");
    await api.revokeStaffLeave(
      actor,
      { leaveId: a.id, reason: "Plans changed" },
      { db, now },
    );
    await api.revokeStaffLeave(
      actor,
      { leaveId: a.id, reason: "Plans changed" },
      { db, now },
    );
    expect(
      await db.staffTimeOff.findUnique({ where: { id: a.id } }),
    ).toMatchObject({
      reason: "Annual leave",
      revokedAt: now,
      revokedByUserId: actor.userId,
      revocationReason: "Plans changed",
    });
    await db.workspaceUser.update({
      where: { id: access.workspaceUserId },
      data: { isActive: false },
    });
    await expect(api.getStaffLeave(actor, db)).rejects.toThrow(
      "Only an active gym owner",
    );
  });
  it("checks the actual dated coach, protects bookings and allows reassignment before leave", async () => {
    expect((await saveClass()).status).toBe("saved");
    const booking = await db.classBooking.create({
      data: {
        workspaceId: actor.workspaceId,
        memberId,
        classTemplateId: input.templateId!,
        scheduledForDate: new Date(input.date),
        status: "BOOKED",
      },
    });
    await expect(leave()).rejects.toMatchObject({
      conflicts: [
        expect.objectContaining({ kind: "CLASS", label: "Evening class" }),
      ],
    });
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } }))
        .status,
    ).toBe("BOOKED");
    await api.createStaffLeave(
      actor,
      leaveInput({ coachWorkspaceUserId: access.workspaceUserId }),
      { db, now },
    );
    expect(
      (
        await saveClass({
          ...input,
          coachAssignmentMode: "UNASSIGNED",
          coachWorkspaceUserId: "",
        })
      ).status,
    ).toBe("saved");
    await leave();
    expect(
      (await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } }))
        .status,
    ).toBe("BOOKED");
  });
  it("blocks dated assignments, stale review saves, and far-future recurring changes", async () => {
    const reviewed = await reviewClassSchedule({ access, input, db, now });
    expect(reviewed.ok).toBe(true);
    await leave();
    expect(
      await commitClassSchedule({
        access,
        input,
        reviewToken: reviewed.token,
        mutationId: randomUUID(),
        db,
        now,
      }),
    ).toMatchObject({
      status: "error",
      message: expect.stringContaining("leave"),
    });
    await leave({ startsAt: "2045-06-05T17:00", endsAt: "2045-06-05T20:00" });
    const future = {
      ...input,
      scope: "future" as const,
      recurrence: "DAILY" as const,
    };
    const review = await reviewClassSchedule({
      access,
      input: future,
      db,
      now,
    });
    expect(
      review.errors.some(
        (message) =>
          message.includes("2045-06-05") && message.includes("leave"),
      ),
    ).toBe(true);
  });
  it("serializes leave against a competing dated assignment", async () => {
    const [leaveResult, classResult] = await Promise.allSettled([
      leave(),
      saveClass(),
    ]);
    const leaveSaved = leaveResult.status === "fulfilled",
      classSaved =
        classResult.status === "fulfilled" &&
        classResult.value.status === "saved";
    expect(Number(leaveSaved) + Number(classSaved)).toBe(1);
    const occurrence = await api.getClassOccurrence({
      workspaceId: actor.workspaceId,
      classTemplateId: input.templateId!,
      scheduledForDate: input.date,
      db,
    });
    expect(occurrence?.coachWorkspaceUserId === coachId && leaveSaved).toBe(
      false,
    );
  }, 15000);
  it("treats published availability and appointment buffers as conflicts without changing them", async () => {
    const slot = await db.coachingAvailability.create({
      data: {
        workspaceId: actor.workspaceId,
        coachWorkspaceUserId: coachId,
        startsAt: new Date("2030-01-08T10:00Z"),
        endsAt: new Date("2030-01-08T11:00Z"),
        bufferMinutes: 30,
        virtualUrl: "https://example.test/session",
      },
    });
    await expect(
      leave({ startsAt: "2030-01-08T09:00", endsAt: "2030-01-08T09:45" }),
    ).rejects.toMatchObject({
      conflicts: [expect.objectContaining({ kind: "AVAILABILITY" })],
    });
    expect(
      (
        await db.coachingAvailability.findUniqueOrThrow({
          where: { id: slot.id },
        })
      ).withdrawnAt,
    ).toBeNull();
    await leave({ startsAt: "2030-01-08T09:00", endsAt: "2030-01-08T09:30" });
    await db.coachingAvailability.update({
      where: { id: slot.id },
      data: { withdrawnAt: now },
    });
    const program = await db.coachingProgram.create({
      data: {
        workspaceId: actor.workspaceId,
        name: "Program",
        versions: {
          create: {
            number: 1,
            durationDays: 28,
            deliveryWeekdays: [1],
            responseHours: 48,
            goals: "Goal",
            milestones: [],
            priceCents: 0,
            currency: "cad",
            terms: "Terms",
            appointmentUnits: 2,
          },
        },
      },
      include: { versions: true },
    });
    const enrollment = await db.coachingEnrollment.create({
      data: {
        workspaceId: actor.workspaceId,
        memberId,
        programVersionId: program.versions[0]!.id,
        startsOn: now,
        endsOn: new Date("2030-01-31"),
        timezone: "UTC",
        currentCoachWorkspaceUserId: coachId,
        caseOwnerWorkspaceUserId: access.workspaceUserId,
        acceptedAt: now,
        contactVerifiedAt: now,
        paymentState: "PAID",
        assignments: {
          create: {
            coachWorkspaceUserId: coachId,
            acceptedAt: now,
            historyFromDate: now,
          },
        },
      },
    });
    const appointment = await db.coachingAppointment.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: enrollment.id,
        availabilityId: slot.id,
        coachWorkspaceUserId: coachId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        bufferMinutes: 30,
      },
    });
    await expect(
      leave({ startsAt: "2030-01-08T11:15", endsAt: "2030-01-08T12:00" }),
    ).rejects.toMatchObject({
      conflicts: [expect.objectContaining({ kind: "APPOINTMENT" })],
    });
    expect(
      await db.coachingAppointment.findUnique({
        where: { id: appointment.id },
      }),
    ).toMatchObject({ status: "BOOKED", unitState: "HELD" });
  });
  it("blocks publishing, booking and moving into leave including buffers; failed moves retain the original", async () => {
    await leave({ startsAt: "2030-01-08T09:00", endsAt: "2030-01-08T09:45" });
    await expect(
      api.runCoachingCommand(coachActor, {
        operationId: randomUUID(),
        kind: "createAvailability",
        input: {
          startsAt: "2030-01-08T10:00:00Z",
          endsAt: "2030-01-08T11:00:00Z",
          bufferMinutes: 30,
          virtualUrl: "https://example.test/session",
        },
      }),
    ).rejects.toThrow("on leave");
    const slot = await db.coachingAvailability.create({
      data: {
        workspaceId: actor.workspaceId,
        coachWorkspaceUserId: coachId,
        startsAt: new Date("2030-01-08T10:00Z"),
        endsAt: new Date("2030-01-08T11:00Z"),
        bufferMinutes: 30,
        virtualUrl: "https://example.test/session",
      },
    });
    const program = await db.coachingProgram.create({
      data: {
        workspaceId: actor.workspaceId,
        name: "Program",
        versions: {
          create: {
            number: 1,
            durationDays: 28,
            deliveryWeekdays: [1],
            responseHours: 48,
            goals: "Goal",
            milestones: [],
            priceCents: 0,
            currency: "cad",
            terms: "Terms",
            appointmentUnits: 2,
          },
        },
      },
      include: { versions: true },
    });
    const enrollment = await db.coachingEnrollment.create({
      data: {
        workspaceId: actor.workspaceId,
        memberId,
        programVersionId: program.versions[0]!.id,
        startsOn: now,
        endsOn: new Date("2030-01-31"),
        timezone: "UTC",
        currentCoachWorkspaceUserId: coachId,
        caseOwnerWorkspaceUserId: access.workspaceUserId,
        acceptedAt: now,
        contactVerifiedAt: now,
        paymentState: "PAID",
        assignments: {
          create: {
            coachWorkspaceUserId: coachId,
            acceptedAt: now,
            historyFromDate: now,
          },
        },
      },
    });
    await expect(
      api.runCoachingCommand(coachActor, {
        operationId: randomUUID(),
        kind: "bookAppointment",
        enrollmentId: enrollment.id,
        expectedVersion: 0,
        input: { availabilityId: slot.id },
      }),
    ).rejects.toThrow("on leave");
    const oldSlot = await db.coachingAvailability.create({
      data: {
        workspaceId: actor.workspaceId,
        coachWorkspaceUserId: coachId,
        startsAt: new Date("2030-01-09T10:00Z"),
        endsAt: new Date("2030-01-09T11:00Z"),
        virtualUrl: "https://example.test/session",
      },
    });
    const appointment = await db.coachingAppointment.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: enrollment.id,
        availabilityId: oldSlot.id,
        coachWorkspaceUserId: coachId,
        startsAt: oldSlot.startsAt,
        endsAt: oldSlot.endsAt,
      },
    });
    await expect(
      api.runCoachingCommand(coachActor, {
        operationId: randomUUID(),
        kind: "moveAppointment",
        enrollmentId: enrollment.id,
        expectedVersion: 0,
        input: {
          appointmentId: appointment.id,
          availabilityId: slot.id,
          reason: "Requested new time",
        },
      }),
    ).rejects.toThrow("on leave");
    expect(
      await db.coachingAppointment.findUnique({
        where: { id: appointment.id },
      }),
    ).toMatchObject({
      status: "BOOKED",
      unitState: "HELD",
      availabilityId: oldSlot.id,
    });
    expect(
      await db.coachingAppointment.count({
        where: { enrollmentId: enrollment.id },
      }),
    ).toBe(1);
  });
  it("uses gym-local times and rejects repeated or missing DST times", () => {
    expect(
      api
        .parseStaffLeaveTime("2030-01-07T09:00", "America/Los_Angeles")
        .toISOString(),
    ).toBe("2030-01-07T17:00:00.000Z");
    expect(() =>
      api.parseStaffLeaveTime("2030-03-10T02:30", "America/Los_Angeles"),
    ).toThrow("daylight saving");
    expect(() =>
      api.parseStaffLeaveTime("2030-11-03T01:30", "America/Los_Angeles"),
    ).toThrow("daylight saving");
  });
});
