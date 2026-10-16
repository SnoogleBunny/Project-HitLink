import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { retrieveInvoiceEvidence } from "@flowstate/payments";
function gateway(changes: Record<string, unknown> = {}) {
  return {
    invoices: {
      retrieve: async () => ({
        id: "in_unpaid",
        customer: "cus_payer",
        status: "open",
        currency: "cad",
        subtotal: 100,
        total: 100,
        amount_paid: 0,
        amount_remaining: 100,
        created: 1000,
        status_transitions: {},
        attempted: true,
        attempt_count: 2,
        ...changes,
      }),
    },
    invoicePayments: {
      list: async function* () {
        /* No settled allocations. */
      },
    },
  } as unknown as Stripe;
}
describe("canonical invoice failure evidence", () => {
  it("does not invent a failure date when an attempted unpaid invoice is discovered later", async () => {
    const evidence = await retrieveInvoiceEvidence(
      "acct",
      "in_unpaid",
      { type: "invoice.updated", created: 2000 },
      gateway(),
    );
    expect(evidence.firstFailedAt).toBeUndefined();
    expect(evidence.failureCode).toBe("payment_failure_time_unknown");
  });
  it("uses the verified failure event date and does not mark an unattempted invoice failed", async () => {
    const failed = await retrieveInvoiceEvidence(
      "acct",
      "in_unpaid",
      { type: "invoice.payment_failed", created: 2000 },
      gateway(),
    );
    expect(failed.firstFailedAt).toEqual(new Date(2000000));
    const unattempted = await retrieveInvoiceEvidence(
      "acct",
      "in_unpaid",
      { type: "invoice.updated", created: 2000 },
      gateway({ attempted: false, attempt_count: 0 }),
    );
    expect(unattempted.failureCode).toBeNull();
    expect(unattempted.firstFailedAt).toBeUndefined();
  });
  it("does not turn a settled or void invoice into new failed debt on a delayed event", async () => {
    for (const status of ["paid", "void"]) {
      const result = await retrieveInvoiceEvidence(
        "acct",
        "in_unpaid",
        { type: "invoice.payment_failed", created: 2000 },
        gateway({ status, amount_remaining: 0 }),
      );
      expect(result.firstFailedAt).toBeUndefined();
      expect(result.failureCode).toBeNull();
    }
  });
});
