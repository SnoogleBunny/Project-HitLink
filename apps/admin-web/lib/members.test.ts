import { describe, expect, it, vi } from "vitest";
import {
  addGuardianToMember,
  createMember,
  getMemberProfile,
  listMembers,
  updateMember,
} from "./members";

type MemberTestDb = NonNullable<Parameters<typeof createMember>[0]["db"]>;

function buildTrialBookingRecord() {
  return {
    id: "booking_1",
    scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
    createdAt: new Date("2026-04-07T10:00:00.000Z"),
    status: "BOOKED" as const,
    classTemplate: {
      id: "template_1",
      title: null,
      weekday: "TUESDAY" as const,
      startTimeMinutes: 18 * 60,
      program: {
        name: "Muay Thai Fundamentals",
      },
    },
  };
}

function buildAttendanceRecord() {
  return {
    id: "attendance_1",
    scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
    state: "PRESENT" as const,
    note: "Strong first class",
    updatedAt: new Date("2026-04-14T20:00:00.000Z"),
    classTemplate: {
      id: "template_1",
      title: null,
      weekday: "TUESDAY" as const,
      startTimeMinutes: 18 * 60,
      program: {
        name: "Muay Thai Fundamentals",
      },
    },
  };
}

function buildMemberRecord() {
  return {
    id: "member_1",
    fullName: "Jordan Lee",
    email: "jordan@example.com",
    phone: "555-1234",
    dateOfBirth: new Date("2010-02-03T00:00:00.000Z"),
    status: "TRIAL" as const,
    notes: "First trial",
    tags: ["Youth", "Trial"],
    createdAt: new Date("2026-04-07T09:00:00.000Z"),
    updatedAt: new Date("2026-04-07T09:30:00.000Z"),
    familyLinks: [
      {
        id: "family_link_1",
        relationshipLabel: "Parent",
        isPrimary: true,
        guardian: {
          id: "guardian_1",
          fullName: "Alex Lee",
          email: "alex@example.com",
          phone: "555-5678",
          notes: "Primary contact",
        },
      },
    ],
    classBookings: [buildTrialBookingRecord()],
    attendanceRecords: [buildAttendanceRecord()],
  };
}

function createMockDb(): MemberTestDb {
  return {
    member: {
      create: vi.fn().mockResolvedValue({
        id: "member_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    guardian: {
      create: vi.fn().mockResolvedValue({
        id: "guardian_1",
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: "guardian_1",
      }),
    },
    familyLink: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({
        id: "family_link_1",
      }),
    },
  };
}

describe("member helpers", () => {
  it("creates a member with sanitized fields, tags, and status", async () => {
    const db = createMockDb();
    const created = {
      data: null as Record<string, unknown> | null,
    };

    db.member.create = vi.fn(async ({ data }) => {
      created.data = data as Record<string, unknown>;

      return {
        id: "member_1",
      };
    });

    await expect(
      createMember({
        workspaceId: "workspace_1",
        now: new Date("2026-04-07T10:00:00.000Z"),
        input: {
          fullName: "  Jordan Lee  ",
          email: "  Jordan@Example.com  ",
          phone: "  555-1234  ",
          dateOfBirth: "2010-02-03",
          status: "TRIAL",
          tags: " Youth, Trial, youth, Beginner ",
          notes: "  First trial  ",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      memberId: "member_1",
    });

    expect(created.data).toEqual({
      workspaceId: "workspace_1",
      fullName: "Jordan Lee",
      email: "jordan@example.com",
      phone: "555-1234",
      dateOfBirth: new Date("2010-02-03T00:00:00.000Z"),
      status: "TRIAL",
      notes: "First trial",
      tags: ["Youth", "Trial", "Beginner"],
    });
  });

  it("rejects invalid member inputs", async () => {
    const db = createMockDb();
    const baseInput = {
      fullName: "Jordan Lee",
      email: "jordan@example.com",
      phone: "",
      dateOfBirth: "",
      status: "TRIAL",
      notes: "",
      tags: "",
    };

    await expect(
      createMember({
        workspaceId: "workspace_1",
        input: {
          ...baseInput,
          email: "not-an-email",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Enter a valid email address.",
    });

    await expect(
      createMember({
        workspaceId: "workspace_1",
        now: new Date("2026-04-07T10:00:00.000Z"),
        input: {
          ...baseInput,
          dateOfBirth: "2027-01-01",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Enter a valid date of birth that is not in the future.",
    });

    await expect(
      createMember({
        workspaceId: "workspace_1",
        input: {
          ...baseInput,
          status: "UNKNOWN",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Select a valid member status.",
    });
  });

  it("scopes member updates by workspace", async () => {
    const db = createMockDb();
    db.member.updateMany = vi.fn().mockResolvedValue({
      count: 0,
    });

    await expect(
      updateMember({
        workspaceId: "workspace_1",
        memberId: "member_foreign",
        input: {
          fullName: "Jordan Lee",
          status: "ACTIVE",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Member not found.",
    });

    expect(db.member.updateMany).toHaveBeenCalledWith({
      where: {
        id: "member_foreign",
        workspaceId: "workspace_1",
      },
      data: expect.objectContaining({
        fullName: "Jordan Lee",
        status: "ACTIVE",
      }),
    });
  });

  it("syncs linked member users only when the email remains unique", async () => {
    const db = createMockDb();
    db.member.findFirst = vi.fn().mockResolvedValue({
      id: "member_1",
      userId: "user_1",
      user: {
        id: "user_1",
        email: "jordan@example.com",
      },
    });

    await expect(
      updateMember({
        workspaceId: "workspace_1",
        memberId: "member_1",
        input: {
          fullName: "Jordan Lee",
          email: "jordan@example.com",
          status: "ACTIVE",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "updated",
      memberId: "member_1",
    });
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user_1",
      },
      data: {
        email: "jordan@example.com",
        fullName: "Jordan Lee",
      },
    });

    db.user.findUnique = vi.fn().mockResolvedValue({
      id: "user_other",
    });

    await expect(
      updateMember({
        workspaceId: "workspace_1",
        memberId: "member_1",
        input: {
          fullName: "Jordan Lee",
          email: "taken@example.com",
          status: "ACTIVE",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "That email already belongs to another user.",
    });
  });

  it("lists and searches members inside the workspace", async () => {
    const db = createMockDb();
    db.member.findMany = vi.fn().mockResolvedValue([buildMemberRecord()]);

    const result = await listMembers({
      workspaceId: "workspace_1",
      query: "jordan",
      db,
    });

    expect(db.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          OR: expect.any(Array),
        }),
        take: 100,
      }),
    );
    expect(result[0]).toMatchObject({
      id: "member_1",
      fullName: "Jordan Lee",
      guardians: [
        {
          guardianId: "guardian_1",
          fullName: "Alex Lee",
          isPrimary: true,
        },
      ],
      latestTrialBooking: {
        id: "booking_1",
        classTitle: "Muay Thai Fundamentals",
      },
    });
  });

  it("gets a profile only inside the workspace and includes guardians, trials, and attendance", async () => {
    const db = createMockDb();
    db.member.findFirst = vi.fn().mockResolvedValue(buildMemberRecord());

    const result = await getMemberProfile({
      workspaceId: "workspace_1",
      memberId: "member_1",
      db,
    });

    expect(db.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "member_1",
          workspaceId: "workspace_1",
        },
      }),
    );
    expect(result?.trialBookings).toHaveLength(1);
    expect(result?.attendanceRecords).toMatchObject([
      {
        id: "attendance_1",
        state: "PRESENT",
        classTitle: "Muay Thai Fundamentals",
      },
    ]);
    expect(result?.guardians[0]?.fullName).toBe("Alex Lee");
  });

  it("adds a guardian link after member and guardian workspace checks", async () => {
    const db = createMockDb();

    await expect(
      addGuardianToMember({
        workspaceId: "workspace_1",
        memberId: "member_1",
        input: {
          fullName: "  Alex Lee  ",
          email: " Alex@Example.com ",
          phone: " 555-5678 ",
          relationshipLabel: " Parent ",
          isPrimary: true,
          notes: " Primary contact ",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      familyLinkId: "family_link_1",
    });

    expect(db.member.findFirst).toHaveBeenCalledWith({
      where: {
        id: "member_1",
        workspaceId: "workspace_1",
      },
      select: {
        id: true,
      },
    });
    expect(db.guardian.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        fullName: "Alex Lee",
        email: "alex@example.com",
        phone: "555-5678",
        notes: "Primary contact",
      },
      select: {
        id: true,
      },
    });
    expect(db.familyLink.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        guardianId: "guardian_1",
        childMemberId: "member_1",
        relationshipLabel: "Parent",
        isPrimary: true,
      },
      select: {
        id: true,
      },
    });
  });

  it("blocks a third guardian for a child member", async () => {
    const db = createMockDb();
    db.familyLink.count = vi.fn().mockResolvedValue(2);

    await expect(
      addGuardianToMember({
        workspaceId: "workspace_1",
        memberId: "member_1",
        input: {
          fullName: "Alex Lee",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "A child member can have up to two guardians in this slice.",
    });

    expect(db.guardian.create).not.toHaveBeenCalled();
    expect(db.familyLink.create).not.toHaveBeenCalled();
  });

  it("rejects linking an existing guardian outside the workspace", async () => {
    const db = createMockDb();
    db.guardian.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      addGuardianToMember({
        workspaceId: "workspace_1",
        memberId: "member_1",
        input: {
          guardianId: "guardian_foreign",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Guardian not found.",
    });

    expect(db.guardian.findFirst).toHaveBeenCalledWith({
      where: {
        id: "guardian_foreign",
        workspaceId: "workspace_1",
      },
      select: {
        id: true,
      },
    });
    expect(db.familyLink.create).not.toHaveBeenCalled();
  });
});
