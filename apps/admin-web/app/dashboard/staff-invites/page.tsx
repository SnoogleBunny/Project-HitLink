import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { listPendingCoachInvites } from "../../../lib/staff-invites";
import {
  resendStaffInviteAction,
  revokeStaffInviteAction,
} from "./actions";
import { StaffInviteForm } from "./staff-invite-form";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function StaffInvitesPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const pendingInvites = await listPendingCoachInvites({
    workspaceId: workspace.id,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Staff invites"
      title="Coach invite scaffolding"
      description="Invite records, resend, and revoke are ready. Email delivery and coach acceptance stay deferred."
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Invite coach</p>
          <h3>Owner-only invite flow</h3>
          <p className="management-copy">
            This creates and refreshes invite records only. Full email delivery
            and coach acceptance are still deferred.
          </p>
          <StaffInviteForm />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Pending invites</p>
          <h3>Awaiting follow-up</h3>

          {pendingInvites.length === 0 ? (
            <p className="empty-state">
              No pending coach invites right now. Expired invites are cleaned up
              lazily when this page loads or actions run.
            </p>
          ) : (
            <div className="stack-list">
              {pendingInvites.map((invite) => (
                <article key={invite.id} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{invite.email}</h4>
                      <span className="status-pill status-pill-success">
                        Pending
                      </span>
                    </div>
                    <dl className="inline-meta">
                      <div>
                        <dt>Invited by</dt>
                        <dd>{invite.invitedByDisplayName}</dd>
                      </div>
                      <div>
                        <dt>Created</dt>
                        <dd>{formatDateTime(invite.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>{formatDateTime(invite.expiresAt)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="stack-item-actions">
                    <form action={resendStaffInviteAction}>
                      <input name="inviteId" type="hidden" value={invite.id} />
                      <button className="button button-secondary" type="submit">
                        Resend
                      </button>
                    </form>

                    <form action={revokeStaffInviteAction}>
                      <input name="inviteId" type="hidden" value={invite.id} />
                      <button className="button button-danger" type="submit">
                        Revoke
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Schedule readiness</p>
        <h3>Class templates + weekly schedule</h3>
        <p className="management-copy">
          Schedule setup should consume only unarchived programs and active,
          unarchived rooms.
        </p>
      </section>
    </AdminShell>
  );
}
