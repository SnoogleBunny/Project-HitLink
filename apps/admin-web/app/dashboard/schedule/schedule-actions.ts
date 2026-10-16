"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { commitClassSchedule, reviewClassSchedule, scheduleInputFromForm, type ClassScheduleInput, type ClassScheduleReview } from "../../../lib/class-schedule";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

export interface ScheduleFormState { error: string | null; review?: ClassScheduleReview; input?: ClassScheduleInput }
export async function reviewOrSaveClassAction(_state: ScheduleFormState, formData: FormData): Promise<ScheduleFormState> {
  const { workspace, location, workspaceUserId } = await requireOwnerWorkspaceContext();
  const access = { workspaceId: workspace.id, locationId: location.id, workspaceUserId, timezone: location.timezone, role: "OWNER" as const };
  if (formData.get("command") === "save") {
    let input: ClassScheduleInput;
    try {
      const serialized = String(formData.get("reviewedInput") ?? "");
      if (serialized.length > 20000) throw new Error("Oversized input");
      input = JSON.parse(serialized);
    } catch { return { error: "The reviewed class details could not be read. Review them again." }; }
    const result = await commitClassSchedule({ access, input, reviewToken: String(formData.get("reviewToken") ?? ""), mutationId: String(formData.get("mutationId") ?? "") });
    if (result.status === "error") return { error: result.message, review: result.review, input };
    revalidatePath("/dashboard"); revalidatePath("/dashboard/schedule"); revalidatePath("/dashboard/coach/today");
    redirect(`/dashboard/schedule?date=${encodeURIComponent(input.date)}&saved=1`);
  }
  const input = scheduleInputFromForm(formData);
  const review = await reviewClassSchedule({ access, input });
  return { error: review.ok ? null : review.errors[0] ?? "Check the class details.", review, input };
}
