import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { getMemberPunchCardPageData } from "../../../lib/member-commerce";
import { getMemberMembershipSummary } from "../../../lib/member-portal";
import { PunchCardPurchaseForm } from "./punch-card-purchase-form";

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
  const [membership, punchCards] = await Promise.all([
    getMemberMembershipSummary({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
    }),
    getMemberPunchCardPageData({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
    }),
  ]);
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

      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Punch cards</p>
          <h3>
            {punchCards.cards.length} owned card
            {punchCards.cards.length === 1 ? "" : "s"}
          </h3>
          {punchCards.cards.length === 0 ? (
            <p className="member-copy">No punch cards on this account yet.</p>
          ) : (
            <div className="member-stack-list">
              {punchCards.cards.map((card) => (
                <article key={card.id} className="member-stack-item">
                  <div className="member-stack-copy">
                    <div className="member-stack-heading">
                      <h4>{card.name}</h4>
                      <span className="member-status-pill">
                        {card.remainingPunches} / {card.originalPunches}
                      </span>
                    </div>
                    <p>{card.description ?? "No description yet."}</p>
                    <dl className="member-inline-meta">
                      <div>
                        <dt>Status</dt>
                        <dd>{card.status}</dd>
                      </div>
                      <div>
                        <dt>Programs</dt>
                        <dd>{card.restrictionSummary}</dd>
                      </div>
                      <div>
                        <dt>Purchased</dt>
                        <dd>{formatDate(card.purchasedAt)}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="member-card">
          <p className="member-eyebrow">Buy punch cards</p>
          <h3>
            {punchCards.availableProducts.length} available product
            {punchCards.availableProducts.length === 1 ? "" : "s"}
          </h3>
          {punchCards.availableProducts.length === 0 ? (
            <p className="member-copy">
              No punch-card products are available for online purchase right now.
            </p>
          ) : (
            <PunchCardPurchaseForm products={punchCards.availableProducts} />
          )}
        </section>
      </div>
    </MemberShell>
  );
}
