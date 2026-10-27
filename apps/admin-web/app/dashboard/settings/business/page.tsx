import Link from "next/link";
import { AdminShell } from "../../../_components/admin-shell";
import { getBusinessSettings } from "../../../../lib/business-settings";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { BusinessSettingsForm } from "./form";
import { getWorkspaceTimezoneSettings } from "../../../../lib/workspace-timezone-settings";
import { addDays, getWorkspaceDateString, toDateOnlyString } from "@flowstate/db";
import { TimezoneForm } from "./timezone-form";

export default async function BusinessSettingsPage() {
  const context = await requireOwnerWorkspaceContext();
  const { workspace, financialCurrencies } = await getBusinessSettings({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  });
  const settings = workspace.settings,
    location = workspace.location;
  const currency =
    settings?.currency ??
    (financialCurrencies.length === 1 ? financialCurrencies[0]! : "");
  const timezone = await getWorkspaceTimezoneSettings({ workspaceId: context.workspace.id, userId: context.session.userId });
  return (
    <AdminShell
      session={context.session}
      workspaceName={workspace.name}
      title="Business details"
      description="Manage your business identity, contact details and regional settings."
      actions={
        <Link className="text-link" href="/dashboard/settings">
          All settings
        </Link>
      }
    >
      <div className="hl-focused-form">
        <BusinessSettingsForm
          version={settings?.identityVersion ?? 0}
          currencyLocked={financialCurrencies.length > 0 && !!currency}
          initial={{
            name: workspace.name,
            businessType: workspace.businessType ?? "",
            contactEmail: settings?.contactEmail ?? "",
            contactPhone: settings?.contactPhone ?? "",
            currency,
            locale: settings?.locale ?? "en-CA",
            addressLine1: location?.addressLine1 ?? "",
            addressLine2: location?.addressLine2 ?? "",
            city: location?.city ?? "",
            region: location?.region ?? "",
            postalCode: location?.postalCode ?? "",
            countryCode: location?.countryCode ?? "",
          }}
        />
        <TimezoneForm currentTimezone={timezone.currentTimezone} version={timezone.version} earliestDate={[addDays(getWorkspaceDateString(new Date(), timezone.currentTimezone), 1), timezone.history.length ? addDays(toDateOnlyString(timezone.history.at(-1)!.effectiveFromDate), 1) : ""].sort().at(-1)!} timezoneOptions={[...new Set(["UTC", timezone.currentTimezone, ...Intl.supportedValuesOf("timeZone")])]} history={timezone.history.map(revision => ({ ...revision, effectiveFromDate: toDateOnlyString(revision.effectiveFromDate), effectiveAt: revision.effectiveAt.toISOString(), createdAt: revision.createdAt.toISOString() }))} />
      </div>
    </AdminShell>
  );
}
