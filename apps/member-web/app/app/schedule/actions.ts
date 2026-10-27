"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DirectBookingFundingReviewError, parseDirectBookingFundingReview } from "@flowstate/db";
import {
  emptyScheduleActionState,
  type ScheduleActionState,
} from "../../form-states";
import { requireMemberCommandContext } from "../../../lib/member-auth";
import { selectFamilyMember } from "../../_components/member-selector-actions";
import { startDropInCheckout } from "../../../lib/member-commerce";
import {
  createSelfBooking,
  joinSelfWaitlist,
} from "../../../lib/self-service-bookings";

async function getCheckoutUrl(pathname: string): Promise<string> {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol =
    forwardedProto ??
    (process.env.NODE_ENV === "production" ? "https" : "http");

  if (!host) {
    return `http://localhost:3001${pathname}`;
  }

  return `${protocol}://${host}${pathname}`;
}

export async function createSelfBookingAction(
  _previousState: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId)
    return { error: "Choose the participant before booking a class." };
  const { context, actor } = await requireMemberCommandContext({
    permission: "book",
    memberId,
  });
  const query = new URLSearchParams({
    date: String(formData.get("scheduledForDate") ?? ""),
  });
  const action = String(formData.get("actionKind") ?? "book");
  if (action === "pay_and_book" && context.permissions?.canPay === false)
    return {
      error:
        "Your family permissions allow bookings, but not purchases. Ask the account holder to arrange payment.",
    };

  if (action === "join_waitlist") {
    const waitlistResult = await joinSelfWaitlist({
      workspaceId: context.workspace.id,
      actor,
      memberId: context.member.id,
      autoPromotionOptIn: formData.get("autoPromotionOptIn") === "on",
      allowPunchCardFunding: formData.get("allowPunchCardFunding") === "on",
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
    await selectFamilyMember(context.member.id);
    query.set("notice", "waitlisted");
    redirect(`/app/schedule?${query}`);

    return emptyScheduleActionState;
  }

  let reviewedFunding;
  try {
    reviewedFunding = parseDirectBookingFundingReview(formData.get("reviewedFunding"));
  } catch (error) {
    if (error instanceof DirectBookingFundingReviewError) return { error: error.message, reviewRequired: true };
    throw error;
  }
  const result = await createSelfBooking({
    workspaceId: context.workspace.id,
    actor,
    memberId: context.member.id,
    timezone: context.location.timezone,
    allowDropIn: context.permissions?.canPay !== false,
    classTemplateId: String(formData.get("classTemplateId") ?? ""),
    scheduledForDate: String(formData.get("scheduledForDate") ?? ""),
    reviewedFunding,
  });

  if (result.status === "error") {
    return {
      error: result.message,
      ...(result.code === "REVIEW_REQUIRED" ? { reviewRequired: true } : {}),
    };
  }

  if (result.status === "payment_required") {
    if (context.permissions?.canPay === false)
      return {
        error:
          "Payment is required. Your family permissions do not allow purchases.",
      };
    const checkout = await startDropInCheckout({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
      bookingId: result.bookingId,
      actorUserId: context.session.userId,
      payerMemberId: (context.accountMember ?? context.member).id,
      successUrl: await getCheckoutUrl(
        `/app/checkout/complete?${query}&booking=${encodeURIComponent(result.bookingId)}`,
      ),
      cancelUrl: await getCheckoutUrl(
        `/app/schedule?${query}&booking=${encodeURIComponent(result.bookingId)}`,
      ),
    });

    if (checkout.status === "error") {
      await selectFamilyMember(context.member.id);
      query.set("booking", result.bookingId);
      redirect(`/app/schedule?${query}`);
    }

    await selectFamilyMember(context.member.id);
    redirect(checkout.url);

    return emptyScheduleActionState;
  }

  revalidatePath("/app");
  revalidatePath("/app/schedule");
  revalidatePath("/app/bookings");
  await selectFamilyMember(context.member.id);
  if ("bookingId" in result) query.set("booking", result.bookingId);
  query.set("notice", "booked");
  redirect(`/app/schedule?${query}`);

  return emptyScheduleActionState;
}

export async function resumeBookingPaymentAction(
  _previousState: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId)
    return { error: "Choose the participant before continuing payment." };
  const { context } = await requireMemberCommandContext({
    memberId,
    permission: "pay",
  });
  const bookingId = String(formData.get("bookingId") ?? "");
  const query = new URLSearchParams({
    booking: bookingId,
    date: String(formData.get("returnDate") ?? ""),
  });
  const checkout = await startDropInCheckout({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    bookingId,
    actorUserId: context.session.userId,
    payerMemberId: (context.accountMember ?? context.member).id,
    successUrl: await getCheckoutUrl(`/app/checkout/complete?${query}`),
    cancelUrl: await getCheckoutUrl(`/app/schedule?${query}`),
  });
  if (checkout.status === "error") return { error: checkout.message };
  await selectFamilyMember(context.member.id);
  redirect(checkout.url);
}
