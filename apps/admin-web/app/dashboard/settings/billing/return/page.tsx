import { redirect } from "next/navigation";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { refreshStripeConnectionStatus } from "../../../../../lib/stripe-settings";

export default async function StripeBillingReturnPage() {
  const { workspace } = await requireOwnerWorkspaceContext();

  await refreshStripeConnectionStatus({
    workspaceId: workspace.id,
  });

  redirect("/dashboard/settings/billing");
}

