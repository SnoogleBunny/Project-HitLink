"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { startDropInCheckout } from "../../../lib/member-commerce";
import {
  createSelfBooking,
  joinSelfWaitlist,
} from "../../../lib/self-service-bookings";

export interface ScheduleActionState {
  error: string | null;
}

export const emptyScheduleActionState: ScheduleActionState = {
  error: null,
};

async function getCheckoutUrl(pathname: string): Promise<string> {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol =
    forwardedProto ?? (process.env.NODE_ENV === "production" ? "https" : "http");

  if (!host) {
    return `http://localhost:3001${pathname}`;
  }

  return `${protocol}://${host}${pathname}`;
}

export async function createSelfBookingAction(
  _previousState: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const context = await requireMemberPortalContext();
  const action = String(formData.get("actionKind") ?? "book");

  if (action === "join_waitlist") {
    const waitlistResult = await joinSelfWaitlist({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      timezone: context.location.timezone,
      classTemplateId: String(formData.get("classTemplateId") ?? ""),
      scheduledForDate: String(formData.get("scheduledForDate") ?? ""),
    });

    if (waitlistResult.status === "error") {
      return {
        error: waitlistResult.message,
      };
    }

    revalidatePath("/app");
    revalidatePath("/app/schedule");
    revalidatePath("/app/bookings");
    redirect("/app/bookings");

    return emptyScheduleActionState;
  }

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

  if (result.status === "payment_required") {
    const checkout = await startDropInCheckout({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      bookingId: result.bookingId,
      successUrl: await getCheckoutUrl("/app/checkout/complete"),
      cancelUrl: await getCheckoutUrl("/app/bookings"),
    });

    if (checkout.status === "error") {
      return {
        error: checkout.message,
      };
    }

    redirect(checkout.url);

    return emptyScheduleActionState;
  }

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  revalidatePath("/app/bookings");
  redirect("/app/bookings");

  return emptyScheduleActionState;
}
