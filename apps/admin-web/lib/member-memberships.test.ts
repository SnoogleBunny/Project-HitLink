import { describe, expect, it, vi } from "vitest";
import {
  assignMembershipToMember,
  cancelMembershipAtPeriodEnd,
  freezeMemberMembership,
} from "./member-memberships";
import type { StripeBillingGateway } from "./stripe-billing";

type MemberMembershipTestDb = NonNullable<
  Parameters<typeof assignMembershipToMember>[0]["db"]
>;

function buildPlan() {
  return {
    id: "plan_1",
    name: "Unlimited",
    description: null,
    monthlyPriceCents: 12900,
    currency: "usd",
    archivedAt: null,
    stripeProductId: null,
    stripePriceId: null,
  };
}

function buildMembership() {
  return {
    id: "membership_1",
    workspaceId: "workspace_1",
    memberId: "member_1",
    membershipPlanId: "plan_1",
    status: "ACTIVE" as const,
    startedAt: new Date("2026-04-08T00:00:00.000Z"),
    endedAt: null,
    nextBillingDate: new Date("2026-05-08T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    cancelRequestedAt: null,
    frozenFrom: null,
    frozenUntil: null,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    currentMembershipSlot: "CURRENT",
    membershipPlan: buildPlan(),
    billingState: {
      id: "billing_state_1",
      status: "ACTIVE" as const,
      nextBillingDate: new Date("2026-05-08T00:00:00.000Z"),
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

function createMockDb(): MemberMembershipTestDb {
  return {
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        phone: "555-1234",
        status: "ACTIVE",
      }),
    },
    membershipPlan: {
      findMany: vi.fn().mockResolvedValue([buildPlan()]),
      findFirst: vi.fn().mockResolvedValue(buildPlan()),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    memberMembership: {
      findFirst: vi.fn(async ({ select }) => {
        if (select && "stripeCustomerId" in (select as Record<string, unknown>)) {
          return {
            stripeCustomerId: null,
          };
        }

        return null;
      }),
      create: vi.fn().mockResolvedValue({
        id: "membership_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    membershipBillingState: {
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    workspaceStripeSettings: {
      findUnique: vi.fn().mockResolvedValue({
        stripeAccountId: "acct_1",
        connectionStatus: "ACTIVE",
        chargesEnabled: true,
        failedPaymentGracePeriodDays: 7,
      }),
    },
    billingRecord: {
      create: vi.fn().mockResolvedValue({
        id: "billing_record_1",
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function createStripeMock(): StripeBillingGateway {
  return {
    createStandardAccount: vi.fn(),
    createAccountLink: vi.fn(),
    retrieveAccount: vi.fn(),
    ensureCustomer: vi.fn().mockResolvedValue({
      stripeCustomerId: "cus_1",
    }),
    ensureMembershipPlanPrice: vi.fn().mockResolvedValue({
      stripeProductId: "prod_1",
      stripePriceId: "price_1",
    }),
    createSubscription: vi.fn().mockResolvedValue({
      stripeSubscriptionId: "sub_1",
      latestInvoiceId: "in_1",
      latestPaymentIntentId: null,
      status: "active",
      nextBillingDate: new Date("2026-05-08T00:00:00.000Z"),
    }),
    cancelSubscriptionAtPeriodEnd: vi.fn().mockResolvedValue(undefined),
    retryInvoicePayment: vi.fn(),
    constructWebhookEvent: vi.fn(),
  } as unknown as StripeBillingGateway;
}

function resolveNoActivationForms() {
  return Promise.resolve({
    items: [],
    history: [],
  });
}

describe("member membership helpers", () => {
  it("assigns a membership and stores Stripe linkage when billing is ready", async () => {
    const db = createMockDb();
    const stripe = createStripeMock();

    await expect(
      assignMembershipToMember({
        workspaceId: "workspace_1",
        input: {
          memberId: "member_1",
          membershipPlanId: "plan_1",
          nextBillingDate: "2026-05-08",
        },
        db,
        stripe,
        resolveActivationForms: resolveNoActivationForms,
      }),
    ).resolves.toEqual({
      status: "assigned",
      memberMembershipId: "membership_1",
    });

    expect(db.memberMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace_1",
          memberId: "member_1",
          membershipPlanId: "plan_1",
          status: "PENDING_PAYMENT_METHOD",
          currentMembershipSlot: "CURRENT",
        }),
      }),
    );
    expect(stripe.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeAccountId: "acct_1",
        memberMembershipId: "membership_1",
        stripeCustomerId: "cus_1",
        stripePriceId: "price_1",
      }),
    );
    expect(db.memberMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("blocks assignment when the member already has a current membership", async () => {
    const db = createMockDb();
    db.memberMembership.findFirst = vi.fn().mockResolvedValue(buildMembership());

    await expect(
      assignMembershipToMember({
        workspaceId: "workspace_1",
        input: {
          memberId: "member_1",
          membershipPlanId: "plan_1",
        },
        db,
        stripe: createStripeMock(),
        resolveActivationForms: resolveNoActivationForms,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "This member already has a current membership.",
    });

    expect(db.memberMembership.create).not.toHaveBeenCalled();
  });

  it("rejects archived or foreign plans", async () => {
    const db = createMockDb();
    db.membershipPlan.findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      assignMembershipToMember({
        workspaceId: "workspace_1",
        input: {
          memberId: "member_1",
          membershipPlanId: "plan_archived",
        },
        db,
        stripe: createStripeMock(),
        resolveActivationForms: resolveNoActivationForms,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose an active membership plan in this workspace.",
    });
  });

  it("blocks membership assignment when activation forms are still unresolved", async () => {
    const db = createMockDb();

    await expect(
      assignMembershipToMember({
        workspaceId: "workspace_1",
        input: {
          memberId: "member_1",
          membershipPlanId: "plan_1",
        },
        db,
        stripe: createStripeMock(),
        resolveActivationForms: () =>
          Promise.resolve({
            items: [
              {
                formName: "Membership Agreement",
                status: "PENDING",
              },
            ],
            history: [],
          } as never),
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Membership activation is blocked until the current form versions are signed: Membership Agreement.",
    });

    expect(db.memberMembership.create).not.toHaveBeenCalled();
  });

  it("cancels at period end and calls Stripe when a subscription exists", async () => {
    const db = createMockDb();
    const stripe = createStripeMock();
    db.memberMembership.findFirst = vi.fn().mockResolvedValue(buildMembership());

    await expect(
      cancelMembershipAtPeriodEnd({
        workspaceId: "workspace_1",
        memberMembershipId: "membership_1",
        db,
        stripe,
        now: new Date("2026-04-08T10:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "cancelled",
      memberMembershipId: "membership_1",
    });

    expect(stripe.cancelSubscriptionAtPeriodEnd).toHaveBeenCalledWith({
      stripeAccountId: "acct_1",
      stripeSubscriptionId: "sub_1",
    });
    expect(db.memberMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          cancelAtPeriodEnd: true,
          cancelRequestedAt: new Date("2026-04-08T10:00:00.000Z"),
        },
      }),
    );
  });

  it("validates freeze dates and records scheduled freeze state", async () => {
    const db = createMockDb();
    db.memberMembership.findFirst = vi.fn().mockResolvedValue(buildMembership());

    await expect(
      freezeMemberMembership({
        workspaceId: "workspace_1",
        input: {
          memberMembershipId: "membership_1",
          frozenFrom: "2026-05-01",
          frozenUntil: "2026-04-01",
        },
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Freeze end date must be after the start date.",
    });

    await expect(
      freezeMemberMembership({
        workspaceId: "workspace_1",
        input: {
          memberMembershipId: "membership_1",
          frozenFrom: "2026-05-01",
          frozenUntil: "2026-05-15",
        },
        db,
        now: new Date("2026-04-08T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "frozen",
      memberMembershipId: "membership_1",
    });

    expect(db.memberMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACTIVE",
          frozenFrom: new Date("2026-05-01T00:00:00.000Z"),
          frozenUntil: new Date("2026-05-15T00:00:00.000Z"),
        }),
      }),
    );
  });
});
