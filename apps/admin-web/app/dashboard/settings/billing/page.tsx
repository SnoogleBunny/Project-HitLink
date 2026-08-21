import Link from "next/link";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import {
  formatStripeConnectionStatus,
  getWorkspaceStripeSettings,
} from "../../../../lib/stripe-settings";
import { connectStripeAction, refreshStripeConnectionAction } from "./actions";
import {
  BillingSettingsRecoveryAlert,
  GracePeriodForm,
} from "./grace-period-form";

type StripeProviderAvailability =
  | {
      status: "ready";
    }
  | {
      status: "unavailable";
      message: string;
    };

type BillingSettingsWithProviderAvailability = Awaited<
  ReturnType<typeof getWorkspaceStripeSettings>
> & {
  providerAvailability?: StripeProviderAvailability;
};

const missingProviderAvailability: StripeProviderAvailability = {
  status: "unavailable",
  message:
    "Stripe connection availability could not be verified. Connect and refresh are unavailable.",
};

interface BillingSettingsPageProps {
  searchParams?: Promise<{
    stripe?: string;
  }>;
}

export default async function BillingSettingsPage({
  searchParams,
}: BillingSettingsPageProps = {}) {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const settings = (await getWorkspaceStripeSettings({
    workspaceId: workspace.id,
  })) as BillingSettingsWithProviderAvailability;
  const params = await searchParams;
  const providerAvailability =
    settings.providerAvailability ?? missingProviderAvailability;
  const providerUnavailable = providerAvailability.status === "unavailable";
  const providerUnavailableReasonId = "stripe-provider-unavailable-reason";
  const providerActionFailed = params?.stripe === "unavailable";

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
          {providerActionFailed ? (
            <BillingSettingsRecoveryAlert
              message={
                providerUnavailable
                  ? providerAvailability.message
                  : "Stripe did not start. Review the current connection status before trying again."
              }
            />
          ) : null}
          <div className="stack-item-heading">
            <h3>{formatStripeConnectionStatus(settings.connectionStatus)}</h3>
            <span
              className={`status-pill ${
                !providerUnavailable && settings.connectionStatus === "ACTIVE"
                  ? "status-pill-success"
                  : ""
              }`}
            >
              {providerUnavailable
                ? "Stripe unavailable"
                : settings.chargesEnabled
                  ? "Charges enabled"
                  : "Setup needed"}
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
          {providerUnavailable ? (
            <p className="management-copy" id={providerUnavailableReasonId}>
              {providerAvailability.message}
            </p>
          ) : null}
          <div className="dashboard-actions">
            <form action={connectStripeAction}>
              <button
                aria-describedby={
                  providerUnavailable ? providerUnavailableReasonId : undefined
                }
                className="button"
                disabled={providerUnavailable}
                type="submit"
              >
                {settings.stripeAccountId ? "Continue setup" : "Connect Stripe"}
              </button>
            </form>
            <form action={refreshStripeConnectionAction}>
              <button
                aria-describedby={
                  providerUnavailable ? providerUnavailableReasonId : undefined
                }
                className="button button-secondary"
                disabled={providerUnavailable}
                type="submit"
              >
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
            failedPaymentGracePeriodDays={settings.failedPaymentGracePeriodDays}
          />
        </section>
      </div>
    </AdminShell>
  );
}
