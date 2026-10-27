import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import {
  createStripeDisputeGateway,
  reconcileDisputeWebhook,
} from "./disputes.js";
function provider() {
  const dispute = {
    id: "du_fixture",
    charge: "ch_fixture",
    payment_intent: null,
    livemode: false,
    status: "under_review",
    reason: "general",
    amount: 8000,
    currency: "cad",
    is_charge_refundable: false,
    evidence_details: { due_by: 1800000000 },
    balance_transactions: [
      {
        id: "txn_1",
        amount: -8000,
        fee: 1500,
        net: -9500,
        currency: "cad",
        type: "adjustment",
      },
    ],
  };
  const charge = {
    id: "ch_fixture",
    payment_intent: "pi_fixture",
    customer: "cus_fixture",
    livemode: false,
    paid: true,
    amount: 10000,
    amount_refunded: 2000,
    currency: "cad",
  };
  const mock = {
    disputes: {
      retrieve: vi.fn().mockResolvedValue(dispute),
      list: vi.fn().mockResolvedValue({ data: [dispute], has_more: true }),
    },
    charges: { retrieve: vi.fn().mockResolvedValue(charge) },
    refunds: {
      list: vi.fn().mockReturnValue(
        (async function* () {
          yield {
            id: "re_fixture",
            charge: "ch_fixture",
            amount: 2000,
            currency: "cad",
            status: "succeeded",
          };
        })(),
      ),
    },
    invoicePayments: {
      list: vi.fn().mockReturnValue(
        (async function* () {
          yield {
            id: "inpay_1",
            payment: { payment_intent: "pi_fixture" },
            invoice: "in_1",
            amount_paid: 6000,
          };
          yield {
            id: "inpay_2",
            payment: { payment_intent: "pi_fixture" },
            invoice: "in_2",
            amount_paid: 4000,
          };
        })(),
      ),
    },
    invoices: {
      retrieve: vi
        .fn()
        .mockResolvedValue({
          customer: "cus_fixture",
          livemode: false,
          currency: "cad",
        }),
    },
    balanceTransactions: { retrieve: vi.fn() },
  };
  return {
    mock,
    dispute,
    charge,
    gateway: createStripeDisputeGateway(mock as unknown as Stripe, false),
  };
}
describe("verified processor dispute adapter", () => {
  it("uses connected account reads, nullable PI fallback, and all invoice allocations without copying private evidence", async () => {
    const { gateway, mock } = provider();
    const result = await gateway.retrieve("acct_gym", "du_fixture");
    expect(mock.disputes.retrieve).toHaveBeenCalledWith(
      "du_fixture",
      {},
      { stripeAccount: "acct_gym" },
    );
    expect(mock.charges.retrieve).toHaveBeenCalledWith(
      "ch_fixture",
      {},
      { stripeAccount: "acct_gym" },
    );
    expect(mock.invoicePayments.list).toHaveBeenCalledWith(
      {
        payment: { type: "payment_intent", payment_intent: "pi_fixture" },
        status: "paid",
        limit: 100,
      },
      { stripeAccount: "acct_gym" },
    );
    expect(result.paymentIntentId).toBe("pi_fixture");
    expect(result.allocations).toHaveLength(2);
    expect(result.refunds).toEqual([
      {
        id: "re_fixture",
        amountCents: 2000,
        currency: "cad",
        status: "succeeded",
      },
    ]);
    expect(result.balanceTransactions).toEqual([
      {
        id: "txn_1",
        amount: -8000,
        fee: 1500,
        net: -9500,
        currency: "cad",
        type: "adjustment",
      },
    ]);
    expect(result).not.toHaveProperty("evidence");
  });
  it.each([
    ["mode", { livemode: true }],
    ["charge", { charge: null }],
    ["identity", { id: "du_other" }],
  ])(
    "rejects mismatched dispute %s before any entitlement write",
    async (_name, changes) => {
      const { gateway, mock, dispute } = provider();
      mock.disputes.retrieve.mockResolvedValue({ ...dispute, ...changes });
      await expect(gateway.retrieve("acct_gym", "du_fixture")).rejects.toThrow(
        "account or mode",
      );
      expect(mock.charges.retrieve).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["mode", { livemode: true }],
    ["currency", { currency: "usd" }],
    ["unpaid", { paid: false }],
  ])("rejects mismatched charge %s", async (_name, changes) => {
    const { gateway, mock, charge } = provider();
    mock.charges.retrieve.mockResolvedValue({ ...charge, ...changes });
    await expect(gateway.retrieve("acct_gym", "du_fixture")).rejects.toThrow(
      "not been verified",
    );
  });
  it("rejects another invoice payer and bounds the recovery page", async () => {
    const { gateway, mock } = provider();
    mock.invoices.retrieve.mockResolvedValue({
      customer: "cus_sibling",
      livemode: false,
      currency: "cad",
    });
    await expect(gateway.retrieve("acct_gym", "du_fixture")).rejects.toThrow(
      "payer and mode",
    );
    expect(await gateway.list("acct_gym", "du_previous")).toEqual({
      ids: ["du_fixture"],
      hasMore: true,
    });
    expect(mock.disputes.list).toHaveBeenCalledWith(
      { limit: 10, starting_after: "du_previous" },
      { stripeAccount: "acct_gym" },
    );
  });
  it("rejects unsigned-context mode/account mistakes before retrieving resources", async () => {
    const { gateway, mock } = provider();
    await expect(
      reconcileDisputeWebhook(
        {
          type: "charge.dispute.created",
          livemode: true,
          account: "acct_gym",
        } as Stripe.Event,
        { gateway, expectedLivemode: false },
      ),
    ).rejects.toThrow("account and mode");
    await expect(
      reconcileDisputeWebhook(
        { type: "charge.dispute.created", livemode: false } as Stripe.Event,
        { gateway, expectedLivemode: false },
      ),
    ).rejects.toThrow("account and mode");
    expect(mock.disputes.retrieve).not.toHaveBeenCalled();
  });
});
