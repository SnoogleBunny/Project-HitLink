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

function buildTemplateForDates(args?: {
  bookingCutoffMinutes?: number;
  weekday?: "SUNDAY" | "TUESDAY";
  startTimeMinutes?: number;
  endTimeMinutes?: number;
}) {
  return {
    id: "template_1",
    displayTitle: "Muay Thai Fundamentals",
    weekday: args?.weekday ?? ("TUESDAY" as const),
    startTimeMinutes: args?.startTimeMinutes ?? 18 * 60,
    endTimeMinutes: args?.endTimeMinutes ?? 19 * 60,
    bookingCutoffMinutes: args?.bookingCutoffMinutes ?? 0,
    capacityOverride: null,
    roomCapacity: null,
    programName: "Muay Thai",
    roomName: "Main Mat",
    coachDisplayName: "Casey Coach",
  };
}

function buildTemplateRecord(args?: {
  bookingCutoffMinutes?: number;
  capacityOverride?: number | null;
  roomCapacity?: number | null;
}) {
  return {
    id: "template_1",
    title: null,
    weekday: "TUESDAY" as const,
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    bookingCutoffMinutes: args?.bookingCutoffMinutes ?? 0,
    capacityOverride: args?.capacityOverride ?? null,
    program: {
      name: "Muay Thai Fundamentals",
    },
    room: {
      name: "Main Mat",
      capacity: args?.roomCapacity ?? null,
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
        name: "Flowstate Gym",
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
    classInstance: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    classBooking: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
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
  it.each([
    {
      boundary: "immediately before",
      now: "2026-04-07T23:59:59.999Z",
      expectedFirstDate: "2026-04-07",
    },
    {
      boundary: "at",
      now: "2026-04-08T00:00:00.000Z",
      expectedFirstDate: "2026-04-14",
    },
    {
      boundary: "immediately after",
      now: "2026-04-08T00:00:00.001Z",
      expectedFirstDate: "2026-04-14",
    },
  ])(
    "$boundary the workspace-local booking cutoff offers the correct first occurrence",
    ({ now, expectedFirstDate }) => {
      const result = buildTrialBookingDateOptions({
        templates: [
          buildTemplateForDates({
            bookingCutoffMinutes: 60,
          }),
        ],
        timezone: "America/Vancouver",
        now: new Date(now),
      });

      expect(result[0]?.dateOptions[0]?.scheduledForDate).toBe(
        expectedFirstDate,
      );
      expect(result[0]?.dateOptions).toHaveLength(4);
    },
  );

  it("generates the next 4 upcoming dates for a template", () => {
    const result = buildTrialBookingDateOptions({
      templates: [buildTemplateForDates()],
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:30:00.000Z"),
    });

    expect(
      result[0]?.dateOptions.map((option) => option.scheduledForDate),
    ).toEqual(["2026-04-07", "2026-04-14", "2026-04-21", "2026-04-28"]);
  });

  it("uses the workspace-local date for today/future options", () => {
    const result = buildTrialBookingDateOptions({
      templates: [buildTemplateForDates()],
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:45:00.000Z"),
    });

    expect(result[0]?.dateOptions[0]?.scheduledForDate).toBe("2026-04-07");
  });

  it.each([
    {
      boundary: "immediately before",
      now: "2026-03-08T08:59:59.999Z",
      expectedFirstDate: "2026-03-08",
    },
    {
      boundary: "at",
      now: "2026-03-08T09:00:00.000Z",
      expectedFirstDate: "2026-03-15",
    },
  ])(
    "$boundary the cutoff remains correct across Vancouver's daylight-saving boundary",
    ({ now, expectedFirstDate }) => {
      const result = buildTrialBookingDateOptions({
        templates: [
          buildTemplateForDates({
            weekday: "SUNDAY",
            startTimeMinutes: 3 * 60,
            endTimeMinutes: 4 * 60,
            bookingCutoffMinutes: 60,
          }),
        ],
        timezone: "America/Vancouver",
        now: new Date(now),
      });

      expect(result[0]?.dateOptions[0]?.scheduledForDate).toBe(
        expectedFirstDate,
      );
    },
  );

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
    expect(result).toMatchObject({
      status: "available",
    });
    expect(
      result?.status === "available" ? result.templates[0] : null,
    ).toMatchObject({
      id: "template_1",
      displayTitle: "Muay Thai Fundamentals",
      dateOptions: expect.arrayContaining([
        expect.objectContaining({
          scheduledForDate: "2026-04-07",
        }),
      ]),
    });
  });

  it("projects active templates with zero eligible dates as an explicit unavailable state", async () => {
    const db = createMockDb();
    db.classTemplate.findMany = vi
      .fn()
      .mockResolvedValue([
        buildTemplateRecord({ bookingCutoffMinutes: 43 * 24 * 60 }),
      ]);

    const result = await listTrialBookingOptions({
      workspaceId: "workspace_1",
      now: new Date("2026-04-08T00:30:00.000Z"),
      db,
    });

    expect(result).toEqual({
      status: "no-eligible-dates",
      workspaceId: "workspace_1",
      workspaceName: "Flowstate Gym",
      timezone: "America/Vancouver",
      activeTemplateCount: 1,
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

  it("rejects a date submitted at the cutoff before any member, guardian, family, or booking writes", async () => {
    const db = createMockDb();
    db.classTemplate.findMany = vi.fn().mockResolvedValue([
      buildTemplateRecord({
        bookingCutoffMinutes: 60,
      }),
    ]);

    await expect(
      createTrialBooking({
        workspaceId: "workspace_1",
        now: new Date("2026-04-08T00:00:00.000Z"),
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
      message: "Choose an available upcoming trial date.",
    });

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.member.findFirst).not.toHaveBeenCalled();
    expect(db.member.create).not.toHaveBeenCalled();
    expect(db.guardian.create).not.toHaveBeenCalled();
    expect(db.familyLink.create).not.toHaveBeenCalled();
    expect(db.classBooking.create).not.toHaveBeenCalled();
    expect(db.classBooking.update).not.toHaveBeenCalled();
  });

  it("rejects a full occurrence before any participant or booking writes", async () => {
    const db = createMockDb();
    db.classTemplate.findMany = vi
      .fn()
      .mockResolvedValue([buildTemplateRecord({ capacityOverride: 1 })]);
    Object.assign(db.classBooking, {
      count: vi.fn().mockResolvedValue(1),
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
      message: "This class is full. Choose another available trial date.",
    });
    expect(db.member.findFirst).not.toHaveBeenCalled();
    expect(db.member.create).not.toHaveBeenCalled();
    expect(db.classBooking.create).not.toHaveBeenCalled();
    expect(db.classBooking.update).not.toHaveBeenCalled();
  });

  it("rejects a cancelled occurrence before any participant or booking writes", async () => {
    const db = createMockDb();
    Object.assign(db, {
      classInstance: {
        findFirst: vi.fn().mockResolvedValue({ id: "instance_cancelled" }),
      },
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
      message: "Choose an available upcoming trial date.",
    });
    expect(db.member.findFirst).not.toHaveBeenCalled();
    expect(db.member.create).not.toHaveBeenCalled();
    expect(db.classBooking.create).not.toHaveBeenCalled();
    expect(db.classBooking.update).not.toHaveBeenCalled();
  });

  it("reuses an exact-match member and does not create a duplicate trial member", async () => {
    const db = createMockDb();
    db.member.findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "member_existing",
      })
      .mockResolvedValueOnce(null);

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

  it("issues required trial forms in the booking transaction and returns their links", async () => {
    const db = createMockDb();
    const issueFormRequests = vi.fn().mockResolvedValue([
      {
        requestId: "request_1",
        token: "request_1.token",
        formDocumentId: "form_1",
        formName: "Adult Waiver",
        formType: "WAIVER",
        versionId: "version_1",
        versionNumber: 1,
        signerKind: "MEMBER",
        guardianId: null,
        guardianName: null,
        expiresAt: new Date("2026-04-15T00:30:00.000Z"),
      },
    ]);
    const now = new Date("2026-04-08T00:30:00.000Z");

    await expect(
      createTrialBooking({
        workspaceId: "workspace_1",
        now,
        input: {
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-07",
          fullName: "Jordan Lee",
          email: "jordan@example.com",
        },
        db,
        issueFormRequests,
      }),
    ).resolves.toMatchObject({
      status: "booked",
      classBookingId: "booking_1",
      forms: [
        {
          requestId: "request_1",
          token: "request_1.token",
        },
      ],
    });
    expect(issueFormRequests).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      memberId: "member_1",
      db,
      now,
    });
  });

  it("returns a truthful failure when required-form issuance fails after booking mutation", async () => {
    const db = createMockDb();
    const issueFormRequests = vi
      .fn()
      .mockRejectedValue(new Error("injected post-booking issuance failure"));

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
        issueFormRequests,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Trial booking could not be completed. No booking was saved. Try again.",
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
