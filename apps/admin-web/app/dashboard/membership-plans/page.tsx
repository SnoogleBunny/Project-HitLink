import { resolveDisplayLocale } from "@flowstate/ui";
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

function formatRestrictions(plan: MembershipPlanSummary): string {
  if (plan.programRestrictions.length === 0) {
    return "All active programs";
  }

  return plan.programRestrictions.map((program) => program.name).join(", ");
}

export default async function MembershipPlansPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  function formatDate(value: Date | null): string {
    if (!value) {
      return "Not set";
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
    }).format(value);
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
            {plan.stripePriceId ? (
              <span className="status-pill">Stripe</span>
            ) : null}
          </div>
          <p>{plan.description ?? "No description yet."}</p>
          <dl className="inline-meta">
            <div>
              <dt>Monthly price</dt>
              <dd>{formatMembershipPlanPrice(plan, locale)}</dd>
            </div>
            <div>
              <dt>Programs</dt>
              <dd>{formatRestrictions(plan)}</dd>
            </div>
            <div>
              <dt>Class allowance</dt>
              <dd>
                {!plan.weeklyClassLimit && !plan.monthlyClassLimit
                  ? "Unlimited classes"
                  : [
                      plan.weeklyClassLimit
                        ? `${plan.weeklyClassLimit} per billing week`
                        : null,
                      plan.monthlyClassLimit
                        ? `${plan.monthlyClassLimit} per billing month`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </dd>
            </div>
            {archived ? (
              <div>
                <dt>Archived</dt>
                <dd>{formatDate(plan.archivedAt)}</dd>
              </div>
            ) : null}
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
      description="Set monthly prices, class allowances, cancellation notice and freezes."
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Create plan</p>
          <h3>New monthly plan</h3>
          <p className="management-copy">
            Keep pricing in cents. Punch cards, drop-ins, discounts, and taxes
            are handled in their own billing areas.
          </p>
          <MembershipPlanForm mode="create" options={options} />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Policy notes</p>
          <h3>Terms stay with the member</h3>
          <p className="management-copy">
            New members accept the plan version shown at signup or assignment.
            Existing memberships keep their accepted price, class limits and
            cancellation policy. Review a member’s contract before making an
            exception.
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
