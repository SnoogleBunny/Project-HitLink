"use server";
import {
  CoachingError,
  getZonedDateTimeAsUtc,
  isUnambiguousClassTime,
  runCoachingCommand,
  type CoachingCommand,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperationsWorkspaceContext } from "../../../lib/operations-workspace";

export async function coachingAction(formData: FormData): Promise<void> {
  const context = await requireOperationsWorkspaceContext();
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  let destination = enrollmentId
    ? `/dashboard/coaching/${encodeURIComponent(enrollmentId)}`
    : "/dashboard/coaching";
  try {
    const input: Record<string, unknown> = Object.fromEntries(
      formData.entries(),
    );
    for (const key of ["confirmPublish", "confirmConsequences", "noShow"])
      input[key] = formData.get(key) === "on";
    if (formData.get("kind") === "createAvailability") {
      for (const key of ["startsAt", "endsAt"]) {
        const local = String(formData.get(key) ?? "");
        const [dateString = "", time = ""] = local.split("T");
        const [hours = 0, minutes = 0] = time.split(":").map(Number);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !isUnambiguousClassTime(dateString, hours * 60 + minutes, context.location.timezone)) {
          throw new CoachingError("Choose an unambiguous appointment time in the gym's timezone.");
        }
        input[key] = getZonedDateTimeAsUtc({
          dateString,
          minutes: hours * 60 + minutes,
          timezone: context.location.timezone,
        }).toISOString();
      }
    }
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
      destination = `/dashboard/coaching/${result.id}`;
    destination += "?saved=1";
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof CoachingError ? error.message : "The change could not be saved. Reload the page and try again.")}`;
  }
  revalidatePath("/dashboard/coaching", "layout");
  redirect(destination);
}
