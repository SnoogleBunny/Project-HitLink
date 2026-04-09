import { describe, expect, it, vi } from "vitest";
import { createClassBooking, listBookingFormOptions } from "./bookings";

type BookingTestDb = NonNullable<Parameters<typeof createClassBooking>[0]["db"]>;

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
      capacity: 20,
    },
    coachWorkspaceUser: {
      user: {
        fullName: "Casey Coach",
        email: "coach@example.com",
      },
    },
  };
}

function createMockDb(): BookingTestDb {
  return {
    member: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "member_1",
          fullName: "Jordan Lee",
          email: "jordan@example.com",
          phone: null,
          status: "ACTIVE",
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
      }),
    },
    familyLink: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    classTemplate: {
      findMany: vi.fn().mockResolvedValue([buildTemplateRecord()]),
      findFirst: vi.fn().mockResolvedValue(buildTemplateRecord()),
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
  };
}

describe("booking helpers", () => {
  it("lists members and eligible future occurrence options", async () => {
    const db = createMockDb();

    const result = await listBookingFormOptions({
      workspaceId: "workspace_1",
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:30:00.000Z"),
      db,
    });

    expect(db.classTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          archivedAt: null,
          program: {
            archivedAt: null,
          },
          room: {
            archivedAt: null,
            isActive: true,
          },
        }),
      }),
    );
    expect(result.members[0]?.label).toContain("Jordan Lee");
    expect(result.templates[0]?.dateOptions[0]).toMatchObject({
      classTemplateId: "template_1",
      scheduledForDate: "2026-04-07",
    });
  });

  it("creates a standard booking only after checking the unique dated key", async () => {
    const db = createMockDb();

    await expect(
      createClassBooking({
        workspaceId: "workspace_1",
        timezone: "America/Vancouver",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          memberId: "member_1",
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-07",
          bookingType: "STANDARD",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      bookingId: "booking_1",
    });

    expect(db.classBooking.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        memberId: "member_1",
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
        memberId: "member_1",
        guardianId: null,
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-07T00:00:00.000Z"),
        bookingType: "STANDARD",
        status: "BOOKED",
        source: "ADMIN",
      },
      select: {
        id: true,
      },
    });
  });

  it("rejects invalid occurrence dates before writing", async () => {
    const db = createMockDb();

    await expect(
      createClassBooking({
        workspaceId: "workspace_1",
        timezone: "America/Vancouver",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          memberId: "member_1",
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-08",
          bookingType: "STANDARD",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose a valid upcoming date for this class.",
    });
    expect(db.classBooking.create).not.toHaveBeenCalled();
  });

  it("rejects cross-workspace member or template selections", async () => {
    const db = createMockDb();
    db.member.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      createClassBooking({
        workspaceId: "workspace_1",
        timezone: "America/Vancouver",
        input: {
          memberId: "member_foreign",
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-14",
          bookingType: "STANDARD",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Member not found.",
    });
    expect(db.classBooking.create).not.toHaveBeenCalled();
  });

  it("rejects active duplicates and restores cancelled rows", async () => {
    const db = createMockDb();
    db.classBooking.findFirst = vi.fn().mockResolvedValueOnce({
      id: "booking_existing",
      status: "BOOKED",
    });

    await expect(
      createClassBooking({
        workspaceId: "workspace_1",
        timezone: "America/Vancouver",
        input: {
          memberId: "member_1",
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-14",
          bookingType: "STANDARD",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "This member already has an active booking for that class date.",
    });
    expect(db.classBooking.create).not.toHaveBeenCalled();

    db.classBooking.findFirst = vi.fn().mockResolvedValueOnce({
      id: "booking_cancelled",
      status: "CANCELLED",
    });

    await expect(
      createClassBooking({
        workspaceId: "workspace_1",
        timezone: "America/Vancouver",
        input: {
          memberId: "member_1",
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-14",
          bookingType: "TRIAL",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "restored",
      bookingId: "booking_1",
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
});
