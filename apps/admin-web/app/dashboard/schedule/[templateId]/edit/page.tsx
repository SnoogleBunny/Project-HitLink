import Link from "next/link";
import { classOccurrenceInclude, classScheduleDefinitionForDate, getClassOccurrence, getWorkspaceDateString, prisma, toDateOnlyString, type ClassOccurrenceTemplate } from "@flowstate/db";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../../_components/admin-shell";
import { getClassTemplateFormOptions } from "../../../../../lib/class-templates";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { occurrenceEditorInput } from "../../../../../lib/class-schedule-form";
import { ScheduleEditor } from "../../schedule-editor";
import "../../schedule.css";

export default async function EditClassPage({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams: Promise<{ date?: string; cancel?: string }> }) {
  const { templateId } = await params; const query = await searchParams;
  const { session, workspace, location } = await requireOwnerWorkspaceContext();
  const date = query.date ?? getWorkspaceDateString(new Date(), location.timezone);
  const [item, options] = await Promise.all([getClassOccurrence({ workspaceId: workspace.id, classTemplateId: templateId, scheduledForDate: date }), getClassTemplateFormOptions({ workspaceId: workspace.id, locationId: location.id })]);
  if (!item || item.status === "CANCELLED") notFound();
  const raw = await prisma.classTemplate.findFirst({ where: { id: templateId, workspaceId: workspace.id }, include: classOccurrenceInclude });
  if (!raw) notFound();
  const definition = classScheduleDefinitionForDate(raw as unknown as ClassOccurrenceTemplate, date);
  const futureInitial = occurrenceEditorInput({ ...item, ...definition, scheduledForDate: date, classTemplateId: templateId, coachAssignmentMode: "INHERIT" });
  futureInitial.scope = "future";
  futureInitial.weekdays = "recurrence" in definition ? definition.weekdays : [raw.weekday];
  futureInitial.recurrence = "recurrence" in definition ? definition.recurrence : "WEEKLY";
  futureInitial.endDate = "recurrence" in definition && definition.endDate ? toDateOnlyString(definition.endDate) : "";
  const initial = occurrenceEditorInput(item);
  if (query.cancel === "1") initial.scope = "cancel";
  return <AdminShell session={session} workspaceName={workspace.name} eyebrow="Classes" title={`${query.cancel ? "Cancel" : "Edit"} ${item.displayTitle}`} description={`${date} · ${item.room.name}`} actions={<Link className="text-link" href={`/dashboard/schedule/${templateId}/roster?date=${date}`}>Back to roster</Link>}><section className="management-card"><ScheduleEditor initial={initial} futureInitial={futureInitial} options={options} timezone={location.timezone} defaultCoachName={item.defaultCoach?.user.fullName ?? item.defaultCoach?.user.email} /></section>{!query.cancel ? <Link className="text-link" href={`/dashboard/schedule/${templateId}/edit?date=${date}&cancel=1`}>Cancel this class</Link> : null}</AdminShell>;
}
