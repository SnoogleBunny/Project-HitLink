"use server";
import {
  confirmOwnerLateClassBooking,
  previewOwnerLateClassBooking,
  OwnerLateBookingError,
  type OwnerLateBookingReview,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
export interface LateBookingState {
  error: string | null;
  success: string | null;
  review: OwnerLateBookingReview | null;
}
export async function ownerLateBookingAction(
  _state: LateBookingState,
  form: FormData,
): Promise<LateBookingState> {
  const context = await requireOwnerWorkspaceContext();
  const args = {
    actor: {
      workspaceId: context.workspace.id,
      userId: context.session.userId,
    },
    input: {
      memberId: String(form.get("memberId") ?? ""),
      classTemplateId: String(form.get("classTemplateId") ?? ""),
      scheduledForDate: String(form.get("scheduledForDate") ?? ""),
      bookingType: String(form.get("bookingType") ?? "") as "ACCESS" | "TRIAL",
      reason: String(form.get("reason") ?? ""),
      operationId: String(form.get("operationId") ?? ""),
    },
  };
  try {
    if (form.get("step") === "confirm") {
      const result = await confirmOwnerLateClassBooking({
        ...args,
        previewHash: String(form.get("previewHash") ?? ""),
        confirmed: form.get("confirmCutoffException") === "on",
      });
      revalidatePath("/dashboard/bookings");
      revalidatePath("/dashboard/coach/today");
      revalidatePath("/app/schedule");
      return {
        error: null,
        success:
          result.status === "already_created"
            ? "This request already confirmed the same booking. No additional unit was used."
            : "Class booking confirmed. The private exception receipt is recorded.",
        review: null,
      };
    }
    return {
      error: null,
      success: null,
      review: await previewOwnerLateClassBooking(args),
    };
  } catch (error) {
    return {
      error:
        error instanceof OwnerLateBookingError
          ? error.message
          : "The exception could not be confirmed. Reload and review the current class before trying again.",
      success: null,
      review: null,
    };
  }
}
