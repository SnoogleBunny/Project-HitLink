import Link from "next/link";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import {
  formatStripeConnectionStatus,
  getWorkspaceStripeSettings,
} from "../../../../lib/stripe-settings";
import {
  connectStripeAction,
  refreshStripeConnectionAction,
} from "./actions";
import { GracePeriodForm } from "./grace-period-form";

export default async function BillingSettingsPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const settings = await getWorkspaceStripeSettings({
    workspaceId: workspace.id,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Settings"
      title="Billing settings"
      description="Stripe connection state and basic failed payment recovery settings."
      actions={
        <Link className="button button-secondary" href="/dashboard/billing">
          Failed payment queue
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Stripe Connect</p>
          <div className="stack-item-heading">
            <h3>{formatStripeConnectionStatus(settings.connectionStatus)}</h3>
            <span
              className={`status-pill ${
                settings.connectionStatus === "ACTIVE"
                  ? "status-pill-success"
                  : ""
              }`}
            >
              {settings.chargesEnabled ? "Charges enabled" : "Setup needed"}
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Connected account</dt>
              <dd>{settings.stripeAccountId ?? "Not connected"}</dd>
            </div>
            <div>
              <dt>Details submitted</dt>
              <dd>{settings.detailsSubmitted ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Payouts enabled</dt>
              <dd>{settings.payoutsEnabled ? "Yes" : "No"}</dd>
            </div>
          </dl>
          <div className="dashboard-actions">
            <form action={connectStripeAction}>
              <button className="button" type="submit">
                {settings.stripeAccountId ? "Continue setup" : "Connect Stripe"}
              </button>
            </form>
            <form action={refreshStripeConnectionAction}>
              <button className="button button-secondary" type="submit">
                Refresh status
              </button>
            </form>
          </div>
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Failed payments</p>
          <h3>Grace period</h3>
          <p className="management-copy">
            This controls queue due dates only. Email/SMS dunning automation
            stays deferred.
          </p>
          <GracePeriodForm
            failedPaymentGracePeriodDays={
              settings.failedPaymentGracePeriodDays
            }
          />
        </section>
      </div>
    </AdminShell>
  );
}

