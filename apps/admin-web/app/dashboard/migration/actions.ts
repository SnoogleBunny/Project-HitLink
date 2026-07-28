"use server";

import { redirect } from "next/navigation";
import { type BasicFormState } from "../../../lib/admin-access";
import { isMigrationCorrectionChannelAvailable } from "../../../lib/migration-correction-channel";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { acknowledgeMigrationOwnerReview } from "../../../lib/workspace-migration";

const internalOperationError = {
  error: "Migration operations are handled by authorized Flowstate operators.",
};

export async function uploadMigrationCsvAction(
  _previousState: BasicFormState,
  _formData: FormData,
): Promise<BasicFormState> {
  void _previousState;
  void _formData;
  await requireOwnerWorkspaceContext();

  return internalOperationError;
}

export async function updateMigrationStageAction(
  _previousState: BasicFormState,
  _formData: FormData,
): Promise<BasicFormState> {
  void _previousState;
  void _formData;
  await requireOwnerWorkspaceContext();

  return internalOperationError;
}

export async function runMigrationImportAction(
  _formData: FormData,
): Promise<void> {
  void _formData;
  await requireOwnerWorkspaceContext();

  redirect("/dashboard/migration?operation=operator-required");
}

export async function markMigrationReadyAction(): Promise<void> {
  await requireOwnerWorkspaceContext();

  redirect("/dashboard/migration?readiness=operator-required");
}

export async function acknowledgeMigrationReviewAction(
  formData: FormData,
): Promise<void> {
  if (formData.get("acknowledgeSnapshotLock") !== "yes") {
    redirect(
      "/dashboard/migration?review=blocked&reason=confirmation-required",
    );
  }

  const { session, workspace } = await requireOwnerWorkspaceContext();

  if (!isMigrationCorrectionChannelAvailable()) {
    redirect(
      "/dashboard/migration?review=blocked&reason=correction-channel-unavailable",
    );
  }

  const result = await acknowledgeMigrationOwnerReview({
    workspaceId: workspace.id,
    userId: session.userId,
  });

  if (result.status === "error") {
    console.warn({
      event: "migration_owner_review_acknowledgment_blocked",
      workspaceId: workspace.id,
      message: result.message,
    });
    const reason =
      result.reason === "schedule-missing" ||
      result.reason === "schedule-passed" ||
      result.reason === "launch-timezone-invalid" ||
      result.reason === "correction-channel-unavailable"
        ? result.reason
        : "remaining-checks";
    redirect(`/dashboard/migration?review=blocked&reason=${reason}`);
  }

  redirect("/dashboard/migration?review=acknowledged");
}
