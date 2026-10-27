import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: mocks.context,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@flowstate/db", async (original) => ({
  ...(await original<typeof import("@flowstate/db")>()),
  previewOwnerLateClassBooking: mocks.preview,
  confirmOwnerLateClassBooking: mocks.confirm,
}));
import { ownerLateBookingAction } from "./actions";
const state = { error: null, success: null, review: null };
function form(step = "preview") {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    memberId: "person",
    classTemplateId: "class",
    scheduledForDate: "2030-01-07",
    bookingType: "ACCESS",
    reason: "Reviewed cutoff exception",
    operationId: "fictional-request-0001",
    actorUserId: "forged-owner",
    workspaceId: "forged-workspace",
    step,
    previewHash: "fresh-review",
  }))
    data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    workspace: { id: "actual-business" },
    session: { userId: "actual-owner" },
  });
});
describe("late owner action actor and explicit confirmation", () => {
  it("derives owner and business from the live session rather than posted identity", async () => {
    mocks.preview.mockResolvedValue({ previewHash: "current" });
    await ownerLateBookingAction(state, form());
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { workspaceId: "actual-business", userId: "actual-owner" },
      }),
    );
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("forwards unchecked confirmation as false to the server transaction guard", async () => {
    mocks.confirm.mockResolvedValue({
      status: "created",
      bookingId: "booking",
      receiptId: "receipt",
    });
    await ownerLateBookingAction(state, form("confirm"));
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed: false,
        previewHash: "fresh-review",
      }),
    );
  });
  it("does not expose unexpected database or provider text in product errors", async () => {
    mocks.preview.mockRejectedValue(new Error("PRIVATE_FAILURE_SENTINEL"));
    const result = await ownerLateBookingAction(state, form());
    expect(result.error).not.toContain("PRIVATE_FAILURE_SENTINEL");
    expect(result.success).toBeNull();
  });
});
