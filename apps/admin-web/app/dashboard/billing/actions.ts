"use server";

import { redirect } from "next/navigation";
import { retryMembershipInvoice } from "@flowstate/payments";
import {
  markPaymentUpdateRequested,
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
  const { workspace, session } = await requireOwnerWorkspaceContext();

  const result = await retryMembershipInvoice({
    workspaceId: workspace.id,
    actorUserId: session.userId,
    membershipBillingStateId: String(formData.get("membershipBillingStateId") ?? ""),
  });

  redirect(result.status === "error" ? `/dashboard/billing?error=${encodeURIComponent(result.message)}` : "/dashboard/billing");
}

