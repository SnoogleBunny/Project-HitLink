import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  connectStripeActionMock,
  fetchMock,
  getWorkspaceStripeSettingsMock,
  ownerContextMock,
  refreshStripeConnectionActionMock,
} = vi.hoisted(() => ({
  connectStripeActionMock: vi.fn(),
  fetchMock: vi.fn(),
  getWorkspaceStripeSettingsMock: vi.fn(),
  ownerContextMock: vi.fn(),
  refreshStripeConnectionActionMock: vi.fn(),
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

vi.mock("../../../_components/admin-shell", () => ({
  AdminShell: ({
    actions,
    children,
    description,
    title,
  }: PropsWithChildren<{
    actions?: ReactNode;
    description: string;
    title: string;
  }>) => (
    <main data-description={description} data-title={title}>
      {actions}
      {children}
    </main>
  ),
}));

vi.mock("../../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: ownerContextMock,
}));

vi.mock("../../../../lib/stripe-settings", () => ({
  formatStripeConnectionStatus: (status: string) =>
    status === "ACTIVE" ? "Active" : "Not connected",
  getWorkspaceStripeSettings: getWorkspaceStripeSettingsMock,
}));

vi.mock("./actions", () => ({
  connectStripeAction: connectStripeActionMock,
  refreshStripeConnectionAction: refreshStripeConnectionActionMock,
}));

vi.mock("./grace-period-form", () => ({
  BillingSettingsRecoveryAlert: ({ message }: { message: string }) => (
    <div role="alert" tabIndex={-1}>
      <strong>Stripe connection unavailable</strong>
      <p>{message}</p>
    </div>
  ),
  GracePeriodForm: ({
    failedPaymentGracePeriodDays,
  }: {
    failedPaymentGracePeriodDays: number;
  }) => <div data-grace-period-days={failedPaymentGracePeriodDays} />,
}));

import BillingSettingsPage from "./page";

const ownerContext = {
  session: {
    userId: "owner-1",
    displayName: "Jacky Owner",
    email: "owner@example.com",
    workspaceId: "workspace-1",
    role: "OWNER",
  },
  workspace: {
    id: "workspace-1",
    name: "North Shore Muay Thai",
  },
};

const baseSettings = {
  workspaceId: "workspace-1",
  stripeAccountId: null,
  connectionStatus: "NOT_CONNECTED",
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  failedPaymentGracePeriodDays: 7,
};

const unavailable = {
  status: "unavailable",
  reason: "stripe-secret-key-not-configured",
  message: "Stripe is unavailable because STRIPE_SECRET_KEY is not configured.",
} as const;

function getButton(html: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<button[^>]*>\\s*${escapedLabel}\\s*</button>`),
  );

  expect(match, `button labeled ${label}`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("BillingSettingsPage Stripe availability boundary", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
    connectStripeActionMock.mockReset();
    refreshStripeConnectionActionMock.mockReset();
    getWorkspaceStripeSettingsMock.mockReset();
    ownerContextMock.mockReset();
    ownerContextMock.mockResolvedValue(ownerContext);
  });

  it("shows the exact no-key reason before native-disabled provider controls without blocking local grace settings", async () => {
    getWorkspaceStripeSettingsMock.mockResolvedValue({
      ...baseSettings,
      providerAvailability: unavailable,
    });

    const html = renderToStaticMarkup(
      await BillingSettingsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain(unavailable.message);
    expect(html).toContain('id="stripe-provider-unavailable-reason"');
    expect(getButton(html, "Connect Stripe")).toContain('disabled=""');
    expect(getButton(html, "Connect Stripe")).toContain(
      'aria-describedby="stripe-provider-unavailable-reason"',
    );
    expect(getButton(html, "Refresh status")).toContain('disabled=""');
    expect(getButton(html, "Refresh status")).toContain(
      'aria-describedby="stripe-provider-unavailable-reason"',
    );
    expect(html).toContain('data-grace-period-days="7"');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connectStripeActionMock).not.toHaveBeenCalled();
    expect(refreshStripeConnectionActionMock).not.toHaveBeenCalled();
  });

  it("fails closed when the upstream availability projection is absent", async () => {
    getWorkspaceStripeSettingsMock.mockResolvedValue(baseSettings);

    const html = renderToStaticMarkup(
      await BillingSettingsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain(
      "Stripe connection availability could not be verified. Connect and refresh are unavailable.",
    );
    expect(getButton(html, "Connect Stripe")).toContain('disabled=""');
    expect(getButton(html, "Refresh status")).toContain('disabled=""');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("announces and focuses bounded recovery after a fail-closed provider action redirect", async () => {
    getWorkspaceStripeSettingsMock.mockResolvedValue({
      ...baseSettings,
      providerAvailability: unavailable,
    });

    const html = renderToStaticMarkup(
      await BillingSettingsPage({
        searchParams: Promise.resolve({ stripe: "unavailable" }),
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Stripe connection unavailable");
    expect(html).toContain(unavailable.message);
  });

  it("keeps the injected fake-ready disconnected branch enabled without live Stripe", async () => {
    getWorkspaceStripeSettingsMock.mockResolvedValue({
      ...baseSettings,
      providerAvailability: { status: "ready" },
    });

    const html = renderToStaticMarkup(
      await BillingSettingsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(getButton(html, "Connect Stripe")).not.toContain("disabled");
    expect(getButton(html, "Refresh status")).not.toContain("disabled");
    expect(html).not.toContain(unavailable.message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the fake-ready connected branch and continue-setup action", async () => {
    getWorkspaceStripeSettingsMock.mockResolvedValue({
      ...baseSettings,
      stripeAccountId: "acct_demo_connected",
      connectionStatus: "ACTIVE",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      providerAvailability: { status: "ready" },
    });

    const html = renderToStaticMarkup(
      await BillingSettingsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("acct_demo_connected");
    expect(html).toContain("Charges enabled");
    expect(getButton(html, "Continue setup")).not.toContain("disabled");
    expect(getButton(html, "Refresh status")).not.toContain("disabled");
  });
});
