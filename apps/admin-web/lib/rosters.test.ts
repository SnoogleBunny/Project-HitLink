import { describe, expect, it, vi } from "vitest";
import { getClassRoster, listTodayClasses, recordAttendance } from "./rosters";

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
  return {
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
      }),
    },
    classTemplate: {
      findMany: vi.fn().mockResolvedValue([buildTemplateRecord()]),
      findFirst: vi.fn().mockResolvedValue(buildTemplateRecord()),
    },
    classBooking: {
      findMany: vi.fn().mockResolvedValue([buildBookingRecord()]),
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
}

describe("roster helpers", () => {
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

  it("lets owners open any roster and merges trials, guardian fallback, notes, tags, and attendance", async () => {
    const db = createMockDb();

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
