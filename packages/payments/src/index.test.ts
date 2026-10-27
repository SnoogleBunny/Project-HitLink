import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { CheckoutRequest } from "@flowstate/db";

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
  findOperation: vi.fn(),
  saveEvidence: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    checkout = {
      sessions: {
        create: mock.create,
        retrieve: mock.retrieve,
        expire: mock.expire,
      },
    };
  },
}));
vi.mock("@flowstate/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flowstate/db")>()),
  prisma: { financialOperation: { findUnique: mock.findOperation } },
  saveCheckoutEvidence: mock.saveEvidence,
}));

import {
  createStripeCheckoutGateway,
  paymentProvider,
  reconcileCheckoutWebhook,
} from "./index.js";

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_reviewed",
    status: "complete",
    payment_status: "paid",
    url: null,
    amount_total: 12000,
    currency: "cad",
    customer: "cus_payer",
    payment_intent: {
      id: "pi_reviewed",
      status: "succeeded",
      amount_received: 12000,
      currency: "cad",
    },
    metadata: {
      operationId: "checkout-operation",
      payerAccountId: "payer-account",
    },
    expires_at: 1792800000,
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_checkout",
    type: "checkout.session.completed",
    account: "acct_gym",
    data: { object: session() },
    ...overrides,
  } as unknown as Stripe.Event & { account?: string };
}

describe("Stripe checkout evidence boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_explicit_fixture");
    mock.retrieve.mockResolvedValue(session());
    mock.create.mockResolvedValue(
      session({ status: "open", payment_status: "unpaid" }),
    );
    mock.findOperation.mockResolvedValue({
      id: "checkout-operation",
      kind: "CHECKOUT",
      providerAccountId: "acct_gym",
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("refuses an unconfigured provider instead of inventing a confirmed purchase", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(() => paymentProvider()).toThrow(
      "Your purchase has not been confirmed",
    );
    expect(mock.create).not.toHaveBeenCalled();
  });

  it("sends the exact reviewed amount and account with one stable provider idempotency key", async () => {
    const request: CheckoutRequest = {
      accountId: "acct_gym",
      operationId: "checkout-operation",
      payerAccountId: "payer-account",
      customerId: "cus_payer",
      email: "payer@example.test",
      name: "Accepted ten-class pack",
      amountCents: 12000,
      currency: "cad",
      successUrl: "https://member.example.test/complete",
      cancelUrl: "https://member.example.test/membership",
      expiresAt: 1792800000,
      metadata: {
        operationId: "checkout-operation",
        payerAccountId: "payer-account",
      },
    };
    const result = await createStripeCheckoutGateway().create(
      request,
      "accepted-checkout-key",
    );
    expect(mock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_payer",
        client_reference_id: "checkout-operation",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "cad",
              unit_amount: 12000,
              product_data: { name: "Accepted ten-class pack" },
            },
          },
        ],
        adaptive_pricing: { enabled: false },
        automatic_tax: { enabled: false },
        allow_promotion_codes: false,
        metadata: request.metadata,
        payment_intent_data: { metadata: request.metadata },
      }),
      { stripeAccount: "acct_gym", idempotencyKey: "accepted-checkout-key" },
    );
    expect(result.paid).toBe(false);
  });

  it("requires a fully settled matching payment intent before returning paid evidence", async () => {
    await expect(
      createStripeCheckoutGateway().retrieve("acct_gym", "cs_reviewed"),
    ).resolves.toMatchObject({
      paid: true,
      amountCents: 12000,
      currency: "cad",
      paymentIntentId: "pi_reviewed",
    });
    expect(mock.retrieve).toHaveBeenCalledWith(
      "cs_reviewed",
      { expand: ["payment_intent"] },
      { stripeAccount: "acct_gym" },
    );
  });

  it.each([
    ["an unexpanded intent", "pi_reviewed"],
    [
      "a processing intent",
      {
        id: "pi_reviewed",
        status: "processing",
        amount_received: 12000,
        currency: "cad",
      },
    ],
    [
      "an underpayment",
      {
        id: "pi_reviewed",
        status: "succeeded",
        amount_received: 11999,
        currency: "cad",
      },
    ],
    [
      "a different currency",
      {
        id: "pi_reviewed",
        status: "succeeded",
        amount_received: 12000,
        currency: "usd",
      },
    ],
  ])(
    "rejects paid session evidence with %s",
    async (_description, paymentIntent) => {
      mock.retrieve.mockResolvedValue(
        session({ payment_intent: paymentIntent }),
      );
      await expect(
        createStripeCheckoutGateway().retrieve("acct_gym", "cs_reviewed"),
      ).rejects.toThrow("has not confirmed the full payment");
      expect(mock.saveEvidence).not.toHaveBeenCalled();
    },
  );

  it("keeps an unpaid session pending even when its intent payload looks successful", async () => {
    mock.retrieve.mockResolvedValue(session({ payment_status: "unpaid" }));
    await expect(
      createStripeCheckoutGateway().retrieve("acct_gym", "cs_reviewed"),
    ).resolves.toMatchObject({ paid: false });
  });

  it.each([
    [
      "another connected account",
      { account: "acct_other" },
      { kind: "CHECKOUT", providerAccountId: "acct_gym" },
    ],
    [
      "no connected account",
      { account: undefined },
      { kind: "CHECKOUT", providerAccountId: "acct_gym" },
    ],
    [
      "a different operation kind",
      {},
      { kind: "REFUND", providerAccountId: "acct_gym" },
    ],
    ["a missing operation", {}, null],
  ])(
    "rejects a crafted webhook with %s before provider retrieval or persistence",
    async (_description, eventOverrides, operation) => {
      mock.findOperation.mockResolvedValue(operation);
      await expect(
        reconcileCheckoutWebhook(event(eventOverrides)),
      ).rejects.toThrow("account does not match");
      expect(mock.retrieve).not.toHaveBeenCalled();
      expect(mock.saveEvidence).not.toHaveBeenCalled();
    },
  );

  it("retrieves canonical provider state instead of trusting a signed webhook's paid flag", async () => {
    mock.retrieve.mockResolvedValue(
      session({ payment_status: "unpaid", status: "open" }),
    );
    await expect(reconcileCheckoutWebhook(event())).resolves.toBe(true);
    expect(mock.saveEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: "checkout-operation",
        accountId: "acct_gym",
        evidence: expect.objectContaining({ paid: false, state: "open" }),
      }),
    );
  });

  it("leaves coaching checkout entitlement to its dedicated reconciler", async () => {
    await expect(
      reconcileCheckoutWebhook(
        event({
          data: {
            object: session({
              metadata: {
                operationId: "checkout-operation",
                purpose: "coaching",
              },
            }),
          },
        }),
      ),
    ).resolves.toBe(false);
    expect(mock.retrieve).not.toHaveBeenCalled();
    expect(mock.saveEvidence).not.toHaveBeenCalled();
  });
});
