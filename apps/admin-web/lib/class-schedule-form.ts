import { parseClassPrerequisites } from "@flowstate/db";
import type { ResolvedClassOccurrence } from "@flowstate/db";
import type { ClassScheduleInput } from "./class-schedule";

function time(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
export function occurrenceEditorInput(item: ResolvedClassOccurrence): ClassScheduleInput {
  return { prerequisites: parseClassPrerequisites(item.prerequisites) ?? undefined, templateId: item.classTemplateId, scope: "occurrence", date: item.scheduledForDate, title: item.title ?? "", programId: item.programId, roomId: item.roomId, coachWorkspaceUserId: item.coachWorkspaceUserId ?? "", coachAssignmentMode: item.coachAssignmentMode, startTime: time(item.startTimeMinutes), endTime: time(item.endTimeMinutes), capacity: item.capacityOverride === null ? "" : String(item.capacityOverride), bookingCutoffMinutes: String(item.bookingCutoffMinutes), cancellationCutoffMinutes: String(item.cancellationCutoffMinutes), recurrence: "WEEKLY", weekdays: [item.weekday], endDate: "", reason: "" };
}
