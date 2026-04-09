import { describe, expect, it, vi } from "vitest";
import {
  cancelSelfBooking,
  createSelfBooking,
  listEligibleSelfServiceOccurrences,
} from "./self-service-bookings";

type SelfServiceBookingTestDb = NonNullable<
  Parameters<typeof createSelfBooking>[0]["db"]
>;

function buildMembership(restrictedProgramIds: string[] = ["program_1"]) {
  return {
    id: "membership_1",
    workspaceId: "workspace_1",
    memberId: "member_1",
    membershipPlanId: "plan_1",
    status: "ACTIVE" as const,
    startedAt: new Date("2026-04-01T00:00:00.000Z"),
    endedAt: null,
    nextBillingDate: new Date("2026-05-01T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    cancelRequestedAt: null,
    frozenFrom: null,
    frozenUntil: null,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    membershipPlan: {
      id: "plan_1",
      name: "Unlimited",
      description: null,
      monthlyPriceCents: 12900,
      currency: "usd",
      programRestrictions: restrictedProgramIds.map((programId, index) => ({
        programId,
        program: {
          id: programId,
          name: `Program ${index + 1}`,
        },
      })),
    },
    billingState: {
      id: "billing_state_1",
      status: "ACTIVE" as const,
      nextBillingDate: new Date("2026-05-01T00:00:00.000Z"),
      latestInvoiceId: null,
      latestPaymentIntentId: null,
      latestSubscriptionId: "sub_1",
      lastPaymentStatus: null,
      lastPaymentAt: null,
      failureCode: null,
      failureMessage: null,
      failedAt: null,
      gracePeriodEndsAt: null,
      paymentUpdateRequestedAt: null,
      retryRequestedAt: null,
    },
  };
}

function buildTemplate(args?: {
  id?: string;
  programId?: string;
  weekday?: "TUESDAY" | "THURSDAY";
  bookingCutoffMinutes?: number;
  cancellationCutoffMinutes?: number;
}) {
  return {
    id: args?.id ?? "template_1",
    programId: args?.programId ?? "program_1",
    title: "Muay Thai Fundamentals",
    weekday: args?.weekday ?? ("TUESDAY" as const),
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    bookingCutoffMinutes: args?.bookingCutoffMinutes ?? 60,
    cancellationCutoffMinutes: args?.cancellationCutoffMinutes ?? 120,
    program: {
      id: args?.programId ?? "program_1",
      name: "Muay Thai Fundamentals",
    },
    room: {
      name: "Main Mat",
    },
  };
}

function createMockDb(): SelfServiceBookingTestDb {
  const template = buildTemplate();

  return {
    memberMembership: {
      findFirst: vi.fn().mockResolvedValue(buildMembership()),
    },
    classTemplate: {
      findMany: vi.fn().mockResolvedValue([template]),
      findFirst: vi.fn().mockResolvedValue(template),
    },
    classBooking: {
      findMany: vi.fn().mockResolvedValue([]),
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
    },
  };
}

describe("self-service booking helpers", () => {
  it("lists only the classes allowed by the current membership restrictions", async () => {
    const db = createMockDb();
    db.classTemplate.findMany = vi.fn().mockResolvedValue([
      buildTemplate({
        id: "template_allowed",
        programId: "program_1",
      }),
    ]);

    const result = await listEligibleSelfServiceOccurrences({
      workspaceId: "workspace_1",
      memberId: "member_1",
      timezone: "UTC",
      now: new Date("2026-04-08T12:00:00.000Z"),
      db,
    });

    expect(db.classTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          programId: {
            in: ["program_1"],
          },
        }),
      }),
    );
    expect(result.eligibility).toBe("eligible");
    expect(result.occurrences[0]?.classTemplateId).toBe("template_allowed");
  });

  it("creates member bookings with MEMBER_PORTAL source, blocks active duplicates, and restores cancelled canonical rows", async () => {
    const db = createMockDb();

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
      status: "created",
      bookingId: "booking_1",
    });
    expect(db.classBooking.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        memberId: "member_1",
        guardianId: null,
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
        bookingType: "STANDARD",
        status: "BOOKED",
        source: "MEMBER_PORTAL",
      },
      select: {
        id: true,
      },
    });

    db.classBooking.findFirst = vi.fn().mockResolvedValueOnce({
      id: "booking_existing",
      classTemplateId: "template_1",
      scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
      bookingType: "STANDARD",
      status: "BOOKED",
      classTemplate: buildTemplate(),
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
      status: "error",
      message: "You already have an active booking for that class date.",
    });

    db.classBooking.findFirst = vi.fn().mockResolvedValueOnce({
      id: "booking_cancelled",
      classTemplateId: "template_1",
      scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
      bookingType: "STANDARD",
      status: "CANCELLED",
      classTemplate: buildTemplate(),
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
      status: "restored",
      bookingId: "booking_1",
    });
    expect(db.classBooking.update).toHaveBeenCalledWith({
      where: {
        id: "booking_cancelled",
      },
      data: {
        bookingType: "STANDARD",
        guardianId: null,
        source: "MEMBER_PORTAL",
        status: "BOOKED",
      },
      select: {
        id: true,
      },
    });
  });

  it("cancels only the member's own upcoming booking and rejects foreign or past-cutoff cancellations", async () => {
    const db = createMockDb();
    db.classBooking.findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "booking_1",
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
        bookingType: "STANDARD",
        status: "BOOKED",
        classTemplate: buildTemplate(),
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "booking_1",
        classTemplateId: "template_1",
        scheduledForDate: new Date("2026-04-14T00:00:00.000Z"),
        bookingType: "STANDARD",
        status: "BOOKED",
        classTemplate: buildTemplate({
          cancellationCutoffMinutes: 60,
        }),
      });

    await expect(
      cancelSelfBooking({
        workspaceId: "workspace_1",
        memberId: "member_1",
        bookingId: "booking_1",
        timezone: "UTC",
        now: new Date("2026-04-14T12:00:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "cancelled",
      bookingId: "booking_1",
    });
    expect(db.classBooking.updateMany).toHaveBeenCalledWith({
      where: {
        id: "booking_1",
        workspaceId: "workspace_1",
        memberId: "member_1",
        status: "BOOKED",
      },
      data: {
        status: "CANCELLED",
      },
    });

    await expect(
      cancelSelfBooking({
        workspaceId: "workspace_1",
        memberId: "member_1",
        bookingId: "booking_foreign",
        timezone: "UTC",
        now: new Date("2026-04-14T12:00:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Booking not found.",
    });

    await expect(
      cancelSelfBooking({
        workspaceId: "workspace_1",
        memberId: "member_1",
        bookingId: "booking_1",
        timezone: "UTC",
        now: new Date("2026-04-14T17:30:00.000Z"),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Cancellation cutoff has already passed for this booking.",
    });
  });
});
