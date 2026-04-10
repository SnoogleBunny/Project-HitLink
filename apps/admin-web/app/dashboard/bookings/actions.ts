"use server";

import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../lib/admin-access";
import { createClassBooking } from "../../../lib/bookings";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

function parseBookingOption(value: string): {
  classTemplateId: string;
  scheduledForDate: string;
} {
  const [classTemplateId = "", scheduledForDate = ""] = value.split("|");

  return {
    classTemplateId,
    scheduledForDate,
  };
}

export async function createClassBookingAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace, location } = await requireOwnerWorkspaceContext();
  const bookingOption = parseBookingOption(
    String(formData.get("bookingOption") ?? ""),
  );
  const result = await createClassBooking({
    workspaceId: workspace.id,
    timezone: location.timezone,
    input: {
      memberId: String(formData.get("memberId") ?? ""),
      guardianId: String(formData.get("guardianId") ?? ""),
      classTemplateId: bookingOption.classTemplateId,
      scheduledForDate: bookingOption.scheduledForDate,
      bookingType: String(formData.get("bookingType") ?? "MEMBERSHIP"),
    },
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/bookings");

  return emptyFormState;
}
