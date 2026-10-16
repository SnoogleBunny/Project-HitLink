import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  authorize: vi.fn(),
  set: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../../lib/member-auth", () => ({
  requireMemberPortalContext: mock.authorize,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mock.set }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.refresh }));
import { selectFamilyMember } from "./member-selector-actions";
import { SELECTED_MEMBER_COOKIE } from "../../lib/member-selection-cookie";
beforeEach(() => vi.resetAllMocks());
describe("family selection action", () => {
  it("saves the reauthorized child's workspace identity through the shared cookie helper", async () => {
    mock.authorize.mockResolvedValue({
      workspace: { id: "gym" },
      member: { id: "child" },
    });
    await selectFamilyMember("child");
    expect(mock.authorize).toHaveBeenCalledWith({
      memberId: "child",
      permission: "view",
    });
    expect(mock.set).toHaveBeenCalledWith(
      SELECTED_MEMBER_COOKIE,
      "gym:child",
      expect.objectContaining({ path: "/app" }),
    );
    expect(mock.refresh).toHaveBeenCalledWith("/app", "layout");
  });
  it("does not overwrite selection if authority has been revoked", async () => {
    mock.authorize.mockRejectedValue(new Error("Access revoked"));
    await expect(selectFamilyMember("child")).rejects.toThrow("revoked");
    expect(mock.set).not.toHaveBeenCalled();
    expect(mock.refresh).not.toHaveBeenCalled();
  });
});
