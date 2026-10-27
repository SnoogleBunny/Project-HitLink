import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), owner: vi.fn(), operations: vi.fn() }));
vi.mock("./admin-access", () => ({ getSessionOrNull: mocks.session }));
vi.mock("./owner-workspace", () => ({ requireOwnerWorkspaceContext: mocks.owner }));
vi.mock("./operations-workspace", () => ({ requireOperationsWorkspaceContext: mocks.operations }));
import { requireAdminAccountContext } from "./account-security-context";

beforeEach(() => vi.resetAllMocks());
describe("account security access", () => {
  it("keeps a preparing owner's security controls available without operational readiness", async () => {
    mocks.session.mockResolvedValue({ role: "OWNER" });
    mocks.owner.mockResolvedValue({ session: { userId: "owner" }, workspace: { status: "SETUP_INCOMPLETE" } });
    expect(await requireAdminAccountContext()).toMatchObject({ session: { userId: "owner" } });
    expect(mocks.owner).toHaveBeenCalledOnce(); expect(mocks.operations).not.toHaveBeenCalled();
  });
  it("uses the current staff authorization for coaches", async () => {
    mocks.session.mockResolvedValue({ role: "COACH" });
    mocks.operations.mockResolvedValue({ session: { userId: "coach" } });
    expect(await requireAdminAccountContext()).toMatchObject({ session: { userId: "coach" } });
    expect(mocks.owner).not.toHaveBeenCalled();
  });
  it("preserves the existing authentication redirect when no session exists", async () => {
    mocks.session.mockResolvedValue(null); mocks.owner.mockRejectedValue(Error("redirect:/login"));
    await expect(requireAdminAccountContext()).rejects.toThrow("redirect:/login");
    expect(mocks.operations).not.toHaveBeenCalled();
  });
});
