import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cleanupExpiredPendingBookingsMock,
  resolveBookingAccessForProgramMock,
  createAccessBackedBookingMock,
  cancelAccessBackedBookingMock,
  joinWaitlistMock,
  leaveWaitlistMock,
} = vi.hoisted(() => ({
  cleanupExpiredPendingBookingsMock: vi.fn(),
  resolveBookingAccessForProgramMock: vi.fn(),
  createAccessBackedBookingMock: vi.fn(),
  cancelAccessBackedBookingMock: vi.fn(),
  joinWaitlistMock: vi.fn(),
  leaveWaitlistMock: vi.fn(),
}));

vi.mock("@flowstate/db", async () => {
  const actual =
    await vi.importActual<typeof import("@flowstate/db")>("@flowstate/db");

  return {
    ...actual,
    cleanupExpiredPendingBookings: cleanupExpiredPendingBookingsMock,
    resolveBookingAccessForProgram: resolveBookingAccessForProgramMock,
    createAccessBackedBooking: createAccessBackedBookingMock,
    cancelAccessBackedBooking: cancelAccessBackedBookingMock,
    joinWaitlist: joinWaitlistMock,
    leaveWaitlist: leaveWaitlistMock,
  };
});

import {
  cancelSelfBooking,
  createSelfBooking,
  joinSelfWaitlist,
  leaveSelfWaitlist,
  listEligibleSelfServiceOccurrences,
  listMemberBookings,
} from "./self-service-bookings";

type SelfServiceBookingTestDb = NonNullable<
  Parameters<typeof createSelfBooking>[0]["db"]
>;

function buildTemplate(args?: {
  id?: string;
  programId?: string;
  weekday?: "TUESDAY" | "THURSDAY";
  bookingCutoffMinutes?: number;
  cancellationCutoffMinutes?: number;
  capacityOverride?: number | null;
  roomCapacity?: number | null;
}) {
  return {
    workspaceId: "workspace_1",
    id: args?.id ?? "template_1",
    programId: args?.programId ?? "program_1",
    title: "Muay Thai Fundamentals",
    weekday: args?.weekday ?? ("TUESDAY" as const),
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    bookingCutoffMinutes: args?.bookingCutoffMinutes ?? 60,
    cancellationCutoffMinutes: args?.cancellationCutoffMinutes ?? 120,
    capacityOverride: args?.capacityOverride ?? null,
    program: {
      id: args?.programId ?? "program_1",
      name: "Muay Thai Fundamentals",
    },
    room: {
      name: "Main Mat",
      capacity: args?.roomCapacity ?? 10,
    },
  };
}

function buildExistingBooking() {
  const classTemplate = buildTemplate();

  return {
    id: "booking_1",
    classTemplateId: "template_1",
    scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
    bookingType: "MEMBERSHIP" as const,
    status: "BOOKED" as const,
    pendingPaymentExpiresAt: null,
    classTemplate,
  };
}

function createMockDb(): SelfServiceBookingTestDb {
  return {
    classTemplate: {
      findMany: vi.fn().mockResolvedValue([buildTemplate()]),
    },
    classBooking: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    waitlistEntry: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    memberMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    memberPunchCard: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    dropInProduct: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(),
  };
}

describe("self-service booking helpers", () => {
  beforeEach(() => {
    cleanupExpiredPendingBookingsMock.mockReset();
    resolveBookingAccessForProgramMock.mockReset();
    createAccessBackedBookingMock.mockReset();
    cancelAccessBackedBookingMock.mockReset();
    joinWaitlistMock.mockReset();
    leaveWaitlistMock.mockReset();
    cleanupExpiredPendingBookingsMock.mockResolvedValue({ count: 0 });
    resolveBookingAccessForProgramMock.mockResolvedValue({
      type: "membership",
      membershipId: "membership_1",
    });
  });

  it("uses the exact date's title, room, time, capacity and coach in discovery and booking details", async () => {
    const base = buildTemplate();
    const template = { ...base, classInstances: [{ ...base, id: "exception", scheduledForDate: new Date("2026-04-14T00:00:00Z"), status: "ACTIVE", isScheduleOverride: true,
      title: "Evening padwork", startTimeMinutes: 20 * 60, endTimeMinutes: 21 * 60, capacityOverride: 8,
      room: { id: "other-room", name: "Upstairs mat", capacity: 12 }, coachAssignmentMode: "ASSIGNED", coachWorkspaceUserId: "coach", coachWorkspaceUser: { id: "coach", user: { fullName: "Coach Alex", email: "coach@example.com" } } }] };
    const db = createMockDb();
    db.classTemplate.findMany = vi.fn().mockResolvedValue([template]);
    const result = await listEligibleSelfServiceOccurrences({ workspaceId: "workspace_1", memberId: "member_1", timezone: "UTC", fromDate: "2026-04-14", toDate: "2026-04-14", now: new Date("2026-04-14T18:00:00Z"), db });
    expect(result.occurrences).toEqual([expect.objectContaining({ displayTitle: "Evening padwork", roomName: "Upstairs mat", timeLabel: "8:00 PM", coachName: "Coach Alex", capacityLabel: "0 / 8 booked" })]);
    db.classBooking.findMany = vi.fn().mockResolvedValue([{ ...buildExistingBooking(), classTemplate: template }]);
    const bookings = await listMemberBookings({ workspaceId: "workspace_1", memberId: "member_1", timezone: "UTC", now: new Date("2026-04-14T18:00:00Z"), db });
    expect(bookings.upcoming).toEqual([expect.objectContaining({ displayTitle: "Evening padwork", roomName: "Upstairs mat", timeLabel: "8:00 PM", coachName: "Coach Alex", canCancel: true })]);
  });

  it("disables drop-in allocation when the actor cannot pay, even if a crafted form asks to book", async () => {
    const db = createMockDb();
    createAccessBackedBookingMock.mockResolvedValue({ status: "created", bookingId: "new" });
    await createSelfBooking({ workspaceId: "workspace_1", memberId: "member_1", classTemplateId: "template_1", scheduledForDate: "2026-04-14", timezone: "UTC", allowDropIn: false, db });
    expect(createAccessBackedBookingMock).toHaveBeenCalledWith(expect.objectContaining({ allowDropIn: false, memberId: "member_1" }));
  });

  it("lists membership-backed availability and cleans stale pending bookings first", async () => {
    const db = createMockDb();
    db.classBooking.findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await listEligibleSelfServiceOccurrences({
      workspaceId: "workspace_1",
      memberId: "member_1",
      timezone: "UTC",
      now: new Date("2026-04-08T12:00:00.000Z"),
      db,
    });

    expect(cleanupExpiredPendingBookingsMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      db,
      now: new Date("2026-04-08T12:00:00.000Z"),
    });
    expect(resolveBookingAccessForProgramMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      memberId: "member_1",
      programId: "program_1",
      scheduledForDate: "2026-04-14",
      now: new Date("2026-04-08T12:00:00.000Z"),
      allowDropIn: true,
      db,
    });
    expect(result.occurrences[0]).toMatchObject({
      classTemplateId: "template_1",
      bookingState: "AVAILABLE",
      action: "book",
      accessLabel: "Membership",
    });
  });

  it.each([
    {
      boundary: "immediately before",
      now: "2026-04-14T20:59:59.999Z",
      expectedAvailability: true,
    },
    {
      boundary: "exactly at",
      now: "2026-04-14T21:00:00.000Z",
      expectedAvailability: false,
    },
    {
      boundary: "immediately after",
      now: "2026-04-14T21:00:00.001Z",
      expectedAvailability: false,
    },
  ])(
    "$boundary the booking cutoff has availability $expectedAvailability in the workspace timezone",
    async ({ now, expectedAvailability }) => {
      const db = createMockDb();
      db.classBooking.findMany = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await listEligibleSelfServiceOccurrences({
        workspaceId: "workspace_1",
        memberId: "member_1",
        timezone: "America/New_York",
        now: new Date(now),
        db,
      });

      expect(
        result.occurrences.some(
          (occurrence) => occurrence.scheduledForDate === "2026-04-14",
        ),
      ).toBe(expectedAvailability);
    },
  );

  it("shows waitlist join when a full occurrence still has membership or punch-card access", async () => {
    const db = createMockDb();
    db.classTemplate.findMany = vi.fn().mockResolvedValue([
      buildTemplate({
        capacityOverride: 1,
      }),
    ]);
    db.classBooking.findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          classTemplateId: "template_1",
          scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
        },
      ]);
    resolveBookingAccessForProgramMock.mockResolvedValue({
      type: "punch_card",
      memberPunchCardId: "card_1",
      productName: "10-class pack",
    });

    const result = await listEligibleSelfServiceOccurrences({
      workspaceId: "workspace_1",
      memberId: "member_1",
      timezone: "UTC",
      now: new Date("2026-04-08T12:00:00.000Z"),
      db,
    });

    expect(result.occurrences[0]).toMatchObject({
      bookingState: "FULL",
      action: "join_waitlist",
      accessLabel: "Punch card",
    });
  });

  it("shows drop-in payment state and blocks drop-ins from joining a full waitlist", async () => {
    const db = createMockDb();
    db.classTemplate.findMany = vi.fn().mockResolvedValue([
      buildTemplate({
        capacityOverride: 1,
      }),
    ]);
    db.classBooking.findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          classTemplateId: "template_1",
          scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
        },
      ]);
    resolveBookingAccessForProgramMock.mockResolvedValue({
      type: "drop_in",
      dropInProductId: "drop_in_1",
      productName: "Single class",
      priceCents: 3500,
      currency: "usd",
    });

    const result = await listEligibleSelfServiceOccurrences({
      workspaceId: "workspace_1",
      memberId: "member_1",
      timezone: "UTC",
      now: new Date("2026-04-08T12:00:00.000Z"),
      db,
    });

    expect(result.occurrences[0]).toMatchObject({
      bookingState: "FULL",
      action: "none",
      accessLabel: "Drop-in",
      note: "Drop-ins cannot join this waitlist.",
    });
  });

  it("shows existing booked and payment-pending states from the member's own bookings", async () => {
    const db = createMockDb();
    db.classBooking.findMany = vi
      .fn()
      .mockResolvedValueOnce([
        buildExistingBooking(),
        {
          ...buildExistingBooking(),
          id: "booking_2",
          classTemplateId: "template_2",
          scheduledForDate: new Date("2026-04-16T00:00:00.000Z"),
          bookingType: "DROP_IN" as const,
          status: "PENDING_PAYMENT" as const,
          pendingPaymentExpiresAt: new Date("2026-04-16T10:00:00.000Z"),
          classTemplate: buildTemplate({
            id: "template_2",
            weekday: "THURSDAY",
          }),
        },
      ])
      .mockResolvedValueOnce([]);
    db.classTemplate.findMany = vi.fn().mockResolvedValue([
      buildTemplate(),
      buildTemplate({
        id: "template_2",
        weekday: "THURSDAY",
      }),
    ]);

    const result = await listEligibleSelfServiceOccurrences({
      workspaceId: "workspace_1",
      memberId: "member_1",
      timezone: "UTC",
      now: new Date("2026-04-08T12:00:00.000Z"),
      db,
    });

    expect(result.occurrences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classTemplateId: "template_1",
          bookingState: "BOOKED",
          actionLabel: "Manage",
        }),
        expect.objectContaining({
          classTemplateId: "template_2",
          bookingState: "PAYMENT_PENDING",
          actionLabel: "Manage",
        }),
      ]),
    );
  });

  it("passes through payment-required bookings for drop-ins", async () => {
    const db = createMockDb();
    createAccessBackedBookingMock.mockResolvedValue({
      status: "payment_required",
      bookingId: "booking_pending",
      dropInProductId: "drop_in_1",
      priceCents: 3500,
      currency: "usd",
    });

    await expect(
      createSelfBooking({
        workspaceId: "workspace_1",
        memberId: "member_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
        timezone: "UTC",
        now: new Date("2026-04-08T12:00:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "payment_required",
      bookingId: "booking_pending",
      dropInProductId: "drop_in_1",
      priceCents: 3500,
      currency: "usd",
    });
    expect(createAccessBackedBookingMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      memberId: "member_1",
      classTemplateId: "template_1",
      scheduledForDate: "2026-04-14",
      timezone: "UTC",
      source: "MEMBER_PORTAL",
      allowDropIn: true,
      db,
      now: new Date("2026-04-08T12:00:00.000Z"),
    });
  });

  it("maps cancellation and waitlist helpers through the member portal wrappers", async () => {
    const db = createMockDb();
    cancelAccessBackedBookingMock.mockResolvedValue({
      status: "cancelled",
      bookingId: "booking_1",
      punchRefunded: true,
      lateCancellation: false,
    });
    joinWaitlistMock.mockResolvedValue({
      status: "restored",
      waitlistEntryId: "waitlist_1",
    });
    leaveWaitlistMock.mockResolvedValue({
      status: "left",
      waitlistEntryId: "waitlist_1",
    });

    await expect(
      cancelSelfBooking({
        workspaceId: "workspace_1",
        memberId: "member_1",
        bookingId: "booking_1",
        timezone: "UTC",
        now: new Date("2026-04-08T12:00:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "cancelled",
      bookingId: "booking_1",
    });

    await expect(
      joinSelfWaitlist({
        workspaceId: "workspace_1",
        memberId: "member_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
        timezone: "UTC",
        now: new Date("2026-04-08T12:00:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "waitlist_restored",
      waitlistEntryId: "waitlist_1",
    });
    expect(joinWaitlistMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      memberId: "member_1",
      classTemplateId: "template_1",
      scheduledForDate: "2026-04-14",
      timezone: "UTC",
      source: "MEMBER_PORTAL",
      db,
      now: new Date("2026-04-08T12:00:00.000Z"),
    });

    await expect(
      leaveSelfWaitlist({
        workspaceId: "workspace_1",
        memberId: "member_1",
        waitlistEntryId: "waitlist_1",
        db,
      }),
    ).resolves.toEqual({
      status: "waitlist_left",
      waitlistEntryId: "waitlist_1",
    });
  });

  it("lists only the signed-in member's own bookings and active waitlist entries", async () => {
    const db = createMockDb();
    db.classBooking.findMany = vi.fn().mockResolvedValue([
      {
        ...buildExistingBooking(),
        classTemplate: buildTemplate(),
      },
    ]);
    db.waitlistEntry.findMany = vi.fn().mockResolvedValue([
      {
        id: "waitlist_1",
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
        joinedAt: new Date("2026-04-08T12:00:00.000Z"),
        classTemplate: {
          id: "template_1",
          title: "Muay Thai Fundamentals",
          startTimeMinutes: 18 * 60,
          program: {
            name: "Muay Thai",
          },
          room: {
            name: "Main Mat",
          },
        },
      },
    ]);

    const result = await listMemberBookings({
      workspaceId: "workspace_1",
      memberId: "member_1",
      timezone: "UTC",
      now: new Date("2026-04-08T12:00:00.000Z"),
      db,
    });

    expect(db.classBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          memberId: "member_1",
        }),
      }),
    );
    expect(db.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace_1",
          memberId: "member_1",
          status: "ACTIVE",
        },
      }),
    );
    expect(result.upcoming).toEqual([
      expect.objectContaining({
        bookingId: "booking_1",
        classTemplateId: "template_1",
      }),
    ]);
    expect(result.waitlist).toEqual([
      expect.objectContaining({
        waitlistEntryId: "waitlist_1",
        classTemplateId: "template_1",
      }),
    ]);
  });
});
