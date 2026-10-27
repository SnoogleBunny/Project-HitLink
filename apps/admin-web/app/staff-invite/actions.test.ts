import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  workspace: vi.fn(),
  ready: vi.fn(),
  session: vi.fn(),
  cookies: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@flowstate/auth", () => ({ createSession: mocks.session }));
vi.mock("@flowstate/db", () => ({
  prisma: { workspace: { findUnique: mocks.workspace } },
  isWorkspaceOperationallyReady: mocks.ready,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../lib/staff-invites", () => ({
  acceptStaffInvite: mocks.accept,
  INVALID_STAFF_INVITE_MESSAGE: "Generic invalid invitation",
}));
import { acceptStaffInviteAction } from "./actions";
const form = () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    token: "fictional-fragment-bearer",
    email: "coach@example.test",
    password: "fictional-password",
    fullName: "Fictional Coach",
    role: "OWNER",
    workspaceId: "forged-gym",
  }))
    data.set(key, value);
  return data;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.accept.mockResolvedValue({
    userId: "invited-account",
    workspaceId: "inviting-gym",
    passwordHash: "validated-password-hash",
  });
  mocks.workspace.mockResolvedValue({
    status: "ACTIVE",
    migration: null,
    setupActivation: { ownerUserId: "owner" },
  });
  mocks.ready.mockReturnValue(true);
  mocks.cookies.mockResolvedValue({ fictional: true });
});
describe("staff invitation acceptance action", () => {
  it("uses the domain's account/workspace and cannot turn posted owner role into permission", async () => {
    await expect(
      acceptStaffInviteAction({ error: null, complete: false }, form()),
    ).rejects.toThrow("REDIRECT:/dashboard/coach/today");
    expect(mocks.accept).toHaveBeenCalledWith({
      token: "fictional-fragment-bearer",
      email: "coach@example.test",
      password: "fictional-password",
      fullName: "Fictional Coach",
    });
    expect(mocks.workspace).toHaveBeenCalledWith({
      where: { id: "inviting-gym" },
      include: { migration: true, setupActivation: true },
    });
    expect(mocks.session).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "invited-account",
        expectedPasswordHash: "validated-password-hash",
      }),
    );
  });
  it("keeps invalid, expired, reused and unexpected storage errors generic", async () => {
    mocks.accept.mockRejectedValue(
      new Error("private bearer and account details"),
    );
    expect(
      await acceptStaffInviteAction({ error: null, complete: false }, form()),
    ).toEqual({ error: "Generic invalid invitation", complete: false });
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("confirms accepted setup access without opening operational staff pages early", async () => {
    mocks.ready.mockReturnValue(false);
    expect(
      await acceptStaffInviteAction({ error: null, complete: false }, form()),
    ).toEqual({ error: null, complete: true });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("keeps accepted access recoverable by normal login if writing a new session fails", async () => {
    mocks.session.mockRejectedValue(new Error("storage unavailable"));
    expect(
      await acceptStaffInviteAction({ error: null, complete: false }, form()),
    ).toEqual({ error: null, complete: true });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
