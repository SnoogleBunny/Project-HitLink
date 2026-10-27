import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  context: vi.fn(),
  copy: vi.fn(),
  retry: vi.fn(),
}));
vi.mock("./owner-workspace", () => ({
  requireOwnerWorkspaceContext: mock.context,
}));
vi.mock("@flowstate/db", () => ({
  PaymentConfirmationError: class extends Error {},
  queuePaymentConfirmationCopy: mock.copy,
  retryFailedNotification: mock.retry,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
import { emailPaymentConfirmationCopy } from "../app/dashboard/billing/receipts/[id]/actions";
import { retryEmailDeliveryAction } from "../app/dashboard/settings/email/actions";
describe("owner receipt and delivery action boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.context.mockResolvedValue({
      workspace: { id: "trusted-gym" },
      session: { userId: "trusted-owner" },
    });
    mock.copy.mockResolvedValue({ notificationJobId: "copy" });
    mock.retry.mockResolvedValue({ status: "queued" });
  });
  it("copies only through authenticated owner scope, ignoring posted recipient and actor", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      confirmationId: "receipt",
      operationId: "operation",
      workspaceId: "foreign",
      actorUserId: "attacker",
      email: "other@example.test",
    }))
      form.set(key, value);
    await expect(emailPaymentConfirmationCopy(form)).rejects.toThrow(
      "redirect:/dashboard/billing/receipts/receipt?queued=1",
    );
    expect(mock.copy).toHaveBeenCalledWith({
      actor: {
        kind: "OWNER",
        workspaceId: "trusted-gym",
        userId: "trusted-owner",
      },
      confirmationId: "receipt",
      operationId: "operation",
    });
  });
  it("passes stale record evidence to the domain without accepting attempt budgets from the browser", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      notificationJobId: "job",
      operationId: "operation",
      updatedAt: "2030-01-01T00:00:00Z",
      reason: "Reviewed",
      attemptLimit: "999",
      attempts: "0",
    }))
      form.set(key, value);
    await expect(retryEmailDeliveryAction(form)).rejects.toThrow(
      "redirect:/dashboard/settings/email?queued=1",
    );
    expect(mock.retry).toHaveBeenCalledWith({
      workspaceId: "trusted-gym",
      actorUserId: "trusted-owner",
      notificationJobId: "job",
      operationId: "operation",
      expectedUpdatedAt: new Date("2030-01-01T00:00:00Z"),
      reason: "Reviewed",
    });
  });
  it("does not leak internal provider/domain errors or claim queue success when rejected", async () => {
    mock.retry.mockRejectedValue(new Error("PRIVATE_PROVIDER_PAYLOAD"));
    await expect(retryEmailDeliveryAction(new FormData())).rejects.toThrow(
      "error=The+message+could+not+be+retried",
    );
  });
});
