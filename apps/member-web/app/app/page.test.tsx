import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboardMock, requireContextMock } = vi.hoisted(() => ({
  getDashboardMock: vi.fn(),
  requireContextMock: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../_components/member-shell", () => ({
  MemberShell: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("../../lib/member-auth", () => ({
  requireMemberPortalContext: requireContextMock,
}));

vi.mock("../../lib/member-portal", () => ({
  getMemberPortalDashboard: getDashboardMock,
}));

import AppHomePage from "./page";

const context = {
  workspace: { id: "workspace_1" },
  member: { id: "member_1" },
  location: { timezone: "America/Vancouver" },
};

function dashboardWithPendingPayment() {
  return {
    membership: {
      allowedProgramNames: [],
      currentMembership: {
        id: "membership_1",
        workspaceId: "workspace_1",
        memberId: "member_1",
        membershipPlanId: "plan_1",
        status: "PENDING_PAYMENT_METHOD",
        startedAt: new Date("2026-07-01T00:00:00.000Z"),
        endedAt: null,
        nextBillingDate: new Date("2026-08-15T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        cancelRequestedAt: null,
        frozenFrom: null,
        frozenUntil: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        membershipPlan: {
          id: "plan_1",
          name: "Unlimited training",
          description: null,
          monthlyPriceCents: 15000,
          currency: "cad",
          programRestrictions: [],
        },
        billingState: {
          id: "billing_1",
          status: "PENDING_PAYMENT_METHOD",
          nextBillingDate: new Date("2026-08-15T00:00:00.000Z"),
          latestInvoiceId: null,
          latestPaymentIntentId: null,
          latestSubscriptionId: null,
          lastPaymentStatus: null,
          lastPaymentAt: null,
          failureCode: null,
          failureMessage: "Online billing is not connected for this gym yet.",
          failedAt: null,
          gracePeriodEndsAt: null,
          paymentUpdateRequestedAt: null,
          retryRequestedAt: null,
        },
      },
    },
    upcomingBookings: [],
    recentAttendance: [],
  };
}

describe("AppHomePage member priorities", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    requireContextMock.mockResolvedValue(context);
    getDashboardMock.mockResolvedValue(dashboardWithPendingPayment());
  });

  it("orders bookings, membership, billing, and attendance exactly", async () => {
    const html = renderToStaticMarkup(await AppHomePage());
    const bookingsStart = html.indexOf(">Upcoming bookings<");
    const membershipStart = html.indexOf(">Membership<");
    const billingStart = html.indexOf(">Billing<");
    const attendanceStart = html.indexOf(">Recent attendance<");

    expect(bookingsStart).toBeGreaterThan(-1);
    expect(membershipStart).toBeGreaterThan(bookingsStart);
    expect(billingStart).toBeGreaterThan(membershipStart);
    expect(attendanceStart).toBeGreaterThan(billingStart);
  });

  it("uses readable payment labels, retains truthful disconnected billing copy, and recovers from no bookings", async () => {
    const html = renderToStaticMarkup(await AppHomePage());

    expect(html).toContain("Payment setup needed");
    expect(html).toContain("Payment method needed");
    expect(html).not.toContain("PENDING_PAYMENT_METHOD");
    expect(html).toContain("Online billing is not connected for this gym yet.");
    expect(html).toContain('href="/app/schedule"');
    expect(html).toContain("Browse the class schedule");
  });
});
