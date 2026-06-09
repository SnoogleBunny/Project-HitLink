import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveRequiredFormStatusesForMember } from "@flowstate/db";
import { AdminShell } from "../../../_components/admin-shell";
import { formatMinutesAsTime } from "../../../../lib/class-templates";
import {
  buildActionableFormRequestHref,
  formatRequiredFormState,
} from "../../../../lib/forms-status";
import { formatRequirementTarget } from "../../../../lib/forms";
import { getMemberProfile } from "../../../../lib/members";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { GuardianLinkForm } from "../guardian-link-form";
import { MemberEditForm } from "../member-form";
import { PortalAccessForm } from "../portal-access-form";

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
  const [member, forms] = await Promise.all([
    getMemberProfile({
      workspaceId: workspace.id,
      memberId,
    }),
    resolveRequiredFormStatusesForMember({
      workspaceId: workspace.id,
      memberId,
    }),
  ]);

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
        <>
          <Link className="button" href={`/dashboard/members/${member.id}/billing`}>
            Open billing
          </Link>
          <Link className="button button-secondary" href="/dashboard/members">
            Back to members
          </Link>
        </>
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
          <p className="dashboard-card-label">Required forms</p>
          <h3>
            {forms.items.length} current requirement
            {forms.items.length === 1 ? "" : "s"}
          </h3>
          {forms.items.length === 0 ? (
            <p className="empty-state">
              No active forms apply to this member right now.
            </p>
          ) : (
            <div className="stack-list">
              {forms.items.map((item) => (
                <article key={item.assignmentId} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{item.formName}</h4>
                      <span
                        className={`status-pill ${
                          item.status === "SIGNED" ? "status-pill-success" : ""
                        }`}
                      >
                        {formatRequiredFormState(item.status)}
                      </span>
                    </div>
                    <p>
                      {formatRequirementTarget(item.requirementTarget)} · Current
                      version {item.currentVersionNumber}
                    </p>
                    <dl className="inline-meta">
                      <div>
                        <dt>Signer</dt>
                        <dd>{formatStatus(item.signerKind)}</dd>
                      </div>
                      <div>
                        <dt>Signed by</dt>
                        <dd>{item.signedByName ?? "Not signed yet"}</dd>
                      </div>
                      <div>
                        <dt>Signed at</dt>
                        <dd>{item.signedAt ? formatDateTime(item.signedAt) : "Not signed yet"}</dd>
                      </div>
                    </dl>

                    {item.openRequests.length > 0 ? (
                      <div className="dashboard-actions">
                        {item.openRequests.map((request) => (
                          <a
                            key={request.requestId}
                            className="button button-secondary"
                            href={buildActionableFormRequestHref(request)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {request.guardianName
                              ? `Open link for ${request.guardianName}`
                              : "Open signing link"}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Signed history</p>
          <h3>
            {forms.history.length} signed version
            {forms.history.length === 1 ? "" : "s"}
          </h3>
          {forms.history.length === 0 ? (
            <p className="empty-state">No signed documents recorded yet.</p>
          ) : (
            <div className="stack-list">
              {forms.history.map((item) => (
                <article key={item.signedDocumentId} className="stack-item">
                  <div className="stack-item-copy">
                    <div className="stack-item-heading">
                      <h4>{item.formName}</h4>
                      <span className="status-pill status-pill-success">
                        v{item.versionNumber}
                      </span>
                    </div>
                    <p>
                      {formatStatus(item.signerKind)}
                      {item.guardianName ? ` · ${item.guardianName}` : ""} signed on{" "}
                      {formatDateTime(item.signedAt)}
                    </p>
                    <dl className="inline-meta">
                      <div>
                        <dt>Signer name</dt>
                        <dd>{item.signerNameSnapshot}</dd>
                      </div>
                      <div>
                        <dt>Email</dt>
                        <dd>{item.signerEmailSnapshot ?? "Not captured"}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          )}
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

      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Portal access</p>
          <h3>
            {member.portalAccess ? "Member login is active" : "Create member login"}
          </h3>
          <p className="management-copy">
            Keep member login scoped to this one profile only. This screen does
            not reuse unrelated existing users or support family account linking.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>{member.portalAccess ? "Enabled" : "Not created"}</dd>
            </div>
            <div>
              <dt>Login email</dt>
              <dd>{member.portalAccess?.email ?? member.email ?? "Add member email first"}</dd>
            </div>
          </dl>
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">
            {member.portalAccess ? "Reset password" : "Provision login"}
          </p>
          <h3>
            {member.portalAccess ? "Replace temporary password" : "Create member portal access"}
          </h3>
          <PortalAccessForm
            memberEmail={member.email}
            memberId={member.id}
            portalAccessEmail={member.portalAccess?.email ?? null}
          />
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
                      <dd>{formatStatus(booking.status)}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="management-card">
        <p className="dashboard-card-label">Attendance</p>
        <h3>
          {member.attendanceRecords.length} recent record
          {member.attendanceRecords.length === 1 ? "" : "s"}
        </h3>

        {member.attendanceRecords.length === 0 ? (
          <p className="empty-state">No attendance history recorded yet.</p>
        ) : (
          <div className="stack-list">
            {member.attendanceRecords.map((attendanceRecord) => (
              <article key={attendanceRecord.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{attendanceRecord.classTitle}</h4>
                    <span className="status-pill status-pill-success">
                      {formatStatus(attendanceRecord.state)}
                    </span>
                  </div>
                  <p>
                    {formatDate(attendanceRecord.scheduledForDate)} at{" "}
                    {formatMinutesAsTime(attendanceRecord.startTimeMinutes)}
                  </p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Template</dt>
                      <dd>{attendanceRecord.classTemplateId}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatDateTime(attendanceRecord.updatedAt)}</dd>
                    </div>
                    <div>
                      <dt>Note</dt>
                      <dd>{attendanceRecord.note ?? "No note"}</dd>
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
