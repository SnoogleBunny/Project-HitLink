import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  find: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@flowstate/db", () => ({
  prisma: { signatureRequest: { findFirst: mocks.find } },
}));
vi.mock("./member-auth", () => ({
  requireMemberPortalContext: mocks.authorize,
}));
vi.mock("./forms", () => ({ getPortalFormRequestPageData: mocks.request }));
import { getAuthorizedPortalFormRequest } from "./portal-form-context";
const account = {
  workspace: { id: "gym" },
  member: { id: "parent" },
  authorizedMembers: [{ id: "child", fullName: "Child" }],
};
beforeEach(() => vi.resetAllMocks());
describe("request-scoped form authorization", () => {
  it("uses the authorized request participant after another tab selects the parent", async () => {
    const child = {
      ...account,
      member: { id: "child" },
      permissions: { guardianId: "guardian" },
    };
    mocks.authorize.mockResolvedValueOnce(account).mockResolvedValueOnce(child);
    mocks.find.mockResolvedValue({ memberId: "child" });
    mocks.request.mockResolvedValue({ requestId: "form", memberId: "child" });
    expect(
      (await getAuthorizedPortalFormRequest("form"))?.context.member.id,
    ).toBe("child");
    expect(mocks.find).toHaveBeenCalledWith({
      where: {
        id: "form",
        workspaceId: "gym",
        memberId: { in: ["parent", "child"] },
      },
      select: { memberId: true },
    });
    expect(mocks.authorize).toHaveBeenLastCalledWith({
      memberId: "child",
      permission: "sign",
    });
    expect(mocks.request).toHaveBeenCalledWith({
      workspaceId: "gym",
      memberId: "child",
      requestId: "form",
      guardianId: "guardian",
    });
  });
  it("does not read document content for a request outside the account's current members", async () => {
    mocks.authorize.mockResolvedValue(account);
    mocks.find.mockResolvedValue(null);
    expect(await getAuthorizedPortalFormRequest("foreign")).toBeNull();
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("rechecks signing permission before loading document content", async () => {
    mocks.authorize
      .mockResolvedValueOnce(account)
      .mockRejectedValueOnce(new Error("Access revoked"));
    mocks.find.mockResolvedValue({ memberId: "child" });
    await expect(getAuthorizedPortalFormRequest("form")).rejects.toThrow(
      "Access revoked",
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("keeps request-specific guardian and version checks fail-closed", async () => {
    mocks.authorize.mockResolvedValue(account);
    mocks.find.mockResolvedValue({ memberId: "parent" });
    mocks.request.mockResolvedValue(null);
    expect(await getAuthorizedPortalFormRequest("wrong-guardian")).toBeNull();
  });
});
