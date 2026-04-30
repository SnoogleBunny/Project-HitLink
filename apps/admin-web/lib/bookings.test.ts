import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAccessBackedBookingMock } = vi.hoisted(() => ({
  createAccessBackedBookingMock: vi.fn(),
}));

vi.mock("@hitlink/db", async () => {
  const actual = await vi.importActual<typeof import("@hitlink/db")>(
    "@hitlink/db",
  );

  return {
    ...actual,
    createAccessBackedBooking: createAccessBackedBookingMock,
  };
});

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
    $transaction: vi.fn(async (callback) => callback(createMockDb())),
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
    memberMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    memberPunchCard: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({
        count: 0,
      }),
    },
    dropInProduct: {
      findMany: vi.fn().mockResolvedValue([]),
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
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

describe("booking helpers", () => {
  beforeEach(() => {
    createAccessBackedBookingMock.mockReset();
  });

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

  it("delegates membership-backed bookings to the shared access helper", async () => {
    const db = createMockDb();
    createAccessBackedBookingMock.mockResolvedValue({
      status: "created",
      bookingId: "booking_1",
      bookingType: "MEMBERSHIP",
    });

    await expect(
      createClassBooking({
        workspaceId: "workspace_1",
        timezone: "America/Vancouver",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          memberId: "member_1",
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-07",
          bookingType: "MEMBERSHIP",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      bookingId: "booking_1",
    });

    expect(createAccessBackedBookingMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      memberId: "member_1",
      guardianId: null,
      classTemplateId: "template_1",
      scheduledForDate: "2026-04-07",
      timezone: "America/Vancouver",
      source: "ADMIN",
      allowDropIn: false,
      db,
      now: new Date("2026-04-08T00:30:00.000Z"),
    });
    expect(db.classBooking.create).not.toHaveBeenCalled();
  });

  it("shows the explicit portal message when only a drop-in flow would work", async () => {
    const db = createMockDb();
    createAccessBackedBookingMock.mockResolvedValue({
      status: "payment_required",
      bookingId: "booking_pending",
      dropInProductId: "drop_in_1",
      priceCents: 3500,
      currency: "usd",
    });

    await expect(
      createClassBooking({
        workspaceId: "workspace_1",
        timezone: "America/Vancouver",
        input: {
          memberId: "member_1",
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-14",
          bookingType: "MEMBERSHIP",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "This class is only accessible through a paid drop-in flow. Ask the member to book it from the portal.",
    });
  });

  it("rejects invalid trial occurrence dates before writing", async () => {
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
          bookingType: "TRIAL",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose a valid upcoming date for this class.",
    });
    expect(db.classBooking.create).not.toHaveBeenCalled();
    expect(createAccessBackedBookingMock).not.toHaveBeenCalled();
  });

  it("rejects cross-workspace member selections", async () => {
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
          bookingType: "MEMBERSHIP",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Member not found.",
    });
  });

  it("rejects active duplicate trials and restores cancelled rows", async () => {
    const db = createMockDb();
    db.classBooking.findFirst = vi.fn().mockResolvedValueOnce({
      id: "booking_existing",
      status: "BOOKED",
    });

    await expect(
      createClassBooking({
        workspaceId: "workspace_1",
        timezone: "America/Vancouver",
        now: new Date("2026-04-08T00:30:00.000Z"),
        input: {
          memberId: "member_1",
          classTemplateId: "template_1",
          scheduledForDate: "2026-04-14",
          bookingType: "TRIAL",
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
        now: new Date("2026-04-08T00:30:00.000Z"),
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
        guardianId: null,
        bookingType: "TRIAL",
        source: "ADMIN",
        status: "BOOKED",
      },
      select: {
        id: true,
      },
    });
  });
});
