"use server";

import {
  WorkspaceSetupError,
  validateNewBusinessRegionalSettings,
} from "@flowstate/db";
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

  const newBusiness = formData.get("onboardingKind") === "NEW_BUSINESS";
  if (
    !workspaceName ||
    !timezone ||
    (!newBusiness && (!currentSoftware || !accessInstructions))
  ) {
    return {
      error: newBusiness
        ? "Business name and timezone are required."
        : "Gym name, launch timezone, current software, and access instructions are required.",
    };
  }

  if (newBusiness) {
    try {
      validateNewBusinessRegionalSettings({
        timezone,
        serviceMode: String(formData.get("serviceMode") ?? ""),
        currency: String(formData.get("currency") ?? ""),
        locale: String(formData.get("locale") ?? ""),
        contactEmail: String(formData.get("contactEmail") ?? ""),
      });
    } catch (error) {
      return {
        error:
          error instanceof WorkspaceSetupError
            ? error.message
            : "Review the business settings.",
      };
    }
    if (workspaceName.length > 120)
      return { error: "Enter a business name using 120 characters or fewer." };
  }
  const result = await createOwnerWorkspaceOnboarding({
    input: {
      userId: session.userId,
      ...(newBusiness
        ? {
            kind: "NEW_BUSINESS" as const,
            serviceMode: String(formData.get("serviceMode") ?? ""),
            currency: String(formData.get("currency") ?? ""),
            locale: String(formData.get("locale") ?? ""),
            contactEmail: String(formData.get("contactEmail") ?? ""),
          }
        : {}),
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
    try {
      console.warn({
        event: "owner_onboarding_blocked_inactive_membership",
        reason: "inactive-membership",
      });
    } catch {
      // Logging availability must not change this known blocked outcome.
    }

    return {
      error: result.message,
    };
  }

  redirect(
    result.status === "created"
      ? newBusiness
        ? "/dashboard/setup"
        : "/dashboard/migration"
      : result.location,
  );

  return emptyFormState;
}
