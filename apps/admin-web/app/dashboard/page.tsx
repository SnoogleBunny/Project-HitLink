import { resolveDisplayLocale } from "@flowstate/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { dateOnlyStringToUtcDate, formatMinutesAsTime } from "@flowstate/db";
import { Badge, Icon, Money, type IconName } from "@flowstate/ui";
import { AdminShell } from "../_components/admin-shell";
import { getOwnerToday } from "../../lib/owner-today";
import { requireOwnerWorkspaceContext } from "../../lib/owner-workspace";
import { isWorkspaceOperationallyReady } from "@flowstate/db";
import { getClassTemplateFormOptions } from "../../lib/class-templates";
import { occurrenceEditorInput } from "../../lib/class-schedule-form";
import { CoachAssignment } from "./schedule/coach-assignment";
import "./schedule/schedule.css";
import "./today.css";

function MetricHeading({ label, icon }: { label: string; icon: IconName }) {
  return (
    <span className="today-metric-heading">
      <span>{label}</span>
      <span className="today-metric-icon">
        <Icon name={icon} />
      </span>
    </span>
  );
}

export default async function DashboardPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const locale = resolveDisplayLocale(workspace.settings?.locale);

  if (
    !isWorkspaceOperationallyReady({
      workspaceStatus: workspace.status,
      setupActivation: workspace.setupActivation,
      migrationStage: workspace.migration?.stage,
      ownerReviewAcknowledgedAt: workspace.migration?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId:
        workspace.migration?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: workspace.migration?.operationallyReadyAt,
      operationallyReadyByUserId:
        workspace.migration?.operationallyReadyByUserId,
    })
  )
    redirect(workspace.setup ? "/dashboard/setup" : "/dashboard/migration");
  if (workspace.setupActivation?.serviceMode === "COACHING")
    redirect("/dashboard/coaching");
  const [today, options] = await Promise.all([
    getOwnerToday(workspace.id, workspace.location.timezone),
    getClassTemplateFormOptions({
      workspaceId: workspace.id,
      locationId: workspace.location.id,
    }),
  ]);
  const selected = today.selectedClass;
  // Keep every queue reachable, with one item per category in the initial snapshot.
  const attentionPreview: typeof today.attention = [];
  for (const item of today.attention) {
    if (!attentionPreview.some((other) => other.category === item.category))
      attentionPreview.push(item);
  }
  for (const item of today.attention) {
    if (attentionPreview.length >= 3) break;
    if (!attentionPreview.includes(item)) attentionPreview.push(item);
  }
  const remainingAttention = today.attention.filter(
    (item) => !attentionPreview.includes(item),
  );
  const selectedIndex = Math.max(
    0,
    today.classes.findIndex((item) => item.id === selected?.id),
  );
  const classPreview = today.classes.slice(selectedIndex, selectedIndex + 3);
  const remainingClasses = today.classes.filter(
    (item) => !classPreview.includes(item),
  );
  const trialPreview = today.trials.slice(0, 3);
  const remainingTrials = today.trials.slice(3);
  const rosterUrl = (id: string) =>
    `/dashboard/schedule/${id}/roster?date=${today.date}`;
  const dateLabel = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    dateStyle: "full",
  }).format(dateOnlyStringToUtcDate(today.date));
  const deadlineLabel = (value: Date) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: workspace.location.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(value);
  const memberPortal = new URL(
    "/app/schedule",
    process.env.NEXT_PUBLIC_MEMBER_WEB_URL ??
      process.env.NEXT_PUBLIC_MEMBER_APP_URL ??
      "http://localhost:3001",
  ).href;
  const paymentContent = (
    <>
      <MetricHeading label="Payments needing attention" icon="billing" />
      <strong className="today-metric-value">{today.paymentCount}</strong>
      <span className="today-metric-footer">
        <span>
          {today.paymentCount
            ? "Failed or unresolved payments, refunds and open disputes"
            : "No payments need attention"}
        </span>
        {today.paymentCount ? (
          <span className="today-metric-action">
            Review payments <span aria-hidden="true">›</span>
          </span>
        ) : null}
      </span>
    </>
  );
  function renderAttention(items: typeof today.attention) {
    return (
      <ul className="today-attention-list">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <Badge tone={item.tone}>{item.category}</Badge>
              <h3>{item.title}</h3>
              <p>
                {item.amountCents != null && item.currency ? (
                  <>
                    <Money
                      amountMinor={item.amountCents}
                      currency={item.currency}
                    />{" "}
                    ·{" "}
                  </>
                ) : null}
                {item.description}
              </p>
              {item.deadline ? (
                <p>Grace period ends {deadlineLabel(item.deadline)}</p>
              ) : null}
            </div>
            <Link
              className="button button-secondary"
              href={item.href}
              aria-label={item.actionLabel}
            >
              Review
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  function renderClasses(items: typeof today.classes) {
    return (
      <div className="today-class-list">
        {items.map((item) => (
          <article key={item.id}>
            <div className="today-class-details">
              <h3>{item.displayTitle}</h3>
              <p className="class-room">{item.room.name}</p>
              <p className="today-class-meta">
                {formatMinutesAsTime(item.startTimeMinutes, locale)}–
                {formatMinutesAsTime(item.endTimeMinutes, locale)}
                <span aria-hidden="true"> · </span>
                {item.booked}
                {item.effectiveCapacity === null
                  ? " booked"
                  : ` / ${item.effectiveCapacity} booked`}
              </p>
              <div className="class-coach">
                <span>
                  {item.coachWorkspaceUserId
                    ? item.coachDisplayName
                    : "Needs coach"}
                </span>
                {item.canEdit ? (
                  <CoachAssignment
                    title={item.displayTitle}
                    coachName={
                      item.coachWorkspaceUserId ? item.coachDisplayName : null
                    }
                    defaultCoachName={
                      item.defaultCoach?.user.fullName ??
                      item.defaultCoach?.user.email
                    }
                    initial={occurrenceEditorInput(item)}
                    options={options}
                    timezone={workspace.location.timezone}
                  />
                ) : null}
              </div>
            </div>
            <Link className="text-link" href={rosterUrl(item.id)}>
              Open class
            </Link>
          </article>
        ))}
      </div>
    );
  }
  function renderTrials(items: typeof today.trials) {
    return (
      <div className="today-trial-list">
        {items.map((trial) => (
          <article key={trial.id}>
            <div>
              <Link
                className="text-link"
                href={`/dashboard/members/${trial.member.id}`}
              >
                {trial.member.fullName}
              </Link>
              <p>
                {trial.occurrence.displayTitle} ·{" "}
                {formatMinutesAsTime(trial.occurrence.startTimeMinutes, locale)}
              </p>
            </div>
            <Link className="text-link" href={rosterUrl(trial.occurrence.id)}>
              Open roster
            </Link>
          </article>
        ))}
      </div>
    );
  }
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      eyebrow={workspace.name}
      title="Today"
      description={`${dateLabel} · ${workspace.location.timezone}`}
      actions={
        <a className="button button-secondary" href={memberPortal}>
          Open member portal
        </a>
      }
    >
      <div className="today-metrics">
        <Link
          className="management-card today-metric"
          href="/dashboard/members"
        >
          <MetricHeading label="Active members" icon="members" />
          <strong className="today-metric-value">{today.activeMembers}</strong>
          <span className="today-metric-footer">
            <span>Individual gym members</span>
            <span className="today-metric-action">
              View all members <span aria-hidden="true">›</span>
            </span>
          </span>
        </Link>
        {selected ? (
          <Link
            className="management-card today-metric"
            href={rosterUrl(selected.id)}
          >
            <MetricHeading label="Class bookings" icon="classes" />
            <strong className="today-metric-value">
              {selected.booked}
              {selected.effectiveCapacity === null
                ? " booked"
                : ` of ${selected.effectiveCapacity}`}
            </strong>
            <span className="today-metric-footer">
              <span>
                {selected.displayTitle} ·{" "}
                {formatMinutesAsTime(selected.startTimeMinutes, locale)}
              </span>
              <span className="today-metric-action">
                View class roster <span aria-hidden="true">›</span>
              </span>
            </span>
          </Link>
        ) : (
          <Link
            className="management-card today-metric"
            href="/dashboard/schedule"
          >
            <MetricHeading label="Classes today" icon="classes" />
            <strong className="today-metric-value">0</strong>
            <span className="today-metric-footer">
              <span>No classes scheduled today</span>
              <span className="today-metric-action">
                View the class schedule <span aria-hidden="true">›</span>
              </span>
            </span>
          </Link>
        )}
        {today.paymentCount ? (
          <Link
            className="management-card today-metric"
            href="/dashboard/billing?filter=attention"
          >
            {paymentContent}
          </Link>
        ) : (
          <section className="management-card today-metric">
            {paymentContent}
          </section>
        )}
      </div>
      {today.trials.length ? (
        <section
          className="management-card today-trials"
          aria-labelledby="today-trials-heading"
        >
          <div className="today-section-heading">
            <h2 id="today-trials-heading">
              Trials today{" "}
              <span className="today-count">{today.trials.length}</span>
            </h2>
            <Link className="text-link" href="/dashboard/members?status=TRIAL">
              All trial members
            </Link>
          </div>
          {renderTrials(trialPreview)}
          {remainingTrials.length ? (
            <details className="today-more">
              <summary>
                Show {remainingTrials.length} more{" "}
                {remainingTrials.length === 1 ? "trial" : "trials"}
              </summary>
              {renderTrials(remainingTrials)}
            </details>
          ) : null}
        </section>
      ) : null}
      <div className="today-overview">
        <section
          className="management-card today-attention"
          aria-labelledby="today-attention-heading"
        >
          <div className="today-section-heading">
            <h2 id="today-attention-heading">Needs attention</h2>
            {today.attention.length ? (
              <span className="today-count">
                {today.attention.length}{" "}
                {today.attention.length === 1 ? "item" : "items"}
              </span>
            ) : null}
          </div>
          {today.attention.length ? (
            <>
              {renderAttention(attentionPreview)}
              {remainingAttention.length ? (
                <details className="today-more">
                  <summary>
                    Show {remainingAttention.length} more{" "}
                    {remainingAttention.length === 1 ? "item" : "items"}
                  </summary>
                  {renderAttention(remainingAttention)}
                </details>
              ) : null}
            </>
          ) : (
            <div className="today-clear">
              <Badge tone="success">Up to date</Badge>
              <p>No outstanding reviews or missing attendance today.</p>
            </div>
          )}
        </section>
        <section
          className="management-card today-classes"
          aria-labelledby="today-classes-heading"
        >
          <div className="today-section-heading">
            <h2 id="today-classes-heading">
              Today’s classes{" "}
              <span className="today-count">{today.classes.length}</span>
            </h2>
            <Link className="text-link" href="/dashboard/schedule">
              Full schedule
            </Link>
          </div>
          {today.classes.length ? (
            <>
              {renderClasses(classPreview)}
              {remainingClasses.length ? (
                <details className="today-more">
                  <summary>
                    Show {remainingClasses.length} more{" "}
                    {remainingClasses.length === 1 ? "class" : "classes"} today
                  </summary>
                  {renderClasses(remainingClasses)}
                </details>
              ) : null}
            </>
          ) : (
            <p className="today-empty">
              No classes today.{" "}
              <Link className="text-link" href="/dashboard/schedule">
                View another day
              </Link>
            </p>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
