"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  emptyBookingsActionState,
  type BookingsActionState,
} from "../../form-states";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import {
  cancelSelfBooking,
  leaveSelfWaitlist,
} from "../../../lib/self-service-bookings";

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

export async function leaveSelfWaitlistAction(
  _previousState: BookingsActionState,
  formData: FormData,
): Promise<BookingsActionState> {
  const context = await requireMemberPortalContext();
  const result = await leaveSelfWaitlist({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    waitlistEntryId: String(formData.get("waitlistEntryId") ?? ""),
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
