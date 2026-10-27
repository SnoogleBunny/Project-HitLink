import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomCapacityError } from "@flowstate/db";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: mocks.context,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@flowstate/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flowstate/db")>()),
  previewRoomCapacityChange: mocks.preview,
  confirmRoomCapacityChange: mocks.confirm,
}));
import {
  roomCapacityAction,
  type RoomCapacityFormState,
} from "./capacity-actions";
const state: RoomCapacityFormState = {
  baseVersion: "a".repeat(64),
  confirmedVersion: null,
  operationId: "room-default-original-request",
  error: null,
  success: null,
  review: null,
};
function form(step = "preview") {
  const data = new FormData();
  Object.entries({
    roomId: "actual-room",
    capacity: "4",
    version: "a".repeat(64),
    reason: "Reviewed room reservations",
    operationId: state.operationId,
    step,
    workspaceId: "forged-business",
    userId: "forged-owner",
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    workspace: { id: "actual-business" },
    session: { userId: "actual-owner" },
  });
});
describe("room default action state and current-target contract", () => {
  it("uses authenticated actor and the submitted draft version for preview", async () => {
    mocks.preview.mockResolvedValue({ previewHash: "reviewed", errors: [] });
    const result = await roomCapacityAction(
      { ...state, baseVersion: "b".repeat(64) },
      form(),
    );
    expect(mocks.preview).toHaveBeenCalledWith(
      { workspaceId: "actual-business", userId: "actual-owner" },
      {
        roomId: "actual-room",
        capacity: "4",
        expectedVersion: "a".repeat(64),
        reason: "Reviewed room reservations",
        operationId: state.operationId,
      },
    );
    expect(result).toMatchObject({
      baseVersion: "a".repeat(64),
      confirmedVersion: null,
      success: null,
      review: { previewHash: "reviewed" },
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("does not advance an unacknowledged or stale proposal and preserves its request identity", async () => {
    mocks.confirm.mockRejectedValue(
      new RoomCapacityError("Acknowledge the current capacity effects."),
    );
    const data = form("confirm");
    data.set("previewHash", "reviewed-hash");
    const result = await roomCapacityAction(state, data);
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { previewHash: "reviewed-hash", confirmed: false },
    );
    expect(result).toMatchObject({
      baseVersion: state.baseVersion,
      confirmedVersion: null,
      operationId: state.operationId,
      success: null,
      review: null,
    });
    expect(result.error).toContain("Acknowledge");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("advances only to its committed version and preserves visible feedback through unkeyed revalidation", async () => {
    mocks.confirm.mockResolvedValue({
      confirmedVersion: "c".repeat(64),
      revision: 2,
      capacity: 4,
      replayed: false,
    });
    const data = form("confirm");
    data.set("previewHash", "reviewed-hash");
    data.set("confirmEffects", "on");
    const result = await roomCapacityAction(state, data);
    expect(result).toMatchObject({
      baseVersion: "c".repeat(64),
      confirmedVersion: "c".repeat(64),
      review: null,
      error: null,
    });
    expect(result.operationId).not.toBe(state.operationId);
    expect(result.success).toContain("review 2 confirmed");
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/dashboard/rooms/actual-room/edit",
    );
  });
  it("does not create success feedback for an unexpected transaction failure", async () => {
    mocks.preview.mockRejectedValue(new Error("Fictional transaction failure"));
    await expect(roomCapacityAction(state, form())).rejects.toThrow(
      "Fictional transaction failure",
    );
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
