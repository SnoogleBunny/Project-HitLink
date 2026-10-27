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
vi.mock("@flowstate/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flowstate/db")>()),
  previewClassSchedulingPolicy: mocks.preview,
  confirmClassSchedulingPolicy: mocks.confirm,
}));
import { bookingRulesAction } from "./actions";
const state = {
  baseVersion: 2,
  confirmedVersion: null,
  error: null,
  success: null,
  review: null,
};
function form(step = "preview") {
  const data = new FormData();
  data.set("policy", JSON.stringify({ schemaVersion: 1 }));
  data.set("version", "2");
  data.set("reason", "Reviewed hours");
  data.set("step", step);
  data.set("workspaceId", "forged-tenant");
  data.set("actorUserId", "forged-owner");
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    workspace: { id: "actual-workspace" },
    session: { userId: "actual-owner" },
  });
});
describe("owner class booking rule actions", () => {
  it("derives tenant and owner from the authenticated context", async () => {
    mocks.preview.mockResolvedValue({ previewHash: "current" });
    await bookingRulesAction(state, form());
    expect(mocks.preview).toHaveBeenCalledWith({
      actor: { workspaceId: "actual-workspace", userId: "actual-owner" },
      input: {
        policy: { schemaVersion: 1 },
        reason: "Reviewed hours",
        expectedVersion: 2,
      },
    });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("forwards the exact preview and acknowledgment to the transaction guard", async () => {
    mocks.confirm.mockResolvedValue({ version: 3 });
    const data = form("confirm");
    data.set("previewHash", "fresh-review");
    await bookingRulesAction(state, data);
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        previewHash: "fresh-review",
        confirmed: false,
      }),
    );
    data.set("confirmCommitments", "on");
    expect(await bookingRulesAction(state, data)).toMatchObject({
      success: "Class booking rules version 3 confirmed.",
    });
    expect(mocks.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ confirmed: true }),
    );
  });
  it("rejects malformed proposals and does not expose internal failure details", async () => {
    const data = form();
    data.set("policy", "not-json");
    expect(await bookingRulesAction(state, data)).toMatchObject({
      error: "Enter valid opening hours and booking limits.",
    });
    expect(mocks.preview).not.toHaveBeenCalled();
    mocks.preview.mockRejectedValue(new Error("PRIVATE_DATABASE_SENTINEL"));
    expect((await bookingRulesAction(state, form())).error).not.toContain(
      "PRIVATE_DATABASE_SENTINEL",
    );
  });
});

describe("booking rule draft version survives server revalidation", () => {
  it("keeps the submitted draft base after a successful preview rather than accepting a newer server prop", async () => {
    mocks.preview.mockResolvedValue({ version: 2, previewHash: "reviewed-v2" });
    const result = await bookingRulesAction(
      { ...state, baseVersion: 3 },
      form(),
    );
    expect(result).toMatchObject({
      baseVersion: 2,
      confirmedVersion: null,
      success: null,
      review: { version: 2 },
    });
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ expectedVersion: 2 }),
      }),
    );
  });
  it("does not advance a stale draft on validation or policy-version failure", async () => {
    mocks.preview.mockRejectedValue(new Error("Concurrent policy update"));
    const result = await bookingRulesAction(state, form());
    expect(result.baseVersion).toBe(2);
    expect(result.confirmedVersion).toBeNull();
    expect(result.success).toBeNull();
  });
  it("advances the draft base only to the version actually committed by this confirmation and retains the visible success", async () => {
    mocks.confirm.mockResolvedValue({ version: 3 });
    const data = form("confirm");
    data.set("previewHash", "current-v2");
    data.set("confirmCommitments", "on");
    const result = await bookingRulesAction(state, data);
    expect(result).toMatchObject({
      baseVersion: 3,
      confirmedVersion: 3,
      success: "Class booking rules version 3 confirmed.",
      review: null,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
  });
});
