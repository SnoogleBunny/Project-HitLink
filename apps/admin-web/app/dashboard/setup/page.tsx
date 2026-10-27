import Link from "next/link";
import { getWorkspaceSetup } from "@flowstate/db";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { AdminShell } from "../../_components/admin-shell";
import { SetupForm } from "./form";
import { redirect } from "next/navigation";

export default async function SetupPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  if (!workspace.setup) redirect("/dashboard/migration");
  const setup = await getWorkspaceSetup({
    workspaceId: workspace.id,
    userId: session.userId,
  });
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      title="New business setup"
      description="Verify owner access and approve your business details before activation."
      actions={
        <Link className="text-link" href="/dashboard/settings/business">
          Business details
        </Link>
      }
    >
      {setup.activation ? (
        <section className="management-card form-stack">
          <h2>Business is active</h2>
          <p role="status">
            Your reviewed new-business setup is active. No legacy import or
            sample services were created.
          </p>
          <p>
            Payments and customer email still require their actual provider
            configuration. Add only the services you offer.
          </p>
          <Link
            className="button"
            href={
              setup.serviceMode === "COACHING"
                ? "/dashboard/coaching"
                : "/dashboard"
            }
          >
            Open workspace
          </Link>
        </section>
      ) : (
        <SetupForm
          ownerEmail={setup.ownerEmail}
          ownerVerified={setup.ownerVerified}
        />
      )}
    </AdminShell>
  );
}
