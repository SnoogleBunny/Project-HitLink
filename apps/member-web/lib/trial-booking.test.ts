import { describe, expect, it, vi } from "vitest";
import {
  buildTrialBookingDateOptions,
  createTrialBooking,
  findTrialBookingDateOption,
  listTrialBookingOptions,
} from "./trial-booking";

type TrialBookingTestDb = NonNullable<
  Parameters<typeof createTrialBooking>[0]["db"]
>;

function buildTemplateForDates() {
  return {
    id: "template_1",
    displayTitle: "Muay Thai Fundamentals",
    weekday: "TUESDAY" as const,
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    programName: "Muay Thai",
    roomName: "Main Mat",
    coachDisplayName: "Casey Coach",
  };
}

function buildTemplateRecord() {
  return {
    id: "template_1",
    title: null,
    weekday: "TUESDAY" as const,
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    program: {
      name: "Muay Thai Fundamentals",
    },
    room: {
      name: "Main Mat",
    },
    coachWorkspaceUser: {
      user: {
        fullName: "Casey Coach",
        email: "coach@example.com",
      },
    },
  };
}

function createMockDb(): TrialBookingTestDb {
  const db = {
    workspace: {
      findFirst: vi.fn().mockResolvedValue({
        id: "workspace_1",
        name: "HitLink Gym",
        status: "ACTIVE",
        location: {
          id: "location_1",
          timezone: "America/Vancouver",
        },
      }),
    },
    classTemplate: {
      findMany: vi.fn().mockResolvedValue([buildTemplateRecord()]),
    },
    member: {
      create: vi.fn().mockResolvedValue({
        id: "member_1",
      }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    guardian: {
      create: vi.fn().mockResolvedValue({
        id: "guardian_1",
      }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    familyLink: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({
        id: "family_link_1",
      }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    classBooking: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "booking_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "booking_1",
      }),
    },
    $transaction: vi.fn(async (callback) => callback(db)),
  };

  return db;
}

describe("trial booking date helpers", () => {
  it("generates the next 4 upcoming dates for a template", () => {
    const result = buildTrialBookingDateOptions({
      templates: [buildTemplateForDates()],
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:30:00.000Z"),
    });

    expect(result[0]?.dateOptions.map((option) => option.scheduledForDate)).toEqual([
      "2026-04-07",
      "2026-04-14",
      "2026-04-21",
      "2026-04-28",
    ]);
  });

  it("uses the workspace-local date for today/future options", () => {
    const result = buildTrialBookingDateOptions({
      templates: [buildTemplateForDates()],
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T02:00:00.000Z"),
    });

    expect(result[0]?.dateOptions[0]?.scheduledForDate).toBe("2026-04-07");
  });

  it("validates selected dates against generated options", () => {
    const options = buildTrialBookingDateOptions({
      templates: [buildTemplateForDates()],
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:30:00.000Z"),
    });

    expect(
      findTrialBookingDateOption({
        options,
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
      }),
    ).toMatchObject({
      template: {
        id: "template_1",
      },
      dateOption: {
        scheduledForDate: "2026-04-14",
      },
    });
    expect(
      findTrialBookingDateOption({
        options,
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-15",
      }),
    ).toBeNull();
  });
});

describe("trial booking helpers", () => {
  it("lists eligible trial booking options from active templates", async () => {
    const db = createMockDb();

    const result = await listTrialBookingOptions({
      workspaceId: "workspace_1",
      now: new Date("2026-04-08T00:30:00.000Z"),
      db,
    });

    expect(db.classTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          archivedAt: null,
          room: expect.objectContaining({
            isActive: true,
          }),
        }),
      }),
    );
    expect(result?.templates[0]).toMatchObject({
      id: "template_1",
      displayTitle: "Muay Thai Fundamentals",
      dateOptions: expect.arrayContaining([
        expect.objectContaining({
          scheduledForDate: "2026-04-07",
        }),
      ]),
    });
  });

  it("rejects arbitrary or cross-workspace template date selections", async () => {
    const db = createMockDb();

    await expect(
      createTrialBooking({
        workspaceId: "workspace_1",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          classTemplateId: "template_foreign",
          scheduledForDate: "2026-04-07",
          fullName: "Jordan Lee",
          email: "jordan@example.com",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose an available upcoming trial date.",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("reuses an exact-match member and does not create a duplicate trial member", async () => {
    const db = createMockDb();
    db.member.findFirst = vi.fn().mockResolvedValue({
      id: "member_existing",
    });

    await expect(
      createTrialBooking({
        workspaceId: "workspace_1",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-07",
          fullName: "Jordan Lee",
          email: "Jordan@Example.com",
        },
        db,
      }),
    ).resolves.toMatchObject({
      status: "booked",
      memberId: "member_existing",
      classBookingId: "booking_1",
    });

    expect(db.member.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        email: "jordan@example.com",
      },
      select: {
        id: true,
      },
    });
    expect(db.member.create).not.toHaveBeenCalled();
    expect(db.classBooking.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        memberId: "member_existing",
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-07T00:00:00.000Z"),
      },
      select: {
        id: true,
        status: true,
      },
    });
    expect(db.classBooking.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        memberId: "member_existing",
        guardianId: null,
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-07T00:00:00.000Z"),
        bookingType: "TRIAL",
        status: "BOOKED",
        source: "PUBLIC_TRIAL",
      },
      select: {
        id: true,
      },
    });
  });

  it("creates a new trial member, guardian, family link, and booking when no member match exists", async () => {
    const db = createMockDb();

    await expect(
      createTrialBooking({
        workspaceId: "workspace_1",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-07",
          fullName: "Jordan Lee",
          email: "jordan@example.com",
          dateOfBirth: "2012-01-02",
          guardianFullName: "Alex Lee",
          guardianEmail: "alex@example.com",
          relationshipLabel: "Parent",
        },
        db,
      }),
    ).resolves.toMatchObject({
      status: "booked",
      memberId: "member_1",
      classBookingId: "booking_1",
    });

    expect(db.member.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        phone: null,
        dateOfBirth: new Date("2012-01-02T00:00:00.000Z"),
        status: "TRIAL",
        tags: [],
        notes: null,
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
        phone: null,
        notes: null,
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

  it("rejects duplicate active class bookings and restores cancelled trial rows", async () => {
    const db = createMockDb();
    db.classBooking.findFirst = vi.fn().mockResolvedValueOnce({
      id: "booking_existing",
      status: "BOOKED",
    });

    await expect(
      createTrialBooking({
        workspaceId: "workspace_1",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-07",
          fullName: "Jordan Lee",
          email: "jordan@example.com",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "This member already has a booking for that class date.",
    });
    expect(db.classBooking.create).not.toHaveBeenCalled();

    db.classBooking.findFirst = vi.fn().mockResolvedValueOnce({
      id: "booking_cancelled",
      status: "CANCELLED",
    });

    await expect(
      createTrialBooking({
        workspaceId: "workspace_1",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-07",
          fullName: "Jordan Lee",
          email: "jordan@example.com",
        },
        db,
      }),
    ).resolves.toMatchObject({
      status: "booked",
      classBookingId: "booking_1",
    });
    expect(db.classBooking.update).toHaveBeenCalledWith({
      where: {
        id: "booking_cancelled",
      },
      data: {
        status: "BOOKED",
      },
      select: {
        id: true,
      },
    });
  });

  it("rejects missing contact details before writing", async () => {
    const db = createMockDb();

    await expect(
      createTrialBooking({
        workspaceId: "workspace_1",
        input: {
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-07",
          fullName: "Jordan Lee",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Enter an email or phone number.",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
