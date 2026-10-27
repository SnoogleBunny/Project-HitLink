import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  owner: vi.fn(),
  clear: vi.fn(),
  revalidate: vi.fn(),
  cookies: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@flowstate/db", () => ({
  changeStaffAccess: mocks.change,
  StaffAccessError: class extends Error {},
  StaffLeaveError: class extends Error {},
  createStaffLeave: vi.fn(),
  revokeStaffLeave: vi.fn(),
}));
vi.mock("@flowstate/auth", () => ({ clearSessionCookie: mocks.clear }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: mocks.owner,
}));
import { staffAccessAction } from "./actions";
const empty = { error: null, success: null };
function form() {
  const value = new FormData();
  for (const [key, item] of Object.entries({
    workspaceUserId: "target",
    role: "COACH",
    isActive: "false",
    expectedUpdatedAt: "2026-10-25T00:00:00Z",
    operationId: "maintained-staff-operation",
    reason: "Staff contract ended",
    confirmAccessChange: "on",
    workspaceId: "forged-gym",
    userId: "forged-owner",
  }))
    value.set(key, item);
  return value;
}
describe("staff access action authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.owner.mockResolvedValue({
      workspaceUserId: "owner-staff",
      workspace: { id: "authorized-gym" },
      session: { userId: "authorized-owner" },
    });
    mocks.change.mockResolvedValue({ id: "audit" });
    mocks.cookies.mockResolvedValue({ set: vi.fn() });
  });
  it("requires explicit review before invoking any access mutation", async () => {
    const input = form();
    input.delete("confirmAccessChange");
    expect(await staffAccessAction(empty, input)).toMatchObject({
      error: expect.stringContaining("confirm"),
    });
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("rejects an omitted access state instead of turning it into deactivation", async () => {
    const input = form();
    input.delete("isActive");
    expect(await staffAccessAction(empty, input)).toMatchObject({
      error: expect.stringContaining("active or inactive"),
    });
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("ignores crafted actor and tenant fields and uses the authenticated owner", async () => {
    expect(await staffAccessAction(empty, form())).toMatchObject({
      error: null,
      success: expect.any(String),
    });
    expect(mocks.change.mock.calls[0]?.[0]).toEqual({
      workspaceId: "authorized-gym",
      userId: "authorized-owner",
    });
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("clears this device and requires a new sign-in after an authorized self-change", async () => {
    const input = form();
    input.set("workspaceUserId", "owner-staff");
    await expect(staffAccessAction(empty, input)).rejects.toThrow(
      "redirect:/login",
    );
    expect(mocks.change).toHaveBeenCalledOnce();
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
});
