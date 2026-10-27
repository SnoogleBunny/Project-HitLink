import { afterEach, describe, expect, it, vi } from "vitest";
import { createStripeWebhookFailure, stripeWebhookPublicFailure } from "./stripe-webhook-failures";

afterEach(() => vi.restoreAllMocks());
describe("Stripe webhook safe failure projection", () => {
  it.each([
    ["refund.failed", "REFUND_RECONCILIATION_PENDING"],
    ["checkout.session.completed", "CHECKOUT_RECONCILIATION_PENDING"],
    ["account.application.deauthorized", "STRIPE_ACCOUNT_RECONCILIATION_PENDING"],
  ])("retains actionable failure identity for %s without a provider exception payload", (eventType, code) => {
    const emit = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = createStripeWebhookFailure({ eventType, stripeEventId: "evt_fictional123", stripeAccountId: "acct_fictional123", livemode: true });
    expect(failure.code).toBe(code);
    expect(stripeWebhookPublicFailure(failure)).toEqual({ error: failure.message, code, diagnosticId: failure.diagnosticId });
    const record = JSON.parse(emit.mock.calls[0]![0] as string);
    expect(record).toMatchObject({ eventType, code, diagnosticId: failure.diagnosticId, stripeEventId: "evt_fictional123", stripeAccountId: "acct_fictional123", livemode: true });
  });
  it("does not copy a forged message, diagnostic reference, unknown event type or malformed provider identity", () => {
    const emit = vi.spyOn(console, "error").mockImplementation(() => {});
    const marker = "PRIVATE_PAYLOAD_SENTINEL";
    const failure = createStripeWebhookFailure({ eventType: marker, stripeEventId: `evt_${marker}\n`, stripeAccountId: marker, livemode: false });
    expect(failure.code).toBe("STRIPE_WEBHOOK_RECONCILIATION_PENDING");
    const body = stripeWebhookPublicFailure({ code: marker, diagnosticId: marker, message: marker } as never);
    expect(body).toMatchObject({ code: "STRIPE_WEBHOOK_RECONCILIATION_PENDING", error: expect.stringMatching(/retry/i) });
    expect(body).not.toHaveProperty("diagnosticId");
    expect(JSON.stringify({ body, failure, log: emit.mock.calls })).not.toContain(marker);
    expect(JSON.parse(emit.mock.calls[0]![0] as string)).not.toHaveProperty("stripeEventId");
  });
});
