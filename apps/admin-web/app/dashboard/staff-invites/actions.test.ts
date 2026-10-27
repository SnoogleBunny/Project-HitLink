import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  invite: vi.fn(),
  resend: vi.fn(),
  revoke: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@flowstate/db", () => ({ StaffAccessError: class extends Error {} }));
vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: mocks.context,
}));
vi.mock("../../../lib/staff-invites", () => ({
  inviteCoachToWorkspace: mocks.invite,
  resendPendingCoachInvite: mocks.resend,
  revokePendingCoachInvite: mocks.revoke,
  StaffInviteError: class extends Error {},
}));
import { createStaffInviteAction, revokeStaffInviteAction } from "./actions";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://admin.example.test");
  mocks.context.mockResolvedValue({
    workspace: { id: "authorized-gym" },
    session: { userId: "current-owner" },
  });
  mocks.invite.mockResolvedValue({ status: "created", inviteId: "invite" });
  mocks.revoke.mockResolvedValue({ status: "revoked", inviteId: "invite" });
});
afterEach(() => vi.unstubAllEnvs());
describe("owner invitation mutation boundaries", () => {
  it("takes tenant, actor and email origin from authorized server context", async () => {
    const form = new FormData();
    form.set("email", "coach@example.test");
    form.set("workspaceId", "foreign-gym");
    form.set("invitedByUserId", "foreign-owner");
    form.set("inviteOrigin", "https://attacker.example.test");
    await expect(
      createStaffInviteAction({ error: null }, form),
    ).rejects.toThrow("REDIRECT:/dashboard/staff-invites");
    expect(mocks.invite).toHaveBeenCalledWith({
      workspaceId: "authorized-gym",
      invitedByUserId: "current-owner",
      email: "coach@example.test",
      inviteOrigin: "https://admin.example.test",
    });
  });
  it("attributes a revocation to the current owner and keeps domain failure details private", async () => {
    const form = new FormData();
    form.set("inviteId", "foreign-invite");
    await expect(revokeStaffInviteAction(form)).rejects.toThrow(
      "REDIRECT:/dashboard/staff-invites",
    );
    expect(mocks.revoke).toHaveBeenCalledWith({
      inviteId: "foreign-invite",
      workspaceId: "authorized-gym",
      invitedByUserId: "current-owner",
    });
    mocks.invite.mockRejectedValue(new Error("raw failed bearer write"));
    expect(await createStaffInviteAction({ error: null }, form)).toEqual({
      error: "The invitation could not be updated. Try again.",
    });
  });
});
