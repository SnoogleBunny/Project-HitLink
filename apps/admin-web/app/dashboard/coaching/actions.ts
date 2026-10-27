"use server";
import {
  CoachingError,
  runCoachingCommand,
  type CoachingCommand,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationsWorkspaceContext } from "../../../lib/operations-workspace";
import {
  coachingFeedback,
  coachingHref,
  coachingReturnPath,
} from "./navigation";

export async function coachingAction(formData: FormData): Promise<void> {
  const context = await requireOperationsWorkspaceContext();
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  let destination = coachingReturnPath({
    enrollmentId,
    kind: String(formData.get("kind")),
    returnView: formData.get("returnView"),
    returnReviewId: String(formData.get("returnReviewId") ?? ""),
  });
  try {
    const input: Record<string, unknown> = Object.fromEntries(
      formData.entries(),
    );
    for (const key of [
      "confirmPublish",
      "confirmConsequences",
      "noShow",
      "waiveLatePenalty",
    ])
      input[key] = formData.get(key) === "on";
    const result = await runCoachingCommand(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      {
        kind: String(formData.get("kind")) as CoachingCommand["kind"],
        operationId: String(formData.get("operationId")),
        enrollmentId: enrollmentId || undefined,
        expectedVersion: Number(formData.get("expectedVersion")),
        input,
      },
    );
    if (formData.get("kind") === "enroll")
      destination = coachingHref(result.id);
    destination = coachingFeedback(destination, "saved", "1");
  } catch (error) {
    destination = coachingFeedback(
      destination,
      "error",
      error instanceof CoachingError
        ? error.message
        : "The change could not be saved. Reload the page and try again.",
    );
  }
  revalidatePath("/dashboard/coaching", "layout");
  redirect(destination);
}
