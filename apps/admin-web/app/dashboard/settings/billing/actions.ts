"use server";

import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import {
  refreshStripeConnectionStatus,
  startStripeConnectOnboarding,
  type StripeSettingsMutationResult,
  updateFailedPaymentGracePeriod,
} from "../../../../lib/stripe-settings";

const billingSettingsPath = "/dashboard/settings/billing";

function getBillingSettingsReturnPath(
  result: StripeSettingsMutationResult,
): string {
  return result.status === "unavailable"
    ? `${billingSettingsPath}?stripe=unavailable`
    : billingSettingsPath;
}

export async function connectStripeAction(): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await startStripeConnectOnboarding({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  });

  if (result.status === "redirect") {
    redirect(result.url);
  }

  redirect(getBillingSettingsReturnPath(result));
}

export async function refreshStripeConnectionAction(): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();

  const result = await refreshStripeConnectionStatus({
    workspaceId: workspace.id,
  });

  redirect(getBillingSettingsReturnPath(result));
}

export async function updateFailedPaymentGracePeriodAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await updateFailedPaymentGracePeriod({
    workspaceId: workspace.id,
    failedPaymentGracePeriodDays: String(
      formData.get("failedPaymentGracePeriodDays") ?? "",
    ),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(billingSettingsPath);

  return emptyFormState;
}

