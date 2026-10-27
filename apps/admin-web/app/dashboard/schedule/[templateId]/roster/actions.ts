"use server";

import { revalidatePath } from "next/cache";
import {
  emptyFormState,
  type BasicFormState,
} from "../../../../../lib/admin-access";
import { requireOperationsWorkspaceContext } from "../../../../../lib/operations-workspace";
import {
  promoteRosterWaitlist,
  recordAttendance,
  closeClassRoster,
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
  let result;
  try {
    result = await recordAttendance({
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
      reason: String(formData.get("reason") ?? ""),
      expectedVersion: String(formData.get("expectedVersion") ?? "UNRECORDED"),
      requestKey: String(formData.get("requestKey") ?? ""),
    });
  } catch {
    return {
      error:
        "Attendance could not be confirmed. Refresh the roster and try again.",
    };
  }

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  revalidatePath(`/dashboard/schedule/${classTemplateId}/roster`);

  return emptyFormState;
}

export interface RosterCloseState {
  error: string | null;
  message: string;
  skipped: Array<{ memberId: string; reason: string }>;
}
export async function closeRosterAction(
  _state: RosterCloseState,
  formData: FormData,
): Promise<RosterCloseState> {
  const { workspace, location, workspaceUserId, workspaceUserRole } =
    await requireOperationsWorkspaceContext();
  if (formData.get("confirm") !== "on")
    return {
      error:
        "Confirm that only unresolved eligible bookings should be marked as no-shows.",
      message: "",
      skipped: [],
    };
  const classTemplateId = String(formData.get("classTemplateId") ?? "");
  try {
    const result = await closeClassRoster({
      access: {
        workspaceId: workspace.id,
        workspaceUserId,
        role: workspaceUserRole,
        timezone: location.timezone,
      },
      classTemplateId,
      scheduledForDate: String(formData.get("scheduledForDate") ?? ""),
      requestKey: String(formData.get("requestKey") ?? ""),
    });
    if (result.status === "error")
      return { error: result.message, message: "", skipped: [] };
    revalidatePath(`/dashboard/schedule/${classTemplateId}/roster`);
    revalidatePath("/dashboard");
    return {
      error: null,
      message: `${result.closedCount} unresolved booking${result.closedCount === 1 ? " was" : "s were"} marked as no-show.${result.skipped.length ? ` ${result.skipped.length} need review and were left unchanged.` : ""}`,
      skipped: result.skipped,
    };
  } catch {
    return {
      error:
        "Roster closure could not be confirmed. Refresh the roster before trying again.",
      message: "",
      skipped: [],
    };
  }
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
