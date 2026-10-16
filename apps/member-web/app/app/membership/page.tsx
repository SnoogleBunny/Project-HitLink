import { randomUUID } from "node:crypto";
import { getMemberProgramProgress, getMembershipLifecycle, getMembershipAllowanceSummary, getWorkspaceDateString, readAcceptedMembershipTerms, toDateOnlyString } from "@flowstate/db";
import { MembershipLifecyclePanel } from "@flowstate/ui";
import { memberLifecycleAction } from "./lifecycle-actions";
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
  const [membership, punchCards, billing, progress] = await Promise.all([
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
    getMemberProgramProgress({ workspaceId: context.workspace.id, userId: context.session.userId }, context.member.id),
  ]);
  const currentMembership = membership.currentMembership;
  const acceptedTerms = readAcceptedMembershipTerms(currentMembership?.acceptedTerms);
  const canManage = context.permissions?.canPay !== false && context.permissions?.canBook !== false;
  const [lifecycle, allowance] = currentMembership ? await Promise.all([
    canManage ? getMembershipLifecycle({ workspaceId: context.workspace.id, userId: context.session.userId }, currentMembership.id) : Promise.resolve(null),
    getMembershipAllowanceSummary({ workspaceId: context.workspace.id, memberId: context.member.id, scheduledForDate: getWorkspaceDateString(new Date(), context.location.timezone), timezone: context.location.timezone }),
  ]) : [null, null];
  const purchaseUnavailableReason =
    context.permissions?.canPay === false ? "Your family access does not include purchases. Ask the account holder to arrange payment." : billing.readOnlyReason ===
    "Online billing is not connected for this gym yet."
      ? billing.readOnlyReason
      : null;

  return (
    <MemberShell
      context={context}
      title="Membership"
      description="Review your current recurring membership, billing cadence, and any plan-based class restrictions."
    >
      {progress.map(program => <section className="member-card" key={program.id}><h2>{program.name} progress</h2><p>Current rank: {program.history[0] ? `${program.history[0].rankName}${program.history[0].stripeCount ? ` · ${program.history[0].stripeCount} stripes` : ""}` : "Unranked"}</p>{program.history.length ? <details><summary>Promotion history</summary>{program.history.map(entry => <div className="stack-item" key={entry.id}><div><strong>{entry.rankName} · {entry.stripeCount} stripes</strong><p>{entry.effectiveOn} · Awarded by {entry.awardedBy}</p>{entry.publicNote ? <p>{entry.publicNote}</p> : null}</div></div>)}</details> : <p>Your gym will record promotions here.</p>}</section>)}
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
                    acceptedTerms?.monthlyPriceCents ?? currentMembership.membershipPlan.monthlyPriceCents,
                    acceptedTerms?.currency ?? currentMembership.membershipPlan.currency,
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
                <dt>Scheduled access end</dt>
                <dd>
                  {currentMembership.endedAt ? formatGymDateTime(currentMembership.endedAt, context.location.timezone) : currentMembership.cancelAtPeriodEnd ? "Scheduled; see request below" : "Not scheduled"}
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
            {allowance?.unlimited ? <p>Unlimited classes</p> : allowance ? <div className="member-stack-list">{allowance.windows.map((window) => <p key={window.kind}><strong>{window.kind === "WEEK" ? "Billing week" : "Billing month"}: {window.remaining} classes left</strong> · {window.used} used · {window.reserved} reserved · resets {window.endsOn}</p>)}</div> : null}
            {lifecycle?.policy ? <details><summary>Accepted cancellation and freeze policy</summary><p>Notice: {lifecycle.policy.noticeLength} {lifecycle.policy.noticeUnit.toLowerCase().replaceAll("_", " ")}. Access ends {lifecycle.policy.alignment === "NEXT_BILLING_BOUNDARY" ? "at the next billing boundary after notice" : "on the exact notice end date"}.</p><p>{lifecycle.policy.noticeBilling === "CONTINUE" ? "Scheduled renewals continue during notice." : "The owner records the notice-period billing decision for your request."} {lifecycle.policy.freezeEnabled ? `A freeze can last up to ${lifecycle.policy.freezeMaxCycles} billing cycles and needs a fixed resume date.` : "This plan does not include freezes."}</p></details> : null}
            {acceptedTerms ? <details><summary>Accepted class policy</summary><p>Late cancellation: {acceptedTerms.lateCancellationConsumesClass ? "uses one class" : "class restored"}. No-show: {acceptedTerms.noShowConsumesClass ? "uses one class" : "class restored"}. Limits follow your billing cycle; a short final week has the full weekly allowance.</p></details> : null}
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

      {currentMembership && lifecycle ? <section className="member-card"><MembershipLifecyclePanel sourceBillingManaged={lifecycle.sourceBillingManaged} memberId={context.member.id} membershipId={currentMembership.id} memberName={context.member.fullName} owner={false} currency={acceptedTerms?.currency ?? currentMembership.membershipPlan.currency} billingAnchor={toDateOnlyString(currentMembership.allowanceAnchorDate ?? currentMembership.startedAt)} policyKnown={!!lifecycle.policy} allowCancellation={lifecycle.policy?.allowMemberCancellation ?? true} allowFreeze={!!lifecycle.policy?.freezeEnabled && lifecycle.policy.allowMemberFreeze} action={memberLifecycleAction} requests={lifecycle.requests.map((request) => ({ id: request.id, kind: request.kind, state: request.state, receivedAt: request.receivedAt.toISOString(), effectiveOn: request.effectiveOn ? toDateOnlyString(request.effectiveOn) : null, resumeOn: request.resumeOn ? toDateOnlyString(request.resumeOn) : null, providerOperationId: request.providerOperationId, active: request.activeSlot === "ACTIVE" }))} /></section> : null}
      <div className="member-grid">
        {punchCards.cards.length ? <section className="member-card">
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
        </section> : null}

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
              requestId={randomUUID()}
              memberId={context.member.id}
              products={punchCards.availableProducts}
              purchaseUnavailableReason={purchaseUnavailableReason}
            />
          )}
        </section>
      </div>
    </MemberShell>
  );
}
