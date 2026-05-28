import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listOccurrenceWaitlistMock,
  promoteNextWaitlistEntryMock,
  removeWaitlistEntryMock,
} = vi.hoisted(() => ({
  listOccurrenceWaitlistMock: vi.fn(),
  promoteNextWaitlistEntryMock: vi.fn(),
  removeWaitlistEntryMock: vi.fn(),
}));

vi.mock("@flowstate/db", async () => {
  const actual = await vi.importActual<typeof import("@flowstate/db")>(
    "@flowstate/db",
  );

  return {
    ...actual,
    listOccurrenceWaitlist: listOccurrenceWaitlistMock,
    promoteNextWaitlistEntry: promoteNextWaitlistEntryMock,
    removeWaitlistEntry: removeWaitlistEntryMock,
  };
});

import {
  getClassRoster,
  listTodayClasses,
  promoteRosterWaitlist,
  recordAttendance,
  removeRosterWaitlist,
} from "./rosters";

type RosterTestDb = NonNullable<Parameters<typeof listTodayClasses>[0]["db"]>;

const access = {
  workspaceId: "workspace_1",
  workspaceUserId: "coach_workspace_user_1",
  role: "COACH" as const,
  timezone: "America/Vancouver",
};

function buildTemplateRecord() {
  return {
    id: "template_1",
    title: null,
    weekday: "TUESDAY" as const,
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    capacityOverride: null,
    coachWorkspaceUserId: "coach_workspace_user_1",
    program: {
      name: "Muay Thai Fundamentals",
    },
    room: {
      name: "Main Mat",
      capacity: 20,
    },
    coachWorkspaceUser: {
      id: "coach_workspace_user_1",
      role: "COACH" as const,
      isActive: true,
      user: {
        fullName: "Casey Coach",
        email: "coach@example.com",
      },
    },
  };
}

function buildBookingRecord() {
  return {
    id: "booking_1",
    memberId: "member_1",
    guardianId: null,
    bookingType: "TRIAL" as const,
    status: "BOOKED" as const,
    classTemplateId: "template_1",
    member: {
      id: "member_1",
      fullName: "Jordan Lee",
      email: "jordan@example.com",
      phone: "555-1234",
      status: "TRIAL",
      notes: "First class",
      tags: ["Trial", "Youth"],
      familyLinks: [
        {
          id: "family_link_1",
          relationshipLabel: "Parent",
          isPrimary: true,
          guardian: {
            id: "guardian_1",
            fullName: "Alex Lee",
            email: "alex@example.com",
            phone: null,
          },
        },
      ],
    },
    guardian: null,
  };
}

function createMockDb(): RosterTestDb {
  const db = {
    $transaction: vi.fn(async (callback) => callback(db)),
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
      }),
    },
    memberMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    memberPunchCard: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({
        count: 0,
      }),
    },
    dropInProduct: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    classTemplate: {
      findMany: vi.fn().mockResolvedValue([buildTemplateRecord()]),
      findFirst: vi.fn().mockResolvedValue(buildTemplateRecord()),
    },
    classBooking: {
      findMany: vi.fn().mockResolvedValue([buildBookingRecord()]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "booking_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "booking_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
      count: vi.fn().mockResolvedValue(1),
    },
    waitlistEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: "waitlist_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "waitlist_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    attendanceRecord: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "attendance_1",
          memberId: "member_1",
          classTemplateId: "template_1",
          state: "PRESENT",
          note: "Ready",
          updatedAt: new Date("2026-04-07T20:00:00.000Z"),
        },
      ]),
      upsert: vi.fn().mockResolvedValue({
        id: "attendance_1",
      }),
    },
  };

  return db;
}

describe("roster helpers", () => {
  beforeEach(() => {
    listOccurrenceWaitlistMock.mockReset();
    promoteNextWaitlistEntryMock.mockReset();
    removeWaitlistEntryMock.mockReset();
    listOccurrenceWaitlistMock.mockResolvedValue({
      entries: [],
    });
  });

  it("lists today's assigned coach classes with booking and attendance counts", async () => {
    const db = createMockDb();

    const result = await listTodayClasses({
      access,
      now: new Date("2026-04-08T00:30:00.000Z"),
      db,
    });

    expect(db.classTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          weekday: "TUESDAY",
          coachWorkspaceUserId: "coach_workspace_user_1",
        }),
      }),
    );
    expect(result[0]).toMatchObject({
      id: "template_1",
      scheduledForDate: "2026-04-07",
      rosterCount: 1,
      trialCount: 1,
      attendanceRecordedCount: 1,
    });
  });

  it("lets owners open any roster and shows the waitlist alongside roster rows", async () => {
    const db = createMockDb();
    listOccurrenceWaitlistMock.mockResolvedValue({
      entries: [
        {
          id: "waitlist_1",
          memberId: "member_2",
          memberName: "Riley Diaz",
          memberEmail: "riley@example.com",
          memberPhone: "555-0000",
          memberStatus: "ACTIVE",
          position: 1,
          joinedAt: new Date("2026-04-06T18:00:00.000Z"),
          promotedAt: null,
          promotedBookingId: null,
        },
      ],
    });

    const result = await getClassRoster({
      access: {
        ...access,
        role: "OWNER",
        workspaceUserId: "owner_workspace_user_1",
      },
      templateId: "template_1",
      scheduledForDate: "2026-04-07",
      now: new Date("2026-04-08T00:30:00.000Z"),
      db,
    });

    expect(db.classTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          coachWorkspaceUserId: expect.any(String),
        }),
      }),
    );
    expect(result?.rows[0]).toMatchObject({
      memberName: "Jordan Lee",
      bookingType: "TRIAL",
      guardianName: "Alex Lee",
      tags: ["Trial", "Youth"],
      notes: "First class",
      attendanceState: "PRESENT",
      attendanceNote: "Ready",
    });
    expect(result?.waitlist).toEqual([
      expect.objectContaining({
        id: "waitlist_1",
        memberName: "Riley Diaz",
        position: 1,
      }),
    ]);
  });

  it("records attendance and syncs the matching active booking status", async () => {
    const db = createMockDb();

    await expect(
      recordAttendance({
        access,
        memberId: "member_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-07",
        state: "LATE",
        note: "Arrived during warmup",
        now: new Date("2026-04-08T00:30:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "recorded",
      attendanceRecordId: "attendance_1",
    });

    expect(db.attendanceRecord.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_memberId_classTemplateId_scheduledForDate: {
          workspaceId: "workspace_1",
          memberId: "member_1",
          classTemplateId: "template_1",
          scheduledForDate: new Date("2026-04-07T00:00:00.000Z"),
        },
      },
      update: {
        state: "LATE",
        note: "Arrived during warmup",
        coachWorkspaceUserId: "coach_workspace_user_1",
      },
      create: {
        workspaceId: "workspace_1",
        memberId: "member_1",
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-07T00:00:00.000Z"),
        state: "LATE",
        note: "Arrived during warmup",
        coachWorkspaceUserId: "coach_workspace_user_1",
      },
      select: {
        id: true,
      },
    });
    expect(db.classBooking.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        memberId: "member_1",
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-07T00:00:00.000Z"),
        status: {
          not: "CANCELLED",
        },
      },
      data: {
        status: "ATTENDED",
      },
    });
  });

  it("delegates waitlist promotion and removal through the shared helpers", async () => {
    const db = createMockDb();
    promoteNextWaitlistEntryMock.mockResolvedValue({
      status: "promoted",
      bookingId: "booking_2",
      waitlistEntryId: "waitlist_1",
    });
    removeWaitlistEntryMock.mockResolvedValue({
      status: "removed",
      waitlistEntryId: "waitlist_1",
    });

    await expect(
      promoteRosterWaitlist({
        access,
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-07",
        db,
        now: new Date("2026-04-06T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "promoted",
      bookingId: "booking_2",
      waitlistEntryId: "waitlist_1",
    });
    expect(promoteNextWaitlistEntryMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      classTemplateId: "template_1",
      scheduledForDate: "2026-04-07",
      timezone: "America/Vancouver",
      source: "ADMIN",
      db,
      now: new Date("2026-04-06T12:00:00.000Z"),
    });

    await expect(
      removeRosterWaitlist({
        access,
        waitlistEntryId: "waitlist_1",
        db,
      }),
    ).resolves.toEqual({
      status: "removed",
      waitlistEntryId: "waitlist_1",
    });
    expect(removeWaitlistEntryMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      waitlistEntryId: "waitlist_1",
      db,
    });
  });

  it("rejects future attendance and unassigned coach rosters", async () => {
    const db = createMockDb();

    await expect(
      recordAttendance({
        access,
        memberId: "member_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
        state: "PRESENT",
        now: new Date("2026-04-08T00:30:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Attendance can only be recorded for today or a past class date.",
    });
    expect(db.attendanceRecord.upsert).not.toHaveBeenCalled();

    db.classTemplate.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      recordAttendance({
        access,
        memberId: "member_1",
        classTemplateId: "template_foreign",
        scheduledForDate: "2026-04-07",
        state: "PRESENT",
        now: new Date("2026-04-08T00:30:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Class roster not found.",
    });
  });
});
