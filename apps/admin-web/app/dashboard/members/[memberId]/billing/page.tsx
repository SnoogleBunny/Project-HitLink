import { formatMemberBillingDate as formatDate } from "../../../../../lib/member-billing-dates";
import { randomUUID } from "node:crypto";
import { getSourceBillingRenewalReview } from "../../../../../lib/source-billing-renewals";
import { SourceRenewalForm } from "./source-renewal-form";
import { MembershipLifecyclePanel } from "@flowstate/ui";
import { ownerLifecycleAction } from "./lifecycle-actions";
import { VerifiedMembershipEnrollment } from "./verified-enrollment";
import { UnitAdjustmentForm } from "./unit-adjustment-form";
import { formatMoney as formatKnownMoney } from "@flowstate/ui/money";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveRequiredFormStatusesForMember, getMembershipAllowanceSummary, getWorkspaceDateString, getMembershipLifecycle, readAcceptedMembershipTerms, toDateOnlyString, prisma } from "@flowstate/db";
import { AdminShell } from "../../../../_components/admin-shell";
import {
  formatMembershipStatus,
  getMemberBillingProfile,
} from "../../../../../lib/member-memberships";
import {
  buildActionableFormRequestHref,
  formatRequiredFormState,
} from "../../../../../lib/forms-status";
import {
  listMemberPunchCardBalances,
  listPunchCardProducts,
} from "../../../../../lib/access-products";
import { formatRequirementTarget } from "../../../../../lib/forms";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import {
  OwnerPunchCardGrantForm,
} from "./billing-forms";

function formatDateTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);
}

function formatMoney(amountCents: number | null, currency: string | null): string {
  if (amountCents === null || !currency) {
    return "Not set";
  }

  return formatKnownMoney(amountCents, currency);
}

export default async function MemberBillingPage({
  params,
}: {
  params: Promise<{
    memberId: string;
  }>;
}) {
  const { memberId } = await params;
  const { session, workspace, workspaceUserId } = await requireOwnerWorkspaceContext();
  const [profile, punchCardBalances, punchCardProducts, activationForms] = await Promise.all([
    getMemberBillingProfile({
      workspaceId: workspace.id,
      memberId,
    }),
    listMemberPunchCardBalances({
      workspaceId: workspace.id,
      memberId,
    }),
    listPunchCardProducts({
      workspaceId: workspace.id,
    }),
    resolveRequiredFormStatusesForMember({
      workspaceId: workspace.id,
      memberId,
      targets: ["MEMBERSHIP_ACTIVATION"],
    }),
  ]);

  if (!profile) {
    notFound();
  }

  const membership = profile.currentMembership;
  const sourceRenewal=membership ? await getSourceBillingRenewalReview({workspaceId:workspace.id,workspaceUserId,userId:session.userId},membership.id) : null;
  const lifecycle = membership ? await getMembershipLifecycle({ workspaceId: workspace.id, userId: session.userId }, membership.id) : null;
  const contract = membership ? await prisma.memberMembership.findUnique({ where: { id: membership.id }, select: { acceptedTerms: true, allowanceAnchorDate: true, startedAt: true, allowanceTimezone: true } }) : null;
  const terms = readAcceptedMembershipTerms(contract?.acceptedTerms);
  const billingTimezone = contract?.allowanceTimezone ?? workspace.location.timezone;
  const allowanceDate = getWorkspaceDateString(new Date(), workspace.location.timezone);
  const [allowance, adjustments] = await Promise.all([getMembershipAllowanceSummary({ workspaceId: workspace.id, memberId, scheduledForDate: allowanceDate, timezone: workspace.location.timezone }), prisma.membershipAllowanceAdjustment.findMany({ where: { workspaceId: workspace.id, memberId }, orderBy: { createdAt: "desc" }, take: 20 })]);
  const grantableProducts = punchCardProducts.activeProducts;
  const unresolvedActivationForms = activationForms.items.filter(
    (item) => item.status !== "SIGNED",
  );

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Member billing"
      title={`${profile.member.fullName} billing`}
      description="Owner-managed recurring membership, punch-card balances, Stripe linkage, freeze, cancellation, and recent billing state."
      actions={
        <Link
          className="button button-secondary"
          href={`/dashboard/members/${profile.member.id}`}
        >

          Back to profile
        </Link>
      }
    >
      {sourceRenewal ? <SourceRenewalForm review={sourceRenewal} operationKey={randomUUID()}/> : null}
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Activation forms</p>
          <h3>
            {activationForms.items.length} activation requirement
            {activationForms.items.length === 1 ? "" : "s"}
          </h3>
          {activationForms.items.length === 0 ? (
            <p className="empty-state">
              No membership-activation forms are configured right now.
            </p>
          ) : (
            <div className="stack-list">
              {activationForms.items.map((item) => (
                <article key={item.assignmentId} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{item.formName}</h4>
                      <span
                        className={`status-pill ${
                          item.status === "SIGNED" ? "status-pill-success" : ""
                        }`}
                      >
                        {formatRequiredFormState(item.status)}
                      </span>
                    </div>
                    <p>
                      {formatRequirementTarget(item.requirementTarget)} · Current
                      version {item.currentVersionNumber}
                    </p>
                    {item.openRequests.length > 0 ? (
                      <div className="dashboard-actions">
                        {item.openRequests.map((request) => (
                          <a
                            key={request.requestId}
                            className="button button-secondary"
                            href={buildActionableFormRequestHref(request)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Open signing path
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Current membership</p>
          {membership ? (
            <>
              <div className="stack-item-heading">
                <h3>{membership.membershipPlan.name}</h3>
                <span
                  className={`status-pill ${
                    membership.status === "ACTIVE" ? "status-pill-success" : ""
                  }`}
                >
                  {formatMembershipStatus(membership.status)}
                </span>
                {membership.billingState ? (
                  <span className="status-pill">
                    Billing {formatMembershipStatus(membership.billingState.status)}
                  </span>
                ) : null}
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Monthly price</dt>
                  <dd>
                    {formatMoney(
                      terms?.monthlyPriceCents ?? membership.membershipPlan.monthlyPriceCents,
                      terms?.currency ?? membership.membershipPlan.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Next billing date</dt>
                  <dd>{formatDate(membership.nextBillingDate, billingTimezone)}</dd>
                </div>
                <div>
                  <dt>Cancel at period end</dt>
                  <dd>{membership.cancelAtPeriodEnd ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Freeze window</dt>
                  <dd>
                    {membership.frozenFrom
                      ? `${formatDate(membership.frozenFrom)} to ${formatDate(
                          membership.frozenUntil,
                        )}`
                      : "No freeze scheduled"}
                  </dd>
                </div>
                <div>
                  <dt>Stripe customer</dt>
                  <dd>{membership.stripeCustomerId ?? "Not created yet"}</dd>
                </div>
                <div>
                  <dt>Stripe subscription</dt>
                  <dd>{membership.stripeSubscriptionId ?? "Not created yet"}</dd>
                </div>
              </dl>

              {membership.billingState?.failureMessage ? (
                <div className="info-callout">
                  <strong>Billing attention</strong>
                  <p>{membership.billingState.failureMessage}</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h3>No current membership</h3>
              <p className="empty-state">
                The member or their verified guardian can start a recurring membership through enrollment.
              </p>
            </>
          )}
        </section>

        {!membership ? <VerifiedMembershipEnrollment workspaceId={workspace.id} memberName={profile.member.fullName} formsPending={unresolvedActivationForms.length > 0} /> : null}
      </div>

      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Punch-card balances</p>
          <h3>
            {punchCardBalances.length} card
            {punchCardBalances.length === 1 ? "" : "s"}
          </h3>
          {punchCardBalances.length === 0 ? (
            <p className="empty-state">No punch cards have been granted or purchased yet.</p>
          ) : (
            <div className="stack-list">
              {punchCardBalances.map((card) => (
                <article key={card.id} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{card.name}</h4>
                      <span
                        className={`status-pill ${
                          card.status === "ACTIVE" ? "status-pill-success" : ""
                        }`}
                      >
                        {formatMembershipStatus(card.status)}
                      </span>
                    </div>
                    <dl className="inline-meta">
                      <div>
                        <dt>Remaining</dt>
                        <dd>
                          {card.remainingPunches} / {card.originalPunches}
                        </dd>
                      </div>
                      <div>
                        <dt>Purchased</dt>
                        <dd>{formatDate(card.purchasedAt, workspace.location.timezone)}</dd>
                      </div>
                      <div>
                        <dt>Recorded price</dt>
                        <dd>
                          {formatMoney(card.purchasePriceCents, card.purchaseCurrency)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Grant punch card</p>
          <h3>Owner-managed access</h3>
          <p className="management-copy">
            Grant a non-expiring punch card directly to this member. Disabled
            products stay grantable here as long as they are not archived.
          </p>
          <OwnerPunchCardGrantForm
            memberId={profile.member.id}
            products={grantableProducts}
          />
        </section>
      </div>

      {membership && lifecycle && contract ? <section className="management-card"><MembershipLifecyclePanel sourceBillingManaged={lifecycle.sourceBillingManaged} memberId={memberId} membershipId={membership.id} memberName={profile.member.fullName} owner={lifecycle.owner} currency={terms?.currency ?? membership.membershipPlan.currency} billingAnchor={toDateOnlyString(contract.allowanceAnchorDate ?? contract.startedAt)} policyKnown={!!lifecycle.policy} allowCancellation={true} allowFreeze={!!lifecycle.policy?.freezeEnabled} action={ownerLifecycleAction} requests={lifecycle.requests.map((request) => ({ id: request.id, kind: request.kind, state: request.state, receivedAt: request.receivedAt.toISOString(), effectiveOn: request.effectiveOn ? toDateOnlyString(request.effectiveOn) : null, resumeOn: request.resumeOn ? toDateOnlyString(request.resumeOn) : null, providerOperationId: request.providerOperationId, active: request.activeSlot === "ACTIVE" }))} /></section> : null}

      <section className="management-card form-stack"><h3>Class allowance</h3>
        {allowance?.unlimited ? <p>Unlimited classes under the accepted membership terms.</p> : allowance ? <div className="stack-list">{allowance.windows.map((window) => <div className="stack-item" key={window.kind}><div><strong>{window.kind === "WEEK" ? "Billing week" : "Billing month"}: {window.remaining} of {window.limit} available</strong><p>{window.used} used · {window.reserved} reserved · resets {window.endsOn}</p></div></div>)}</div> : <p className="management-copy">No current membership allowance. Pack balances appear above.</p>}
        <UnitAdjustmentForm memberId={memberId} membershipId={membership?.id} kinds={allowance?.windows.map((window) => window.kind) ?? []} cards={punchCardBalances.filter((card) => card.status !== "ARCHIVED")} date={allowanceDate} />
        {adjustments.length ? <details><summary>Recent allowance adjustments</summary><div className="stack-list">{adjustments.map((item) => <p key={item.id}>{item.delta > 0 ? "+" : ""}{item.delta} · {item.kind === "WEEK" ? "Billing week" : "Billing month"} from {formatDate(item.periodStart)} · {item.reason}</p>)}</div></details> : null}
      </section>

      <section className="management-card">
        <p className="dashboard-card-label">Billing history</p>
        <h3>
          {profile.billingRecords.length} recent record
          {profile.billingRecords.length === 1 ? "" : "s"}
        </h3>

        {profile.billingRecords.length === 0 ? (
          <p className="empty-state">No billing records yet.</p>
        ) : (
          <div className="stack-list">
            {profile.billingRecords.map((record) => (
              <article key={record.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{formatMembershipStatus(record.type)}</h4>
                    <span className="status-pill">
                      {formatMembershipStatus(record.status)}
                    </span>
                  </div>
                  <p>{formatDateTime(record.occurredAt, workspace.location.timezone)}</p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Amount</dt>
                      <dd>{formatMoney(record.amountCents, record.currency)}</dd>
                    </div>
                    <div>
                      <dt>Invoice</dt>
                      <dd>{record.stripeInvoiceId ?? "Not set"}</dd>
                    </div>
                    <div>
                      <dt>Failure</dt>
                      <dd>{record.failureMessage ?? record.failureCode ?? "None"}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
