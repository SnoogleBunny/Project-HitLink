import { describe, expect, it, vi } from "vitest";
import {
  createMemberPaymentMethodUpdateSession,
  getMemberBillingSummary,
  retryOwnFailedPayment,
  type MemberBillingStripeClient,
} from "./member-billing";

type MemberBillingTestDb = NonNullable<
  Parameters<typeof getMemberBillingSummary>[0]["db"]
>;

function buildMembership() {
  return {
    id: "membership_1",
    workspaceId: "workspace_1",
    memberId: "member_1",
    membershipPlanId: "plan_1",
    status: "PENDING_PAYMENT_METHOD" as const,
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
      programRestrictions: [],
    },
    billingState: {
      id: "billing_state_1",
      status: "PENDING_PAYMENT_METHOD" as const,
      nextBillingDate: new Date("2026-05-01T00:00:00.000Z"),
      latestInvoiceId: "in_1",
      latestPaymentIntentId: null,
      latestSubscriptionId: "sub_1",
      lastPaymentStatus: "PENDING" as const,
      lastPaymentAt: null,
      failureCode: "missing_payment_method",
      failureMessage: "Add a payment method",
      failedAt: new Date("2026-04-08T00:00:00.000Z"),
      gracePeriodEndsAt: new Date("2026-04-15T00:00:00.000Z"),
      paymentUpdateRequestedAt: null,
      retryRequestedAt: null,
    },
  };
}

function createMockDb(): MemberBillingTestDb {
  return {
    memberMembership: {
      findFirst: vi.fn().mockResolvedValue(buildMembership()),
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
    membershipBillingState: {
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    billingRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: "billing_record_1",
      }),
    },
  };
}

function createStripeMock(): MemberBillingStripeClient {
  return {
    createPaymentMethodUpdateSession: vi.fn().mockResolvedValue({
      url: "https://stripe.test/session",
    }),
    retryInvoicePayment: vi.fn().mockResolvedValue({
      stripeInvoiceId: "in_1",
      status: "succeeded",
      latestPaymentIntentId: "pi_1",
      failureCode: null,
      failureMessage: null,
    }),
  };
}

describe("member billing helpers", () => {
  it("returns a read-only summary when Stripe linkage is incomplete", async () => {
    const db = createMockDb();
    db.memberMembership.findFirst = vi.fn().mockResolvedValue({
      ...buildMembership(),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      billingState: {
        ...buildMembership().billingState,
        latestSubscriptionId: null,
      },
    });

    const result = await getMemberBillingSummary({
      workspaceId: "workspace_1",
      memberId: "member_1",
      db,
    });

    expect(result.canUpdatePaymentMethod).toBe(false);
    expect(result.canRetryPayment).toBe(false);
    expect(result.readOnlyReason).toBe(
      "Billing is not fully linked for this membership yet.",
    );
  });

  it("creates a member-scoped payment-method session and records the request", async () => {
    const db = createMockDb();
    const stripe = createStripeMock();
    const now = new Date("2026-04-08T10:00:00.000Z");

    await expect(
      createMemberPaymentMethodUpdateSession({
        workspaceId: "workspace_1",
        memberId: "member_1",
        returnUrl: "http://localhost:3001/app/billing",
        db,
        stripe,
        now,
      }),
    ).resolves.toEqual({
      status: "created",
      url: "https://stripe.test/session",
    });

    expect(stripe.createPaymentMethodUpdateSession).toHaveBeenCalledWith({
      stripeAccountId: "acct_1",
      stripeCustomerId: "cus_1",
      returnUrl: "http://localhost:3001/app/billing",
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
  });

  it("retries only the current member's actionable invoice and updates billing state", async () => {
    const db = createMockDb();
    const stripe = createStripeMock();
    const now = new Date("2026-04-08T10:00:00.000Z");

    await expect(
      retryOwnFailedPayment({
        workspaceId: "workspace_1",
        memberId: "member_1",
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
          latestPaymentIntentId: "pi_1",
          lastPaymentStatus: "SUCCEEDED",
          retryRequestedAt: now,
        }),
      }),
    );
    expect(db.memberMembership.updateMany).toHaveBeenCalledWith({
      where: {
        id: "membership_1",
        workspaceId: "workspace_1",
      },
      data: {
        status: "ACTIVE",
      },
    });
  });
});
