import Link from "next/link";
import { addDays, dateOnlyStringToUtcDate, formatMinutesAsTime, getWorkspaceDateString, getOccurrenceStartsAt, listClassOccurrences, parseDateOnlyString, prisma } from "@flowstate/db";
import { AdminShell } from "../../_components/admin-shell";
import { getClassTemplateFormOptions } from "../../../lib/class-templates";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { occurrenceEditorInput } from "../../../lib/class-schedule-form";
import { CoachAssignment } from "./coach-assignment";
import "./schedule.css";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; saved?: string }> }) {
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const query = await searchParams;
  const today = getWorkspaceDateString(new Date(), location.timezone);
  const date = query.date && parseDateOnlyString(query.date).status === "ok" ? query.date : today;
  const [classes, options, bookings, waitlist] = await Promise.all([
    listClassOccurrences({ workspaceId: workspace.id, fromDate: date, toDate: date, includeCancelled: true }),
    getClassTemplateFormOptions({ workspaceId: workspace.id, locationId: location.id }),
    prisma.classBooking.findMany({ where: { workspaceId: workspace.id, scheduledForDate: dateOnlyStringToUtcDate(date), status: { in: ["BOOKED", "PENDING_PAYMENT", "ATTENDED", "ABSENT", "NO_SHOW"] } }, select: { classTemplateId: true } }),
    prisma.waitlistEntry.findMany({ where: { workspaceId: workspace.id, scheduledForDate: dateOnlyStringToUtcDate(date), status: "ACTIVE" }, select: { classTemplateId: true } }),
  ]);
  return <AdminShell session={session} workspaceName={workspace.name} eyebrow="Classes" title="Classes" description={`Manage your timetable and dated rosters. Times use ${location.timezone}.`} actions={<Link className="button" href={`/dashboard/schedule/new?date=${date}`}>Add class</Link>}>
    {query.saved ? <p className="info-callout" role="status">Class changes saved.</p> : null}
    <section className="management-card form-stack">
      <form method="get" className="dashboard-actions class-date-controls"><label className="field"><span>Class date</span><input name="date" type="date" defaultValue={date} required /></label><button className="button button-secondary" type="submit">Show classes</button><Link className="text-link" href={`/dashboard/schedule?date=${today}`}>Today</Link></form>
      <nav className="class-day-picker" aria-label="Class days">{Array.from({ length: 7 }, (_, i) => addDays(date, i - 3)).map((day) => <Link key={day} className={day === date ? "button" : "button button-secondary"} aria-current={day === date ? "date" : undefined} href={`/dashboard/schedule?date=${day}`}>{new Intl.DateTimeFormat("en-CA", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(dateOnlyStringToUtcDate(day))}</Link>)}</nav>
    </section>
    <section className="management-card form-stack"><h3>{new Intl.DateTimeFormat("en-CA", { dateStyle: "full", timeZone: "UTC" }).format(dateOnlyStringToUtcDate(date))}</h3>
      {!classes.length ? <div className="empty-state"><p>No classes on this date.</p><Link className="text-link" href={`/dashboard/schedule/new?date=${date}`}>Add a class</Link></div> : <div className="class-date-list">{classes.map((item) => {
        const count = bookings.filter((booking) => booking.classTemplateId === item.classTemplateId).length;
        const queued = waitlist.filter((entry) => entry.classTemplateId === item.classTemplateId).length;
        const cancelled = item.status === "CANCELLED";
        const upcoming = getOccurrenceStartsAt({ scheduledForDate: date, startTimeMinutes: item.startTimeMinutes, timezone: location.timezone }) > new Date();
        return <article key={`${item.id}:${date}`} className="class-date-row"><div><h4>{item.displayTitle}</h4><p className="class-room">{item.room.name}</p><p>{formatMinutesAsTime(item.startTimeMinutes)}–{formatMinutesAsTime(item.endTimeMinutes)}</p>{cancelled ? <span className="status-pill">Cancelled</span> : null}</div><div className="class-coach"><span>{item.coachWorkspaceUserId ? item.coachDisplayName : "Needs coach"}</span>{!cancelled && upcoming ? <CoachAssignment title={item.displayTitle} coachName={item.coachWorkspaceUserId ? item.coachDisplayName : null} defaultCoachName={item.defaultCoach?.user.fullName ?? item.defaultCoach?.user.email} initial={occurrenceEditorInput(item)} options={options} timezone={location.timezone} /> : null}</div><div><strong>{count}{item.effectiveCapacity === null ? " booked" : ` / ${item.effectiveCapacity} booked`}</strong>{queued ? <p>{queued} waiting</p> : null}</div><div className="dashboard-actions">{!cancelled ? <Link className="button button-secondary" href={`/dashboard/schedule/${item.id}/roster?date=${date}`}>Open roster</Link> : null}{!cancelled && upcoming ? <Link className="text-link" href={`/dashboard/schedule/${item.id}/edit?date=${date}`}>Edit class</Link> : null}</div></article>;
      })}</div>}
    </section>
  </AdminShell>;
}
