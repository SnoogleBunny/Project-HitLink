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

  it("reconciles canonical invoice state before marking a webhook processed", async () => {
    const db = createMockDb();
    const reconcile = vi.fn().mockResolvedValue(true);

    await expect(
      processStripeWebhookEvent({
        event: buildWebhookEvent(),
        db,
        now: new Date("2026-04-08T00:00:00.000Z"),
        reconcileMembershipEvent: reconcile,
        recoverPublicMembershipEvent: vi.fn().mockResolvedValue(false),
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
    expect(reconcile).toHaveBeenCalledWith(buildWebhookEvent());
    expect(db.membershipBillingState.upsert).not.toHaveBeenCalled();
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
    const reconcile = vi.fn().mockRejectedValue(new Error("db down"));

    await expect(
      processStripeWebhookEvent({
        event: buildWebhookEvent(),
        db,
        reconcileMembershipEvent: reconcile,
        recoverPublicMembershipEvent: vi.fn().mockResolvedValue(false),
      }),
    ).resolves.toEqual({
      status: "error",
      code: "MEMBERSHIP_RECONCILIATION_PENDING",
      diagnosticId: expect.any(String),
      message: expect.stringMatching(/retry/i),
    });

    expect(db.stripeWebhookEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ERROR",
          lastError: expect.stringMatching(/^MEMBERSHIP_RECONCILIATION_PENDING:[0-9a-f-]{36}$/),
        }),
      }),
    );
  });
});



describe("processor dispute webhook dispatch", () => {
  it.each(["created", "updated", "closed", "funds_withdrawn", "funds_reinstated"])("dispatches charge.dispute.%s before marking its durable receipt complete", async (suffix) => {
    const db = createMockDb();
    const handler = vi.fn().mockResolvedValue(undefined);
    const event = buildWebhookEvent({ type: `charge.dispute.${suffix}`, data: { object: { id: "du_1", object: "dispute" } } });
    expect(await processStripeWebhookEvent({ event, db, reconcileDisputeEvent: handler })).toEqual({ status: "processed" });
    expect(handler).toHaveBeenCalledWith(event);
    expect(db.stripeWebhookEvent.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }));
  });
  it("leaves provider uncertainty retryable and stores only a normalized error code", async () => {
    const db = createMockDb();
    const result = await processStripeWebhookEvent({ event: buildWebhookEvent({ type: "charge.dispute.closed" }), db, reconcileDisputeEvent: vi.fn().mockRejectedValue(new Error("private provider body")) });
    expect(result).toEqual({ status: "error", code: "DISPUTE_RECONCILIATION_PENDING", diagnosticId: expect.any(String), message: expect.stringMatching(/retry/i) });
    expect(db.stripeWebhookEvent.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR", lastError: expect.stringMatching(/^DISPUTE_RECONCILIATION_PENDING:[0-9a-f-]{36}$/) }) }));
  });
});
