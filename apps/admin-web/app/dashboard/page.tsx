import Link from "next/link";
import { redirect } from "next/navigation";
import { dateOnlyStringToUtcDate, formatMinutesAsTime } from "@flowstate/db";
import { AdminShell } from "../_components/admin-shell";
import { getOwnerToday } from "../../lib/owner-today";
import { requireOwnerWorkspaceContext } from "../../lib/owner-workspace";
import { isWorkspaceMigrationReady } from "../../lib/workspace-migration";
import { getClassTemplateFormOptions } from "../../lib/class-templates";
import { occurrenceEditorInput } from "../../lib/class-schedule-form";
import { CoachAssignment } from "./schedule/coach-assignment";
import "./schedule/schedule.css";
import "./today.css";

export default async function DashboardPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  if (!isWorkspaceMigrationReady({ workspaceStatus: workspace.status, migrationStage: workspace.migration?.stage, ownerReviewAcknowledgedAt: workspace.migration?.ownerReviewAcknowledgedAt, ownerReviewAcknowledgedByUserId: workspace.migration?.ownerReviewAcknowledgedByUserId, operationallyReadyAt: workspace.migration?.operationallyReadyAt, operationallyReadyByUserId: workspace.migration?.operationallyReadyByUserId })) redirect("/dashboard/migration");
  const [today, options] = await Promise.all([
    getOwnerToday(workspace.id, workspace.location.timezone),
    getClassTemplateFormOptions({ workspaceId: workspace.id, locationId: workspace.location.id }),
  ]);
  const selected = today.selectedClass;
  const rosterUrl = (id: string) => `/dashboard/schedule/${id}/roster?date=${today.date}`;
  const dateLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "full" }).format(dateOnlyStringToUtcDate(today.date));
  const paymentContent = <><span className="dashboard-card-label">Payments needing attention</span><strong className="today-metric-value">{today.paymentCount}</strong><span>{today.paymentCount ? "Review payment issues" : "No payment issues"}</span></>;
  return <AdminShell session={session} workspaceName={workspace.name} eyebrow={workspace.name} title="Today" description={dateLabel} actions={<Link className="button" href={`/dashboard/schedule/new?date=${today.date}`}>Add class</Link>}>
    <div className="today-metrics">
      <Link className="management-card today-metric" href="/dashboard/members?status=ACTIVE"><span className="dashboard-card-label">Active members</span><strong className="today-metric-value">{today.activeMembers}</strong><span>View active members</span></Link>
      {selected ? <Link className="management-card today-metric" href={rosterUrl(selected.id)}><span className="dashboard-card-label">{selected.displayTitle}</span><strong className="today-metric-value">{selected.booked}{selected.effectiveCapacity === null ? " booked" : ` / ${selected.effectiveCapacity}`}</strong><span>{formatMinutesAsTime(selected.startTimeMinutes)} · Bookings and roster</span></Link> : <Link className="management-card today-metric" href="/dashboard/schedule"><span className="dashboard-card-label">Classes today</span><strong className="today-metric-value">0</strong><span>View the class schedule</span></Link>}
      {today.paymentCount ? <Link className="management-card today-metric" href="/dashboard/billing?filter=attention">{paymentContent}</Link> : <section className="management-card today-metric">{paymentContent}</section>}
    </div>
    <section className="management-card form-stack"><div className="stack-item-heading"><h2>Trials today</h2><Link className="text-link" href="/dashboard/members?status=TRIAL">All trial members</Link></div>
      {today.trials.length ? <div className="stack-list">{today.trials.map((trial) => <article key={trial.id} className="stack-item"><div><Link className="text-link" href={`/dashboard/members/${trial.member.id}`}>{trial.member.fullName}</Link><p>{trial.occurrence.displayTitle} · {formatMinutesAsTime(trial.occurrence.startTimeMinutes)}</p></div><Link className="text-link" href={rosterUrl(trial.occurrence.id)}>Open roster</Link></article>)}</div> : <p>No trials booked for today.</p>}
    </section>
    <section className="management-card form-stack"><div className="stack-item-heading"><h2>Today&apos;s classes</h2><Link className="text-link" href="/dashboard/schedule">Full schedule</Link></div>
      {today.classes.length ? <div className="class-date-list">{today.classes.map((item) => <article key={item.id} className="class-date-row"><div><h3>{item.displayTitle}</h3><p>{formatMinutesAsTime(item.startTimeMinutes)}–{formatMinutesAsTime(item.endTimeMinutes)} · {item.room.name}</p></div><div className="class-coach"><span>{item.coachWorkspaceUserId ? item.coachDisplayName : "Needs coach"}</span>{item.canEdit ? <CoachAssignment title={item.displayTitle} coachName={item.coachWorkspaceUserId ? item.coachDisplayName : null} defaultCoachName={item.defaultCoach?.user.fullName ?? item.defaultCoach?.user.email} initial={occurrenceEditorInput(item)} options={options} timezone={workspace.location.timezone} /> : null}</div><strong>{item.booked}{item.effectiveCapacity === null ? " booked" : ` / ${item.effectiveCapacity} booked`}</strong><Link className="button button-secondary" href={rosterUrl(item.id)}>Open roster</Link></article>)}</div> : <p>No classes today. <Link className="text-link" href="/dashboard/schedule">View another day</Link></p>}
    </section>
  </AdminShell>;
}
