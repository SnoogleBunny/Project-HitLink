"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { createSelfBooking } from "../../../lib/self-service-bookings";

export interface ScheduleActionState {
  error: string | null;
}

export const emptyScheduleActionState: ScheduleActionState = {
  error: null,
};

export async function createSelfBookingAction(
  _previousState: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const context = await requireMemberPortalContext();
  const result = await createSelfBooking({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    timezone: context.location.timezone,
    classTemplateId: String(formData.get("classTemplateId") ?? ""),
    scheduledForDate: String(formData.get("scheduledForDate") ?? ""),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  revalidatePath("/app/bookings");
  redirect("/app/bookings");

  return emptyScheduleActionState;
}
