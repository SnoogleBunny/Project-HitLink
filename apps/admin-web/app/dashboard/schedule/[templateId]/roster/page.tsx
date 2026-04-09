import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOperationsWorkspaceContext } from "../../../../../lib/operations-workspace";
import { getClassRoster } from "../../../../../lib/rosters";
import { AttendanceForm } from "./attendance-form";

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
  const scheduledForDate = query?.date ?? "";
  const roster = await getClassRoster({
    access: {
      workspaceId: workspace.id,
      workspaceUserId,
      role: workspaceUserRole,
      timezone: location.timezone,
    },
    templateId,
    scheduledForDate,
  });

  if (!roster) {
    notFound();
  }

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Roster"
      title={roster.displayTitle}
      description={`${roster.weekdayLabel}, ${roster.scheduledForDate} at ${roster.timeLabel}. ${formatCapacity(roster.effectiveCapacity, roster.rows.length)}.`}
      actions={
        <Link className="button button-secondary" href="/dashboard/coach/today">
          Back to today
        </Link>
      }
    >
      <section className="management-card">
        <p className="dashboard-card-label">Class details</p>
        <h3>{roster.programName}</h3>
        <dl className="inline-meta">
          <div>
            <dt>Room</dt>
            <dd>{roster.roomName}</dd>
          </div>
          <div>
            <dt>Coach</dt>
            <dd>{roster.coachDisplayName}</dd>
          </div>
          <div>
            <dt>Roster</dt>
            <dd>{formatCapacity(roster.effectiveCapacity, roster.rows.length)}</dd>
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
                      <dt>Tags</dt>
                      <dd>{row.tags.length > 0 ? row.tags.join(", ") : "None"}</dd>
                    </div>
                    <div>
                      <dt>Guardian contact</dt>
                      <dd>{row.guardianContact ?? "Not set"}</dd>
                    </div>
                    <div>
                      <dt>Notes</dt>
                      <dd>{row.notes ?? "No notes"}</dd>
                    </div>
                  </dl>
                </div>

                <div className="stack-item-actions">
                  <AttendanceForm
                    classTemplateId={roster.templateId}
                    row={row}
                    scheduledForDate={roster.scheduledForDate}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
