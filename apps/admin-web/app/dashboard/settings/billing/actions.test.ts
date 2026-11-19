import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  refreshStripeConnectionStatusMock,
  requireOwnerWorkspaceContextMock,
  startStripeConnectOnboardingMock,
  updateFailedPaymentGracePeriodMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  refreshStripeConnectionStatusMock: vi.fn(),
  requireOwnerWorkspaceContextMock: vi.fn(),
  startStripeConnectOnboardingMock: vi.fn(),
  updateFailedPaymentGracePeriodMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("../../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: requireOwnerWorkspaceContextMock,
}));

vi.mock("../../../../lib/stripe-settings", () => ({
  refreshStripeConnectionStatus: refreshStripeConnectionStatusMock,
  startStripeConnectOnboarding: startStripeConnectOnboardingMock,
  updateFailedPaymentGracePeriod: updateFailedPaymentGracePeriodMock,
}));

import {
  connectStripeAction,
  refreshStripeConnectionAction,
} from "./actions";

const unavailableResult = {
  status: "unavailable",
  reason: "stripe-secret-key-not-configured",
  message: "Stripe is unavailable because STRIPE_SECRET_KEY is not configured.",
} as const;

describe("owner Stripe settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerWorkspaceContextMock.mockResolvedValue({
      workspace: {
        id: "workspace_1",
        name: "Sahara Muay Thai",
      },
    });
  });

  it("redirects connect unavailability to explicit UI feedback", async () => {
    startStripeConnectOnboardingMock.mockResolvedValue(unavailableResult);

    await expect(connectStripeAction()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/settings/billing?stripe=unavailable",
    );

    expect(startStripeConnectOnboardingMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      workspaceName: "Sahara Muay Thai",
    });
  });

  it("redirects refresh unavailability to explicit UI feedback", async () => {
    refreshStripeConnectionStatusMock.mockResolvedValue(unavailableResult);

    await expect(refreshStripeConnectionAction()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/settings/billing?stripe=unavailable",
    );

    expect(refreshStripeConnectionStatusMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
    });
  });
});