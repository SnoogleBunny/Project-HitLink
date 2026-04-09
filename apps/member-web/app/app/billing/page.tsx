import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { BillingActions } from "./billing-actions";
import { getMemberBillingSummary } from "../../../lib/member-billing";

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

export default async function BillingPage() {
  const context = await requireMemberPortalContext();
  const billing = await getMemberBillingSummary({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
  });
  const billingState = billing.currentMembership?.billingState;

  return (
    <MemberShell
      context={context}
      title="Billing"
      description="Review billing status, open the Stripe payment-method flow when available, and retry actionable payment failures."
    >
      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Current billing state</p>
          <h3>{billingState?.status ?? "Not ready"}</h3>
          <dl className="member-detail-list">
            <div>
              <dt>Next billing date</dt>
              <dd>{formatDate(billingState?.nextBillingDate ?? null)}</dd>
            </div>
            <div>
              <dt>Last payment status</dt>
              <dd>{billingState?.lastPaymentStatus ?? "Not set"}</dd>
            </div>
            <div>
              <dt>Failure</dt>
              <dd>{billingState?.failureMessage ?? billingState?.failureCode ?? "None"}</dd>
            </div>
            <div>
              <dt>Grace period ends</dt>
              <dd>{formatDate(billingState?.gracePeriodEndsAt ?? null)}</dd>
            </div>
          </dl>

          {billing.readOnlyReason ? (
            <div className="member-callout">
              <strong>Billing is read-only</strong>
              <p>{billing.readOnlyReason}</p>
            </div>
          ) : null}
        </section>

        <section className="member-card">
          <p className="member-eyebrow">Self-service</p>
          <h3>Payment actions</h3>
          <p className="member-copy">
            Use Stripe’s hosted flow to replace the payment method on file, or
            retry the latest actionable invoice when the current billing state
            allows it.
          </p>
          <BillingActions
            canRetryPayment={billing.canRetryPayment}
            canUpdatePaymentMethod={billing.canUpdatePaymentMethod}
          />
        </section>
      </div>

      <section className="member-card">
        <p className="member-eyebrow">Recent billing records</p>
        <h3>{billing.recentRecords.length} recent update{billing.recentRecords.length === 1 ? "" : "s"}</h3>
        {billing.recentRecords.length === 0 ? (
          <p className="member-copy">No billing records are available yet.</p>
        ) : (
          <div className="member-stack-list">
            {billing.recentRecords.map((record) => (
              <article key={record.id} className="member-stack-item">
                <div className="member-stack-copy">
                  <div className="member-stack-heading">
                    <h4>{record.type}</h4>
                    <span className="member-status-pill">{record.status}</span>
                  </div>
                  <p>{formatDateTime(record.occurredAt)}</p>
                  <dl className="member-inline-meta">
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
    </MemberShell>
  );
}
