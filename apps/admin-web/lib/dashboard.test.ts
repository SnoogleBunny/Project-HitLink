import { describe, expect, it, vi } from "vitest";
import {
  buildDashboardAttention,
  getOwnerDashboardSummary,
  type OwnerDashboardSummary,
} from "./dashboard";
import type { TodayClassSummary } from "./rosters";

type DashboardTestDb = NonNullable<
  Parameters<typeof getOwnerDashboardSummary>[0]["db"]
>;
type FailedPaymentQueueItem = OwnerDashboardSummary["failedPayments"][number];

function buildTodayClass(
  overrides: Partial<TodayClassSummary> = {},
): TodayClassSummary {
  return {
    id: "template_1",
    displayTitle: "Muay Thai Fundamentals",
    scheduledForDate: "2026-05-26",
    weekdayLabel: "Tuesday",
    timeLabel: "18:00 - 19:00",
    roomName: "Main Mat",
    coachDisplayName: "Casey Coach",
    effectiveCapacity: 20,
    rosterCount: 18,
    trialCount: 1,
    attendanceRecordedCount: 10,
    ...overrides,
  };
}

function buildQueueRecord(
  overrides: Partial<FailedPaymentQueueItem> = {},
): FailedPaymentQueueItem {
  return {
    id: "billing_state_1",
    status: "PAYMENT_FAILED",
    nextBillingDate: new Date("2026-05-30T00:00:00.000Z"),
    latestInvoiceId: "in_1",
    latestPaymentIntentId: "pi_1",
    failureCode: "card_declined",
    failureMessage: "Card declined",
    failedAt: new Date("2026-05-22T00:00:00.000Z"),
    gracePeriodEndsAt: new Date("2026-05-29T00:00:00.000Z"),
    paymentUpdateRequestedAt: null,
    retryRequestedAt: null,
    member: {
      id: "member_1",
      fullName: "Maya Chen",
      email: "maya@example.com",
      phone: "555-1000",
    },
    memberMembership: {
      id: "membership_1",
      stripeSubscriptionId: "sub_1",
      membershipPlan: {
        name: "Unlimited",
        monthlyPriceCents: 14900,
        currency: "usd",
      },
    },
    ...overrides,
  };
}

function buildTemplateRecord() {
  return {
    id: "template_1",
    title: null,
    weekday: "TUESDAY" as const,
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    capacityOverride: null,
    coachWorkspaceUserId: "owner_workspace_user_1",
    program: {
      name: "Muay Thai Fundamentals",
    },
    room: {
      name: "Main Mat",
      capacity: 20,
    },
    coachWorkspaceUser: {
      id: "owner_workspace_user_1",
      role: "OWNER" as const,
      isActive: true,
      user: {
        fullName: "Owner One",
        email: "owner@example.com",
      },
    },
  };
}

function buildBookingRecord(index: number, bookingType: "MEMBERSHIP" | "TRIAL") {
  return {
    id: `booking_${index}`,
    memberId: `member_${index}`,
    guardianId: null,
    bookingType,
    status: "BOOKED" as const,
    classTemplateId: "template_1",
    member: {
      id: `member_${index}`,
      fullName: `Member ${index}`,
      email: `member${index}@example.com`,
      phone: null,
      status: bookingType === "TRIAL" ? "TRIAL" : "ACTIVE",
      notes: null,
      tags: [],
      familyLinks: [],
    },
    guardian: null,
  };
}

function createDashboardDb(args?: {
  templates?: ReturnType<typeof buildTemplateRecord>[];
  bookings?: ReturnType<typeof buildBookingRecord>[];
  attendanceCount?: number;
  failedPayments?: FailedPaymentQueueItem[];
  pendingInvites?: Array<{
    id: string;
    email: string;
    expiresAt: Date;
    createdAt: Date;
  }>;
}): DashboardTestDb {
  const templates = args?.templates ?? [buildTemplateRecord()];
  const bookings =
    args?.bookings ??
    [
      buildBookingRecord(1, "TRIAL"),
      buildBookingRecord(2, "MEMBERSHIP"),
      buildBookingRecord(3, "MEMBERSHIP"),
    ];
  const attendanceRecords = Array.from(
    {
      length: args?.attendanceCount ?? 1,
    },
    (_, index) => ({
      id: `attendance_${index + 1}`,
      memberId: `member_${index + 1}`,
      classTemplateId: "template_1",
      state: "PRESENT" as const,
      note: null,
      updatedAt: new Date("2026-05-26T19:00:00.000Z"),
    }),
  );
  const db = {
    $transaction: vi.fn(async (callback) => callback(db)),
    program: {
      count: vi.fn().mockResolvedValue(2),
    },
    room: {
      count: vi.fn().mockResolvedValue(1),
    },
    classTemplate: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue(templates),
      findFirst: vi.fn().mockResolvedValue(templates[0] ?? null),
    },
    membershipPlan: {
      count: vi.fn().mockResolvedValue(3),
    },
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
      }),
    },
    memberMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    memberPunchCard: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({
        count: 0,
      }),
    },
    dropInProduct: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    classBooking: {
      findMany: vi.fn().mockResolvedValue(bookings),
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
      count: vi.fn().mockResolvedValue(bookings.length),
    },
    waitlistEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: "waitlist_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "waitlist_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    attendanceRecord: {
      findMany: vi.fn().mockResolvedValue(attendanceRecords),
      upsert: vi.fn().mockResolvedValue({
        id: "attendance_1",
      }),
    },
    membershipBillingState: {
      findMany: vi.fn().mockResolvedValue(args?.failedPayments ?? []),
      findFirst: vi.fn().mockResolvedValue(args?.failedPayments?.[0] ?? null),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    workspaceStripeSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    billingRecord: {
      create: vi.fn().mockResolvedValue({
        id: "billing_record_1",
      }),
    },
    staffInvite: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue(
        (args?.pendingInvites ?? []).map((invite) => ({
          ...invite,
          role: "COACH" as const,
          status: "PENDING" as const,
          invitedByUser: {
            fullName: "Owner One",
            email: "owner@example.com",
          },
        })),
      ),
      updateMany: vi.fn().mockResolvedValue({
        count: 0,
      }),
    },
  };

  return db as DashboardTestDb;
}

describe("dashboard aggregation", () => {
  it("builds owner readiness metrics, setup counts, and top attention items", async () => {
    const failedPayment = buildQueueRecord();
    const db = createDashboardDb({
      failedPayments: [failedPayment],
      pendingInvites: [
        {
          id: "invite_1",
          email: "coach@example.com",
          expiresAt: new Date("2026-05-30T00:00:00.000Z"),
          createdAt: new Date("2026-05-20T00:00:00.000Z"),
        },
      ],
    });

    const summary = await getOwnerDashboardSummary({
      workspaceId: "workspace_1",
      workspaceUserId: "owner_workspace_user_1",
      timezone: "America/Vancouver",
      locationId: "location_1",
      now: new Date("2026-05-26T16:00:00.000Z"),
      db,
    });

    expect(summary.scheduledForDate).toBe("2026-05-26");
    expect(summary.metrics).toEqual([
      expect.objectContaining({
        id: "classes",
        value: 1,
        tone: "neutral",
      }),
      expect.objectContaining({
        id: "bookings",
        value: 3,
        tone: "neutral",
      }),
      expect.objectContaining({
        id: "trials",
        value: 1,
        tone: "success",
      }),
      expect.objectContaining({
        id: "attendance",
        value: 2,
        tone: "warning",
      }),
      expect.objectContaining({
        id: "billing",
        value: 1,
        tone: "danger",
      }),
    ]);
    expect(summary.setup).toEqual({
      programCount: 2,
      roomCount: 1,
      templateCount: 1,
      membershipPlanCount: 3,
      pendingInviteCount: 1,
    });
    expect(summary.attentionItems.map((item) => item.category)).toEqual([
      "billing",
      "attendance",
      "trials",
      "invites",
    ]);
    expect(summary.attentionItems[0]).toMatchObject({
      title: "Payment needs action: Maya Chen",
      context:
        "Payment Failed · Failed May 22, 2026 · Grace ends May 29, 2026",
      href: "/dashboard/billing",
      severity: "danger",
    });
  });

  it("uses intentional billing context when failed dates are not available", () => {
    const result = buildDashboardAttention({
      todayClasses: [],
      failedPayments: [
        buildQueueRecord({
          status: "PENDING_PAYMENT_METHOD",
          failedAt: null,
          gracePeriodEndsAt: null,
          nextBillingDate: new Date("2026-06-01T00:00:00.000Z"),
        }),
      ],
      pendingInvites: [],
    });

    expect(result.attentionItems[0]).toMatchObject({
      context: "Payment method needs setup · Next billing Jun 1, 2026",
    });
  });

  it("sorts and limits attention items by urgency", () => {
    const todayClasses = [
      buildTodayClass({
        id: "template_1",
        trialCount: 1,
        rosterCount: 10,
        attendanceRecordedCount: 4,
      }),
      buildTodayClass({
        id: "template_2",
        displayTitle: "HYROX Engine",
        trialCount: 0,
        rosterCount: 18,
        attendanceRecordedCount: 18,
      }),
      buildTodayClass({
        id: "template_3",
        displayTitle: "Advanced Sparring",
        trialCount: 2,
        rosterCount: 8,
        attendanceRecordedCount: 8,
        effectiveCapacity: 30,
      }),
    ];

    const result = buildDashboardAttention({
      todayClasses,
      failedPayments: [
        buildQueueRecord({
          id: "billing_state_1",
        }),
        buildQueueRecord({
          id: "billing_state_2",
          member: {
            id: "member_2",
            fullName: "Nina Patel",
            email: null,
            phone: null,
          },
        }),
      ],
      pendingInvites: [
        {
          id: "invite_1",
          email: "coach1@example.com",
          status: "PENDING",
          expiresAt: new Date("2026-05-30T00:00:00.000Z"),
          createdAt: new Date("2026-05-20T00:00:00.000Z"),
          invitedByDisplayName: "Owner One",
          invitedByEmail: "owner@example.com",
        },
        {
          id: "invite_2",
          email: "coach2@example.com",
          status: "PENDING",
          expiresAt: new Date("2026-05-30T00:00:00.000Z"),
          createdAt: new Date("2026-05-20T00:00:00.000Z"),
          invitedByDisplayName: "Owner One",
          invitedByEmail: "owner@example.com",
        },
      ],
    });

    expect(result.attentionItems).toHaveLength(5);
    expect(result.attentionItems.map((item) => item.category)).toEqual([
      "billing",
      "billing",
      "attendance",
      "trials",
      "trials",
    ]);
    expect(result.attentionSummary).toEqual([
      expect.objectContaining({
        category: "billing",
        count: 2,
        tone: "danger",
      }),
      expect.objectContaining({
        category: "attendance",
        count: 1,
        tone: "warning",
      }),
      expect.objectContaining({
        category: "trials",
        count: 2,
        tone: "success",
      }),
      expect.objectContaining({
        category: "capacity",
        count: 1,
        tone: "warning",
      }),
      expect.objectContaining({
        category: "invites",
        count: 2,
        tone: "warning",
      }),
    ]);
  });

  it("keeps the clear-day state healthy when there is nothing actionable", async () => {
    const db = createDashboardDb({
      templates: [],
      bookings: [],
      attendanceCount: 0,
      failedPayments: [],
      pendingInvites: [],
    });

    const summary = await getOwnerDashboardSummary({
      workspaceId: "workspace_1",
      workspaceUserId: "owner_workspace_user_1",
      timezone: "America/Vancouver",
      locationId: "location_1",
      now: new Date("2026-05-26T16:00:00.000Z"),
      db,
    });

    expect(summary.scheduledForDate).toBeNull();
    expect(summary.attentionItems).toEqual([]);
    expect(summary.metrics).toEqual([
      expect.objectContaining({
        id: "classes",
        value: 0,
      }),
      expect.objectContaining({
        id: "bookings",
        value: 0,
      }),
      expect.objectContaining({
        id: "trials",
        value: 0,
        tone: "neutral",
      }),
      expect.objectContaining({
        id: "attendance",
        value: 0,
        tone: "success",
      }),
      expect.objectContaining({
        id: "billing",
        value: 0,
        tone: "success",
      }),
    ]);
    expect(summary.attentionSummary).toEqual([
      expect.objectContaining({
        category: "billing",
        count: 0,
        tone: "success",
      }),
      expect.objectContaining({
        category: "attendance",
        count: 0,
        tone: "success",
      }),
      expect.objectContaining({
        category: "trials",
        count: 0,
        tone: "neutral",
      }),
      expect.objectContaining({
        category: "capacity",
        count: 0,
        tone: "success",
      }),
      expect.objectContaining({
        category: "invites",
        count: 0,
        tone: "success",
      }),
    ]);
  });
});
