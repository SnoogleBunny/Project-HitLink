import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { getMemberBillingSummary } from "../../../lib/member-billing";
import { getMemberPunchCardPageData } from "../../../lib/member-commerce";
import { getMemberMembershipSummary } from "../../../lib/member-portal";
import {
  formatCalendarDate,
  formatGymDateTime,
  formatMembershipStatus,
  formatMoney,
  formatPunchCardStatus,
} from "../../../lib/billing-display";
import { PunchCardPurchaseForm } from "./punch-card-purchase-form";

export default async function MembershipPage() {
  const context = await requireMemberPortalContext();
  const [membership, punchCards, billing] = await Promise.all([
    getMemberMembershipSummary({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
    }),
    getMemberPunchCardPageData({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
    }),
    getMemberBillingSummary({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
    }),
  ]);
  const currentMembership = membership.currentMembership;
  const purchaseUnavailableReason =
    billing.readOnlyReason ===
    "Online billing is not connected for this gym yet."
      ? billing.readOnlyReason
      : null;

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
                <dt>Membership status</dt>
                <dd>{formatMembershipStatus(currentMembership.status)}</dd>
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
                <dt>Next billing (gym time)</dt>
                <dd>
                  {formatGymDateTime(
                    currentMembership.nextBillingDate,
                    context.location.timezone,
                  )}
                </dd>
              </div>
              <div>
                <dt>End after current billing period</dt>
                <dd>
                  {currentMembership.cancelAtPeriodEnd
                    ? "Scheduled"
                    : "Not scheduled"}
                </dd>
              </div>
              <div>
                <dt>Scheduled freeze</dt>
                <dd>
                  {currentMembership.frozenFrom
                    ? `${formatCalendarDate(currentMembership.frozenFrom)} to ${
                        currentMembership.frozenUntil
                          ? formatCalendarDate(currentMembership.frozenUntil)
                          : "No end date"
                      }`
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
                      <span
                        aria-label={`Punch-card status: ${formatPunchCardStatus(card.status)}`}
                        className="member-status-pill"
                      >
                        {formatPunchCardStatus(card.status)}
                      </span>
                    </div>
                    <dl className="member-inline-meta">
                      <div>
                        <dt>Punches remaining</dt>
                        <dd
                          aria-label={`Punches remaining: ${card.remainingPunches} of ${card.originalPunches}`}
                        >
                          {card.remainingPunches} / {card.originalPunches}
                        </dd>
                      </div>
                      <div>
                        <dt>Programs</dt>
                        <dd>{card.restrictionSummary}</dd>
                      </div>
                      <div>
                        <dt>Purchased (gym time)</dt>
                        <dd>
                          {formatGymDateTime(
                            card.purchasedAt,
                            context.location.timezone,
                          )}
                        </dd>
                      </div>
                    </dl>
                    <p>{card.description ?? "No description yet."}</p>
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
              No punch-card products are available for online purchase right
              now.
            </p>
          ) : (
            <PunchCardPurchaseForm
              products={punchCards.availableProducts}
              purchaseUnavailableReason={purchaseUnavailableReason}
            />
          )}
        </section>
      </div>
    </MemberShell>
  );
}
