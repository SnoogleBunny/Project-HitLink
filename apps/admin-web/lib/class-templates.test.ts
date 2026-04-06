import { describe, expect, it, vi } from "vitest";
import {
  archiveClassTemplate,
  createClassTemplate,
  formatMinutesAsTime,
  listWeeklyClassTemplates,
  parseTimeToMinutes,
  updateClassTemplate,
} from "./class-templates";

function buildInput(
  overrides: Partial<Parameters<typeof createClassTemplate>[0]["input"]> = {},
) {
  return {
    programId: "program_1",
    roomId: "room_1",
    coachWorkspaceUserId: "workspace_user_1",
    title: "  Evening Fundamentals  ",
    weekday: "MONDAY",
    startTime: "18:00",
    endTime: "19:00",
    capacityOverride: "20",
    bookingCutoffMinutes: "60",
    cancellationCutoffMinutes: "120",
    ...overrides,
  };
}

function createMockDb() {
  return {
    program: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: "program_1",
      }),
    },
    room: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: "room_1",
      }),
    },
    workspaceUser: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: "workspace_user_1",
      }),
    },
    classTemplate: {
      create: vi.fn().mockResolvedValue({
        id: "template_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  } as NonNullable<Parameters<typeof createClassTemplate>[0]["db"]>;
}

describe("class template helpers", () => {
  it("converts HH:MM into minute integers and formats minutes consistently", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(formatMinutesAsTime(570)).toBe("9:30 AM");
    expect(formatMinutesAsTime(18 * 60)).toBe("6:00 PM");
  });

  it("creates a class template with sanitized title and parsed minute fields", async () => {
    const db = createMockDb();
    const created = {
      data: null as Record<string, unknown> | null,
    };

    db.classTemplate.create = vi.fn(async ({ data }) => {
      created.data = data as Record<string, unknown>;

      return {
        id: "template_1",
      };
    });

    await expect(
      createClassTemplate({
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      templateId: "template_1",
    });

    expect(created.data).toEqual({
      workspaceId: "workspace_1",
      programId: "program_1",
      roomId: "room_1",
      coachWorkspaceUserId: "workspace_user_1",
      title: "Evening Fundamentals",
      weekday: "MONDAY",
      startTimeMinutes: 1080,
      endTimeMinutes: 1140,
      capacityOverride: 20,
      bookingCutoffMinutes: 60,
      cancellationCutoffMinutes: 120,
    });
  });

  it("stores a blank title as null", async () => {
    const db = createMockDb();
    const created = {
      data: null as Record<string, unknown> | null,
    };

    db.classTemplate.create = vi.fn(async ({ data }) => {
      created.data = data as Record<string, unknown>;

      return {
        id: "template_1",
      };
    });

    await createClassTemplate({
      workspaceId: "workspace_1",
      locationId: "location_1",
      input: buildInput({
        title: "   ",
        capacityOverride: "",
      }),
      db,
    });

    expect(created.data).toMatchObject({
      title: null,
      capacityOverride: null,
    });
  });

  it("rejects invalid time ordering", async () => {
    const db = createMockDb();

    await expect(
      createClassTemplate({
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput({
          startTime: "19:00",
          endTime: "18:00",
        }),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "End time must be later than start time.",
    });
  });

  it("rejects invalid capacity values", async () => {
    const db = createMockDb();

    await expect(
      createClassTemplate({
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput({
          capacityOverride: "0",
        }),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Capacity override must be a positive whole number.",
    });
  });

  it("rejects invalid cutoff values", async () => {
    const db = createMockDb();

    await expect(
      createClassTemplate({
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput({
          bookingCutoffMinutes: "-1",
        }),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Booking cutoff must be zero or a positive whole number.",
    });

    await expect(
      createClassTemplate({
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput({
          cancellationCutoffMinutes: "-5",
        }),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Cancellation cutoff must be zero or a positive whole number.",
    });
  });

  it("rejects archived or cross-workspace program selections", async () => {
    const db = createMockDb();
    db.program.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      createClassTemplate({
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Select an active program in this workspace.",
    });
  });

  it("rejects archived, inactive, or wrong-location rooms", async () => {
    const db = createMockDb();
    db.room.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      createClassTemplate({
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Select an active room in the primary location.",
    });
  });

  it("rejects inactive or wrong-role coach assignments", async () => {
    const db = createMockDb();
    db.workspaceUser.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      createClassTemplate({
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Select an active owner or coach.",
    });
  });

  it("does not update a template outside the current workspace", async () => {
    const db = createMockDb();
    db.classTemplate.updateMany = vi.fn().mockResolvedValue({
      count: 0,
    });

    await expect(
      updateClassTemplate({
        templateId: "template_2",
        workspaceId: "workspace_1",
        locationId: "location_1",
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Class template not found.",
    });

    expect(db.classTemplate.updateMany).toHaveBeenCalledWith({
      where: {
        id: "template_2",
        workspaceId: "workspace_1",
      },
      data: {
        programId: "program_1",
        roomId: "room_1",
        coachWorkspaceUserId: "workspace_user_1",
        title: "Evening Fundamentals",
        weekday: "MONDAY",
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        capacityOverride: 20,
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: 120,
      },
    });
  });

  it("does not archive a template outside the current workspace", async () => {
    const db = createMockDb();
    db.classTemplate.updateMany = vi.fn().mockResolvedValue({
      count: 0,
    });

    await expect(
      archiveClassTemplate({
        templateId: "template_2",
        workspaceId: "workspace_1",
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Class template not found.",
    });

    expect(db.classTemplate.updateMany).toHaveBeenCalledWith({
      where: {
        id: "template_2",
        workspaceId: "workspace_1",
      },
      data: {
        archivedAt: expect.any(Date),
      },
    });
  });

  it("still lists templates when the linked coach is now inactive", async () => {
    const db = createMockDb();
    db.classTemplate.findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "template_1",
          title: null,
          weekday: "MONDAY",
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          capacityOverride: null,
          bookingCutoffMinutes: 60,
          cancellationCutoffMinutes: 120,
          archivedAt: null,
          createdAt: new Date("2026-04-06T10:00:00.000Z"),
          updatedAt: new Date("2026-04-06T10:00:00.000Z"),
          program: {
            id: "program_1",
            name: "Fundamentals",
          },
          room: {
            id: "room_1",
            name: "Main Mat",
            capacity: 24,
          },
          coachWorkspaceUser: {
            id: "workspace_user_1",
            role: "COACH",
            isActive: false,
            user: {
              fullName: "Casey Coach",
              email: "coach@example.com",
            },
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await listWeeklyClassTemplates({
      workspaceId: "workspace_1",
      db,
    });
    const monday = result.days[0]!;
    const template = monday.templates[0]!;

    expect(monday.weekday).toBe("MONDAY");
    expect(monday.templates).toHaveLength(1);
    expect(template).toMatchObject({
      displayTitle: "Fundamentals",
      coachDisplayName: "Casey Coach",
      coachEmail: "coach@example.com",
      coachIsActive: false,
      roomName: "Main Mat",
      timeLabel: "6:00 PM - 7:00 PM",
    });
  });
});
