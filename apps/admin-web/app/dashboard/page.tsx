import { prisma } from "@hitlink/db";
import Link from "next/link";
import { AdminShell } from "../_components/admin-shell";
import { requireDashboardSession } from "../../lib/admin-access";

export default async function DashboardPage() {
  const session = await requireDashboardSession();
  const workspace = await prisma.workspace.findUnique({
    where: {
      id: session.workspaceId,
    },
    include: {
      location: true,
      settings: true,
    },
  });

  if (!workspace || !workspace.location) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Workspace setup incomplete</h1>
          <p className="auth-description">
            The workspace record exists, but the primary location is missing.
          </p>
          <Link className="text-link" href="/onboarding">
            Return to onboarding
          </Link>
        </section>
      </main>
    );
  }

  const address = [
    workspace.location.addressLine1,
    workspace.location.city,
    workspace.location.region,
    workspace.location.postalCode,
    workspace.location.countryCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <AdminShell session={session} workspaceName={workspace.name}>
      <div className="dashboard-grid">
        <section className="dashboard-card">
          <p className="dashboard-card-label">Workspace</p>
          <h3>{workspace.name}</h3>
          <p>{workspace.businessType ?? "Business type not set yet."}</p>
          <dl className="dashboard-list">
            <div>
              <dt>Status</dt>
              <dd>{workspace.status}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{session.role}</dd>
            </div>
          </dl>
        </section>

        <section className="dashboard-card">
          <p className="dashboard-card-label">Primary location</p>
          <h3>{workspace.location.name}</h3>
          <p>{address || "Address details are still minimal in this slice."}</p>
          <dl className="dashboard-list">
            <div>
              <dt>Timezone</dt>
              <dd>{workspace.location.timezone}</dd>
            </div>
            <div>
              <dt>Rooms enabled</dt>
              <dd>
                {workspace.settings?.allowMultipleRooms ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="dashboard-card dashboard-card-wide">
          <p className="dashboard-card-label">Next phase</p>
          <h3>What waits until later</h3>
          <p>
            Staff invites, programs, rooms, schedules, members, billing, Stripe,
            messaging, and the member portal stay deferred until the next slices.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
