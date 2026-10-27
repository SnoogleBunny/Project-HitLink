import { resolveDisplayLocale } from "@flowstate/ui";
import { prisma } from "@flowstate/db";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getClassOccurrence, getRosterEmergencyContacts, getRosterMemberOperations, MemberOperationsError } from "@flowstate/db";
import { getClassTemplateFormOptions } from "../../../../../lib/class-templates";
import { occurrenceEditorInput } from "../../../../../lib/class-schedule-form";
import { CoachAssignment } from "../../coach-assignment";
import "../../schedule.css";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOperationsWorkspaceContext } from "../../../../../lib/operations-workspace";
import { getClassRoster } from "../../../../../lib/rosters";
import { AttendanceForm } from "./attendance-form";
import { WaitlistPanel } from "./waitlist-panel";
import { CloseRosterForm } from "./close-roster-form";

function formatCapacity(value: number | null, rosterCount: number): string {
  if (value === null) {
    return `${rosterCount} booked`;
  }

  return `${rosterCount} / ${value} booked`;
}

function formatStatus(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export default async function RosterPage({
  params,
  searchParams,
}: {
  params: Promise<{
    templateId: string;
  }>;
  searchParams?: Promise<{
    date?: string;
  }>;
}) {
  const { templateId } = await params;
  const query = await searchParams;
  const { session, workspace, location, workspaceUserId, workspaceUserRole } =
    await requireOperationsWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);

  const scheduledForDate = query?.date ?? "";
  const roster = await getClassRoster({
    access: {
      workspaceId: workspace.id,
      workspaceUserId,
      role: workspaceUserRole,
      timezone: location.timezone,
      locale,
    },
    templateId,
    scheduledForDate,
  });

  if (!roster) {
    notFound();
  }
  const emergencyContacts = await getRosterEmergencyContacts({ workspaceId: workspace.id, userId: session.userId, occurrence: { classTemplateId: templateId, date: scheduledForDate } });
  const operations = await getRosterMemberOperations({ workspaceId: workspace.id, userId: session.userId, occurrence: { classTemplateId: templateId, date: scheduledForDate } })
    .catch(error => { if (error instanceof MemberOperationsError) notFound(); throw error; });
  const [occurrence, coachOptions] =
    workspaceUserRole === "OWNER"
      ? await Promise.all([
          getClassOccurrence({
            workspaceId: workspace.id,
            classTemplateId: templateId,
            scheduledForDate,
          }),
          getClassTemplateFormOptions({
            workspaceId: workspace.id,
            locationId: location.id,
          }),
        ])
      : [null, null];

  const progressViewer = await prisma.workspaceUser.findUnique({
    where: { id: workspaceUserId },
    select: {
      role: true,
      canManageProgress: true,
      canOverridePrerequisites: true,
    },
  });
  const canViewProgress =
    progressViewer?.role === "OWNER" ||
    progressViewer?.canManageProgress ||
    progressViewer?.canOverridePrerequisites;
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Roster"
      title={roster.displayTitle}
      description={`${roster.weekdayLabel}, ${roster.scheduledForDate} at ${roster.timeLabel}. ${formatCapacity(roster.effectiveCapacity, roster.rows.length)}.`}
      actions={
        <div className="dashboard-actions">
          <Link
            className="button button-secondary"
            href={
              workspaceUserRole === "OWNER"
                ? `/dashboard/schedule?date=${scheduledForDate}`
                : "/dashboard/coach/today"
            }
          >
            {workspaceUserRole === "OWNER"
              ? "Back to Classes"
              : "Back to today"}
          </Link>
          {workspaceUserRole === "OWNER" ? (
            <Link
              className="text-link"
              href={`/dashboard/schedule/${templateId}/edit?date=${scheduledForDate}`}
            >
              Edit class
            </Link>
          ) : null}
        </div>
      }
    >
      <section className="management-card">
        <p className="dashboard-card-label">Class details</p>
        <h3>{roster.programName}</h3>
        <p className="class-room">{roster.roomName}</p>
        <dl className="inline-meta">
          <div>
            <dt>Coach</dt>
            <dd className="class-coach">
              {roster.coachDisplayName}
              {occurrence && coachOptions ? (
                <CoachAssignment
                  initial={occurrenceEditorInput(occurrence)}
                  options={coachOptions}
                  title={occurrence.displayTitle}
                  coachName={
                    occurrence.coachWorkspaceUserId
                      ? occurrence.coachDisplayName
                      : null
                  }
                  defaultCoachName={
                    occurrence.defaultCoach?.user.fullName ??
                    occurrence.defaultCoach?.user.email
                  }
                  timezone={location.timezone}
                />
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Roster</dt>
            <dd>
              {formatCapacity(roster.effectiveCapacity, roster.rows.length)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="management-card">
        <p className="dashboard-card-label">Booked members</p>
        <h3>
          {roster.rows.length} attendee{roster.rows.length === 1 ? "" : "s"}
        </h3>

        {roster.rows.length === 0 ? (
          <p className="empty-state">No active bookings for this class date.</p>
        ) : (
          <div className="stack-list">
            {roster.rows.map((row) => (
              <article key={row.bookingId} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{row.memberName}</h4>
                    {row.bookingType === "TRIAL" ? (
                      <span className="status-pill status-pill-success">
                        Trial
                      </span>
                    ) : null}
                    <span className="status-pill">
                      {formatStatus(row.bookingStatus)}
                    </span>
                    {row.attendanceState ? (
                      <span className="status-pill status-pill-success">
                        {formatStatus(row.attendanceState)}
                      </span>
                    ) : null}
                  </div>
                  <p>
                    {row.email ?? row.phone ?? "No contact details"} /{" "}
                    {row.guardianName
                      ? `Guardian: ${row.guardianName}`
                      : "No guardian listed"}
                  </p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Shared internal labels</dt>
                      <dd>
                        {operations[row.memberId]?.tags.length ? operations[row.memberId]!.tags.map(tag => <p key={tag.recordKey}>{tag.tagLabel} · {tag.tagPurpose === "COHORT_ELIGIBILITY" ? "Eligibility tag" : "Operational label"} · {tag.actorName} · <time dateTime={tag.createdAt}>{new Intl.DateTimeFormat(locale, { timeZone: roster.occurrenceTimezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(tag.createdAt))}</time></p>) : "No shared labels"}
                      </dd>
                    </div>
                    <div>
                      <dt>Guardian contact</dt>
                      <dd>{row.guardianContact ?? "Not set"}</dd>
                    </div>
                    <div>
                      <dt>Emergency contacts</dt>
                      <dd>{emergencyContacts.filter(contact => contact.memberId === row.memberId).map(contact => <p key={`${contact.fullName}:${contact.phone}`}>{contact.fullName}{contact.relationshipLabel ? ` · ${contact.relationshipLabel}` : ""} · <a href={`tel:${contact.phone}`}>{contact.phone}</a></p>)}</dd>
                      {!emergencyContacts.some(contact => contact.memberId === row.memberId) ? <dd>Not recorded</dd> : null}
                    </div>
                  </dl>
                  <section aria-label={`Operational notes for ${row.memberName}`}>
                    <h4>Operational notes</h4>
                    {operations[row.memberId]?.notes.length ? operations[row.memberId]!.notes.map(note => <div key={note.recordKey}>
                      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{note.noteBody}</p>
                      <p>{note.actorName} · <time dateTime={note.createdAt}>{new Intl.DateTimeFormat(locale, { timeZone: roster.occurrenceTimezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(note.createdAt))}</time></p>
                    </div>) : <p>No current shared operational notes.</p>}
                    <Link className="button button-secondary" href={`/dashboard/members/${row.memberId}/operations?classTemplateId=${templateId}&date=${scheduledForDate}`}>{operations[row.memberId]?.hasMore ? "View more internal records" : "Manage operational notes and labels"}</Link>
                  </section>
                  {row.attendanceHistory?.length ? (
                    <details>
                      <summary>Recent attendance history</summary>
                      <ol>
                        {row.attendanceHistory.map((event) => (
                          <li key={event.id}>
                            <strong>
                              {event.previousState
                                ? `${formatStatus(event.previousState)} → `
                                : ""}
                              {formatStatus(event.state)}
                            </strong>{" "}
                            · {event.actorName} ·{" "}
                            <time dateTime={event.createdAt}>
                              {new Intl.DateTimeFormat(locale, {
                                timeZone: roster.occurrenceTimezone,
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(event.createdAt))}
                            </time>
                            {event.reason ? <p>{event.reason}</p> : null}
                          </li>
                        ))}
                      </ol>
                    </details>
                  ) : null}
                </div>

                <div className="stack-item-actions">
                  {canViewProgress ? (
                    <Link
                      className="text-link"
                      href={`/dashboard/members/${row.memberId}/progress?classTemplateId=${templateId}&date=${scheduledForDate}`}
                    >
                      Progress and eligibility
                    </Link>
                  ) : null}
                  <AttendanceForm
                    key={`${row.bookingId}:${row.attendanceVersion}`}
                    classTemplateId={roster.templateId}
                    row={row}
                    scheduledForDate={roster.scheduledForDate}
                    requestKey={randomUUID()}
                    noShowAllowed={roster.canClose}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="management-card form-stack">
        <h3>Close roster</h3>
        <p>
          No-shows and bulk closure are available after the scheduled class
          ends:{" "}
          {new Intl.DateTimeFormat(locale, {
            timeZone: roster.occurrenceTimezone,
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(roster.noShowCutoffAt))}{" "}
          ({roster.occurrenceTimezone}). This protects late arrivals.
        </p>
        <CloseRosterForm
          classTemplateId={roster.templateId}
          scheduledForDate={roster.scheduledForDate}
          requestKey={randomUUID()}
          canClose={roster.canClose}
          unresolvedCount={roster.unresolvedCount}
          members={roster.rows}
        />
      </section>

      <section className="management-card">
        <p className="dashboard-card-label">Waitlist</p>
        <h3>
          {roster.waitlist.length} active entr
          {roster.waitlist.length === 1 ? "y" : "ies"}
        </h3>

        {roster.waitlist.length === 0 ? (
          <p className="empty-state">
            No active waitlist entries for this class date.
          </p>
        ) : (
          <WaitlistPanel
            classTemplateId={roster.templateId}
            rows={roster.waitlist}
            scheduledForDate={roster.scheduledForDate}
          />
        )}
      </section>
    </AdminShell>
  );
}
