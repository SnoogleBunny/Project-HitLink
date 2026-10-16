"use server";
import {
  approveWorkspaceRetentionCase,
  executeWorkspaceRetention,
  holdWorkspaceRetentionCase,
  recordExternalFileRemoval,
  recordWorkspaceBackupRemoval,
  saveWorkspaceRetentionCase,
  WorkspaceDataError,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { getSessionOrNull } from "../../../lib/admin-access";
export type RetentionActionState = {
  error: string | null;
  success: string | null;
};
export async function retentionAction(
  _state: RetentionActionState,
  form: FormData,
): Promise<RetentionActionState> {
  const session = await getSessionOrNull();
  if (!session)
    return { error: "Sign in to review this records case.", success: null };
  const value = (key: string) => String(form.get(key) ?? ""),
    caseId = value("caseId"),
    version = Number(value("version"));
  try {
    if (form.get("confirmed") !== "on")
      throw new WorkspaceDataError(
        "Review the action and confirm before continuing.",
      );
    switch (value("intent")) {
      case "approve":
        await approveWorkspaceRetentionCase(session.userId, caseId, version);
        break;
      case "hold":
        await holdWorkspaceRetentionCase(
          session.userId,
          caseId,
          version,
          value("reason"),
        );
        break;
      case "save":
        await saveWorkspaceRetentionCase(session.userId, {
          workspaceId: value("workspaceId"),
          expectedVersion: version,
          custodianUserId: value("custodianUserId"),
          backupCustodianUserId: value("backupCustodianUserId"),
          retentionAt: value("retentionAt"),
          backupDeletionAfter: value("backupDeletionAfter"),
          retentionBasis: value("retentionBasis"),
          holdResolutionEvidence: value("holdResolutionEvidence"),
        });
        break;
      case "external":
        await recordExternalFileRemoval(session.userId, caseId, version, {
          inventoryHash: value("inventoryHash"),
          evidenceReference: value("evidenceReference"),
        });
        break;
      case "remove":
        await executeWorkspaceRetention(session.userId, caseId, version, {
          inventoryHash: value("inventoryHash"),
          confirmedWorkspaceId: value("confirmedWorkspaceId"),
        });
        break;
      case "backup":
        await recordWorkspaceBackupRemoval(session.userId, caseId, version, {
          confirmedWorkspaceId: value("confirmedWorkspaceId"),
          evidenceReference: value("evidenceReference"),
          removedAt: value("removedAt"),
        });
        break;
      default:
        throw new WorkspaceDataError("Choose a records action.");
    }
    revalidatePath(`/records/${caseId}`);
    revalidatePath("/dashboard/settings/data");
    return {
      error: null,
      success: "Recorded. Review the current status below.",
    };
  } catch (error) {
    return {
      error:
        error instanceof WorkspaceDataError
          ? error.message
          : "This action could not be confirmed. Review the case before trying again.",
      success: null,
    };
  }
}
