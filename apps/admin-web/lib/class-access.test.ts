import { describe, expect, it, vi } from "vitest";
import {
  cancelAccessBackedBooking,
  countActiveOccurrenceBookings,
  createAccessBackedBooking,
  expireDropInBookingPayment,
  finalizeDropInBookingPayment,
  finalizePunchCardCheckoutPurchase,
  joinWaitlist,
  pickOldestEligiblePunchCard,
  promoteNextWaitlistEntry,
} from "@hitlink/db";

function buildTemplateRecord() {
  return {
    id: "template_1",
    workspaceId: "workspace_1",
    programId: "program_1",
    title: "Muay Thai Fundamentals",
    weekday: "TUESDAY" as const,
    startTimeMinutes: 18 * 60,
    bookingCutoffMinutes: 60,
    cancellationCutoffMinutes: 120,
    capacityOverride: 1,
    program: {
      id: "program_1",
      name: "Muay Thai",
    },
    room: {
      name: "Main Mat",
      capacity: 10,
    },
  };
}

describe("shared class access helpers", () => {
  it("cleans stale pending-payment holds before counting active bookings", async () => {
    const db = {
      classBooking: {
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
        count: vi.fn().mockResolvedValue(2),
      },
    };

    await expect(
      countActiveOccurrenceBookings({
        workspaceId: "workspace_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
        db,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toBe(2);

    expect(db.classBooking.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        status: "PENDING_PAYMENT",
        pendingPaymentExpiresAt: {
          lte: new Date("2026-04-08T12:00:00.000Z"),
        },
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
      },
      data: {
        status: "CANCELLED",
      },
    });
    expect(db.classBooking.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
        OR: [
          {
            status: "BOOKED",
          },
          {
            status: "PENDING_PAYMENT",
            OR: [
              {
                pendingPaymentExpiresAt: null,
              },
              {
                pendingPaymentExpiresAt: {
                  gt: new Date("2026-04-08T12:00:00.000Z"),
                },
              },
            ],
          },
        ],
      },
    });
  });

  it("chooses the oldest eligible non-expiring punch card for the same member", async () => {
    const db = {
      memberPunchCard: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "card_oldest",
            remainingPunches: 4,
            status: "ACTIVE",
            purchasedAt: new Date("2026-01-01T00:00:00.000Z"),
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            punchCardProduct: {
              id: "product_general",
              name: "General pack",
              restrictionMode: "GENERAL",
              programRestrictions: [],
            },
          },
          {
            id: "card_newer",
            remainingPunches: 8,
            status: "ACTIVE",
            purchasedAt: new Date("2026-03-01T00:00:00.000Z"),
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            punchCardProduct: {
              id: "product_restricted",
              name: "Restricted pack",
              restrictionMode: "PROGRAM_RESTRICTED",
              programRestrictions: [{ programId: "program_1" }],
            },
          },
        ]),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    await expect(
      pickOldestEligiblePunchCard({
        workspaceId: "workspace_1",
        memberId: "member_1",
        programId: "program_1",
        db,
      }),
    ).resolves.toMatchObject({
      id: "card_oldest",
    });

    expect(db.memberPunchCard.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        memberId: "member_1",
        status: "ACTIVE",
        remainingPunches: {
          gt: 0,
        },
      },
      include: {
        punchCardProduct: {
          include: {
            programRestrictions: {
              select: {
                programId: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          purchasedAt: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    });
  });

  it("creates punch-card-backed bookings and refunds only early cancellations", async () => {
    const createDb = {
      $transaction: vi.fn(async (callback: (tx: typeof createDb) => unknown) =>
        callback(createDb),
      ),
      classTemplate: {
        findFirst: vi.fn().mockResolvedValue(buildTemplateRecord()),
      },
      classBooking: {
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "booking_1",
        }),
        update: vi.fn().mockResolvedValue({
          id: "booking_1",
        }),
      },
      memberMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      memberPunchCard: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "card_1",
            remainingPunches: 3,
            status: "ACTIVE",
            purchasedAt: new Date("2026-01-01T00:00:00.000Z"),
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            punchCardProduct: {
              id: "product_1",
              name: "10-class pack",
              restrictionMode: "GENERAL",
              programRestrictions: [],
            },
          },
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id: "card_1",
          remainingPunches: 2,
          status: "ACTIVE",
        }),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        create: vi.fn(),
      },
      dropInProduct: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      waitlistEntry: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    await expect(
      createAccessBackedBooking({
        workspaceId: "workspace_1",
        memberId: "member_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
        timezone: "UTC",
        source: "MEMBER_PORTAL",
        allowDropIn: true,
        db: createDb as never,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "created",
      bookingId: "booking_1",
      bookingType: "PUNCH_CARD",
    });

    expect(createDb.memberPunchCard.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "card_1",
        workspaceId: "workspace_1",
        memberId: "member_1",
        status: "ACTIVE",
        remainingPunches: 3,
      },
      data: {
        remainingPunches: 2,
        status: "ACTIVE",
      },
    });
    expect(createDb.classBooking.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        memberId: "member_1",
        guardianId: null,
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
        bookingType: "PUNCH_CARD",
        status: "BOOKED",
        source: "MEMBER_PORTAL",
        memberPunchCardId: "card_1",
        consumedPunchCount: 1,
      },
      select: {
        id: true,
      },
    });

    const cancelDb = {
      $transaction: vi.fn(async (callback: (tx: typeof cancelDb) => unknown) =>
        callback(cancelDb),
      ),
      classBooking: {
        findFirst: vi.fn().mockResolvedValue({
          id: "booking_1",
          bookingType: "PUNCH_CARD",
          status: "BOOKED",
          memberPunchCardId: "card_1",
          consumedPunchCount: 1,
          pendingPaymentExpiresAt: null,
          scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
          classTemplate: {
            startTimeMinutes: 18 * 60,
            cancellationCutoffMinutes: 120,
          },
        }),
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
        update: vi.fn().mockResolvedValue({
          id: "booking_1",
        }),
      },
      memberPunchCard: {
        findFirst: vi.fn().mockResolvedValue({
          id: "card_1",
          remainingPunches: 2,
          status: "ACTIVE",
        }),
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
      },
    };

    await expect(
      cancelAccessBackedBooking({
        workspaceId: "workspace_1",
        memberId: "member_1",
        bookingId: "booking_1",
        timezone: "UTC",
        db: cancelDb as never,
        now: new Date("2026-04-14T14:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "cancelled",
      bookingId: "booking_1",
      punchRefunded: true,
      lateCancellation: false,
    });

    expect(cancelDb.memberPunchCard.updateMany).toHaveBeenCalledWith({
      where: {
        id: "card_1",
        workspaceId: "workspace_1",
        memberId: "member_1",
        remainingPunches: 2,
      },
      data: {
        remainingPunches: 3,
        status: "ACTIVE",
      },
    });
    expect(cancelDb.classBooking.update).toHaveBeenCalledWith({
      where: {
        id: "booking_1",
      },
      data: {
        consumedPunchCount: 0,
      },
      select: {
        id: true,
      },
    });

    const lateCancelDb = {
      ...cancelDb,
      memberPunchCard: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    await expect(
      cancelAccessBackedBooking({
        workspaceId: "workspace_1",
        memberId: "member_1",
        bookingId: "booking_1",
        timezone: "UTC",
        db: lateCancelDb as never,
        now: new Date("2026-04-14T16:30:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "cancelled",
      bookingId: "booking_1",
      punchRefunded: false,
      lateCancellation: true,
    });
    expect(lateCancelDb.memberPunchCard.updateMany).not.toHaveBeenCalled();
  });

  it("restores waitlist entries and promotes the head entry with punch-card access", async () => {
    const joinDb = {
      $transaction: vi.fn(async (callback: (tx: typeof joinDb) => unknown) =>
        callback(joinDb),
      ),
      classTemplate: {
        findFirst: vi.fn().mockResolvedValue(buildTemplateRecord()),
      },
      classBooking: {
        updateMany: vi.fn().mockResolvedValue({
          count: 0,
        }),
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      memberMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: "membership_1",
          status: "ACTIVE",
          membershipPlan: {
            programRestrictions: [],
          },
        }),
      },
      memberPunchCard: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      dropInProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      waitlistEntry: {
        findFirst: vi.fn().mockResolvedValue({
          id: "waitlist_1",
          memberId: "member_1",
          status: "CANCELLED",
          joinedAt: new Date("2026-04-01T00:00:00.000Z"),
          promotedAt: new Date("2026-04-02T00:00:00.000Z"),
          promotedBookingId: "booking_old",
          member: {
            fullName: "Jordan Lee",
            email: "jordan@example.com",
            phone: "555-1234",
            status: "ACTIVE",
          },
        }),
        update: vi.fn().mockResolvedValue({
          id: "waitlist_1",
        }),
        findMany: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    await expect(
      joinWaitlist({
        workspaceId: "workspace_1",
        memberId: "member_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
        timezone: "UTC",
        db: joinDb as never,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "restored",
      waitlistEntryId: "waitlist_1",
    });
    expect(joinDb.waitlistEntry.update).toHaveBeenCalledWith({
      where: {
        id: "waitlist_1",
      },
      data: {
        status: "ACTIVE",
        joinedAt: new Date("2026-04-08T12:00:00.000Z"),
        promotedAt: null,
        promotedBookingId: null,
      },
      select: {
        id: true,
      },
    });

    const promoteDb = {
      $transaction: vi.fn(async (callback: (tx: typeof promoteDb) => unknown) =>
        callback(promoteDb),
      ),
      classTemplate: {
        findFirst: vi.fn().mockResolvedValue(buildTemplateRecord()),
      },
      classBooking: {
        updateMany: vi
          .fn()
          .mockResolvedValue({ count: 0 })
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "booking_2",
        }),
        update: vi.fn().mockResolvedValue({
          id: "booking_2",
        }),
      },
      memberMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      memberPunchCard: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "card_1",
            remainingPunches: 2,
            status: "ACTIVE",
            purchasedAt: new Date("2026-01-01T00:00:00.000Z"),
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            punchCardProduct: {
              id: "product_1",
              name: "10-class pack",
              restrictionMode: "GENERAL",
              programRestrictions: [],
            },
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
        findFirst: vi.fn(),
      },
      dropInProduct: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      waitlistEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "waitlist_1",
            memberId: "member_1",
            status: "ACTIVE",
            joinedAt: new Date("2026-04-01T00:00:00.000Z"),
            promotedAt: null,
            promotedBookingId: null,
            member: {
              fullName: "Jordan Lee",
              email: "jordan@example.com",
              phone: "555-1234",
              status: "ACTIVE",
            },
          },
          {
            id: "waitlist_2",
            memberId: "member_2",
            status: "ACTIVE",
            joinedAt: new Date("2026-04-02T00:00:00.000Z"),
            promotedAt: null,
            promotedBookingId: null,
            member: {
              fullName: "Riley Diaz",
              email: "riley@example.com",
              phone: "555-0000",
              status: "ACTIVE",
            },
          },
        ]),
        update: vi.fn().mockResolvedValue({
          id: "waitlist_1",
        }),
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    await expect(
      promoteNextWaitlistEntry({
        workspaceId: "workspace_1",
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
        timezone: "UTC",
        source: "ADMIN",
        db: promoteDb as never,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "promoted",
      waitlistEntryId: "waitlist_1",
      bookingId: "booking_2",
      bookingType: "PUNCH_CARD",
    });

    expect(promoteDb.classBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: "member_1",
          bookingType: "PUNCH_CARD",
          memberPunchCardId: "card_1",
        }),
      }),
    );
    expect(promoteDb.waitlistEntry.update).toHaveBeenCalledWith({
      where: {
        id: "waitlist_1",
      },
      data: {
        status: "PROMOTED",
        promotedAt: new Date("2026-04-08T12:00:00.000Z"),
        promotedBookingId: "booking_2",
      },
      select: {
        id: true,
      },
    });
  });

  it("finalizes punch-card purchases and drop-in webhooks idempotently", async () => {
    const purchaseDb = {
      memberPunchCard: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: "card_1",
            remainingPunches: 10,
            status: "ACTIVE",
            purchasedAt: new Date("2026-04-08T12:00:00.000Z"),
            createdAt: new Date("2026-04-08T12:00:00.000Z"),
            punchCardProduct: {
              id: "product_1",
              name: "10-class pack",
              restrictionMode: "GENERAL",
              programRestrictions: [],
            },
          }),
        create: vi.fn().mockResolvedValue({
          id: "card_1",
        }),
      },
    };

    await expect(
      finalizePunchCardCheckoutPurchase({
        workspaceId: "workspace_1",
        memberId: "member_1",
        punchCardProductId: "product_1",
        originalPunches: 10,
        priceCents: 25000,
        currency: "usd",
        checkoutSessionId: "cs_1",
        db: purchaseDb as never,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "created",
      memberPunchCardId: "card_1",
    });

    await expect(
      finalizePunchCardCheckoutPurchase({
        workspaceId: "workspace_1",
        memberId: "member_1",
        punchCardProductId: "product_1",
        originalPunches: 10,
        priceCents: 25000,
        currency: "usd",
        checkoutSessionId: "cs_1",
        db: purchaseDb as never,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "already_exists",
      memberPunchCardId: "card_1",
    });

    const dropInDb = {
      $transaction: vi.fn(async (callback: (tx: typeof dropInDb) => unknown) =>
        callback(dropInDb),
      ),
      classBooking: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "booking_1",
            status: "PENDING_PAYMENT",
          })
          .mockResolvedValueOnce({
            id: "booking_1",
            status: "BOOKED",
          }),
        update: vi.fn().mockResolvedValue({
          id: "booking_1",
        }),
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
      },
    };

    await expect(
      finalizeDropInBookingPayment({
        workspaceId: "workspace_1",
        bookingId: "booking_1",
        checkoutSessionId: "cs_1",
        paymentIntentId: "pi_1",
        expiresAt: new Date("2026-04-08T12:15:00.000Z"),
        db: dropInDb as never,
        now: new Date("2026-04-08T12:05:00.000Z"),
      }),
    ).resolves.toBe("booked");
    await expect(
      finalizeDropInBookingPayment({
        workspaceId: "workspace_1",
        bookingId: "booking_1",
        checkoutSessionId: "cs_1",
        paymentIntentId: "pi_1",
        expiresAt: new Date("2026-04-08T12:15:00.000Z"),
        db: dropInDb as never,
        now: new Date("2026-04-08T12:05:00.000Z"),
      }),
    ).resolves.toBe("already_booked");
    await expect(
      expireDropInBookingPayment({
        workspaceId: "workspace_1",
        bookingId: "booking_1",
        checkoutSessionId: "cs_1",
        db: dropInDb as never,
      }),
    ).resolves.toBe("cancelled");
  });
});
