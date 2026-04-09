import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  markPaymentUpdateRequestedMock,
  redirectMock,
  requireOwnerWorkspaceContextMock,
  retryFailedPaymentNowMock,
} = vi.hoisted(() => ({
  markPaymentUpdateRequestedMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  requireOwnerWorkspaceContextMock: vi.fn(),
  retryFailedPaymentNowMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: requireOwnerWorkspaceContextMock,
}));

vi.mock("../../../lib/failed-payments", () => ({
  markPaymentUpdateRequested: markPaymentUpdateRequestedMock,
  retryFailedPaymentNow: retryFailedPaymentNowMock,
}));

import {
  markPaymentUpdateRequestedAction,
  retryFailedPaymentNowAction,
} from "./actions";

describe("billing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerWorkspaceContextMock.mockResolvedValue({
      workspace: {
        id: "workspace_1",
      },
    });
    markPaymentUpdateRequestedMock.mockResolvedValue({
      status: "updated",
    });
    retryFailedPaymentNowMock.mockResolvedValue({
      status: "retried",
    });
  });

  it("uses the owner workspace context before marking payment update requests", async () => {
    const formData = new FormData();
    formData.set("membershipBillingStateId", "billing_state_1");

    await expect(markPaymentUpdateRequestedAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/billing",
    );

    expect(requireOwnerWorkspaceContextMock).toHaveBeenCalled();
    expect(markPaymentUpdateRequestedMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      membershipBillingStateId: "billing_state_1",
    });
  });

  it("uses the owner workspace context before retrying payments", async () => {
    const formData = new FormData();
    formData.set("membershipBillingStateId", "billing_state_1");

    await expect(retryFailedPaymentNowAction(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/billing",
    );

    expect(requireOwnerWorkspaceContextMock).toHaveBeenCalled();
    expect(retryFailedPaymentNowMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      membershipBillingStateId: "billing_state_1",
    });
  });
});

