import Link from "next/link";
import { AdminShell } from "../../_components/admin-shell";
import {
  listWeeklyClassTemplates,
  type WeeklyScheduleTemplate,
} from "../../../lib/class-templates";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatCapacity(template: WeeklyScheduleTemplate): string {
  if (template.effectiveCapacity === null) {
    return "No capacity set";
  }

  return `Capacity ${template.effectiveCapacity}`;
}

function formatCutoff(minutes: number): string {
  return minutes === 0 ? "No cutoff" : `${minutes} min before`;
}

export default async function SchedulePage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const schedule = await listWeeklyClassTemplates({
    workspaceId: workspace.id,
  });

  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow="Schedule"
      title="Weekly class templates"
      description="Define recurring weekly classes with existing programs, rooms, and active owner or coach assignments."
      actions={
        <Link className="button" href="/dashboard/schedule/new">
          New class template
        </Link>
      }
    >
      <section className="management-card">
        <p className="dashboard-card-label">Weekly board</p>
        <h3>Recurring classes only</h3>
        <p className="management-copy">
          This view shows the reusable weekly schedule template system only.
          One-off changes, bookings, waitlists, and per-date exceptions stay
          deferred to later slices.
        </p>
      </section>

      <section
        className="schedule-grid"
        aria-label="Weekly schedule by weekday"
      >
        {schedule.days.map((day) => (
          <section key={day.weekday} className="schedule-day">
            <div className="schedule-day-header">
              <div>
                <p className="dashboard-card-label">{day.label}</p>
                <h3>
                  {day.templates.length} template
                  {day.templates.length === 1 ? "" : "s"}
                </h3>
              </div>
            </div>

            {day.templates.length === 0 ? (
              <p className="empty-state">
                No recurring classes on {day.label.toLowerCase()} yet.
              </p>
            ) : (
              <div className="schedule-template-list">
                {day.templates.map((template) => (
                  <article key={template.id} className="schedule-template-card">
                    <div className="schedule-template-header">
                      <div>
                        <p className="dashboard-card-label">
                          {template.timeLabel}
                        </p>
                        <h4>{template.displayTitle}</h4>
                      </div>

                      <Link
                        className="button button-secondary"
                        href={`/dashboard/schedule/${template.id}/edit`}
                      >
                        Edit
                      </Link>
                    </div>

                    <dl className="detail-list">
                      <div>
                        <dt>Program</dt>
                        <dd>{template.programName}</dd>
                      </div>
                      <div>
                        <dt>Room</dt>
                        <dd>{template.roomName}</dd>
                      </div>
                      <div>
                        <dt>Coach</dt>
                        <dd>{template.coachDisplayName}</dd>
                      </div>
                      <div>
                        <dt>Capacity</dt>
                        <dd>{formatCapacity(template)}</dd>
                      </div>
                      <div>
                        <dt>Booking cutoff</dt>
                        <dd>{formatCutoff(template.bookingCutoffMinutes)}</dd>
                      </div>
                      <div>
                        <dt>Cancel cutoff</dt>
                        <dd>
                          {formatCutoff(template.cancellationCutoffMinutes)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
        ))}
      </section>

      <section className="management-card">
        <p className="dashboard-card-label">Archived templates</p>
        <h3>Hidden from the default weekly board</h3>

        {schedule.archivedTemplates.length === 0 ? (
          <p className="empty-state">No archived class templates yet.</p>
        ) : (
          <div className="stack-list">
            {schedule.archivedTemplates.map((template) => (
              <article key={template.id} className="stack-item">
                <div className="stack-item-copy">
                  <div className="stack-item-heading">
                    <h4>{template.displayTitle}</h4>
                    <span className="status-pill">Archived</span>
                  </div>
                  <p>
                    {template.weekdayLabel} at {template.timeLabel}
                  </p>
                  <dl className="inline-meta">
                    <div>
                      <dt>Room</dt>
                      <dd>{template.roomName}</dd>
                    </div>
                    <div>
                      <dt>Coach</dt>
                      <dd>{template.coachDisplayName}</dd>
                    </div>
                    <div>
                      <dt>Archived</dt>
                      <dd>
                        {template.archivedAt
                          ? formatDateTime(template.archivedAt)
                          : "Earlier"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <Link
                  className="button button-secondary"
                  href={`/dashboard/schedule/${template.id}/edit`}
                >
                  View details
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
