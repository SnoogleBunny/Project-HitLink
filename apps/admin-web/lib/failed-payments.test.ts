import { describe, expect, it, vi } from "vitest";
import {
  listFailedPaymentQueue,
  markPaymentUpdateRequested,
  retryFailedPaymentNow,
} from "./failed-payments";
import type { StripeBillingGateway } from "./stripe-billing";

type FailedPaymentTestDb = NonNullable<
  Parameters<typeof listFailedPaymentQueue>[0]["db"]
>;

function buildQueueRecord() {
  return {
    id: "billing_state_1",
    status: "PAYMENT_FAILED" as const,
    nextBillingDate: new Date("2026-05-08T00:00:00.000Z"),
    latestInvoiceId: "in_1",
    latestPaymentIntentId: "pi_1",
    failureCode: "card_declined",
    failureMessage: "Card declined",
    failedAt: new Date("2026-04-08T00:00:00.000Z"),
    gracePeriodEndsAt: new Date("2026-04-15T00:00:00.000Z"),
    paymentUpdateRequestedAt: null,
    retryRequestedAt: null,
    member: {
      id: "member_1",
      fullName: "Jordan Lee",
      email: "jordan@example.com",
      phone: "555-1234",
    },
    memberMembership: {
      id: "membership_1",
      stripeSubscriptionId: "sub_1",
      membershipPlan: {
        name: "Unlimited",
        monthlyPriceCents: 12900,
        currency: "usd",
      },
    },
  };
}

function createMockDb(): FailedPaymentTestDb {
  return {
    membershipBillingState: {
      findMany: vi.fn().mockResolvedValue([buildQueueRecord()]),
      findFirst: vi.fn().mockResolvedValue(buildQueueRecord()),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    workspaceStripeSettings: {
      findUnique: vi.fn().mockResolvedValue({
        stripeAccountId: "acct_1",
        connectionStatus: "ACTIVE",
        chargesEnabled: true,
      }),
    },
    billingRecord: {
      create: vi.fn().mockResolvedValue({
        id: "billing_record_1",
      }),
    },
  };
}

function createStripeMock(): StripeBillingGateway {
  return {
    createStandardAccount: vi.fn(),
    createAccountLink: vi.fn(),
    retrieveAccount: vi.fn(),
    ensureCustomer: vi.fn(),
    ensureMembershipPlanPrice: vi.fn(),
    createSubscription: vi.fn(),
    cancelSubscriptionAtPeriodEnd: vi.fn(),
    retryInvoicePayment: vi.fn().mockResolvedValue({
      stripeInvoiceId: "in_1",
      status: "succeeded",
      latestPaymentIntentId: "pi_2",
      failureCode: null,
      failureMessage: null,
    }),
    constructWebhookEvent: vi.fn(),
  } as unknown as StripeBillingGateway;
}

describe("failed payment helpers", () => {
  it("lists only actionable failed payment statuses", async () => {
    const db = createMockDb();

    const queue = await listFailedPaymentQueue({
      workspaceId: "workspace_1",
      db,
    });

    expect(queue).toHaveLength(1);
    expect(db.membershipBillingState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          status: {
            in: [
              "PENDING_PAYMENT_METHOD",
              "PAST_DUE",
              "PAYMENT_FAILED",
              "ACTION_REQUIRED",
            ],
          },
        }),
      }),
    );
  });

  it("marks that a payment update was requested", async () => {
    const db = createMockDb();
    const now = new Date("2026-04-08T10:00:00.000Z");

    await expect(
      markPaymentUpdateRequested({
        workspaceId: "workspace_1",
        membershipBillingStateId: "billing_state_1",
        db,
        now,
      }),
    ).resolves.toEqual({
      status: "updated",
    });

    expect(db.membershipBillingState.updateMany).toHaveBeenCalledWith({
      where: {
        id: "billing_state_1",
        workspaceId: "workspace_1",
      },
      data: {
        paymentUpdateRequestedAt: now,
      },
    });
    expect(db.billingRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PAYMENT_UPDATE_REQUESTED",
          status: "INFO",
        }),
      }),
    );
  });

  it("retries the latest invoice when Stripe is ready", async () => {
    const db = createMockDb();
    const stripe = createStripeMock();
    const now = new Date("2026-04-08T10:00:00.000Z");

    await expect(
      retryFailedPaymentNow({
        workspaceId: "workspace_1",
        membershipBillingStateId: "billing_state_1",
        db,
        stripe,
        now,
      }),
    ).resolves.toEqual({
      status: "retried",
    });

    expect(stripe.retryInvoicePayment).toHaveBeenCalledWith({
      stripeAccountId: "acct_1",
      stripeInvoiceId: "in_1",
    });
    expect(db.membershipBillingState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACTIVE",
          lastPaymentStatus: "SUCCEEDED",
          lastPaymentAt: now,
          retryRequestedAt: now,
        }),
      }),
    );
  });

  it("rejects retry when no latest invoice is available", async () => {
    const db = createMockDb();
    db.membershipBillingState.findFirst = vi.fn().mockResolvedValue({
      ...buildQueueRecord(),
      latestInvoiceId: null,
    });

    await expect(
      retryFailedPaymentNow({
        workspaceId: "workspace_1",
        membershipBillingStateId: "billing_state_1",
        db,
        stripe: createStripeMock(),
      }),
    ).resolves.toEqual({
      status: "error",
      message: "This billing item does not have an invoice to retry.",
    });
  });
});

