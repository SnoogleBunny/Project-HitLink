import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemberOperationsError } from "@flowstate/db";
import { initialMemberOperationsFormState } from "./operations-state";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  change: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("./operations-context", () => ({
  requireMemberOperationsContext: mocks.context,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@flowstate/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flowstate/db")>()),
  changeMemberOperations: mocks.change,
}));
import { changeMemberOperationsAction } from "./operations-actions";
const recordKey = "note:00000000-0000-4000-8000-000000000001";
const operationId = "operations-original-request";
const state = initialMemberOperationsFormState({
  baseVersion: 1,
  recordKey,
  operationId,
});
function form(action = "AMEND", version = "1") {
  const data = new FormData();
  Object.entries({
    memberId: "member-actual",
    recordKey,
    recordKind: "NOTE",
    expectedVersion: version,
    operationId,
    operation: action,
    visibility: "ASSIGNED_OPERATIONS",
    noteBody: "Class logistics",
    reason: "Corrected the class instruction",
    workspaceId: "forged-workspace",
    actorUserId: "forged-actor",
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    session: { userId: "actual-owner" },
    workspace: { id: "actual-workspace" },
  });
  mocks.change.mockResolvedValue({
    recordKey,
    version: 2,
    eventId: "event-confirmed",
    replayed: false,
  });
});
describe("operational editor owns the submitted draft version and request identity", () => {
  it("uses authenticated scope and the submitted base, never a newer state or forged tenant", async () => {
    const result = await changeMemberOperationsAction(
      { ...state, baseVersion: 9 },
      form(),
    );
    expect(mocks.change).toHaveBeenCalledWith(
      { workspaceId: "actual-workspace", userId: "actual-owner" },
      expect.objectContaining({
        memberId: "member-actual",
        expectedVersion: 1,
        operationId,
      }),
    );
    expect(result).toMatchObject({
      baseVersion: 2,
      confirmedVersion: 2,
      recordKey,
      completedOperationId: operationId,
      completedAction: "AMEND",
      error: null,
    });
    expect(result.success).toBe(
      "Operational change saved with its author and history.",
    );
    expect(result.operationId).not.toBe(operationId);
    expect(mocks.revalidate).toHaveBeenCalledWith(
      "/dashboard/members/member-actual",
    );
  });
  it("retains stale draft authority and request identity on a rejected correction", async () => {
    mocks.change.mockRejectedValue(
      new MemberOperationsError(
        "This operational record changed. Review the current version before saving.",
      ),
    );
    const result = await changeMemberOperationsAction(
      { ...state, baseVersion: 7 },
      form(),
    );
    expect(result).toMatchObject({
      baseVersion: 1,
      confirmedVersion: null,
      operationId,
      recordKey,
      success: null,
      completedAction: null,
    });
    expect(result.error).toContain("changed");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("rotates the add-note request only after a confirmed save and starts the next note at version zero", async () => {
    const data = form("ADD", "0");
    mocks.change.mockResolvedValue({
      recordKey,
      version: 1,
      eventId: "event-new-note",
      replayed: false,
    });
    const result = await changeMemberOperationsAction(
      { ...state, baseVersion: 0 },
      data,
    );
    expect(result).toMatchObject({
      baseVersion: 0,
      confirmedVersion: 1,
      completedAction: "ADD",
      completedOperationId: operationId,
      error: null,
    });
    expect(result.success).toBeTruthy();
    expect(result.recordKey).toMatch(/^note:[a-f0-9-]{36}$/i);
    expect(result.recordKey).not.toBe(recordKey);
    expect(result.operationId).not.toBe(operationId);
    const next = form("ADD", "0");
    next.set("recordKey", result.recordKey);
    next.set("operationId", result.operationId);
    mocks.change.mockResolvedValue({
      recordKey: result.recordKey,
      version: 1,
      eventId: "event-second-note",
      replayed: false,
    });
    const second = await changeMemberOperationsAction(result, next);
    expect(mocks.change).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        expectedVersion: 0,
        recordKey: result.recordKey,
        operationId: result.operationId,
      }),
    );
    expect(second.recordKey).not.toBe(result.recordKey);
    expect(second.operationId).not.toBe(result.operationId);
  });
  it("rotates an added-label request without treating the persisted label version as the next new label's base", async () => {
    const data = form("ADD", "0");
    data.set("recordKind", "TAG");
    data.set("tagPurpose", "OPERATIONAL");
    data.set("tagLabel", "Reception route");
    data.set("classTemplateId", "exact-template");
    data.set("date", "2026-11-02");
    mocks.change.mockResolvedValue({
      recordKey: "tag:OPERATIONAL:confirmed",
      version: 1,
      replayed: false,
    });
    const result = await changeMemberOperationsAction(
      { ...state, baseVersion: 0 },
      data,
    );
    expect(mocks.change).toHaveBeenCalledWith(
      {
        workspaceId: "actual-workspace",
        userId: "actual-owner",
        occurrence: { classTemplateId: "exact-template", date: "2026-11-02" },
      },
      expect.objectContaining({
        recordKind: "TAG",
        tagPurpose: "OPERATIONAL",
        recordKey: expect.stringMatching(/^tag:OPERATIONAL:[a-f0-9]{64}$/),
        expectedVersion: 0,
      }),
    );
    expect(result).toMatchObject({
      baseVersion: 0,
      confirmedVersion: 1,
      recordKey: "new-internal-label",
      completedAction: "ADD",
    });
    expect(result.operationId).not.toBe(operationId);
  });
  it("returns a confirmed retraction outcome for the stable parent even when the current-row form disappears", async () => {
    const result = await changeMemberOperationsAction(state, form("RETRACT"));
    expect(result).toMatchObject({
      baseVersion: 2,
      confirmedVersion: 2,
      completedAction: "RETRACT",
      completedOperationId: operationId,
    });
    expect(result.success).toBeTruthy();
    expect(mocks.change).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ visibility: expect.anything() }),
    );
  });
  it("does not create a confirmation or advance the draft after an unexpected transaction failure", async () => {
    mocks.change.mockRejectedValue(new Error("Fictional transaction failure"));
    await expect(changeMemberOperationsAction(state, form())).rejects.toThrow(
      "Fictional transaction failure",
    );
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
