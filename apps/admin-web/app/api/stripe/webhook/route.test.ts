import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signature: "", process: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "stripe-signature": mocks.signature }),
}));
vi.mock("../../../../lib/stripe-billing", async () => {
  const { default: SDK } = await import("stripe");
  return {
    processStripeWebhookEvent: mocks.process,
    stripeBillingGateway: {
      constructWebhookEvent: ({
        payload,
        signature,
        webhookSecret,
      }: {
        payload: string;
        signature: string;
        webhookSecret: string;
      }) =>
        new SDK("sk_test_local_signature_only").webhooks.constructEvent(
          payload,
          signature,
          webhookSecret,
        ),
    },
  };
});
import { POST } from "./route";
const secret = "whsec_fictional_local_signature_test";
const payload = JSON.stringify({
  id: "evt_local",
  object: "event",
  account: "acct_local",
  livemode: false,
  type: "charge.dispute.created",
  data: { object: { id: "du_local", object: "dispute" } },
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("raw-body Stripe dispute webhook signature boundary", () => {
  it("dispatches a locally SDK-signed event only after verification", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    mocks.signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp: Math.floor(Date.now() / 1000),
      scheme: "v1",
      signature: "",
      cryptoProvider: Stripe.createNodeCryptoProvider(),
    });
    mocks.process.mockResolvedValue({ status: "processed" });
    expect(
      (
        await POST(
          new Request("http://localhost/api/stripe/webhook", {
            method: "POST",
            body: payload,
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith({
      event: expect.objectContaining({
        id: "evt_local",
        type: "charge.dispute.created",
      }),
    });
  });
  it("projects retry failure fields without trusting a handled message or arbitrary diagnostic reference", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    mocks.signature = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000), scheme: "v1", signature: "", cryptoProvider: Stripe.createNodeCryptoProvider() });
    const marker = "PRIVATE_ROUTE_MESSAGE_SENTINEL";
    mocks.process.mockResolvedValue({ status: "error", message: marker, code: marker, diagnosticId: marker });
    const response = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: expect.stringMatching(/retry/i), code: "STRIPE_WEBHOOK_RECONCILIATION_PENDING" });
    expect(JSON.stringify(body)).not.toContain(marker);
  });
  it("rejects changed raw bytes and another signing secret before dispatch", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    mocks.signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp: Math.floor(Date.now() / 1000),
      scheme: "v1",
      signature: "",
      cryptoProvider: Stripe.createNodeCryptoProvider(),
    });
    expect(
      (
        await POST(
          new Request("http://localhost/api/stripe/webhook", {
            method: "POST",
            body: `${payload} `,
          }),
        )
      ).status,
    ).toBe(400);
    mocks.signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_other_local",
      timestamp: Math.floor(Date.now() / 1000),
      scheme: "v1",
      signature: "",
      cryptoProvider: Stripe.createNodeCryptoProvider(),
    });
    expect(
      (
        await POST(
          new Request("http://localhost/api/stripe/webhook", {
            method: "POST",
            body: payload,
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
