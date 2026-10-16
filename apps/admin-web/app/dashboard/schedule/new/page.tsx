import Link from "next/link";
import { getWeekdayForDateString, getWorkspaceDateString, parseDateOnlyString } from "@flowstate/db";
import { AdminShell } from "../../../_components/admin-shell";
import { getClassTemplateFormOptions } from "../../../../lib/class-templates";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { ScheduleEditor } from "../schedule-editor";
import "../schedule.css";

export default async function NewClassPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const query = await searchParams;
  const date = query.date && parseDateOnlyString(query.date).status === "ok" ? query.date : getWorkspaceDateString(new Date(), location.timezone);
  const options = await getClassTemplateFormOptions({ workspaceId: workspace.id, locationId: location.id });
  return <AdminShell session={session} workspaceName={workspace.name} eyebrow="Classes" title="Add class" description="Choose the class details, then review its dates before saving." actions={<Link className="text-link" href={`/dashboard/schedule?date=${date}`}>Back to Classes</Link>}><section className="management-card">{options.hasRequiredOptions ? <ScheduleEditor options={options} timezone={location.timezone} initial={{ templateId: null, scope: "new", date, title: "", programId: options.programs[0]?.id ?? "", roomId: options.rooms[0]?.id ?? "", coachWorkspaceUserId: "", coachAssignmentMode: "INHERIT", startTime: "09:00", endTime: "10:00", capacity: "", bookingCutoffMinutes: "0", cancellationCutoffMinutes: "0", recurrence: "WEEKLY", weekdays: [getWeekdayForDateString(date)], endDate: "", reason: "" }} /> : <div className="empty-state"><p>Add an active program and room before scheduling classes.</p><Link className="text-link" href="/dashboard/programs">Manage programs</Link>{" · "}<Link className="text-link" href="/dashboard/rooms">Manage rooms</Link></div>}</section></AdminShell>;
}
