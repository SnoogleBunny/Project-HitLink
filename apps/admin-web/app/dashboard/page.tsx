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

  const [
    programCount,
    roomCount,
    templateCount,
    pendingInviteCount,
    membershipPlanCount,
    failedPaymentCount,
  ] =
    await Promise.all([
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
      prisma.classTemplate.count({
        where: {
          workspaceId: workspace.id,
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
      prisma.membershipPlan.count({
        where: {
          workspaceId: workspace.id,
          archivedAt: null,
        },
      }),
      prisma.membershipBillingState.count({
        where: {
          workspaceId: workspace.id,
          status: {
            in: [
              "PENDING_PAYMENT_METHOD",
              "PAST_DUE",
              "PAYMENT_FAILED",
              "ACTION_REQUIRED",
            ],
          },
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
      description="Programs, rooms, staff invites, and recurring weekly schedule setup now live together in the owner dashboard."
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
              <dt>Active templates</dt>
              <dd>{templateCount}</dd>
            </div>
            <div>
              <dt>Pending coach invites</dt>
              <dd>{pendingInviteCount}</dd>
            </div>
            <div>
              <dt>Membership plans</dt>
              <dd>{membershipPlanCount}</dd>
            </div>
            <div>
              <dt>Billing queue</dt>
              <dd>{failedPaymentCount}</dd>
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
              <dd>{workspace.settings?.allowMultipleRooms ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </section>

        <section className="dashboard-card dashboard-card-wide">
          <p className="dashboard-card-label">Schedule</p>
          <h3>Manage recurring weekly classes</h3>
          <p>
            Build the weekly operating schedule from unarchived programs, active
            rooms, and eligible owner or coach assignments.
          </p>
          <div className="dashboard-actions">
            <Link className="button" href="/dashboard/schedule">
              Open schedule
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
            <Link
              className="button button-secondary"
              href="/dashboard/membership-plans"
            >
              Manage memberships
            </Link>
          </div>
        </section>

        <section className="dashboard-card dashboard-card-wide">
          <p className="dashboard-card-label">What remains later</p>
          <h3>Still intentionally out of scope</h3>
          <p>
            Full class instances, waitlists, punch cards, drop-ins, messaging,
            member billing self-service, and coach invite acceptance all stay
            deferred beyond this slice.
          </p>
        </section>
      </div>
    </AdminShell>
  );
}
