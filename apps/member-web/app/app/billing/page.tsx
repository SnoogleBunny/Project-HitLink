import { resolveDisplayLocale } from "@flowstate/ui";
import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { BillingActions } from "./billing-actions";
import { getMemberBillingSummary } from "../../../lib/member-billing";
import { getPayerBillingData } from "../../../lib/payer-billing";
import { AccountPayments } from "./account-payments";
import {
  formatBillingRecordStatus,
  formatBillingRecordType,
  formatBillingStateStatus,
  formatFailureDetail,
  formatGymDateTime as knownformatGymDateTime,
  formatMoney as knownformatMoney,
} from "../../../lib/billing-display";

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const locale = resolveDisplayLocale(context.workspace.settings?.locale);
  const formatGymDateTime = (
    value: Date | null,
    timezone: string,
    nullLabel?: string,
  ) => knownformatGymDateTime(value, timezone, nullLabel, locale);
  const formatMoney = (amount: number | null, currency: string | null) =>
    knownformatMoney(amount, currency, locale);
  const [billing, payer, params] = await Promise.all([
    getMemberBillingSummary({
      workspaceId: context.workspace.id,
      memberId: context.member.id,
    }),
    getPayerBillingData({
      workspaceId: context.workspace.id,
      userId: context.session.userId,
      payerMemberId: (context.accountMember ?? context.member).id,
    }),
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const billingState = billing.currentMembership?.billingState;
  const billingStatus = billingState?.status ?? "NOT_READY";

  return (
    <MemberShell
      context={context}
      title="Payments"
      description="Payments and credits for your account, including purchases for family members."
    >
      <AccountPayments
        locale={locale}
        data={payer}
        timezone={context.location.timezone}
        history={params.view === "history"}
      />
      <div className="member-grid">
        <section className="member-card">
          <p className="member-eyebrow">Current billing state</p>
          <h3>{formatBillingStateStatus(billingStatus)}</h3>
          <dl className="member-detail-list">
            <div>
              <dt>Next billing (gym time)</dt>
              <dd>
                {formatGymDateTime(
                  billingState?.nextBillingDate ?? null,
                  context.location.timezone,
                )}
              </dd>
            </div>
            <div>
              <dt>Last payment status</dt>
              <dd>
                {formatBillingRecordStatus(
                  billingState?.lastPaymentStatus ?? "",
                )}
              </dd>
            </div>
            <div>
              <dt>Payment issue</dt>
              <dd>
                {formatFailureDetail({
                  status: billingStatus,
                  failureMessage: billingState?.failureMessage ?? null,
                  failureCode: billingState?.failureCode ?? null,
                })}
              </dd>
            </div>
            <div>
              <dt>Grace period ends (gym time)</dt>
              <dd>
                {formatGymDateTime(
                  billingState?.gracePeriodEndsAt ?? null,
                  context.location.timezone,
                  "No grace-period end recorded",
                )}
              </dd>
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
            Open the secure payment page to update the payment method on file,
            or retry the latest payment when a retry is available.
          </p>
          <BillingActions
            canRetryPayment={billing.canRetryPayment}
            canUpdatePaymentMethod={billing.canUpdatePaymentMethod}
          />
        </section>
      </div>

      <details className="member-card hl-payment-legacy">
        <summary>Membership billing activity</summary>
        <p className="member-eyebrow">Recent billing records</p>
        <h3>
          {billing.recentRecords.length} recent update
          {billing.recentRecords.length === 1 ? "" : "s"}
        </h3>
        {billing.recentRecords.length === 0 ? (
          <p className="member-copy">No billing records are available yet.</p>
        ) : (
          <div className="member-stack-list">
            {billing.recentRecords.map((record) => (
              <article key={record.id} className="member-stack-item">
                <div className="member-stack-copy">
                  <div className="member-stack-heading">
                    <h4>{formatBillingRecordType(record.type)}</h4>
                  </div>
                  <dl className="member-inline-meta">
                    <div>
                      <dt>Billing record status</dt>
                      <dd>
                        <span className="member-status-pill">
                          {formatBillingRecordStatus(record.status)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Recorded (gym time)</dt>
                      <dd>
                        <time dateTime={record.occurredAt.toISOString()}>
                          {formatGymDateTime(
                            record.occurredAt,
                            context.location.timezone,
                          )}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>
                        {formatMoney(record.amountCents, record.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt>Invoice available</dt>
                      <dd>{record.stripeInvoiceId ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt>Payment issue</dt>
                      <dd>
                        {formatFailureDetail({
                          status: record.status,
                          failureMessage: record.failureMessage,
                          failureCode: record.failureCode,
                        })}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </details>
    </MemberShell>
  );
}
