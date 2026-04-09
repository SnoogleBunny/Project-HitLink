"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { cancelSelfBooking } from "../../../lib/self-service-bookings";

export interface BookingsActionState {
  error: string | null;
}

export const emptyBookingsActionState: BookingsActionState = {
  error: null,
};

export async function cancelSelfBookingAction(
  _previousState: BookingsActionState,
  formData: FormData,
): Promise<BookingsActionState> {
  const context = await requireMemberPortalContext();
  const result = await cancelSelfBooking({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    timezone: context.location.timezone,
    bookingId: String(formData.get("bookingId") ?? ""),
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

  return emptyBookingsActionState;
}
