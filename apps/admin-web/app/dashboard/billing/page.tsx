import { resolveDisplayLocale } from "@flowstate/ui";
import { formatMoney as formatKnownMoney } from "@flowstate/ui/money";
import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import {
  formatBillingStateStatus,
  listFailedPaymentQueue,
} from "../../../lib/failed-payments";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { getFinancialReviewQueue } from "../../../lib/financial-review";
import { FinancialReviewQueue } from "./financial-review-queue";
import {
  markPaymentUpdateRequestedAction,
  retryFailedPaymentNowAction,
} from "./actions";

const failureCodeLabels: Record<string, string> = {
  card_declined: "Payment was declined.",
  expired_card: "The card has expired.",
  incorrect_cvc: "The card security code was incorrect.",
  insufficient_funds: "The card has insufficient funds.",
  authentication_required: "Payment authentication is required.",
};

function formatPaymentIssue(
  failureMessage: string | null,
  failureCode: string | null,
): string {
  const message = failureMessage?.trim();

  if (message) {
    return message;
  }

  if (failureCode) {
    return failureCodeLabels[failureCode] ?? "Payment could not be completed.";
  }

  return "Payment issue details are unavailable.";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const { location, session, workspace } = await requireOwnerWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  function formatMoney(amountCents: number, currency: string): string {
    return formatKnownMoney(amountCents, currency, locale);
  }

  function createInstantFormatter(timeZone: string): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    });
  }

  function formatGymDateTime(
    value: Date | null,
    gymTimeZone: string,
    nullLabel: string,
  ): string {
    if (!value) {
      return nullLabel;
    }

    try {
      return createInstantFormatter(gymTimeZone).format(value);
    } catch (error) {
      if (!(error instanceof RangeError)) {
        throw error;
      }

      return `${createInstantFormatter("UTC").format(value)} (gym timezone unavailable)`;
    }
  }

  const params = await searchParams;
  const history = params?.view === "history";
  const [queue, reviews] = await Promise.all([
    listFailedPaymentQueue({
      workspaceId: workspace.id,
    }),
    getFinancialReviewQueue({ workspaceId: workspace.id, history }),
  ]);

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Billing"
      title="Billing"
      description="Review payment problems and follow up on unresolved requests."
      actions={
        <Link
          className="button button-secondary"
          href="/dashboard/settings/billing"
        >
          Billing settings
        </Link>
      }
    >
      {typeof params?.error === "string" ? (
        <p role="alert" className="form-error">
          {params.error}
        </p>
      ) : null}
      <nav className="hl-payment-tabs" aria-label="Billing views">
        <Link className="text-link" href="/dashboard/billing/summary">
          Financial summary
        </Link>
        <Link className="text-link" href="/dashboard/billing/adjustments">
          Payments and credits
        </Link>
        <Link
          className="text-link"
          href="/dashboard/settings/email#payment-confirmations"
        >
          Payment receipts
        </Link>
        <Link
          className="text-link"
          href="/dashboard/billing?filter=attention"
          aria-current={!history ? "page" : undefined}
        >
          Needs attention{!history ? ` (${queue.length + reviews.length})` : ""}
        </Link>
        <Link
          className="text-link"
          href="/dashboard/billing?view=history"
          aria-current={history ? "page" : undefined}
        >
          Review history
        </Link>
      </nav>
      <FinancialReviewQueue
        locale={locale}
        items={reviews}
        timezone={location.timezone}
        history={history}
      />
      {!history ? (
        <>
          <section className="management-card">
            <p className="dashboard-card-label">Membership payments</p>
            <h3>
              {queue.length} billing item{queue.length === 1 ? "" : "s"}
            </h3>
            <p className="management-copy">
              Retry the latest invoice when available, or record that the gym
              requested a payment-method update.
            </p>
          </section>

          <section className="management-card">
            {queue.length === 0 ? (
              <p className="empty-state">No failed payment items right now.</p>
            ) : (
              <div className="stack-list">
                {queue.map((item, index) => (
                  <article key={item.id} className="stack-item">
                    <div className="stack-item-copy">
                      <div className="stack-item-heading">
                        <h4>{item.member.fullName}</h4>
                        <span
                          aria-label={`Billing status: ${formatBillingStateStatus(item.status, "failed-payment-queue")}`}
                          className="status-pill"
                        >
                          {formatBillingStateStatus(
                            item.status,
                            "failed-payment-queue",
                          )}
                        </span>
                      </div>
                      <p>
                        {item.memberMembership.membershipPlan.name} /{" "}
                        {formatMoney(
                          item.memberMembership.membershipPlan
                            .monthlyPriceCents,
                          item.memberMembership.membershipPlan.currency,
                        )}
                      </p>
                      <dl className="inline-meta">
                        <div>
                          <dt>Payment issue</dt>
                          <dd>
                            {formatPaymentIssue(
                              item.failureMessage,
                              item.failureCode,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Failed (gym time)</dt>
                          <dd>
                            {formatGymDateTime(
                              item.failedAt,
                              location.timezone,
                              "Time not available",
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Grace period ends (gym time)</dt>
                          <dd>
                            {formatGymDateTime(
                              item.gracePeriodEndsAt,
                              location.timezone,
                              "No grace-period end recorded",
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Invoice available for retry</dt>
                          <dd>
                            {item.latestInvoiceId
                              ? "Yes"
                              : "No invoice available"}
                          </dd>
                        </div>
                        <div>
                          <dt>Update request recorded (gym time)</dt>
                          <dd>
                            {formatGymDateTime(
                              item.paymentUpdateRequestedAt,
                              location.timezone,
                              "No update request recorded",
                            )}
                          </dd>
                        </div>
                      </dl>
                      <div className="dashboard-actions">
                        <Link
                          aria-label={`Open billing for ${item.member.fullName}`}
                          className="button button-secondary"
                          href={`/dashboard/members/${item.member.id}/billing`}
                        >
                          Open member
                        </Link>
                        <form action={retryFailedPaymentNowAction}>
                          <input
                            name="membershipBillingStateId"
                            type="hidden"
                            value={item.id}
                          />
                          <button
                            aria-describedby={
                              item.latestInvoiceId
                                ? undefined
                                : `retry-reason-${index}`
                            }
                            aria-label={`Retry payment for ${item.member.fullName}`}
                            className="button button-secondary"
                            disabled={!item.latestInvoiceId}
                            type="submit"
                          >
                            Retry now
                          </button>
                          {!item.latestInvoiceId ? (
                            <p id={`retry-reason-${index}`}>
                              No invoice is available to retry.
                            </p>
                          ) : null}
                        </form>
                        <form action={markPaymentUpdateRequestedAction}>
                          <input
                            name="membershipBillingStateId"
                            type="hidden"
                            value={item.id}
                          />
                          <button
                            aria-label={`Mark payment update requested for ${item.member.fullName}`}
                            className="button button-secondary"
                            type="submit"
                          >
                            Mark update requested
                          </button>
                        </form>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </AdminShell>
  );
}
