import { fixtureSchedulingRevision } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAccessBackedBookingMock } = vi.hoisted(() => ({
  createAccessBackedBookingMock: vi.fn(),
}));

vi.mock("@flowstate/db", async () => {
  const actual =
    await vi.importActual<typeof import("@flowstate/db")>("@flowstate/db");

  return {
    ...actual,
    createAccessBackedBooking: createAccessBackedBookingMock,
  };
});

import { createClassBooking, listBookingFormOptions } from "./bookings";

type BookingTestDb = NonNullable<
  Parameters<typeof createClassBooking>[0]["db"]
>;

function buildTemplateRecord() {
  return {
    id: "template_1",
    title: null,
    weekday: "TUESDAY" as const,
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    bookingCutoffMinutes: 0,
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
    workspaceSchedulingPolicyRevision: {
      findFirst: vi.fn().mockResolvedValue(fixtureSchedulingRevision()),
    },
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

  it("offers no new owner booking dates without confirmed rules", async () => {
    const db = createMockDb();
    db.workspaceSchedulingPolicyRevision!.findFirst = vi
      .fn()
      .mockResolvedValue(null);
    const options = await listBookingFormOptions({
      workspaceId: "workspace_1",
      timezone: "America/Vancouver",
      db,
      now: new Date("2026-04-01T12:00:00Z"),
    });
    expect(options.templates).toEqual([]);
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

  it("uses daily revisions, dated cancellations and substitute coaches in owner booking options", async () => {
    const db = createMockDb();
    const base = {
      ...buildTemplateRecord(),
      coachWorkspaceUser: null,
      coachWorkspaceUserId: null,
    };
    db.classTemplate.findMany = vi.fn().mockResolvedValue([
      {
        ...base,
        scheduleRevisions: [
          {
            ...base,
            id: "revision",
            effectiveFrom: new Date("2026-04-01"),
            startDate: new Date("2026-04-01"),
            endDate: null,
            recurrence: "DAILY",
            weekdays: [],
          },
        ],
        classInstances: [
          {
            ...base,
            id: "cancelled",
            scheduledForDate: new Date("2026-04-08"),
            status: "CANCELLED",
            isScheduleOverride: false,
            coachAssignmentMode: "INHERIT",
          },
          {
            ...base,
            id: "substitute",
            scheduledForDate: new Date("2026-04-09"),
            status: "ACTIVE",
            isScheduleOverride: false,
            coachAssignmentMode: "ASSIGNED",
            coachWorkspaceUser: {
              user: { fullName: "Substitute Coach", email: "sub@example.com" },
            },
          },
        ],
      },
    ]);
    const result = await listBookingFormOptions({
      workspaceId: "workspace_1",
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:30:00Z"),
      db,
    });
    const dates = result.templates[0]!.dateOptions;
    expect(dates.some((date) => date.scheduledForDate === "2026-04-08")).toBe(
      false,
    );
    expect(
      dates.find((date) => date.scheduledForDate === "2026-04-09")?.label,
    ).toContain("Substitute Coach");
    expect(
      dates.find((date) => date.scheduledForDate === "2026-04-10")?.label,
    ).toContain("Coach to be confirmed");
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
      trial: false,
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

  it("surfaces shared dated trial validation without writing directly", async () => {
    const db = createMockDb();
    createAccessBackedBookingMock.mockResolvedValue({
      status: "error",
      code: "INVALID",
      message: "Choose a valid upcoming date for this class.",
    });

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
    expect(createAccessBackedBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ trial: true }),
    );
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
    createAccessBackedBookingMock.mockResolvedValueOnce({
      status: "error",
      code: "DUPLICATE",
      message: "This member already has an active booking for that class date.",
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

    createAccessBackedBookingMock.mockResolvedValueOnce({
      status: "restored",
      bookingId: "booking_1",
      bookingType: "TRIAL",
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
    expect(db.classBooking.update).not.toHaveBeenCalled();
  });
});
