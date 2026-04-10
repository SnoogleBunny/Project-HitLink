"use server";

import { revalidatePath } from "next/cache";
import { emptyFormState, type BasicFormState } from "../../../../../lib/admin-access";
import { requireOperationsWorkspaceContext } from "../../../../../lib/operations-workspace";
import {
  promoteRosterWaitlist,
  recordAttendance,
  removeRosterWaitlist,
} from "../../../../../lib/rosters";

export async function recordAttendanceAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace, location, workspaceUserId, workspaceUserRole } =
    await requireOperationsWorkspaceContext();
  const classTemplateId = String(formData.get("classTemplateId") ?? "");
  const scheduledForDate = String(formData.get("scheduledForDate") ?? "");
  const result = await recordAttendance({
    access: {
      workspaceId: workspace.id,
      workspaceUserId,
      role: workspaceUserRole,
      timezone: location.timezone,
    },
    memberId: String(formData.get("memberId") ?? ""),
    classTemplateId,
    scheduledForDate,
    state: String(formData.get("state") ?? ""),
    note: String(formData.get("note") ?? ""),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  revalidatePath(`/dashboard/schedule/${classTemplateId}/roster`);

  return emptyFormState;
}

export async function promoteWaitlistAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace, location, workspaceUserId, workspaceUserRole } =
    await requireOperationsWorkspaceContext();
  const classTemplateId = String(formData.get("classTemplateId") ?? "");
  const scheduledForDate = String(formData.get("scheduledForDate") ?? "");
  const result = await promoteRosterWaitlist({
    access: {
      workspaceId: workspace.id,
      workspaceUserId,
      role: workspaceUserRole,
      timezone: location.timezone,
    },
    classTemplateId,
    scheduledForDate,
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  revalidatePath(`/dashboard/schedule/${classTemplateId}/roster`);

  return emptyFormState;
}

export async function removeWaitlistAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace, location, workspaceUserId, workspaceUserRole } =
    await requireOperationsWorkspaceContext();
  const classTemplateId = String(formData.get("classTemplateId") ?? "");
  const waitlistEntryId = String(formData.get("waitlistEntryId") ?? "");
  const result = await removeRosterWaitlist({
    access: {
      workspaceId: workspace.id,
      workspaceUserId,
      role: workspaceUserRole,
      timezone: location.timezone,
    },
    waitlistEntryId,
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  revalidatePath(`/dashboard/schedule/${classTemplateId}/roster`);

  return emptyFormState;
}
