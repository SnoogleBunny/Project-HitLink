import Link from "next/link";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOperationsWorkspaceContext } from "../../../../lib/operations-workspace";
import { listTodayClasses, type TodayClassSummary } from "../../../../lib/rosters";

function formatCapacity(template: TodayClassSummary): string {
  if (template.effectiveCapacity === null) {
    return `${template.rosterCount} booked`;
  }

  return `${template.rosterCount} / ${template.effectiveCapacity} booked`;
}

export default async function CoachTodayPage() {
  const { session, workspace, location, workspaceUserId, workspaceUserRole } =
    await requireOperationsWorkspaceContext();
  const classes = await listTodayClasses({
    access: {
      workspaceId: workspace.id,
      workspaceUserId,
      role: workspaceUserRole,
      timezone: location.timezone,
    },
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Coach"
      title="Today's classes"
      description="Open a dated roster for today's real class occurrences. Coaches see assigned classes; owners see all."
      actions={
        session.role === "OWNER" ? (
          <Link className="button button-secondary" href="/dashboard/bookings">
            Create booking
          </Link>
        ) : null
      }
    >
      <section className="management-card">
        <p className="dashboard-card-label">Today</p>
        <h3>
          {classes.length} class{classes.length === 1 ? "" : "es"}
        </h3>

        {classes.length === 0 ? (
          <p className="empty-state">
            No assigned classes are scheduled for today.
          </p>
        ) : (
          <div className="stack-list">
            {classes.map((scheduledClass) => (
              <article key={scheduledClass.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{scheduledClass.displayTitle}</h4>
                    {scheduledClass.trialCount > 0 ? (
                      <span className="status-pill status-pill-success">
                        {scheduledClass.trialCount} trial
                        {scheduledClass.trialCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  <p>
                    {scheduledClass.weekdayLabel},{" "}
                    {scheduledClass.scheduledForDate} at{" "}
                    {scheduledClass.timeLabel}
                  </p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Room</dt>
                      <dd>{scheduledClass.roomName}</dd>
                    </div>
                    <div>
                      <dt>Roster</dt>
                      <dd>{formatCapacity(scheduledClass)}</dd>
                    </div>
                    <div>
                      <dt>Attendance</dt>
                      <dd>{scheduledClass.attendanceRecordedCount} recorded</dd>
                    </div>
                  </dl>
                </div>

                <Link
                  className="button"
                  href={`/dashboard/schedule/${scheduledClass.id}/roster?date=${scheduledClass.scheduledForDate}`}
                >
                  Open roster
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
