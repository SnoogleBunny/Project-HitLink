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

export default async function BillingPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
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
        <Link className="button button-secondary" href="/dashboard/settings/billing">
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
          Retry a latest invoice when available, or mark that a payment update
          request was sent outside this app.
        </p>
      </section>

      <section className="management-card">
        {queue.length === 0 ? (
          <p className="empty-state">No failed payment items right now.</p>
        ) : (
          <div className="stack-list">
            {queue.map((item) => (
              <article key={item.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{item.member.fullName}</h4>
                    <span className="status-pill">
                      {formatBillingStateStatus(item.status)}
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
                      <dt>Failed</dt>
                      <dd>{formatDate(item.failedAt)}</dd>
                    </div>
                    <div>
                      <dt>Grace ends</dt>
                      <dd>{formatDate(item.gracePeriodEndsAt)}</dd>
                    </div>
                    <div>
                      <dt>Invoice</dt>
                      <dd>{item.latestInvoiceId ?? "Not set"}</dd>
                    </div>
                    <div>
                      <dt>Last request</dt>
                      <dd>{formatDate(item.paymentUpdateRequestedAt)}</dd>
                    </div>
                    <div>
                      <dt>Failure</dt>
                      <dd>{item.failureMessage ?? item.failureCode ?? "Not set"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="dashboard-actions">
                  <Link
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
                      className="button button-secondary"
                      disabled={!item.latestInvoiceId}
                      type="submit"
                    >
                      Retry now
                    </button>
                  </form>
                  <form action={markPaymentUpdateRequestedAction}>
                    <input
                      name="membershipBillingStateId"
                      type="hidden"
                      value={item.id}
                    />
                    <button className="button button-secondary" type="submit">
                      Mark update requested
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}

