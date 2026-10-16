"use server";
import { revalidatePath } from "next/cache";
import {
  saveWorkspaceBillingHandover,
  WorkspaceDataError,
  type SourceHandoverDeclaration,
} from "@flowstate/db";
import { verifyWorkspaceCustomerBilling } from "@flowstate/payments";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
export interface HandoverActionState {
  error: string | null;
  success: string | null;
}
export async function ownerHandoverAction(
  _state: HandoverActionState,
  form: FormData,
): Promise<HandoverActionState> {
  const context = await requireOwnerWorkspaceContext();
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const value = (name: string) => String(form.get(name) ?? "");
  try {
    if (form.get("confirmed") !== "on")
      throw new WorkspaceDataError(
        "Review the handover and confirm its scope.",
      );
    if (value("intent") === "verify")
      await verifyWorkspaceCustomerBilling(actor, Number(value("version")));
    else {
      const mode = value("processorMode");
      if (mode !== "STOP_AND_REAUTHORIZE" && mode !== "RETAIN_GYM_PROCESSOR")
        throw new WorkspaceDataError("Choose a billing handover mode.");
      const sourceDeclarations: SourceHandoverDeclaration[] = form
        .getAll("sourceEvidenceId")
        .map((id) => {
          const prefix = `source.${String(id)}.`;
          return {
            evidenceId: String(id),
            sourceAccountReference: value(prefix + "account"),
            sourceContractReference: value(prefix + "contract"),
            disposition: value(
              prefix + "disposition",
            ) as SourceHandoverDeclaration["disposition"],
            effectiveAt: value(prefix + "effectiveAt"),
            evidenceReference: value(prefix + "evidence"),
          };
        });
      await saveWorkspaceBillingHandover(actor, {
        requestId: value("requestId"),
        expectedPlanVersion: Number(value("version")),
        destinationName: value("destinationName"),
        receiverUserId: value("receiverUserId"),
        evidenceReference: value("evidenceReference"),
        payerAuthorityEvidence: value("payerAuthorityEvidence"),
        processorMode: mode,
        processorAccountId: value("processorAccountId"),
        sourceDeclarations,
      });
    }
    revalidatePath("/dashboard/settings/data");
    revalidatePath("/dashboard/settings/data/handover");
    return {
      error: null,
      success:
        value("intent") === "verify"
          ? "The current handover is verified. Processor checks run again before access ends."
          : "Handover prepared. The named receiver must accept it, then every owner must approve the new exit-plan version.",
    };
  } catch (error) {
    return {
      error:
        error instanceof WorkspaceDataError
          ? error.message
          : "The handover could not be confirmed. Check its status before retrying.",
      success: null,
    };
  }
}
