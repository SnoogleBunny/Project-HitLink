"use server";
import { FinancialError, reviewOwnerPaymentDispute } from "@flowstate/db";
import { refreshOwnerPaymentDispute } from "@flowstate/payments";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
export interface DisputeActionState {
  error?: string;
  success?: string;
}
export async function reviewDisputeAction(
  _state: DisputeActionState,
  form: FormData,
): Promise<DisputeActionState> {
  const context = await requireOwnerWorkspaceContext();
  const base = {
    workspaceId: context.workspace.id,
    actorUserId: context.session.userId,
    disputeId: String(form.get("disputeId") ?? ""),
  };
  try {
    if (form.get("intent") === "refresh")
      await refreshOwnerPaymentDispute(base);
    else {
      if (form.get("confirmTreatment") !== "yes")
        throw new FinancialError(
          "Confirm the reservation and access treatment before saving.",
        );
      await reviewOwnerPaymentDispute({
        ...base,
        requestId: String(form.get("requestId") ?? ""),
        reviewHash: String(form.get("reviewHash") ?? ""),
        reviewerWorkspaceUserId: String(form.get("reviewer") ?? ""),
        treatment: String(form.get("treatment") ?? "") as "KEEP_RESERVATIONS",
        reason: String(form.get("reason") ?? ""),
      });
    }
  } catch (error) {
    return {
      error:
        error instanceof FinancialError
          ? error.message
          : "The dispute could not be verified. Its recorded reservations and financial review remain pending.",
    };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/billing");
  revalidatePath("/app/schedule");
  revalidatePath("/app/billing");
  revalidatePath("/app/coaching");
  revalidatePath("/dashboard/billing/reviews/[caseId]", "page");
  return {
    success:
      form.get("intent") === "refresh"
        ? "Processor outcome checked. Review its recorded status below."
        : "Owner treatment recorded. Financial review remains open until its verified outcome and access treatment are complete.",
  };
}
