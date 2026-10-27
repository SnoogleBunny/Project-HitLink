"use server";
import { revalidatePath } from "next/cache";
import { resolveBookingFormRecovery } from "@flowstate/db";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
export type RecoveryActionState = { error?: string; success?: string };
export async function recoverFormBookingAction(
  _state: RecoveryActionState,
  data: FormData,
): Promise<RecoveryActionState> {
  const memberId = String(data.get("memberId") ?? "");
  if (!memberId)
    return { error: "Choose the participant before reviewing recovery." };
  const context = await requireMemberPortalContext({
    permission: "book",
    memberId,
  });
  const choice = String(data.get("choice") ?? "");
  if (!["CANCEL", "REBOOK", "REFUND_REVIEW", "KEEP_BOOKING"].includes(choice))
    return { error: "Choose one of the reviewed recovery actions." };
  const selected = String(data.get("replacement") ?? "").split("|");
  const result = await resolveBookingFormRecovery({
    workspaceId: context.workspace.id,
    actorUserId: context.session.userId,
    recoveryId: String(data.get("recoveryId") ?? ""),
    expectedVersion: Number(data.get("version")),
    choice: choice as "CANCEL" | "REBOOK" | "REFUND_REVIEW" | "KEEP_BOOKING",
    targetClassTemplateId: selected[0],
    targetDate: selected[1],
    operationId: String(data.get("operationId") ?? ""),
  });
  if (result.status === "error") return { error: result.message };
  revalidatePath("/app/forms/recovery");
  revalidatePath("/app/schedule");
  revalidatePath("/app/membership");
  return {
    success:
      result.status === "retained"
        ? "The completed forms and your explicit choice to keep this booking are recorded. Normal attendance terms remain in force."
        : result.status === "moved"
          ? "Your booking moved without a form-change penalty. The original funding remains linked."
          : result.status === "refund_review"
            ? "The booking was cancelled without a form-change penalty. A named owner is reviewing the money; no refund is implied yet."
            : "The affected booking was cancelled without a form-change penalty. Its original reserved units were released.",
  };
}
