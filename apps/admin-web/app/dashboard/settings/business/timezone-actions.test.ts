import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
  revalidate: vi.fn(),
  TimezoneError: class extends Error {},
}));
vi.mock("../../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: mocks.context,
}));
vi.mock("../../../../lib/workspace-timezone-settings", () => ({
  previewWorkspaceTimezoneChange: mocks.preview,
  commitWorkspaceTimezoneChange: mocks.commit,
  WorkspaceTimezoneError: mocks.TimezoneError,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { workspaceTimezoneAction } from "./actions";

const initial = { error: null, success: null, review: null };
const form = (values: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    timezone: "America/Los_Angeles",
    effectiveFromDate: "2030-01-08",
    timezoneVersion: "2",
    ...values,
  }))
    data.set(key, value);
  return data;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({
    workspace: { id: "current-workspace" },
    session: { userId: "current-owner" },
  });
});
describe("reviewed business timezone actions", () => {
  it("previews for the authenticated owner and does not confirm posted actor identifiers", async () => {
    const review = {
      ok: false,
      blockers: [{ date: "2030-01-14", bookings: 1 }],
    };
    mocks.preview.mockResolvedValue(review);
    expect(
      await workspaceTimezoneAction(
        initial,
        form({ workspaceId: "other", userId: "other", step: "preview" }),
      ),
    ).toEqual({ error: null, success: null, review });
    expect(mocks.preview).toHaveBeenCalledWith({
      actor: { workspaceId: "current-workspace", userId: "current-owner" },
      input: {
        timezone: "America/Los_Angeles",
        effectiveFromDate: "2030-01-08",
        expectedVersion: 2,
      },
    });
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("forwards an unchecked confirmation as false so a crafted request cannot bypass the domain guard", async () => {
    mocks.commit.mockRejectedValue(
      new mocks.TimezoneError("Confirm the reviewed timezone change."),
    );
    const result = await workspaceTimezoneAction(
      initial,
      form({ step: "confirm", previewHash: "review-hash", confirmed: "true" }),
    );
    expect(result.error).toBe("Confirm the reviewed timezone change.");
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed: false,
        previewHash: "review-hash",
        input: expect.objectContaining({ expectedVersion: 2 }),
      }),
    );
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("confirms the exact reviewed version and refreshes the dashboard only after commit", async () => {
    mocks.commit.mockResolvedValue({ timezone: "America/Los_Angeles" });
    expect(
      await workspaceTimezoneAction(
        initial,
        form({
          step: "confirm",
          previewHash: "fresh-hash",
          confirmTimezone: "on",
        }),
      ),
    ).toEqual({
      error: null,
      success:
        "Timezone change to America/Los_Angeles scheduled for 2030-01-08.",
      review: null,
    });
    expect(mocks.commit).toHaveBeenCalledWith({
      actor: { workspaceId: "current-workspace", userId: "current-owner" },
      input: {
        timezone: "America/Los_Angeles",
        effectiveFromDate: "2030-01-08",
        expectedVersion: 2,
      },
      previewHash: "fresh-hash",
      confirmed: true,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
  });
  it("clears an unusable review after a stale or failed confirmation without exposing internal details", async () => {
    mocks.commit.mockRejectedValue(
      new mocks.TimezoneError(
        "Timezone settings changed. Reload and preview the change again.",
      ),
    );
    expect(
      await workspaceTimezoneAction(initial, form({ step: "confirm" })),
    ).toEqual({
      error: "Timezone settings changed. Reload and preview the change again.",
      success: null,
      review: null,
    });
    mocks.preview.mockRejectedValue(Error("private database details"));
    expect(await workspaceTimezoneAction(initial, form())).toEqual({
      error:
        "The timezone change could not be confirmed. Reload and preview it again.",
      success: null,
      review: null,
    });
  });
});
