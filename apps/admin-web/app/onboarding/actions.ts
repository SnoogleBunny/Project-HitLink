"use server";

import { redirect } from "next/navigation";
import {
  emptyFormState,
  requireOnboardingSession,
  type BasicFormState,
} from "../../lib/admin-access";
import { createOwnerWorkspaceOnboarding } from "../../lib/onboarding";

export async function onboardingAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const session = await requireOnboardingSession();

  const workspaceName = String(formData.get("workspaceName") ?? "").trim();
  const businessType = String(formData.get("businessType") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const currentSoftware = String(formData.get("currentSoftware") ?? "").trim();
  const accessInstructions = String(
    formData.get("accessInstructions") ?? "",
  ).trim();

  if (!workspaceName || !timezone || !currentSoftware || !accessInstructions) {
    return {
      error:
        "Gym name, launch timezone, current software, and access instructions are required.",
    };
  }

  const result = await createOwnerWorkspaceOnboarding({
    input: {
      userId: session.userId,
      workspaceName,
      businessType,
      timezone,
      addressLine1: String(formData.get("addressLine1") ?? "").trim(),
      addressLine2: String(formData.get("addressLine2") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      region: String(formData.get("region") ?? "").trim(),
      postalCode: String(formData.get("postalCode") ?? "").trim(),
      countryCode: String(formData.get("countryCode") ?? "").trim(),
      migration: {
        currentSoftware,
        targetGoLiveDate: String(formData.get("targetGoLiveDate") ?? "").trim(),
        memberCountEstimate: String(
          formData.get("memberCountEstimate") ?? "",
        ).trim(),
        billingStatus: String(formData.get("billingStatus") ?? "").trim(),
        scheduleComplexity: String(
          formData.get("scheduleComplexity") ?? "",
        ).trim(),
        formsAndWaivers: String(formData.get("formsAndWaivers") ?? "").trim(),
        dataScope: formData.getAll("dataScope").map(String),
        accessInstructions,
      },
    },
  });

  if (result.status === "blocked") {
    console.warn({
      event: "owner_onboarding_blocked_inactive_membership",
      userId: session.userId,
      email: session.email,
      workspaceUserId: result.workspaceUserId,
      isActive: result.isActive,
    });

    return {
      error: result.message,
    };
  }

  redirect(
    result.status === "created" ? "/dashboard/migration" : result.location,
  );

  return emptyFormState;
}
