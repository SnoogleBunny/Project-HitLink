import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../_components/admin-shell";
import { formatMinutesAsTime } from "../../../../lib/class-templates";
import { getMemberProfile } from "../../../../lib/members";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { GuardianLinkForm } from "../guardian-link-form";
import { MemberEditForm } from "../member-form";

function formatDate(value: Date | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatStatus(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{
    memberId: string;
  }>;
}) {
  const { memberId } = await params;
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const member = await getMemberProfile({
    workspaceId: workspace.id,
    memberId,
  });

  if (!member) {
    notFound();
  }

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Members"
      title={member.fullName}
      description="Profile details, internal notes, family links, and booked trial dates."
      actions={
        <Link className="button button-secondary" href="/dashboard/members">
          Back to members
        </Link>
      }
    >
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Profile summary</p>
          <h3>Member basics</h3>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>{formatStatus(member.status)}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{member.email ?? "Not set"}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{member.phone ?? "Not set"}</dd>
            </div>
            <div>
              <dt>Date of birth</dt>
              <dd>{formatDate(member.dateOfBirth)}</dd>
            </div>
            <div>
              <dt>Waiver/form status</dt>
              <dd>{formatStatus(member.formStatus)}</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>{member.tags.length > 0 ? member.tags.join(", ") : "No tags"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(member.createdAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDateTime(member.updatedAt)}</dd>
            </div>
          </dl>

          <div className="info-callout">
            <strong>Notes</strong>
            <p>{member.notes ?? "No internal notes yet."}</p>
          </div>
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Edit profile</p>
          <h3>Update basics</h3>
          <MemberEditForm member={member} />
        </section>
      </div>

      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Guardians</p>
          <h3>
            {member.guardians.length} linked guardian
            {member.guardians.length === 1 ? "" : "s"}
          </h3>

          {member.guardians.length === 0 ? (
            <p className="empty-state">No guardians linked yet.</p>
          ) : (
            <div className="stack-list">
              {member.guardians.map((guardian) => (
                <article key={guardian.linkId} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{guardian.fullName}</h4>
                      {guardian.isPrimary ? (
                        <span className="status-pill status-pill-success">
                          Primary
                        </span>
                      ) : null}
                    </div>
                    <p>
                      {guardian.relationshipLabel ?? "Relationship not set"}
                    </p>
                    <dl className="inline-meta">
                      <div>
                        <dt>Email</dt>
                        <dd>{guardian.email ?? "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Phone</dt>
                        <dd>{guardian.phone ?? "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Notes</dt>
                        <dd>{guardian.notes ?? "No notes"}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Guardian link</p>
          <h3>Add guardian</h3>
          {member.guardians.length >= 2 ? (
            <p className="empty-state">
              Two guardians are already linked. Larger family management stays
              deferred.
            </p>
          ) : (
            <GuardianLinkForm memberId={member.id} />
          )}
        </section>
      </div>

      <section className="management-card">
        <p className="dashboard-card-label">Trials</p>
        <h3>
          {member.trialBookings.length} booked trial
          {member.trialBookings.length === 1 ? "" : "s"}
        </h3>

        {member.trialBookings.length === 0 ? (
          <p className="empty-state">No trial bookings yet.</p>
        ) : (
          <div className="stack-list">
            {member.trialBookings.map((booking) => (
              <article key={booking.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{booking.classTitle}</h4>
                    <span className="status-pill">Trial</span>
                  </div>
                  <p>
                    {formatDate(booking.scheduledForDate)} at{" "}
                    {formatMinutesAsTime(booking.startTimeMinutes)}
                  </p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Template</dt>
                      <dd>{booking.classTemplateId}</dd>
                    </div>
                    <div>
                      <dt>Booked</dt>
                      <dd>{formatDateTime(booking.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>Booked</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
