import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeClassRoster,
  getClassRoster,
  recordAttendance,
  type RosterAccessContext,
} from "./rosters";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (
  databaseUrl &&
  (!["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
    !/test|e2e/i.test(new URL(databaseUrl).pathname))
)
  throw new Error(
    "Attendance integration requires an explicit disposable local test database.",
  );
const suite = databaseUrl ? describe : describe.skip;
suite("transactional attendance history and roster closure", () => {
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  let workspaceId: string,
    templateId: string,
    ownerId: string,
    planId: string,
    locationId: string;
  let access: RosterAccessContext;
  let users: string[] = [];
  const date = "2026-10-26",
    afterClass = new Date("2026-10-26T12:00:00Z");
  const acceptedTerms = {
    version: 1,
    monthlyPriceCents: 10000,
    currency: "cad",
    weeklyClassLimit: 2,
    monthlyClassLimit: null,
    allowanceCountingMode: "ATTENDANCE",
    lateCancellationConsumesClass: true,
    noShowConsumesClass: true,
    programIds: [],
    cancellationPolicyReference: null,
    freezePolicyReference: null,
    capturedAt: "2026-01-01T00:00:00Z",
  };
  beforeEach(async () => {
    workspaceId = "";
    users = [];
    const workspace = await db.workspace.create({
      data: { name: `attendance-${randomUUID()}`, status: "ACTIVE" },
    });
    workspaceId = workspace.id;
    const location = await db.location.create({
      data: { workspaceId, name: "Fictional gym", timezone: "UTC" },
    });
    locationId = location.id;
    const owner = await db.user.create({
      data: {
        email: `${randomUUID()}@attendance.example.test`,
        fullName: "Fictional roster owner",
      },
    });
    ownerId = owner.id;
    users.push(owner.id);
    const staff = await db.workspaceUser.create({
      data: { workspaceId, userId: owner.id, role: "OWNER" },
    });
    access = {
      workspaceId,
      workspaceUserId: staff.id,
      role: "OWNER",
      timezone: "UTC",
    };
    const program = await db.program.create({
      data: { workspaceId, name: "Fictional martial arts" },
    });
    const room = await db.room.create({
      data: { locationId, name: "Fictional mat", capacity: 20 },
    });
    const template = await db.classTemplate.create({
      data: {
        workspaceId,
        programId: program.id,
        roomId: room.id,
        coachWorkspaceUserId: staff.id,
        title: "Attendance class",
        weekday: "MONDAY",
        startTimeMinutes: 600,
        endTimeMinutes: 660,
        capacityOverride: 10,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
      },
    });
    templateId = template.id;
    planId = (
      await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Weekly two",
          monthlyPriceCents: 10000,
          currency: "cad",
          weeklyClassLimit: 2,
        },
      })
    ).id;
  });
  afterEach(async () => {
    if (!workspaceId) return;
    await db.attendanceRecord.deleteMany({ where: { workspaceId } });
    await db.waitlistEntry.deleteMany({ where: { workspaceId } });
    await db.classBooking.deleteMany({ where: { workspaceId } });
    await db.classInstance.deleteMany({ where: { workspaceId } });
    await db.classTemplate.deleteMany({ where: { workspaceId } });
    await db.memberMembership.deleteMany({ where: { workspaceId } });
    // Only the controlled parent deletion may cascade this fixture's immutable
    // attendance history; direct event/operation deletion is intentionally denied.
    await db.workspace.delete({ where: { id: workspaceId } });
    expect(await db.attendanceEvent.count({ where: { workspaceId } })).toBe(0);
    expect(await db.attendanceOperation.count({ where: { workspaceId } })).toBe(
      0,
    );
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(() => db.$disconnect());
  async function participant(name = "Fictional participant", classDate = date) {
    const member = await db.member.create({
      data: {
        workspaceId,
        fullName: name,
        status: "ACTIVE",
        dateOfBirth: new Date("1990-01-01T00:00:00Z"),
        tags: ["Eligible"],
      },
    });
    const membership = await db.memberMembership.create({
      data: {
        workspaceId,
        memberId: member.id,
        membershipPlanId: planId,
        status: "ACTIVE",
        startedAt: new Date("2026-01-01T00:00:00Z"),
        allowanceAnchorDate: new Date("2026-01-01T00:00:00Z"),
        allowanceTimezone: "UTC",
        acceptedTerms,
      },
    });
    const booking = await db.classBooking.create({
      data: {
        workspaceId,
        memberId: member.id,
        classTemplateId: templateId,
        scheduledForDate: new Date(`${classDate}T00:00:00Z`),
        status: "BOOKED",
        fundingMembershipId: membership.id,
        acceptedPolicy: acceptedTerms,
      },
    });
    const periodStart = new Date(`${classDate}T00:00:00Z`),
      periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 7);
    const allocation = await db.membershipAllowanceAllocation.create({
      data: {
        workspaceId,
        memberId: member.id,
        memberMembershipId: membership.id,
        bookingId: booking.id,
        kind: "WEEK",
        periodStart,
        periodEnd,
        limit: 2,
        entries: {
          create: {
            workspaceId,
            revision: 1,
            reservedDelta: 1,
            usedDelta: 0,
            reason: "Fictional confirmed booking",
          },
        },
      },
    });
    return { member, booking, allocation, classDate };
  }
  const command = (
    person: Awaited<ReturnType<typeof participant>>,
    more: Partial<Parameters<typeof recordAttendance>[0]> = {},
  ) => ({
    access,
    memberId: person.member.id,
    classTemplateId: templateId,
    scheduledForDate: person.classDate,
    state: "PRESENT",
    expectedVersion: "UNRECORDED",
    requestKey: randomUUID(),
    now: afterClass,
    db: db as never,
    ...more,
  });

  it("rejects a same-day no-show and closure until the historical occurrence ends", async () => {
    const person = await participant();
    await db.workspaceTimezoneRevision.create({
      data: {
        workspaceId,
        version: 1,
        previousTimezone: "UTC",
        timezone: "Asia/Tokyo",
        effectiveFromDate: new Date("2026-11-02T00:00:00Z"),
        effectiveAt: new Date("2026-11-01T15:00:00Z"),
        actorUserId: ownerId,
        previewHash: "a".repeat(64),
      },
    });
    const context = { ...access, timezone: "Asia/Tokyo" },
      now = new Date("2026-10-26T10:30:00Z");
    expect(
      await recordAttendance(
        command(person, { access: context, state: "NO_SHOW", now }),
      ),
    ).toMatchObject({
      status: "error",
      message: expect.stringContaining("ended"),
    });
    expect(
      await closeClassRoster({
        access: context,
        classTemplateId: templateId,
        scheduledForDate: date,
        requestKey: randomUUID(),
        db: db as never,
        now,
      }),
    ).toMatchObject({
      status: "error",
      message: expect.stringContaining("ended"),
    });
    const roster = await getClassRoster({
      access: context,
      templateId,
      scheduledForDate: date,
      db: db as never,
      now,
    });
    expect(roster).toMatchObject({
      occurrenceTimezone: "UTC",
      noShowCutoffAt: "2026-10-26T11:00:00.000Z",
      canClose: false,
    });
    expect(await db.attendanceRecord.count({ where: { workspaceId } })).toBe(0);
    expect(await db.attendanceOperation.count({ where: { workspaceId } })).toBe(
      0,
    );
    expect(
      (
        await db.membershipAllowanceAllocation.findUniqueOrThrow({
          where: { id: person.allocation.id },
        })
      ).state,
    ).toBe("RESERVED");
  });

  it("preserves actor, prior state/note and reason while exact replay cannot overwrite a later correction", async () => {
    const person = await participant(),
      first = command(person, { note: "Initially checked in" });
    expect((await recordAttendance(first)).status).toBe("recorded");
    const original = await db.attendanceRecord.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(
      await recordAttendance(
        command(person, {
          state: "ABSENT",
          expectedVersion: original.updatedAt.toISOString(),
        }),
      ),
    ).toMatchObject({
      status: "error",
      message: expect.stringContaining("reason"),
    });
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@attendance.example.test`,
        fullName: "Correction reviewer",
      },
    });
    users.push(user.id);
    const reviewer = await db.workspaceUser.create({
      data: { workspaceId, userId: user.id, role: "OWNER" },
    });
    const corrected = command(person, {
      access: { ...access, workspaceUserId: reviewer.id },
      state: "ABSENT",
      note: "Excused",
      reason: "Original check-in belonged to the wrong person",
      expectedVersion: original.updatedAt.toISOString(),
    });
    expect((await recordAttendance(corrected)).status).toBe("recorded");
    expect((await recordAttendance(first)).status).toBe("recorded");
    expect(await recordAttendance({ ...first, state: "LATE" })).toMatchObject({
      status: "error",
      message: expect.stringContaining("different details"),
    });
    expect(
      await db.attendanceRecord.findUniqueOrThrow({
        where: { id: original.id },
      }),
    ).toMatchObject({
      state: "ABSENT",
      note: "Excused",
      coachWorkspaceUserId: access.workspaceUserId,
    });
    expect(
      await db.attendanceEvent.findMany({
        where: { workspaceId },
        orderBy: { previousState: "asc" },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorWorkspaceUserId: reviewer.id,
          actorNameSnapshot: "Correction reviewer",
          actorRole: "OWNER",
          previousState: "PRESENT",
          state: "ABSENT",
          previousNote: "Initially checked in",
          note: "Excused",
          reason: corrected.reason,
          bookingId: person.booking.id,
        }),
      ]),
    );
    expect(await db.attendanceEvent.count({ where: { workspaceId } })).toBe(2);
    expect(await db.attendanceOperation.count({ where: { workspaceId } })).toBe(
      2,
    );
    const entries = await db.membershipAllowanceEntry.findMany({
      where: { allocationId: person.allocation.id },
      orderBy: { revision: "asc" },
    });
    expect(
      entries.map((entry) => [entry.reservedDelta, entry.usedDelta]),
    ).toEqual([
      [1, 0],
      [-1, 1],
      [0, -1],
    ]);
  });

  it("rejects stale correction versions and no-show to present never restores an extra historical use", async () => {
    const person = await participant("Historical participant", "2026-10-19");
    expect(
      (await recordAttendance(command(person, { state: "NO_SHOW" }))).status,
    ).toBe("recorded");
    const original = await db.attendanceRecord.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(
      (
        await recordAttendance(
          command(person, {
            state: "PRESENT",
            expectedVersion: original.updatedAt.toISOString(),
            reason: "Teacher confirmed attendance",
          }),
        )
      ).status,
    ).toBe("recorded");
    const corrected = await db.attendanceRecord.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(corrected.updatedAt.getTime()).toBeGreaterThan(
      original.updatedAt.getTime(),
    );
    expect(
      await recordAttendance(
        command(person, {
          state: "ABSENT",
          expectedVersion: original.updatedAt.toISOString(),
          reason: "Stale tab",
        }),
      ),
    ).toMatchObject({
      status: "error",
      message: expect.stringContaining("changed while"),
    });
    expect(
      await db.membershipAllowanceAllocation.findUniqueOrThrow({
        where: { id: person.allocation.id },
      }),
    ).toMatchObject({
      state: "USED",
      periodStart: new Date("2026-10-19T00:00:00Z"),
      periodEnd: new Date("2026-10-26T00:00:00Z"),
    });
    expect(
      await db.membershipAllowanceAllocation.count({ where: { workspaceId } }),
    ).toBe(1);
    expect(
      await db.membershipAllowanceEntry.count({
        where: { allocationId: person.allocation.id },
      }),
    ).toBe(2);
    expect(await db.attendanceEvent.count({ where: { workspaceId } })).toBe(2);
  });

  it("bulk close preserves explicit states and waitlists and leaves ineligible participants for review", async () => {
    const present = await participant("Already present"),
      unresolved = await participant("Unresolved eligible"),
      ineligible = await participant("Eligibility needs review");
    expect((await recordAttendance(command(present))).status).toBe("recorded");
    await db.classTemplate.update({
      where: { id: templateId },
      data: { prerequisites: { cohortTag: "Eligible" } },
    });
    await db.member.update({
      where: { id: ineligible.member.id },
      data: { tags: [] },
    });
    const waiting = await db.member.create({
      data: { workspaceId, fullName: "Waitlisted only", status: "ACTIVE" },
    });
    await db.waitlistEntry.create({
      data: {
        workspaceId,
        memberId: waiting.id,
        classTemplateId: templateId,
        scheduledForDate: new Date(`${date}T00:00:00Z`),
      },
    });
    const args = {
      access,
      classTemplateId: templateId,
      scheduledForDate: date,
      requestKey: randomUUID(),
      db: db as never,
      now: afterClass,
    };
    expect(await closeClassRoster(args)).toMatchObject({
      status: "closed",
      closedCount: 1,
      skipped: [
        {
          memberId: ineligible.member.id,
          reason: expect.stringContaining("Eligible"),
        },
      ],
    });
    expect(await closeClassRoster(args)).toMatchObject({
      status: "closed",
      closedCount: 1,
    });
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: present.booking.id },
        })
      ).status,
    ).toBe("ATTENDED");
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: unresolved.booking.id },
        })
      ).status,
    ).toBe("NO_SHOW");
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: ineligible.booking.id },
        })
      ).status,
    ).toBe("BOOKED");
    expect(
      await db.attendanceRecord.count({
        where: { workspaceId, memberId: waiting.id },
      }),
    ).toBe(0);
    expect(
      await db.waitlistEntry.count({
        where: { workspaceId, status: "ACTIVE" },
      }),
    ).toBe(1);
    expect(await db.attendanceEvent.count({ where: { workspaceId } })).toBe(2);
    expect(
      await db.membershipAllowanceEntry.count({
        where: { allocationId: unresolved.allocation.id },
      }),
    ).toBe(2);
  });

  it("persists an empty close request so replay cannot penalize a participant added afterward", async () => {
    const args = {
      access,
      classTemplateId: templateId,
      scheduledForDate: date,
      requestKey: randomUUID(),
      db: db as never,
      now: afterClass,
    };
    expect(await closeClassRoster(args)).toEqual({
      status: "closed",
      closedCount: 0,
      skipped: [],
    });
    const later = await participant();
    expect(await closeClassRoster(args)).toEqual({
      status: "closed",
      closedCount: 0,
      skipped: [],
    });
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: later.booking.id },
        })
      ).status,
    ).toBe("BOOKED");
    expect(await db.attendanceEvent.count({ where: { workspaceId } })).toBe(0);
    expect(
      await closeClassRoster({ ...args, reason: "A different command" }),
    ).toMatchObject({
      status: "error",
      message: expect.stringContaining("different details"),
    });
  });

  it("concurrent duplicate requests commit one attendance, event and funding settlement", async () => {
    const person = await participant(),
      args = command(person);
    const results = await Promise.all([
      recordAttendance(args),
      recordAttendance(args),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "recorded",
      "recorded",
    ]);
    expect(await db.attendanceRecord.count({ where: { workspaceId } })).toBe(1);
    expect(await db.attendanceEvent.count({ where: { workspaceId } })).toBe(1);
    expect(await db.attendanceOperation.count({ where: { workspaceId } })).toBe(
      1,
    );
    expect(
      await db.membershipAllowanceEntry.count({
        where: { allocationId: person.allocation.id },
      }),
    ).toBe(2);
  });

  it("fresh role and activation checks defeat cached owner access", async () => {
    const person = await participant();
    await db.classTemplate.update({
      where: { id: templateId },
      data: { coachWorkspaceUserId: null },
    });
    await db.workspaceUser.update({
      where: { id: access.workspaceUserId },
      data: { role: "COACH" },
    });
    expect(await recordAttendance(command(person))).toMatchObject({
      status: "error",
      message: expect.stringContaining("access"),
    });
    await db.workspaceUser.update({
      where: { id: access.workspaceUserId },
      data: { role: "OWNER", isActive: false },
    });
    expect(await recordAttendance(command(person))).toMatchObject({
      status: "error",
      message: expect.stringContaining("access"),
    });
    expect(await db.attendanceRecord.count({ where: { workspaceId } })).toBe(0);
    expect(await db.attendanceOperation.count({ where: { workspaceId } })).toBe(
      0,
    );
  });

  it("audit failure rolls attendance, booking and allowance back; history rejects direct edits and deletion", async () => {
    const person = await participant();
    const failing = {
      $transaction: <T>(callback: (tx: unknown) => Promise<T>) =>
        db.$transaction((tx) =>
          callback({
            ...tx,
            attendanceEvent: {
              ...tx.attendanceEvent,
              createMany: async () => {
                throw new Error("Fictional audit storage failure");
              },
            },
          }),
        ),
    };
    await expect(
      recordAttendance(command(person, { db: failing as never })),
    ).rejects.toThrow("Fictional audit storage failure");
    expect(await db.attendanceRecord.count({ where: { workspaceId } })).toBe(0);
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: person.booking.id },
        })
      ).status,
    ).toBe("BOOKED");
    expect(
      (
        await db.membershipAllowanceAllocation.findUniqueOrThrow({
          where: { id: person.allocation.id },
        })
      ).state,
    ).toBe("RESERVED");
    expect(
      await db.membershipAllowanceEntry.count({
        where: { allocationId: person.allocation.id },
      }),
    ).toBe(1);
    expect(await db.attendanceOperation.count({ where: { workspaceId } })).toBe(
      0,
    );
    expect((await recordAttendance(command(person))).status).toBe("recorded");
    const event = await db.attendanceEvent.findFirstOrThrow({
      where: { workspaceId },
    });
    await expect(
      db.attendanceEvent.update({
        where: { id: event.id },
        data: { reason: "Overwrite" },
      }),
    ).rejects.toThrow();
    await expect(
      db.attendanceEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow();
    await expect(
      db.attendanceOperation.delete({ where: { id: event.operationId } }),
    ).rejects.toThrow();
    expect(await db.attendanceEvent.count({ where: { workspaceId } })).toBe(1);
  });
});
