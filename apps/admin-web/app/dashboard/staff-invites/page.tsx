import { Notice, resolveDisplayLocale } from "@flowstate/ui";
import { AdminShell } from "../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  listPendingCoachInvites,
  listStaffInviteHistory,
} from "../../../lib/staff-invites";
import { resendStaffInviteAction, revokeStaffInviteAction } from "./actions";
import { StaffInviteForm } from "./staff-invite-form";

export default async function StaffInvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  function formatDateTime(value: Date): string {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: location.timezone,
    }).format(value);
  }

  const [pendingInvites, history, feedback] = await Promise.all([
    listPendingCoachInvites({ workspaceId: workspace.id }),
    listStaffInviteHistory({
      workspaceId: workspace.id,
      invitedByUserId: session.userId,
    }),
    searchParams,
  ]);

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Staff invites"
      title="Coach invitations"
      description="Invite coaches, review acceptance and revoke unused invitations."
    >
      {feedback.error ? <Notice tone="danger">{feedback.error}</Notice> : null}
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Invite coach</p>
          <h3>Owner-only invite flow</h3>
          <p className="management-copy">
            A secure invitation is queued for the named email. Delivery stays
            pending until the email provider confirms it. Each invitation
            expires after seven days; sending it again invalidates the older
            link.
          </p>
          <StaffInviteForm />
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Pending invites</p>
          <h3>Awaiting follow-up</h3>

          {pendingInvites.length === 0 ? (
            <p className="empty-state">
              No current coach invitations. Expired invitations cannot be
              accepted.
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

      <section className="management-card form-stack">
        <h2>Invitation history</h2>
        <p>
          Invitation changes retain their actor, time, intended role and status.
          Bearer links never appear in this history.
        </p>
        {history.length ? (
          history.map((event) => {
            const item = event.metadata as {
              email?: string;
              before?: { status?: string };
              after?: { status?: string; expiresAt?: string };
            };
            return (
              <article key={event.id} className="record-card">
                <h3>{item.email}</h3>
                <p>
                  {event.kind
                    .replace("STAFF_INVITE_", "")
                    .replaceAll("_", " ")
                    .toLowerCase()}{" "}
                  · {item.before?.status ?? "No invitation"} →{" "}
                  {item.after?.status}
                </p>
                <p>
                  {formatDateTime(event.createdAt)} · Actor:{" "}
                  {event.actorUserId ?? "Unauthenticated attempt"}
                </p>
              </article>
            );
          })
        ) : (
          <p>No invitation history yet.</p>
        )}
      </section>
    </AdminShell>
  );
}
