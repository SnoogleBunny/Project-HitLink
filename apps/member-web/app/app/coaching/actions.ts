"use server";
import {
  CoachingError,
  runCoachingCommand,
  type CoachingCommand,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import {
  checkCoachingPayment,
  startCoachingPayment,
} from "../../../lib/coaching-payments";

export async function coachingAction(formData: FormData): Promise<void> {
  const context = await requireMemberPortalContext({ scope: "account" });
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  let destination = `/app/coaching/${encodeURIComponent(enrollmentId)}`;
  try {
    const kind = String(formData.get("kind"));
    if (kind === "pay")
      destination = await startCoachingPayment(actor, enrollmentId);
    else if (kind === "checkPayment") {
      const status = await checkCoachingPayment(actor, enrollmentId);
      destination += `?payment=${status.toLowerCase()}`;
    } else {
      const input: Record<string, unknown> = Object.fromEntries(
        formData.entries(),
      );
      for (const key of ["acceptTerms", "confirmConsequences"])
        input[key] = formData.get(key) === "on";
      await runCoachingCommand(actor, {
        kind: kind as CoachingCommand["kind"],
        operationId: String(formData.get("operationId")),
        enrollmentId,
        expectedVersion: Number(formData.get("expectedVersion")),
        input,
      });
      destination += "?saved=1";
    }
  } catch (error) {
    destination = `/app/coaching/${encodeURIComponent(enrollmentId)}?error=${encodeURIComponent(error instanceof CoachingError ? error.message : "The change could not be saved. Reload the page and try again.")}`;
  }
  revalidatePath("/app/coaching", "layout");
  redirect(destination);
}
