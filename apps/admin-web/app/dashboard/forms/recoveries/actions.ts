"use server";
import { revalidatePath } from "next/cache";
import {
  prisma,
  resolveBookingFormRecovery,
  reconcileFormRecoveryRefund,
  FormRequirementError,
} from "@flowstate/db";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
export type OwnerFormRecoveryState = { error?: string; success?: string };
export async function ownerFormRecoveryAction(
  _state: OwnerFormRecoveryState,
  data: FormData,
): Promise<OwnerFormRecoveryState> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const choice = String(data.get("choice") ?? ""),
    common = {
      workspaceId: workspace.id,
      actorUserId: session.userId,
      recoveryId: String(data.get("recoveryId") ?? ""),
      expectedVersion: Number(data.get("version")),
    };
  if (choice === "REFUND_CONFIRMED") {
    try {
      await reconcileFormRecoveryRefund({ ...common, db: prisma });
    } catch (error) {
      if (error instanceof FormRequirementError)
        return { error: error.message };
      throw error;
    }
    revalidatePath("/dashboard/forms/recoveries");
    return {
      success:
        "The completed payment review and provider-confirmed refund were verified. The recovery history is retained.",
    };
  }
  if (!["CANCEL", "REBOOK", "REFUND_REVIEW", "KEEP_BOOKING"].includes(choice))
    return { error: "Choose a reviewed recovery action." };
  const target = String(data.get("replacement") ?? "").split("|");
  const result = await resolveBookingFormRecovery({
    ...common,
    choice: choice as "CANCEL" | "REBOOK" | "REFUND_REVIEW" | "KEEP_BOOKING",
    operationId: String(data.get("operationId") ?? ""),
    targetClassTemplateId: target[0],
    targetDate: target[1],
  });
  if (result.status === "error") return { error: result.message };
  revalidatePath("/dashboard/forms/recoveries");
  revalidatePath("/dashboard/billing/reviews");
  return {
    success:
      result.status === "retained"
        ? "The valid forms and explicit decision to retain this booking are recorded."
        : result.status === "refund_review"
          ? "The booking was cancelled without penalty and the money review is open. No refund is implied."
          : result.status === "moved"
            ? "The booking and original funding moved atomically without a form-change penalty."
            : "The booking was cancelled and its original reserved units released without a form-change penalty.",
  };
}
