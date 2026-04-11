import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveRequiredFormStatusesForMember } from "@hitlink/db";
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
  cancelMembershipAction,
  clearMembershipFreezeAction,
} from "./actions";
import {
  MembershipAssignmentForm,
  MembershipFreezeForm,
  OwnerPunchCardGrantForm,
} from "./billing-forms";

function formatDate(value: Date | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatMoney(amountCents: number | null, currency: string | null): string {
  if (amountCents === null || !currency) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export default async function MemberBillingPage({
  params,
}: {
  params: Promise<{
    memberId: string;
  }>;
}) {
  const { memberId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
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
                      membership.membershipPlan.monthlyPriceCents,
                      membership.membershipPlan.currency,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Next billing date</dt>
                  <dd>{formatDate(membership.nextBillingDate)}</dd>
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
                Assign one recurring monthly membership plan to this member.
              </p>
            </>
          )}
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">
            {membership ? "Lifecycle actions" : "Assign membership"}
          </p>
          {membership ? (
            <div className="form-stack">
              <h3>Freeze</h3>
              <MembershipFreezeForm
                memberId={profile.member.id}
                memberMembershipId={membership.id}
              />

              <form action={clearMembershipFreezeAction}>
                <input name="memberId" type="hidden" value={profile.member.id} />
                <input
                  name="memberMembershipId"
                  type="hidden"
                  value={membership.id}
                />
                <button className="button button-secondary" type="submit">
                  Clear freeze
                </button>
              </form>

              <form action={cancelMembershipAction}>
                <input name="memberId" type="hidden" value={profile.member.id} />
                <input
                  name="memberMembershipId"
                  type="hidden"
                  value={membership.id}
                />
                <button
                  className="button button-secondary"
                  disabled={membership.cancelAtPeriodEnd}
                  type="submit"
                >
                  Cancel at period end
                </button>
              </form>
            </div>
          ) : (
            <>
              <h3>Owner assignment</h3>
              {unresolvedActivationForms.length > 0 ? (
                <div className="info-callout">
                  <strong>Activation blocked</strong>
                  <p>
                    The current membership cannot be assigned until all required
                    activation forms are signed for the current version.
                  </p>
                </div>
              ) : null}
              <MembershipAssignmentForm
                disabled={unresolvedActivationForms.length > 0}
                memberId={profile.member.id}
                plans={profile.availablePlans}
              />
            </>
          )}
        </section>
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
                        <dd>{formatDate(card.purchasedAt)}</dd>
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
                  <p>{formatDateTime(record.occurredAt)}</p>
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
