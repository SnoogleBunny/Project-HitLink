import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../../_components/admin-shell";
import {
  formatMembershipPlanPrice,
  getMembershipPlanForEdit,
  getMembershipPlanFormOptions,
} from "../../../../../lib/membership-plans";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { MembershipPlanForm } from "../../membership-plan-form";

export default async function EditMembershipPlanPage({
  params,
}: {
  params: Promise<{
    membershipPlanId: string;
  }>;
}) {
  const { membershipPlanId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const [plan, options] = await Promise.all([
    getMembershipPlanForEdit({
      workspaceId: workspace.id,
      membershipPlanId,
    }),
    getMembershipPlanFormOptions({
      workspaceId: workspace.id,
    }),
  ]);

  if (!plan) {
    notFound();
  }

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Memberships"
      title={plan.name}
      description="Edit the owner-facing plan details. Synced Stripe prices stay immutable."
      actions={
        <Link className="button button-secondary" href="/dashboard/membership-plans">
          Back to plans
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Edit plan</p>
          <h3>{formatMembershipPlanPrice(plan)} monthly</h3>
          <MembershipPlanForm mode="edit" options={options} plan={plan} />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Stripe linkage</p>
          <h3>{plan.stripePriceId ? "Synced" : "Not synced yet"}</h3>
          <dl className="detail-list">
            <div>
              <dt>Stripe product</dt>
              <dd>{plan.stripeProductId ?? "Created on first assignment"}</dd>
            </div>
            <div>
              <dt>Stripe price</dt>
              <dd>{plan.stripePriceId ?? "Created on first assignment"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </AdminShell>
  );
}

