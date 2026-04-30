import { describe, expect, it, vi } from "vitest";
import {
  getMemberPunchCardPageData,
  startDropInCheckout,
  startPunchCardCheckout,
} from "./member-commerce";

type MemberCommerceTestDb = NonNullable<
  Parameters<typeof getMemberPunchCardPageData>[0]["db"]
>;

type MemberCommerceStripe = NonNullable<
  Parameters<typeof startPunchCardCheckout>[0]["stripe"]
>;

function createMockDb(): MemberCommerceTestDb {
  return {
    workspaceStripeSettings: {
      findUnique: vi.fn().mockResolvedValue({
        stripeAccountId: "acct_1",
        connectionStatus: "ACTIVE",
        chargesEnabled: true,
      }),
    },
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        phone: "555-1234",
      }),
    },
    memberMembership: {
      findFirst: vi.fn().mockResolvedValue({
        stripeCustomerId: "cus_1",
      }),
    },
    punchCardProduct: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "product_1",
          name: "10-class pack",
          description: "Non-expiring",
          punchesIncluded: 10,
          priceCents: 25000,
          currency: "usd",
          isEnabled: true,
          archivedAt: null,
          stripeProductId: null,
          stripePriceId: null,
          restrictionMode: "PROGRAM_RESTRICTED" as const,
          programRestrictions: [
            {
              program: {
                id: "program_1",
                name: "Muay Thai",
              },
            },
          ],
        },
      ]),
      findFirst: vi.fn().mockResolvedValue({
        id: "product_1",
        name: "10-class pack",
        description: "Non-expiring",
        punchesIncluded: 10,
        priceCents: 25000,
        currency: "usd",
        isEnabled: true,
        archivedAt: null,
        stripeProductId: null,
        stripePriceId: null,
        restrictionMode: "GENERAL" as const,
        programRestrictions: [],
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    memberPunchCard: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "card_1",
          originalPunches: 10,
          remainingPunches: 6,
          status: "ACTIVE" as const,
          purchasePriceCents: 25000,
          purchaseCurrency: "usd",
          purchasedAt: new Date("2026-04-01T00:00:00.000Z"),
          punchCardProduct: {
            id: "product_1",
            name: "10-class pack",
            description: "Non-expiring",
            restrictionMode: "PROGRAM_RESTRICTED" as const,
            programRestrictions: [
              {
                program: {
                  id: "program_1",
                  name: "Muay Thai",
                },
              },
            ],
          },
        },
      ]),
    },
    classBooking: {
      findFirst: vi.fn().mockResolvedValue({
        id: "booking_1",
        memberId: "member_1",
        bookingType: "DROP_IN" as const,
        status: "PENDING_PAYMENT" as const,
        dropInProductId: "drop_in_1",
        dropInPriceCents: 3500,
        dropInCurrency: "usd",
        classTemplate: {
          title: "Muay Thai Fundamentals",
          program: {
            name: "Muay Thai",
          },
        },
        dropInProduct: {
          id: "drop_in_1",
          name: "Single class",
          stripeProductId: "prod_dropin",
          stripePriceId: "price_dropin",
        },
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
  };
}

function createStripeMock(): MemberCommerceStripe {
  return {
    ensureCustomer: vi.fn().mockResolvedValue({
      stripeCustomerId: "cus_1",
    }),
    ensureOneTimePrice: vi.fn().mockResolvedValue({
      stripeProductId: "prod_1",
      stripePriceId: "price_1",
    }),
    createCheckoutSession: vi.fn().mockResolvedValue({
      id: "cs_1",
      url: "https://checkout.example/session",
      expiresAt: new Date("2026-04-08T12:15:00.000Z"),
    }),
  };
}

describe("member commerce helpers", () => {
  it("returns only the member's punch cards plus enabled purchase options", async () => {
    const db = createMockDb();

    const result = await getMemberPunchCardPageData({
      workspaceId: "workspace_1",
      memberId: "member_1",
      db,
    });

    expect(db.memberPunchCard.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        memberId: "member_1",
      },
      include: {
        punchCardProduct: {
          include: {
            programRestrictions: {
              include: {
                program: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: {
                program: {
                  name: "asc",
                },
              },
            },
          },
        },
      },
      orderBy: [
        {
          purchasedAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });
    expect(db.punchCardProduct.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        isEnabled: true,
        archivedAt: null,
      },
      include: {
        programRestrictions: {
          include: {
            program: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            program: {
              name: "asc",
            },
          },
        },
      },
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    });
    expect(result).toEqual({
      cards: [
        {
          id: "card_1",
          name: "10-class pack",
          description: "Non-expiring",
          originalPunches: 10,
          remainingPunches: 6,
          status: "ACTIVE",
          purchasedAt: new Date("2026-04-01T00:00:00.000Z"),
          purchasePriceCents: 25000,
          purchaseCurrency: "usd",
          restrictionSummary: "Muay Thai",
        },
      ],
      availableProducts: [
        {
          id: "product_1",
          name: "10-class pack",
          description: "Non-expiring",
          punchesIncluded: 10,
          priceCents: 25000,
          currency: "usd",
          restrictionSummary: "Muay Thai",
        },
      ],
    });
  });

  it("starts punch-card checkout and syncs Stripe price identifiers", async () => {
    const db = createMockDb();
    const stripe = createStripeMock();

    await expect(
      startPunchCardCheckout({
        workspaceId: "workspace_1",
        memberId: "member_1",
        punchCardProductId: "product_1",
        successUrl: "https://member.example/ok",
        cancelUrl: "https://member.example/cancel",
        db,
        stripe,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "ok",
      url: "https://checkout.example/session",
    });

    expect(stripe.createCheckoutSession).toHaveBeenCalledWith({
      stripeAccountId: "acct_1",
      stripeCustomerId: "cus_1",
      stripePriceId: "price_1",
      successUrl: "https://member.example/ok",
      cancelUrl: "https://member.example/cancel",
      expiresAt: 1775650500,
      metadata: {
        checkoutType: "punch_card_purchase",
        workspaceId: "workspace_1",
        memberId: "member_1",
        punchCardProductId: "product_1",
        punchesIncluded: "10",
        priceCents: "25000",
        currency: "usd",
      },
    });
    expect(db.punchCardProduct.updateMany).toHaveBeenCalledWith({
      where: {
        id: "product_1",
        workspaceId: "workspace_1",
      },
      data: {
        stripeProductId: "prod_1",
        stripePriceId: "price_1",
      },
    });
  });

  it("stores drop-in checkout metadata and cancels stale pending bookings on checkout failure", async () => {
    const db = createMockDb();
    const stripe = createStripeMock();

    await expect(
      startDropInCheckout({
        workspaceId: "workspace_1",
        memberId: "member_1",
        bookingId: "booking_1",
        successUrl: "https://member.example/ok",
        cancelUrl: "https://member.example/cancel",
        db,
        stripe,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "ok",
      url: "https://checkout.example/session",
    });

    expect(db.classBooking.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "booking_1",
        workspaceId: "workspace_1",
        memberId: "member_1",
        status: "PENDING_PAYMENT",
      },
      data: {
        dropInCheckoutSessionId: "cs_1",
        pendingPaymentExpiresAt: new Date("2026-04-08T12:15:00.000Z"),
      },
    });

    const failingDb = createMockDb();
    const failingStripe = createStripeMock();
    failingStripe.createCheckoutSession = vi
      .fn()
      .mockRejectedValue(new Error("Stripe is unavailable"));

    await expect(
      startDropInCheckout({
        workspaceId: "workspace_1",
        memberId: "member_1",
        bookingId: "booking_1",
        successUrl: "https://member.example/ok",
        cancelUrl: "https://member.example/cancel",
        db: failingDb,
        stripe: failingStripe,
        now: new Date("2026-04-08T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Stripe is unavailable",
    });

    expect(failingDb.classBooking.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "booking_1",
        workspaceId: "workspace_1",
        memberId: "member_1",
        status: "PENDING_PAYMENT",
      },
      data: {
        status: "CANCELLED",
        pendingPaymentExpiresAt: null,
      },
    });
  });
});
