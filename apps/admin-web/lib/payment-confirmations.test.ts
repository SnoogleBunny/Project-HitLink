import { describe, expect, it } from "vitest";
import {
  formatPaymentConfirmation,
  readPaymentConfirmationSnapshot,
  type PaymentConfirmationSnapshot,
} from "@flowstate/db";
const snapshot: PaymentConfirmationSnapshot = {
  version: 1,
  businessName: "Fictional Gym",
  contactEmail: null,
  contactPhone: null,
  beneficiaryName: "Fictional child",
  description: "Accepted class pack",
  invoiceNumber: null,
  providerReference: "pi_fictional",
  timezone: "UTC",
  locale: "en-CA",
};
describe("payment confirmation display", () => {
  it("preserves exact minor units for zero and three decimal currencies", () => {
    const receipt = {
      id: "receipt_test",
      paidAt: new Date("2026-01-02T15:00:00Z"),
      snapshot,
    };
    expect(
      formatPaymentConfirmation({
        ...receipt,
        amountMinor: 1234,
        currency: "jpy",
      }).amount,
    ).toContain("1,234");
    expect(
      formatPaymentConfirmation({
        ...receipt,
        amountMinor: 1234,
        currency: "kwd",
      }).amount,
    ).toContain("1.234");
  });
  it("uses the frozen locale, timezone and accepted description without changing the integer amount", () => {
    const args = {
      id: "receipt_test",
      paidAt: new Date("2026-01-02T00:30:00Z"),
      amountMinor: 12345,
      currency: "eur",
      snapshot: { ...snapshot, locale: "de-DE", timezone: "America/Vancouver" },
    };
    const output = formatPaymentConfirmation(args);
    expect(output.amount).toContain("123,45");
    expect(output.paidAt).toContain("1. Januar 2026");
    expect(output.body).toContain("Accepted class pack");
    expect(args.amountMinor).toBe(12345);
  });
  it("fails closed for unknown or incomplete receipt snapshots", () => {
    expect(() =>
      readPaymentConfirmationSnapshot({ ...snapshot, version: 2 }),
    ).toThrow("needs review");
    expect(() =>
      readPaymentConfirmationSnapshot({ ...snapshot, providerReference: null }),
    ).toThrow("needs review");
    expect(() =>
      readPaymentConfirmationSnapshot({
        ...snapshot,
        privateNote: "unreviewed",
      }),
    ).toThrow("needs review");
  });
});
