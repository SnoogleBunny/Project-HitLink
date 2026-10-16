"use server";
import {
  createWorkspaceDataExport,
  confirmWorkspaceExportReceipt,
  saveWorkspaceOffboarding,
  confirmWorkspaceOffboarding,
  finalizeWorkspaceOffboarding,
  grantWorkspaceSupportAccess,
  revokeWorkspaceSupportAccess,
  WorkspaceDataError,
} from "@flowstate/db";
import {
  registerWorkspacePlatformBilling,
  stopWorkspacePlatformBilling,
  verifyWorkspaceCustomerBilling,
} from "@flowstate/payments";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
export interface DataActionState {
  error: string | null;
  success: string | null;
}
export async function workspaceDataAction(
  _state: DataActionState,
  form: FormData,
): Promise<DataActionState> {
  const context = await requireOwnerWorkspaceContext();
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const value = (name: string) => String(form.get(name) ?? "");
  try {
    let success = "Saved.";
    switch (value("intent")) {
      case "export":
        await createWorkspaceDataExport(actor, value("purpose"));
        success =
          "Export ready. Download it and verify the records and file checksums.";
        break;
      case "receipt":
        if (form.get("confirmed") !== "on")
          throw new WorkspaceDataError(
            "Confirm that you opened and checked the archive.",
          );
        await confirmWorkspaceExportReceipt(
          actor,
          value("exportId"),
          value("checksum"),
        );
        success = "Export receipt recorded.";
        break;
      case "plan":
        await saveWorkspaceOffboarding(actor, {
          expectedVersion: Number(value("version")),
          accessEndsAt: value("accessEndsAt"),
          retentionUntil: value("retentionUntil"),
          retentionReason: value("retentionReason"),
          recordsContact: value("recordsContact"),
          retentionHoldReason: value("retentionHoldReason"),
          exportJobId: value("exportJobId"),
        });
        success = "Offboarding plan saved for owner review.";
        break;
      case "confirm":
        if (form.get("confirmed") !== "on")
          throw new WorkspaceDataError(
            "Review and confirm the offboarding plan.",
          );
        await confirmWorkspaceOffboarding(actor, Number(value("version")));
        success = "Your confirmation of this plan version is recorded.";
        break;
      case "platform":
        await registerWorkspacePlatformBilling(actor, value("subscriptionId"));
        success = "Platform subscription verified with the processor.";
        break;
      case "stop-platform": {
        const result = await stopWorkspacePlatformBilling(
          actor,
          Number(value("version")),
        );
        success =
          result.status === "STOP_CONFIRMED"
            ? "The processor confirms the platform subscription stop."
            : "Platform billing still needs review. Access has not been revoked.";
        break;
      }
      case "customers":
        await verifyWorkspaceCustomerBilling(actor, Number(value("version")));
        success = "Customer renewal stops verified with the processor.";
        break;
      case "finalize":
        if (form.get("confirmed") !== "on")
          throw new WorkspaceDataError(
            "Confirm access revocation after reviewing the blockers.",
          );
        await finalizeWorkspaceOffboarding(actor, Number(value("version")));
        success =
          "Gym access has ended. Records remain subject to the agreed retention plan.";
        break;
      case "grant":
        await grantWorkspaceSupportAccess(actor, {
          supportUserId: value("supportUserId"),
          purpose: value("purpose"),
          expiresAt: value("expiresAt"),
        });
        success = "Time-limited diagnostics access granted.";
        break;
      case "revoke":
        await revokeWorkspaceSupportAccess(actor, value("grantId"));
        success = "Support access revoked.";
        break;
      default:
        throw new WorkspaceDataError("Choose a records action.");
    }
    revalidatePath("/dashboard/settings/data");
    return { error: null, success };
  } catch (error) {
    return {
      error:
        error instanceof WorkspaceDataError
          ? error.message
          : "This action could not be confirmed. Check its status before trying again.",
      success: null,
    };
  }
}
