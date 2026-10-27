import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  preview: vi.fn(),
  request: vi.fn(),
  verify: vi.fn(),
  context: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((location: string): never => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));
vi.mock("@flowstate/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@flowstate/db")>()),
  activateNewBusiness: mocks.activate,
  previewWorkspaceSetup: mocks.preview,
  requestWorkspaceSetupVerification: mocks.request,
  verifyWorkspaceSetupOwner: mocks.verify,
}));
vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: mocks.context,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { WorkspaceSetupError } from "@flowstate/db";
import { workspaceSetupAction, verifySetupOwnerAction } from "./actions";
const empty = { error: null, message: null, review: null };
const actor = { userId: "actual-owner", workspaceId: "actual-business" };
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("new-business setup action authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.context.mockResolvedValue({
      session: { userId: actor.userId },
      workspace: { id: actor.workspaceId },
    });
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://owner.example.test");
  });
  it("uses authenticated actor and configured origin for mail, ignoring forged recipients and origins", async () => {
    mocks.request.mockResolvedValue({
      message: "Delivery is pending provider configuration.",
    });
    expect(
      await workspaceSetupAction(
        empty,
        form({
          step: "request",
          userId: "other-owner",
          workspaceId: "other-business",
          email: "attacker@example.test",
          origin: "https://attacker.example.test",
        }),
      ),
    ).toEqual({
      error: null,
      message: "Delivery is pending provider configuration.",
      review: null,
    });
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(
      actor,
      "https://owner.example.test",
    );
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("fails closed without a configured portal and never issues mail", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_FLOWSTATE_APP_URL", undefined);
    expect(
      (await workspaceSetupAction(empty, form({ step: "request" }))).error,
    ).toContain("not configured");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("returns server-derived preview rather than posted setup details", async () => {
    const review = {
      version: 4,
      snapshotHash: "a".repeat(64),
      ok: false,
      errors: ["Verify owner email."],
      snapshot: { businessName: "Real business" },
    };
    mocks.preview.mockResolvedValue(review);
    expect(
      await workspaceSetupAction(
        empty,
        form({
          step: "preview",
          businessName: "Forged business",
          ownerVerified: "true",
        }),
      ),
    ).toEqual({ error: null, message: null, review });
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(actor);
  });
  it("passes the exact review plus explicit confirmation and redirects only after a committed activation", async () => {
    mocks.activate.mockResolvedValue({ id: "receipt" });
    await expect(
      workspaceSetupAction(
        empty,
        form({
          step: "activate",
          version: "4",
          snapshotHash: "a".repeat(64),
          confirmSetup: "on",
          userId: "other-owner",
          workspaceId: "other-business",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard/setup?activated=1");
    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith(actor, {
      version: 4,
      snapshotHash: "a".repeat(64),
      confirmed: true,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
  });
  it("does not infer consent or preserve a stale preview after a rejected activation", async () => {
    mocks.activate.mockRejectedValue(
      new WorkspaceSetupError("Setup changed. Review again."),
    );
    expect(
      await workspaceSetupAction(
        empty,
        form({ step: "activate", version: "4", snapshotHash: "a".repeat(64) }),
      ),
    ).toEqual({
      error: "Setup changed. Review again.",
      message: null,
      review: null,
    });
    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith(
      actor,
      expect.objectContaining({ confirmed: false }),
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not expose unexpected database details in an activation failure", async () => {
    mocks.activate.mockRejectedValue(new Error("private connection string"));
    const result = await workspaceSetupAction(
      empty,
      form({ step: "activate" }),
    );
    expect(result.error).toBe(
      "Business setup could not be confirmed. Reload and review it again.",
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("verifies only for the current owner and returns domain rejection without claiming success", async () => {
    mocks.verify.mockResolvedValue({ verified: true });
    expect(
      await verifySetupOwnerAction(
        { error: null, verified: false },
        form({ token: "single-use-token", userId: "other-owner" }),
      ),
    ).toEqual({ error: null, verified: true });
    expect(mocks.verify).toHaveBeenCalledExactlyOnceWith(
      actor,
      "single-use-token",
    );
    mocks.verify.mockRejectedValue(new WorkspaceSetupError("Link expired."));
    expect(
      await verifySetupOwnerAction(
        { error: null, verified: false },
        form({ token: "reused-token" }),
      ),
    ).toEqual({ error: "Link expired.", verified: false });
  });
});
