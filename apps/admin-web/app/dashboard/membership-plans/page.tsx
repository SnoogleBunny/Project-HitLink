import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import {
  formatMembershipPlanPrice,
  getMembershipPlanFormOptions,
  listMembershipPlans,
  type MembershipPlanSummary,
} from "../../../lib/membership-plans";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { archiveMembershipPlanAction } from "./actions";
import { MembershipPlanForm } from "./membership-plan-form";

function formatDate(value: Date | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(value);
}

function formatRestrictions(plan: MembershipPlanSummary): string {
  if (plan.programRestrictions.length === 0) {
    return "All active programs";
  }

  return plan.programRestrictions.map((program) => program.name).join(", ");
}

function PlanCard({
  plan,
  archived = false,
}: {
  plan: MembershipPlanSummary;
  archived?: boolean;
}) {
  return (
    <article className="stack-item">
      <div className="stack-item-copy">
        <div className="stack-item-heading">
          <h4>{plan.name}</h4>
          <span
            className={`status-pill ${archived ? "" : "status-pill-success"}`}
          >
            {archived ? "Archived" : "Live"}
          </span>
          {plan.stripePriceId ? <span className="status-pill">Stripe</span> : null}
        </div>
        <p>{plan.description ?? "No description yet."}</p>
        <dl className="inline-meta">
          <div>
            <dt>Monthly price</dt>
            <dd>{formatMembershipPlanPrice(plan)}</dd>
          </div>
          <div>
            <dt>Programs</dt>
            <dd>{formatRestrictions(plan)}</dd>
          </div>
          <div>
            <dt>Archived</dt>
            <dd>{formatDate(plan.archivedAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="dashboard-actions">
        <Link
          className="button button-secondary"
          href={`/dashboard/membership-plans/${plan.id}/edit`}
        >
          {archived ? "View details" : "Edit plan"}
        </Link>
        {!archived ? (
          <form action={archiveMembershipPlanAction}>
            <input name="membershipPlanId" type="hidden" value={plan.id} />
            <button className="button button-secondary" type="submit">
              Archive
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export default async function MembershipPlansPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const [plans, options] = await Promise.all([
    listMembershipPlans({
      workspaceId: workspace.id,
    }),
    getMembershipPlanFormOptions({
      workspaceId: workspace.id,
    }),
  ]);

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Memberships"
      title="Membership plans"
      description="Create recurring monthly membership plans for owner-assigned member billing."
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Create plan</p>
          <h3>Monthly recurring only</h3>
          <p className="management-copy">
            Keep pricing in cents. Punch cards, drop-ins, discounts, and taxes
            stay out of this slice.
          </p>
          <MembershipPlanForm mode="create" options={options} />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Policy notes</p>
          <h3>Simple references</h3>
          <p className="management-copy">
            Cancellation and freeze policy fields are owner-facing references
            only. This slice does not create a contract engine.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Active plans</dt>
              <dd>{plans.activePlans.length}</dd>
            </div>
            <div>
              <dt>Archived plans</dt>
              <dd>{plans.archivedPlans.length}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Active plans</p>
        <h3>
          {plans.activePlans.length} live plan
          {plans.activePlans.length === 1 ? "" : "s"}
        </h3>

        {plans.activePlans.length === 0 ? (
          <p className="empty-state">
            No membership plans yet. Create one before assigning recurring
            memberships to members.
          </p>
        ) : (
          <div className="stack-list">
            {plans.activePlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        )}
      </section>

      <section className="management-card">
        <p className="dashboard-card-label">Archived plans</p>
        <h3>Hidden from new assignments</h3>

        {plans.archivedPlans.length === 0 ? (
          <p className="empty-state">No archived membership plans yet.</p>
        ) : (
          <div className="stack-list">
            {plans.archivedPlans.map((plan) => (
              <PlanCard key={plan.id} archived plan={plan} />
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}

