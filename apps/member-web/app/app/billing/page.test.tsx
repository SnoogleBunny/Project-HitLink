import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBillingMock, requireContextMock } = vi.hoisted(() => ({
  getBillingMock: vi.fn(),
  requireContextMock: vi.fn(),
}));

vi.mock("../../_components/member-shell", () => ({
  MemberShell: ({ children }: PropsWithChildren) => <main>{children}</main>,
}));

vi.mock("../../../lib/member-auth", () => ({
  requireMemberPortalContext: requireContextMock,
}));

vi.mock("../../../lib/member-billing", () => ({
  getMemberBillingSummary: getBillingMock,
}));

vi.mock("./billing-actions", () => ({
  BillingActions: ({
    canRetryPayment,
    canUpdatePaymentMethod,
  }: {
    canRetryPayment: boolean;
    canUpdatePaymentMethod: boolean;
  }) => (
    <div
      data-can-retry={String(canRetryPayment)}
      data-can-update={String(canUpdatePaymentMethod)}
    />
  ),
}));

import BillingPage from "./page";

const context = {
  workspace: { id: "workspace_1" },
  member: { id: "member_1" },
  location: { timezone: "America/Toronto" },
};

function billingSummary() {
  return {
    currentMembership: {
      billingState: {
        status: "PAYMENT_FAILED",
        nextBillingDate: new Date("2027-01-15T21:30:00.000Z"),
        lastPaymentStatus: "ACTION_REQUIRED",
        failureMessage: null,
        failureCode: "card_declined",
        gracePeriodEndsAt: new Date("2027-01-16T21:30:00.000Z"),
      },
    },
    canRetryPayment: true,
    canUpdatePaymentMethod: true,
    readOnlyReason: null,
    recentRecords: [
      {
        id: "record_1",
        type: "PAYMENT_UPDATE_REQUESTED",
        status: "INFO",
        amountCents: 12900,
        currency: "cad",
        occurredAt: new Date("2027-01-15T21:30:00.000Z"),
        stripeInvoiceId: "in_secret_provider_id",
        failureMessage: null,
        failureCode: null,
      },
      {
        id: "record_2",
        type: "PAYMENT_FAILED",
        status: "ACTION_REQUIRED",
        amountCents: null,
        currency: "cad",
        occurredAt: new Date("2027-01-16T21:30:00.000Z"),
        stripeInvoiceId: null,
        failureMessage: null,
        failureCode: null,
      },
    ],
  };
}

describe("BillingPage display truth", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    requireContextMock.mockResolvedValue(context);
    getBillingMock.mockResolvedValue(billingSummary());
  });

  it("renders approved labels, gym-time instants, amounts, and invoice availability", async () => {
    const html = renderToStaticMarkup(await BillingPage());

    for (const copy of [
      "Payment failed",
      "Next billing (gym time)",
      "Jan 15, 2027, 4:30 p.m. EST",
      "Last payment status",
      "Member action needed",
      "Payment issue",
      "Payment was declined.",
      "Grace period ends (gym time)",
      "Payment-method update requested",
      "Billing record status",
      "Recorded (gym time)",
      "$129.00",
      "Invoice available",
      "Yes",
      "No",
      "No payment issue recorded",
      "Amount not recorded",
      "Payment issue details are unavailable.",
      "Open the secure payment page to update the payment method on file, or retry the latest payment when a retry is available.",
    ]) {
      expect(html).toContain(copy);
    }

    expect(html).toContain('data-can-retry="true"');
    expect(html).toContain('data-can-update="true"');
    expect(html).not.toMatch(
      /PAYMENT_FAILED|ACTION_REQUIRED|PAYMENT_UPDATE_REQUESTED|in_secret_provider_id/,
    );

    const headingIndex = html.indexOf("Payment-method update requested");
    const statusIndex = html.indexOf("Billing record status", headingIndex);
    const recordedIndex = html.indexOf("Recorded (gym time)", headingIndex);
    const amountIndex = html.indexOf("Amount", headingIndex);
    const invoiceIndex = html.indexOf("Invoice available", headingIndex);
    const issueIndex = html.indexOf("Payment issue", invoiceIndex);

    expect(statusIndex).toBeGreaterThan(headingIndex);
    expect(recordedIndex).toBeGreaterThan(statusIndex);
    expect(amountIndex).toBeGreaterThan(recordedIndex);
    expect(invoiceIndex).toBeGreaterThan(amountIndex);
    expect(issueIndex).toBeGreaterThan(invoiceIndex);
  });

  it("uses non-raw fallbacks without hiding failed state or actions", async () => {
    getBillingMock.mockResolvedValue({
      ...billingSummary(),
      currentMembership: {
        billingState: {
          ...billingSummary().currentMembership.billingState,
          status: "FUTURE_BILLING_STATE",
          lastPaymentStatus: "FUTURE_RECORD_STATUS",
          failureCode: "future_provider_failure",
        },
      },
      recentRecords: [
        {
          ...billingSummary().recentRecords[0],
          type: "FUTURE_RECORD_TYPE",
          status: "FUTURE_RECORD_STATUS",
          currency: "zzz",
        },
      ],
    });

    const html = renderToStaticMarkup(await BillingPage());

    expect(html).toContain("Billing status unavailable");
    expect(html).toContain("Status unavailable");
    expect(html).toContain("Billing update");
    expect(html).toContain("Payment could not be completed.");
    expect(html).toContain("12900 ZZZ amount units");
    expect(html).toContain('data-can-retry="true"');
    expect(html).not.toMatch(
      /FUTURE_BILLING_STATE|FUTURE_RECORD_STATUS|FUTURE_RECORD_TYPE|future_provider_failure/,
    );
  });
});
