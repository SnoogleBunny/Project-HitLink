import { EmergencyContacts, resolveDisplayLocale } from "@flowstate/ui";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  readOwnerMemberServiceSummary,
  resolveRequiredFormStatusesForMember,
  getMemberProgramProgress,
  getMemberEmergencyProfile,
  getMemberProfileHistory,
  getMemberOperations,
  MemberOperationsError,
} from "@flowstate/db";
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
import { MemberOperationsPanel } from "./operations-panel";
import { MemberServiceSummaryPanel } from "../member-service-summary";
import { PortalAccessForm } from "../portal-access-form";
import { FamilyAccessForm } from "../family-access-form";
import { getFamilyPortalAccess } from "../../../../lib/family-portal-access";
import { getMemberArchive } from "../../../../lib/member-archive";
import { MemberArchiveForm } from "../archive-form";
import { changeEmergencyContactAction } from "../emergency-actions";

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
  const locale = resolveDisplayLocale(workspace.settings?.locale);
  function formatDate(value: Date | null): string {
    if (!value) {
      return "Not set";
    }

    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
    }).format(value);
  }

  function formatDateTime(value: Date): string {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  }

  const member = await getMemberProfile({
    workspaceId: workspace.id,
    memberId,
  });
  if (!member) notFound();
  const serviceStatus = await readOwnerMemberServiceSummary(
    { workspaceId: workspace.id, userId: session.userId },
    memberId,
  );
  if (!serviceStatus) notFound();
  const operations = await getMemberOperations(
    { workspaceId: workspace.id, userId: session.userId },
    memberId,
  ).catch((error) => {
    if (error instanceof MemberOperationsError) notFound();
    throw error;
  });
  const [forms, familyAccess, progress, archive, emergency, profileHistory] =
    await Promise.all([
      resolveRequiredFormStatusesForMember({
        workspaceId: workspace.id,
        memberId,
      }),
      getFamilyPortalAccess(workspace.id, memberId),
      getMemberProgramProgress(
        { workspaceId: workspace.id, userId: session.userId },
        memberId,
      ),
      getMemberArchive(
        { workspaceId: workspace.id, userId: session.userId },
        memberId,
      ),
      getMemberEmergencyProfile(
        { workspaceId: workspace.id, userId: session.userId },
        memberId,
      ),
      getMemberProfileHistory(
        { workspaceId: workspace.id, userId: session.userId },
        memberId,
      ),
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
          <Link
            className="text-link"
            href={`/dashboard/members/${member.id}/records`}
          >
            Export records
          </Link>
          {progress.length ? (
            <Link
              className="button button-secondary"
              href={`/dashboard/members/${member.id}/progress`}
            >
              Progress
            </Link>
          ) : null}
          <Link
            className="button"
            href={`/dashboard/members/${member.id}/billing`}
          >
            Open billing
          </Link>
          <Link className="button button-secondary" href="/dashboard/members">
            Back to members
          </Link>
        </>
      }
    >
      <section className="management-card">
        <h2>Independent services</h2>
        {serviceStatus.archived ? (
          <p>
            This person is archived. Existing contracts, money, balances and
            records remain recorded; reactivation needs its own review.
          </p>
        ) : null}
        <MemberServiceSummaryPanel services={serviceStatus.services} />
      </section>
      <section className="management-card">
        <h2>Family portal access</h2>
        <FamilyAccessForm
          memberId={member.id}
          accounts={familyAccess.accounts
            .filter((account) => account.userId && account.user)
            .map((account) => ({
              userId: account.userId!,
              label: `${account.fullName} · ${account.user!.email}`,
            }))}
          guardians={familyAccess.links.map((link) => ({
            id: link.guardian.id,
            fullName: link.guardian.fullName,
          }))}
          grants={familyAccess.grants.map((grant) => ({
            userId: grant.userId,
            guardianId: grant.guardianId,
            version: grant.version,
            canBook: grant.canBook,
            canSign: grant.canSign,
            canPay: grant.canPay,
            canManageEmergencyContacts: grant.canManageEmergencyContacts,
            revoked: Boolean(grant.revokedAt),
          }))}
        />
      </section>
      <div className="management-grid">
        <section className="management-card">
          <p className="dashboard-card-label">Profile summary</p>
          <h3>Member basics</h3>
          <dl className="detail-list">
            <div>
              <dt>Profile label</dt>
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
              <dd>Managed in Internal operations below.</dd>
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
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">Edit profile</p>
          <h3>Update basics</h3>
          <MemberEditForm
            key={member.profileVersion}
            member={member}
            operationId={randomUUID()}
          />
        </section>
      </div>

      <MemberOperationsPanel
        view={operations}
        scope={{ memberId }}
        locale={locale}
        timezone={workspace.location.timezone}
        noteKey={`note:${randomUUID()}`}
        operationIds={Object.fromEntries(
          [
            "newNote",
            "newTag",
            ...operations.notes.map((note) => note.recordKey),
            ...operations.tags.map((tag) => tag.recordKey),
            ...(operations.legacy?.unclassifiedTags.map(
              (label) => `legacy:${label}`,
            ) ?? []),
          ].map((key) => [key, randomUUID()]),
        )}
      />

      <section
        className="management-card"
        aria-labelledby="member-emergency-title"
      >
        <h2 id="member-emergency-title">Emergency contacts</h2>
        <EmergencyContacts
          {...emergency}
          operationIds={Object.fromEntries(
            ["new", ...emergency.contacts.map((contact) => contact.id)].map(
              (id) => [id, randomUUID()],
            ),
          )}
          action={changeEmergencyContactAction}
        />
      </section>
      <section
        className="management-card"
        aria-labelledby="member-profile-history-title"
      >
        <h2 id="member-profile-history-title">
          Profile and emergency contact history
        </h2>
        {profileHistory.length ? (
          <ol className="stack-list">
            {profileHistory.map((change) => (
              <li key={change.id} className="stack-item">
                <div>
                  <p>
                    <strong>
                      {change.kind.toLowerCase().replaceAll("_", " ")}
                    </strong>{" "}
                    · {change.actorNameSnapshot} ·{" "}
                    {formatDateTime(change.createdAt)}
                  </p>
                  {change.reason ? <p>{change.reason}</p> : null}
                  <details>
                    <summary>View changed details</summary>
                    <dl className="detail-list">
                      {[
                        "fullName",
                        "email",
                        "phone",
                        "dateOfBirth",
                        "relationshipLabel",
                        "retiredAt",
                      ].flatMap((field) => {
                        const before =
                          change.before &&
                          typeof change.before === "object" &&
                          !Array.isArray(change.before)
                            ? (change.before as Record<string, unknown>)[field]
                            : undefined;
                        const after =
                          change.after &&
                          typeof change.after === "object" &&
                          !Array.isArray(change.after)
                            ? (change.after as Record<string, unknown>)[field]
                            : undefined;
                        return before === after ||
                          (before === undefined && after === undefined)
                          ? []
                          : [
                              <div key={field}>
                                <dt>
                                  {
                                    {
                                      fullName: "Name",
                                      email: "Email",
                                      phone: "Phone",
                                      dateOfBirth: "Date of birth",
                                      relationshipLabel: "Relationship",
                                      retiredAt: "Removed as current contact",
                                    }[field]
                                  }
                                </dt>
                                <dd>
                                  {String(before ?? "Not set")} →{" "}
                                  {String(after ?? "Not set")}
                                </dd>
                              </div>,
                            ];
                      })}
                    </dl>
                  </details>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            No profile changes have been recorded yet. Earlier details have no
            attributed change history.
          </p>
        )}
        {profileHistory.length === 100 ? (
          <p>
            The latest 100 changes are shown. The full reviewed history remains
            in business records.
          </p>
        ) : null}
      </section>

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
                      {formatRequirementTarget(item.requirementTarget)} ·
                      Current version {item.currentVersionNumber}
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
                        <dd>
                          {item.signedAt
                            ? formatDateTime(item.signedAt)
                            : "Not signed yet"}
                        </dd>
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
                      {item.guardianName ? ` · ${item.guardianName}` : ""}{" "}
                      signed on {formatDateTime(item.signedAt)}
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
            {member.portalAccess
              ? "Member login is active"
              : "Create member login"}
          </h3>
          <p className="management-copy">
            Keep member login scoped to this one profile only. This screen does
            not reuse unrelated existing users or support family account
            linking.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>{member.portalAccess ? "Enabled" : "Not created"}</dd>
            </div>
            <div>
              <dt>Login email</dt>
              <dd>
                {member.portalAccess?.email ??
                  member.email ??
                  "Add member email first"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="management-card">
          <p className="dashboard-card-label">
            {member.portalAccess ? "Reset password" : "Provision login"}
          </p>
          <h3>
            {member.portalAccess
              ? "Replace temporary password"
              : "Create member portal access"}
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
      {archive ? (
        <MemberArchiveForm
          memberId={memberId}
          archived={Boolean(archive.archivedAt)}
          version={archive.archiveVersion}
          impact={archive.impact}
        />
      ) : null}
    </AdminShell>
  );
}
