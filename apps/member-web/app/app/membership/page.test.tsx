import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBillingMock,
  getMembershipMock,
  getPunchCardsMock,
  requireContextMock,
} = vi.hoisted(() => ({
  getBillingMock: vi.fn(),
  getMembershipMock: vi.fn(),
  getPunchCardsMock: vi.fn(),
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

vi.mock("../../../lib/member-commerce", () => ({
  getMemberPunchCardPageData: getPunchCardsMock,
}));

vi.mock("../../../lib/member-portal", () => ({
  getMemberMembershipSummary: getMembershipMock,
}));

vi.mock("./punch-card-purchase-form", () => ({
  PunchCardPurchaseForm: ({
    purchaseUnavailableReason,
  }: {
    purchaseUnavailableReason?: string | null;
  }) => (
    <div>
      {purchaseUnavailableReason ? (
        <p id="punch-card-purchase-unavailable">{purchaseUnavailableReason}</p>
      ) : null}
      <button
        aria-describedby={
          purchaseUnavailableReason
            ? "punch-card-purchase-unavailable"
            : undefined
        }
        disabled={Boolean(purchaseUnavailableReason)}
        type="submit"
      >
        Buy punch card
      </button>
    </div>
  ),
}));

import MembershipPage from "./page";

const context = {
  workspace: { id: "workspace_1" },
  member: { id: "member_1" },
  location: { timezone: "America/Toronto" },
};

const disconnectedReason =
  "Online billing is not connected for this gym yet.";

function currentMembership(status = "PENDING_PAYMENT_METHOD") {
  return {
    allowedProgramNames: ["Muay Thai"],
    currentMembership: {
      id: "membership_1",
      status,
      nextBillingDate: new Date("2027-01-15T21:30:00.000Z"),
      cancelAtPeriodEnd: true,
      frozenFrom: new Date("2027-01-15T00:00:00.000Z"),
      frozenUntil: new Date("2027-01-31T00:00:00.000Z"),
      membershipPlan: {
        name: "Unlimited training",
        monthlyPriceCents: 12900,
        currency: "cad",
      },
    },
  };
}

function punchCards(status = "DEPLETED") {
  return {
    cards: [
      {
        id: "card_1",
        name: "10-class pack",
        description: "Non-expiring",
        originalPunches: 10,
        remainingPunches: 0,
        status,
        purchasedAt: new Date("2027-01-15T21:30:00.000Z"),
        restrictionSummary: "Muay Thai",
      },
    ],
    availableProducts: [],
  };
}

describe("MembershipPage purchase readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    requireContextMock.mockResolvedValue(context);
    getMembershipMock.mockResolvedValue({
      allowedProgramNames: [],
      currentMembership: null,
    });
    getPunchCardsMock.mockResolvedValue({
      cards: [],
      availableProducts: [
        {
          id: "product_1",
          name: "10-class pack",
          description: "Ten visits",
          punchesIncluded: 10,
          priceCents: 25000,
          currency: "cad",
          restrictionSummary: "All active programs",
        },
      ],
    });
    getBillingMock.mockResolvedValue({
      currentMembership: null,
      recentRecords: [],
      canUpdatePaymentMethod: false,
      canRetryPayment: false,
      readOnlyReason: disconnectedReason,
    });
  });

  it("disables purchase before the gym activates online billing and explains why", async () => {
    const html = renderToStaticMarkup(await MembershipPage());
    const buyButton = html.match(/<button[^>]*>Buy punch card<\/button>/)?.[0];

    expect(getBillingMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      memberId: "member_1",
    });
    expect(buyButton).toContain('disabled=""');
    expect(buyButton).toContain(
      'aria-describedby="punch-card-purchase-unavailable"',
    );
    expect(html).toContain(disconnectedReason);
  });

  it("keeps the connected fake-gateway purchase branch enabled", async () => {
    getBillingMock.mockResolvedValue({
      currentMembership: null,
      recentRecords: [],
      canUpdatePaymentMethod: false,
      canRetryPayment: false,
      readOnlyReason: null,
    });

    const html = renderToStaticMarkup(await MembershipPage());
    const buyButton = html.match(/<button[^>]*>Buy punch card<\/button>/)?.[0];

    expect(buyButton).not.toContain("disabled");
    expect(buyButton).not.toContain("aria-describedby");
    expect(html).not.toContain("punch-card-purchase-unavailable");
  });
});

describe("MembershipPage display truth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    requireContextMock.mockResolvedValue(context);
    getMembershipMock.mockResolvedValue(currentMembership());
    getPunchCardsMock.mockResolvedValue(punchCards());
    getBillingMock.mockResolvedValue({
      currentMembership: null,
      recentRecords: [],
      canUpdatePaymentMethod: false,
      canRetryPayment: false,
      readOnlyReason: null,
    });
  });

  it("renders approved labels while keeping date-only and gym-time instants truthful", async () => {
    const html = renderToStaticMarkup(await MembershipPage());

    expect(html).toContain("Membership status");
    expect(html).toContain("Payment method needed");
    expect(html).toContain("Next billing (gym time)");
    expect(html).toContain("Jan 15, 2027, 4:30 p.m. EST");
    expect(html).toContain("End after current billing period");
    expect(html).toContain("Scheduled");
    expect(html).toContain("Scheduled freeze");
    expect(html).toContain("Jan 15, 2027 to Jan 31, 2027");
    expect(html).toContain("Punch-card status");
    expect(html).toContain("Used up");
    expect(html).toContain('aria-label="Punches remaining: 0 of 10"');
    expect(html).toContain("Purchased (gym time)");
    expect(html).toContain("$129.00");

    expect(html).not.toMatch(/PENDING_PAYMENT_METHOD|DEPLETED/);

    const planIndex = html.indexOf("Unlimited training");
    const statusIndex = html.indexOf("Membership status");
    const priceIndex = html.indexOf("$129.00");
    const billingIndex = html.indexOf("Next billing (gym time)");
    const cancelIndex = html.indexOf("End after current billing period");
    const freezeIndex = html.indexOf("Scheduled freeze");
    const programsIndex = html.indexOf("Allowed programs");

    expect(statusIndex).toBeGreaterThan(planIndex);
    expect(priceIndex).toBeGreaterThan(statusIndex);
    expect(billingIndex).toBeGreaterThan(priceIndex);
    expect(cancelIndex).toBeGreaterThan(billingIndex);
    expect(freezeIndex).toBeGreaterThan(cancelIndex);
    expect(programsIndex).toBeGreaterThan(freezeIndex);
  });

  it("uses non-raw fallbacks for unknown membership and punch-card statuses", async () => {
    getMembershipMock.mockResolvedValue(
      currentMembership("FUTURE_MEMBERSHIP_STATE"),
    );
    getPunchCardsMock.mockResolvedValue(punchCards("FUTURE_CARD_STATE"));

    const html = renderToStaticMarkup(await MembershipPage());

    expect(html).toContain("Membership status unavailable");
    expect(html).toContain("Status unavailable");
    expect(html).not.toMatch(/FUTURE_MEMBERSHIP_STATE|FUTURE_CARD_STATE/);
  });
});
