import { prisma } from "@hitlink/db";
import Link from "next/link";
import { AdminShell } from "../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../lib/owner-workspace";
import { expireStalePendingStaffInvites } from "../../lib/staff-invites";

export default async function DashboardPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  await expireStalePendingStaffInvites({
    workspaceId: workspace.id,
  });

  const [programCount, roomCount, pendingInviteCount] = await Promise.all([
    prisma.program.count({
      where: {
        workspaceId: workspace.id,
        archivedAt: null,
      },
    }),
    prisma.room.count({
      where: {
        locationId: workspace.location.id,
        archivedAt: null,
      },
    }),
    prisma.staffInvite.count({
      where: {
        workspaceId: workspace.id,
        role: "COACH",
        status: "PENDING",
      },
    }),
  ]);

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
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      title="Workspace overview"
      description="Programs, rooms, and staff invite scaffolding are now ready for schedule setup."
    >
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
          <p className="dashboard-card-label">Operations</p>
          <h3>Admin setup status</h3>
          <dl className="dashboard-list">
            <div>
              <dt>Programs</dt>
              <dd>{programCount}</dd>
            </div>
            <div>
              <dt>Rooms</dt>
              <dd>{roomCount}</dd>
            </div>
            <div>
              <dt>Pending coach invites</dt>
              <dd>{pendingInviteCount}</dd>
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
          <h3>Class templates + weekly schedule</h3>
          <p>
            The next slice should build class templates and a weekly schedule on
            top of unarchived programs plus active, unarchived rooms.
          </p>
          <div className="dashboard-actions">
            <Link className="button" href="/dashboard/programs">
              Manage programs
            </Link>
            <Link className="button button-secondary" href="/dashboard/rooms">
              Manage rooms
            </Link>
            <Link
              className="button button-secondary"
              href="/dashboard/staff-invites"
            >
              Manage staff invites
            </Link>
          </div>
        </section>

        <section className="dashboard-card dashboard-card-wide">
          <p className="dashboard-card-label">What remains later</p>
          <h3>Still intentionally out of scope</h3>
          <p>
            Members, billing, scheduling details, Stripe, messaging, and coach
            invite acceptance all stay deferred beyond this slice.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
