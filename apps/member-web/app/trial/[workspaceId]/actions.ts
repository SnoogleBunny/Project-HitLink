"use server";

import { buildMagicLinkPath, issueTrialMagicLinkRequests } from "@hitlink/db";
import { createTrialBooking } from "../../../lib/trial-booking";

export interface TrialBookingFormState {
  error: string | null;
  confirmation: {
    classTitle: string;
    scheduledForDate: string;
    forms: Array<{
      requestId: string;
      label: string;
      href: string;
    }>;
  } | null;
}

export const emptyTrialBookingFormState: TrialBookingFormState = {
  error: null,
  confirmation: null,
};

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

export async function createTrialBookingAction(
  _previousState: TrialBookingFormState,
  formData: FormData,
): Promise<TrialBookingFormState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const bookingOption = parseBookingOption(
    String(formData.get("bookingOption") ?? ""),
  );
  const result = await createTrialBooking({
    workspaceId,
    input: {
      classTemplateId: bookingOption.classTemplateId,
      scheduledForDate: bookingOption.scheduledForDate,
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
      guardianFullName: String(formData.get("guardianFullName") ?? ""),
      guardianEmail: String(formData.get("guardianEmail") ?? ""),
      guardianPhone: String(formData.get("guardianPhone") ?? ""),
      relationshipLabel: String(formData.get("relationshipLabel") ?? ""),
    },
  });

  if (result.status === "error") {
    return {
      error: result.message,
      confirmation: null,
    };
  }

  const issuedLinks = await issueTrialMagicLinkRequests({
    workspaceId,
    memberId: result.memberId,
  });

  return {
    error: null,
    confirmation: {
      classTitle: result.classTitle,
      scheduledForDate: result.scheduledForDate,
      forms: issuedLinks.map((link) => ({
        requestId: link.requestId,
        label: link.guardianName
          ? `${link.formName} for ${link.guardianName}`
          : link.formName,
        href: buildMagicLinkPath(link.token),
      })),
    },
  };
}
