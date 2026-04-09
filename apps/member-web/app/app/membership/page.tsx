import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { getMemberMembershipSummary } from "../../../lib/member-portal";

function formatDate(value: Date | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(value);
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export default async function MembershipPage() {
  const context = await requireMemberPortalContext();
  const membership = await getMemberMembershipSummary({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
  });
  const currentMembership = membership.currentMembership;

  return (
    <MemberShell
      context={context}
      title="Membership"
      description="Review your current recurring membership, billing cadence, and any plan-based class restrictions."
    >
      <section className="member-card">
        <p className="member-eyebrow">Current membership</p>
        {currentMembership ? (
          <>
            <h3>{currentMembership.membershipPlan.name}</h3>
            <dl className="member-detail-list">
              <div>
                <dt>Status</dt>
                <dd>{currentMembership.status}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>
                  {formatMoney(
                    currentMembership.membershipPlan.monthlyPriceCents,
                    currentMembership.membershipPlan.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Next billing date</dt>
                <dd>{formatDate(currentMembership.nextBillingDate)}</dd>
              </div>
              <div>
                <dt>Cancel at period end</dt>
                <dd>{currentMembership.cancelAtPeriodEnd ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Freeze window</dt>
                <dd>
                  {currentMembership.frozenFrom
                    ? `${formatDate(currentMembership.frozenFrom)} to ${formatDate(
                        currentMembership.frozenUntil,
                      )}`
                    : "No freeze scheduled"}
                </dd>
              </div>
              <div>
                <dt>Allowed programs</dt>
                <dd>
                  {membership.allowedProgramNames.length > 0
                    ? membership.allowedProgramNames.join(", ")
                    : "All active programs"}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <>
            <h3>No current membership</h3>
            <p className="member-copy">
              Your portal is active, but a current recurring membership has not
              been assigned yet.
            </p>
          </>
        )}
      </section>
    </MemberShell>
  );
}
