import { describe, expect, it, vi } from "vitest";
import { processStripeWebhookEvent } from "./stripe-billing";

type StripeWebhookTestDb = NonNullable<
  Parameters<typeof processStripeWebhookEvent>[0]["db"]
>;

function buildWebhookEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "invoice.payment_failed",
    livemode: false,
    account: "acct_1",
    data: {
      object: {
        id: "in_1",
        object: "invoice",
        subscription: "sub_1",
        amount_due: 12900,
        amount_paid: 0,
        currency: "usd",
        status_transitions: {
          paid_at: 1775606400,
        },
        payment_intent: {
          id: "pi_1",
          last_payment_error: {
            code: "card_declined",
            message: "Card declined",
          },
        },
      },
    },
    ...overrides,
  } as never;
}

function createMockDb(): StripeWebhookTestDb {
  return {
    stripeWebhookEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "webhook_event_1",
        status: "PROCESSING",
        receivedAt: new Date("2026-04-08T00:00:00.000Z"),
        updatedAt: new Date("2026-04-08T00:00:00.000Z"),
      }),
      update: vi.fn().mockResolvedValue({
        id: "webhook_event_1",
        status: "PROCESSED",
        receivedAt: new Date("2026-04-08T00:00:00.000Z"),
        updatedAt: new Date("2026-04-08T00:00:00.000Z"),
      }),
    },
    workspaceStripeSettings: {
      findFirst: vi.fn().mockResolvedValue({
        workspaceId: "workspace_1",
        stripeAccountId: "acct_1",
        failedPaymentGracePeriodDays: 7,
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    memberMembership: {
      findFirst: vi.fn().mockResolvedValue({
        id: "membership_1",
        workspaceId: "workspace_1",
        memberId: "member_1",
        stripeSubscriptionId: "sub_1",
        billingState: {
          id: "billing_state_1",
        },
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    membershipBillingState: {
      upsert: vi.fn().mockResolvedValue({
        id: "billing_state_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    billingRecord: {
      create: vi.fn().mockResolvedValue({
        id: "billing_record_1",
      }),
    },
  };
}

describe("Stripe billing webhook processing", () => {
  it("dedupes an already processed webhook event by persisted event id", async () => {
    const db = createMockDb();
    db.stripeWebhookEvent.findUnique = vi.fn().mockResolvedValue({
      id: "webhook_event_1",
      status: "PROCESSED",
      receivedAt: new Date("2026-04-08T00:00:00.000Z"),
      updatedAt: new Date("2026-04-08T00:00:00.000Z"),
    });

    await expect(
      processStripeWebhookEvent({
        event: buildWebhookEvent(),
        db,
      }),
    ).resolves.toEqual({
      status: "duplicate",
    });

    expect(db.membershipBillingState.upsert).not.toHaveBeenCalled();
    expect(db.billingRecord.create).not.toHaveBeenCalled();
  });

  it("maps invoice payment failures into billing state and records", async () => {
    const db = createMockDb();

    await expect(
      processStripeWebhookEvent({
        event: buildWebhookEvent(),
        db,
        now: new Date("2026-04-08T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "processed",
    });

    expect(db.stripeWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stripeEventId: "evt_1",
          status: "PROCESSING",
          attemptCount: 1,
        }),
      }),
    );
    expect(db.membershipBillingState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "PAYMENT_FAILED",
          latestInvoiceId: "in_1",
          latestPaymentIntentId: "pi_1",
          failureCode: "card_declined",
          failureMessage: "Card declined",
        }),
      }),
    );
    expect(db.billingRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "PAYMENT_FAILED",
          status: "FAILED",
          stripeEventId: "evt_1",
          stripeInvoiceId: "in_1",
          stripeSubscriptionId: "sub_1",
        }),
      }),
    );
    expect(db.stripeWebhookEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PROCESSED",
        }),
      }),
    );
  });

  it("marks the webhook row as errored so Stripe can retry", async () => {
    const db = createMockDb();
    db.billingRecord.create = vi.fn().mockRejectedValue(new Error("db down"));

    await expect(
      processStripeWebhookEvent({
        event: buildWebhookEvent(),
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "db down",
    });

    expect(db.stripeWebhookEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ERROR",
          lastError: "db down",
        }),
      }),
    );
  });
});

