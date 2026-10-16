"use server";
import { revalidatePath } from "next/cache";
import {
  grantClassEligibilityException,
  ProgramProgressError,
  recordProgramPromotion,
} from "@flowstate/db";
import { requireOperationsWorkspaceContext } from "../../../../../lib/operations-workspace";
export async function promotionAction(
  _state: { error?: string; message?: string },
  form: FormData,
) {
  const context = await requireOperationsWorkspaceContext(),
    actor = {
      workspaceId: context.workspace.id,
      userId: context.session.userId,
    },
    memberId = String(form.get("memberId") ?? "");
  try {
    if (form.get("command") === "exception") {
      await grantClassEligibilityException(actor, {
        memberId,
        classTemplateId: String(form.get("classTemplateId") ?? ""),
        date: String(form.get("date") ?? ""),
        reason: String(form.get("reason") ?? ""),
      });
      return {
        message: "Eligibility exception recorded. Required forms still apply.",
      };
    }
    await recordProgramPromotion(actor, {
      memberId,
      programId: String(form.get("programId") ?? ""),
      rankKey: String(form.get("rankKey") ?? ""),
      stripeCount: Number(form.get("stripeCount")),
      effectiveOn: String(form.get("effectiveOn") ?? ""),
      awardedByWorkspaceUserId: String(
        form.get("awardedByWorkspaceUserId") ?? "",
      ),
      internalNote: String(form.get("internalNote") ?? ""),
      publicNote: String(form.get("publicNote") ?? ""),
      operationKey: String(form.get("operationKey") ?? ""),
    });
    revalidatePath(`/dashboard/members/${memberId}/progress`);
    return { message: "Promotion recorded." };
  } catch (error) {
    if (error instanceof ProgramProgressError) return { error: error.message };
    throw error;
  }
}
