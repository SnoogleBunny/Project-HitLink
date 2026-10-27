import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ context: vi.fn(), copy: vi.fn() }));
vi.mock("./member-auth", () => ({ requireMemberPortalContext: mock.context }));
vi.mock("@flowstate/db", () => ({
  PaymentConfirmationError: class extends Error {},
  queuePaymentConfirmationCopy: mock.copy,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
import { emailPaymentConfirmationCopy } from "../app/app/billing/receipts/[id]/actions";
describe("payer receipt copy action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.context.mockResolvedValue({
      workspace: { id: "trusted-gym" },
      session: { userId: "trusted-payer" },
      member: { id: "selected-child" },
    });
    mock.copy.mockResolvedValue({ notificationJobId: "copy" });
  });
  it("uses account scope and verified session rather than a selected child or posted recipient", async () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      confirmationId: "receipt",
      operationId: "operation",
      memberId: "another-child",
      email: "other@example.test",
      userId: "attacker",
    }))
      form.set(key, value);
    await expect(emailPaymentConfirmationCopy(form)).rejects.toThrow(
      "redirect:/app/billing/receipts/receipt?queued=1",
    );
    expect(mock.context).toHaveBeenCalledWith({ scope: "account" });
    expect(mock.copy).toHaveBeenCalledWith({
      actor: {
        kind: "PAYER",
        workspaceId: "trusted-gym",
        userId: "trusted-payer",
      },
      confirmationId: "receipt",
      operationId: "operation",
    });
  });
  it("shows a failure without leaking stored private data or claiming delivery", async () => {
    mock.copy.mockRejectedValue(new Error("PRIVATE_DATABASE_DATA"));
    await expect(emailPaymentConfirmationCopy(new FormData())).rejects.toThrow(
      "error=The+copy+could+not+be+queued",
    );
  });
});
