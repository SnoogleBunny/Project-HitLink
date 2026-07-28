import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "../_components/admin-shell";
import {
  getOwnerDashboardSummary,
  type DashboardStatusTone,
  type OwnerDashboardSummary,
} from "../../lib/dashboard";
import { requireOwnerWorkspaceContext } from "../../lib/owner-workspace";
import { isWorkspaceMigrationReady } from "../../lib/workspace-migration";

const metricToneLabels: Record<DashboardStatusTone, string> = {
  neutral: "Info",
  success: "Clear",
  warning: "Watch",
  danger: "Action",
  info: "Info",
};

const actionToneLabels: Record<"success" | "warning" | "danger", string> = {
  success: "Opportunity",
  warning: "Watch",
  danger: "Action",
};

function formatReadinessSummary(args: {
  displayName: string;
  classesToday: number;
  bookedSpots: number;
  trialsToday: number;
  attentionItems: number;
}): string {
  const firstName = args.displayName.split(" ")[0] || args.displayName;

  return `Good morning, ${firstName}. Today has ${args.classesToday} class${
    args.classesToday === 1 ? "" : "es"
  }, ${args.bookedSpots} booked spot${
    args.bookedSpots === 1 ? "" : "s"
  }, ${args.trialsToday} trial${
    args.trialsToday === 1 ? "" : "s"
  }, and ${args.attentionItems} item${
    args.attentionItems === 1 ? "" : "s"
  } needing attention.`;
}

function getRosterHref(
  scheduledClass: OwnerDashboardSummary["todayClasses"][number],
): string {
  return `/dashboard/schedule/${scheduledClass.id}/roster?date=${scheduledClass.scheduledForDate}`;
}

function formatCapacity(
  scheduledClass: OwnerDashboardSummary["todayClasses"][number],
): string {
  if (scheduledClass.effectiveCapacity === null) {
    return `${scheduledClass.rosterCount} booked`;
  }

  return `${scheduledClass.rosterCount} / ${scheduledClass.effectiveCapacity}`;
}

function getCapacityTone(
  scheduledClass: OwnerDashboardSummary["todayClasses"][number],
): DashboardStatusTone {
  if (
    scheduledClass.effectiveCapacity === null ||
    scheduledClass.effectiveCapacity <= 0
  ) {
    return "neutral";
  }

  const capacityLeft =
    scheduledClass.effectiveCapacity - scheduledClass.rosterCount;

  if (capacityLeft <= 2) {
    return "warning";
  }

  return "neutral";
}

function getAttendanceTone(
  scheduledClass: OwnerDashboardSummary["todayClasses"][number],
): DashboardStatusTone {
  if (scheduledClass.rosterCount === 0) {
    return "neutral";
  }

  return scheduledClass.attendanceRecordedCount >= scheduledClass.rosterCount
    ? "success"
    : "warning";
}

export default async function DashboardPage() {
  const { session, workspace, workspaceUserId } =
    await requireOwnerWorkspaceContext();

  if (
    !isWorkspaceMigrationReady({
      workspaceStatus: workspace.status,
      migrationStage: workspace.migration?.stage,
      ownerReviewAcknowledgedAt:
        workspace.migration?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId:
        workspace.migration?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: workspace.migration?.operationallyReadyAt,
      operationallyReadyByUserId:
        workspace.migration?.operationallyReadyByUserId,
    })
  ) {
    redirect("/dashboard/migration");
  }

  const dashboard = await getOwnerDashboardSummary({
    workspaceId: workspace.id,
    workspaceUserId,
    timezone: workspace.location.timezone,
    locationId: workspace.location.id,
  });
  const classesToday =
    dashboard.metrics.find((metric) => metric.id === "classes")?.value ?? 0;
  const bookedSpots =
    dashboard.metrics.find((metric) => metric.id === "bookings")?.value ?? 0;
  const trialsToday =
    dashboard.metrics.find((metric) => metric.id === "trials")?.value ?? 0;
  const failedPaymentCount =
    dashboard.metrics.find((metric) => metric.id === "billing")?.value ?? 0;
  const attentionTotal = dashboard.attentionSummary.reduce(
    (total, item) => total + item.count,
    0,
  );
  const readinessSummary = formatReadinessSummary({
    displayName: session.displayName,
    classesToday,
    bookedSpots,
    trialsToday,
    attentionItems: attentionTotal,
  });

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
      eyebrow="Daily command center"
      title="Today's readiness"
      description="Start-of-day triage for classes, bookings, trials, attendance, and billing exceptions."
    >
      <section className="command-readiness" aria-labelledby="readiness-title">
        <div className="command-readiness-copy">
          <p className="dashboard-card-label">Readiness</p>
          <h3 id="readiness-title">{readinessSummary}</h3>
          <p>{workspace.location.name} · {workspace.location.timezone}</p>
        </div>

        <div className="command-metric-grid" aria-label="Today readiness metrics">
          {dashboard.metrics.map((metric) => (
            <article
              key={metric.id}
              className={`command-metric command-metric-${metric.tone}`}
            >
              <span className="command-metric-status">
                {metricToneLabels[metric.tone]}
              </span>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              <p>{metric.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="command-board">
        <section
          className="command-panel command-panel-priority"
          aria-labelledby="attention-title"
        >
          <div className="command-panel-header">
            <div>
              <p className="dashboard-card-label">Needs attention</p>
              <h3 id="attention-title">Owner queue</h3>
            </div>
            <span
              className={`command-status-chip command-status-chip-${
                attentionTotal > 0 ? "warning" : "success"
              }`}
            >
              <span className="command-status-dot" aria-hidden="true" />
              {attentionTotal} open
            </span>
          </div>

          <div
            className="command-summary-grid"
            aria-label="Attention categories"
          >
            {dashboard.attentionSummary.map((item) => (
              <div
                key={item.category}
                className={`command-summary-chip command-status-chip-${item.tone}`}
              >
                <span className="command-summary-count">{item.count}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          {dashboard.attentionItems.length === 0 ? (
            <div className="command-empty-state">
              <h4>Today is clear</h4>
              <p>
                No billing, attendance, capacity, trial, or invite items need
                action.
              </p>
            </div>
          ) : (
            <div className="command-attention-list">
              {dashboard.attentionItems.map((item) => (
                <article
                  key={item.id}
                  className={`command-attention-item command-severity-rail command-severity-rail-${item.severity}`}
                >
                  <div className="command-attention-copy">
                    <span
                      className={`command-status-chip command-status-chip-${item.severity}`}
                    >
                      <span className="command-status-dot" aria-hidden="true" />
                      {actionToneLabels[item.severity]}
                    </span>
                    <h4>{item.title}</h4>
                    <p>{item.context}</p>
                  </div>
                  <Link className="button button-secondary" href={item.href}>
                    {item.actionLabel}
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="command-panel" aria-labelledby="quick-actions-title">
          <div className="command-panel-header">
            <div>
              <p className="dashboard-card-label">Quick actions</p>
              <h3 id="quick-actions-title">Common moves</h3>
            </div>
          </div>
          <div className="command-action-grid">
            <Link className="command-action" href="/dashboard/bookings">
              <strong>Create booking</strong>
              <span>Place a member into class</span>
            </Link>
            <Link className="command-action" href="/dashboard/members">
              <strong>Add member</strong>
              <span>Create a profile or prospect</span>
            </Link>
            <Link className="command-action" href="/dashboard/coach/today">
              <strong>Today roster</strong>
              <span>Open floor-ready class lists</span>
            </Link>
            <Link className="command-action" href="/dashboard/schedule">
              <strong>Manage schedule</strong>
              <span>Edit recurring classes</span>
            </Link>
          </div>
        </section>
      </div>

      <section className="command-panel" aria-labelledby="schedule-title">
        <div className="command-panel-header">
          <div>
            <p className="dashboard-card-label">Today&apos;s schedule</p>
            <h3 id="schedule-title">
              {dashboard.todayClasses.length} class
              {dashboard.todayClasses.length === 1 ? "" : "es"}
            </h3>
          </div>
          <Link className="button button-secondary" href="/dashboard/schedule">
            Manage schedule
          </Link>
        </div>

        {dashboard.todayClasses.length === 0 ? (
          <div className="command-empty-state">
            <h4>No classes today</h4>
            <p>The daily roster is clear for this location.</p>
          </div>
        ) : (
          <div className="command-schedule-list">
            {dashboard.todayClasses.map((scheduledClass) => {
              const attendanceTone = getAttendanceTone(scheduledClass);
              const capacityTone = getCapacityTone(scheduledClass);

              return (
                <article
                  key={scheduledClass.id}
                  className="command-schedule-row"
                >
                  <div className="command-schedule-time">
                    <strong>{scheduledClass.timeLabel}</strong>
                    <span>{scheduledClass.weekdayLabel}</span>
                  </div>

                  <div className="command-schedule-copy">
                    <h4>{scheduledClass.displayTitle}</h4>
                    <p>
                      {scheduledClass.coachDisplayName} ·{" "}
                      {scheduledClass.roomName}
                    </p>
                    <div className="command-chip-row">
                      <span
                        className={`command-status-chip command-status-chip-${capacityTone}`}
                      >
                        <span
                          className="command-status-dot"
                          aria-hidden="true"
                        />
                        {formatCapacity(scheduledClass)} booked
                      </span>
                      {scheduledClass.trialCount > 0 ? (
                        <span className="command-status-chip command-status-chip-success">
                          <span
                            className="command-status-dot"
                            aria-hidden="true"
                          />
                          {scheduledClass.trialCount} trial
                          {scheduledClass.trialCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      <span
                        className={`command-status-chip command-status-chip-${attendanceTone}`}
                      >
                        <span
                          className="command-status-dot"
                          aria-hidden="true"
                        />
                        {scheduledClass.attendanceRecordedCount} attendance
                      </span>
                    </div>
                  </div>

                  <Link
                    className="button button-secondary"
                    href={getRosterHref(scheduledClass)}
                  >
                    Open roster
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="command-panel command-setup-panel"
        aria-labelledby="setup-title"
      >
        <div className="command-panel-header">
          <div>
            <p className="dashboard-card-label">Setup snapshot</p>
            <h3 id="setup-title">{workspace.name}</h3>
          </div>
          <span className="command-status-chip command-status-chip-neutral">
            <span className="command-status-dot" aria-hidden="true" />
            {workspace.status}
          </span>
        </div>

        <div className="command-setup-grid">
          <dl className="command-setup-list">
            <div>
              <dt>Programs</dt>
              <dd>{dashboard.setup.programCount}</dd>
            </div>
            <div>
              <dt>Rooms</dt>
              <dd>{dashboard.setup.roomCount}</dd>
            </div>
            <div>
              <dt>Active templates</dt>
              <dd>{dashboard.setup.templateCount}</dd>
            </div>
            <div>
              <dt>Membership plans</dt>
              <dd>{dashboard.setup.membershipPlanCount}</dd>
            </div>
            <div>
              <dt>Pending coach invites</dt>
              <dd>{dashboard.setup.pendingInviteCount}</dd>
            </div>
            <div>
              <dt>Billing queue</dt>
              <dd>{failedPaymentCount}</dd>
            </div>
          </dl>

          <div className="command-location-card">
            <h4>{workspace.location.name}</h4>
            <p>{address || "Address details not set."}</p>
            <dl>
              <div>
                <dt>Timezone</dt>
                <dd>{workspace.location.timezone}</dd>
              </div>
              <div>
                <dt>Rooms enabled</dt>
                <dd>{workspace.settings?.allowMultipleRooms ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
