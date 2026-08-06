import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const consoleWarnMock = vi
  .spyOn(console, "warn")
  .mockImplementation(() => undefined);

const {
  acknowledgeMigrationOwnerReviewMock,
  redirectMock,
  requireOwnerWorkspaceContextMock,
} = vi.hoisted(() => ({
  acknowledgeMigrationOwnerReviewMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  requireOwnerWorkspaceContextMock: vi.fn(),
}));

vi.mock("@flowstate/db", () => ({
  prisma: {},
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("../../../lib/owner-workspace", () => ({
  requireOwnerWorkspaceContext: requireOwnerWorkspaceContextMock,
}));

vi.mock("../../../lib/workspace-migration", () => ({
  acknowledgeMigrationOwnerReview: acknowledgeMigrationOwnerReviewMock,
}));

import {
  acknowledgeMigrationReviewAction,
  markMigrationReadyAction,
  runMigrationImportAction,
  updateMigrationStageAction,
  uploadMigrationCsvAction,
} from "./actions";

function buildAcknowledgmentFormData() {
  const formData = new FormData();
  formData.set("acknowledgeSnapshotLock", "yes");
  return formData;
}

describe("migration readiness action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "corrections@example.test",
    );
    requireOwnerWorkspaceContextMock.mockResolvedValue({
      session: {
        userId: "owner_1",
        email: "owner@example.test",
        displayName: "Owner One",
      },
      workspaceUserId: "workspace_user_1",
      workspace: {
        id: "workspace_1",
        name: "North Gym",
      },
    });
    acknowledgeMigrationOwnerReviewMock.mockResolvedValue({
      status: "ok",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails a workspace-owner readiness submission closed without calling an operator capability", async () => {
    await expect(markMigrationReadyAction()).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/migration?readiness=operator-required",
    );

    expect(acknowledgeMigrationOwnerReviewMock).not.toHaveBeenCalled();
    expect(consoleWarnMock).not.toHaveBeenCalled();
  });

  it("fails a workspace-owner stage update closed", async () => {
    await expect(
      updateMigrationStageAction({ error: null }, new FormData()),
    ).resolves.toEqual({
      error:
        "Migration operations are handled by authorized Flowstate operators.",
    });

    expect(acknowledgeMigrationOwnerReviewMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("fails a workspace-owner CSV upload closed", async () => {
    await expect(
      uploadMigrationCsvAction({ error: null }, new FormData()),
    ).resolves.toEqual({
      error:
        "Migration operations are handled by authorized Flowstate operators.",
    });

    expect(acknowledgeMigrationOwnerReviewMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("fails a workspace-owner import run closed", async () => {
    await expect(runMigrationImportAction(new FormData())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/migration?operation=operator-required",
    );

    expect(acknowledgeMigrationOwnerReviewMock).not.toHaveBeenCalled();
  });

  it("rejects a direct acknowledgment submission without consent before the domain call", async () => {
    await expect(
      acknowledgeMigrationReviewAction(new FormData()),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/migration?review=blocked&reason=confirmation-required",
    );

    expect(acknowledgeMigrationOwnerReviewMock).not.toHaveBeenCalled();
  });

  it("authorizes then rejects an invalid correction channel before domain persistence", async () => {
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "one@example.test,two@example.test",
    );

    await expect(
      acknowledgeMigrationReviewAction(buildAcknowledgmentFormData()),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/migration?review=blocked&reason=correction-channel-unavailable",
    );

    expect(requireOwnerWorkspaceContextMock).toHaveBeenCalledTimes(1);
    expect(acknowledgeMigrationOwnerReviewMock).not.toHaveBeenCalled();
    expect(consoleWarnMock).not.toHaveBeenCalled();
  });

  it("records one owner review acknowledgment after explicit consent", async () => {
    await expect(
      acknowledgeMigrationReviewAction(buildAcknowledgmentFormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard/migration?review=acknowledged");

    expect(acknowledgeMigrationOwnerReviewMock).toHaveBeenCalledTimes(1);
    expect(acknowledgeMigrationOwnerReviewMock).toHaveBeenCalledWith({
      workspaceId: "workspace_1",
      userId: "owner_1",
    });
  });

  it.each([
    ["schedule-missing", "schedule-missing"],
    ["schedule-passed", "schedule-passed"],
    ["launch-timezone-invalid", "launch-timezone-invalid"],
    ["correction-channel-unavailable", "correction-channel-unavailable"],
    [undefined, "remaining-checks"],
  ])(
    "preserves the %s recovery reason through redirect",
    async (reason, expected) => {
      acknowledgeMigrationOwnerReviewMock.mockResolvedValue({
        status: "error",
        message: "Owner acknowledgment was not saved.",
        ...(reason ? { reason } : {}),
      });

      await expect(
        acknowledgeMigrationReviewAction(buildAcknowledgmentFormData()),
      ).rejects.toThrow(
        `NEXT_REDIRECT:/dashboard/migration?review=blocked&reason=${expected}`,
      );
    },
  );
});
