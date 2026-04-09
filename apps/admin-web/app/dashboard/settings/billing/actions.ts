"use server";

import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import {
  refreshStripeConnectionStatus,
  startStripeConnectOnboarding,
  updateFailedPaymentGracePeriod,
} from "../../../../lib/stripe-settings";

export async function connectStripeAction(): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await startStripeConnectOnboarding({
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  });

  if (result.status === "redirect") {
    redirect(result.url);
  }

  redirect("/dashboard/settings/billing");
}

export async function refreshStripeConnectionAction(): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();

  await refreshStripeConnectionStatus({
    workspaceId: workspace.id,
  });

  redirect("/dashboard/settings/billing");
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

  redirect("/dashboard/settings/billing");

  return emptyFormState;
}

