import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import {
  formatBillingStateStatus,
  listFailedPaymentQueue,
} from "../../../lib/failed-payments";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
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

function createInstantFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
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

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export default async function BillingPage() {
  const { location, session, workspace } = await requireOwnerWorkspaceContext();
  const queue = await listFailedPaymentQueue({
    workspaceId: workspace.id,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Billing"
      title="Failed payment queue"
      description="Operational billing items that need owner attention. This is not an accounting ledger."
      actions={
        <Link
          className="button button-secondary"
          href="/dashboard/settings/billing"
        >
          Billing settings
        </Link>
      }
    >
      <section className="management-card">
        <p className="dashboard-card-label">Queue</p>
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
                      item.memberMembership.membershipPlan.monthlyPriceCents,
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
                        {item.latestInvoiceId ? "Yes" : "No invoice available"}
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
    </AdminShell>
  );
}
