"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { moveAccessBackedBooking } from "@flowstate/db";
import type { BookingsActionState } from "../../form-states";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { selectFamilyMember } from "../../_components/member-selector-actions";
import {
  cancelSelfBooking,
  leaveSelfWaitlist,
} from "../../../lib/self-service-bookings";

function returnUrl(formData: FormData, notice: string, bookingId?: string) {
  const date = String(formData.get("returnDate") ?? "");
  const query = new URLSearchParams({ notice });
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) query.set("date", date);
  if (bookingId) query.set("booking", bookingId);
  return `/app/schedule?${query}`;
}
async function refreshParticipant(memberId: string) {
  await selectFamilyMember(memberId);
  revalidatePath("/app/schedule");
  revalidatePath("/app/membership");
}
export async function cancelSelfBookingAction(
  _previousState: BookingsActionState,
  formData: FormData,
): Promise<BookingsActionState> {
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId)
    return { error: "Choose the participant before changing this booking." };
  const context = await requireMemberPortalContext({
    permission: "book",
    memberId,
  });
  const result = await cancelSelfBooking({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    timezone: context.location.timezone,
    bookingId: String(formData.get("bookingId") ?? ""),
  });
  if (result.status === "error") return { error: result.message };
  await refreshParticipant(context.member.id);
  redirect(returnUrl(formData, "cancelled"));
}
export async function leaveSelfWaitlistAction(
  _previousState: BookingsActionState,
  formData: FormData,
): Promise<BookingsActionState> {
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId)
    return { error: "Choose the participant before changing this waitlist." };
  const context = await requireMemberPortalContext({
    permission: "book",
    memberId,
  });
  const result = await leaveSelfWaitlist({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    waitlistEntryId: String(formData.get("waitlistEntryId") ?? ""),
  });
  if (result.status === "error") return { error: result.message };
  await refreshParticipant(context.member.id);
  redirect(returnUrl(formData, "left"));
}
export async function moveSelfBookingAction(
  _previousState: BookingsActionState,
  formData: FormData,
): Promise<BookingsActionState> {
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId)
    return { error: "Choose the participant before moving this booking." };
  const context = await requireMemberPortalContext({
    permission: "book",
    memberId,
  });
  const targetDate = String(formData.get("targetDate") ?? "");
  const result = await moveAccessBackedBooking({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    bookingId: String(formData.get("bookingId") ?? ""),
    targetClassTemplateId: String(formData.get("targetClassTemplateId") ?? ""),
    targetDate,
    timezone: context.location.timezone,
    mutationId: String(formData.get("mutationId") ?? ""),
  });
  if (result.status === "error") return { error: result.message };
  formData.set("returnDate", targetDate);
  await refreshParticipant(context.member.id);
  redirect(returnUrl(formData, "moved", result.bookingId));
}
