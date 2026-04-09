"use server";

import { redirect } from "next/navigation";
import {
  markPaymentUpdateRequested,
  retryFailedPaymentNow,
} from "../../../lib/failed-payments";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

export async function markPaymentUpdateRequestedAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();

  await markPaymentUpdateRequested({
    workspaceId: workspace.id,
    membershipBillingStateId: String(formData.get("membershipBillingStateId") ?? ""),
  });

  redirect("/dashboard/billing");
}

export async function retryFailedPaymentNowAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();

  await retryFailedPaymentNow({
    workspaceId: workspace.id,
    membershipBillingStateId: String(formData.get("membershipBillingStateId") ?? ""),
  });

  redirect("/dashboard/billing");
}

