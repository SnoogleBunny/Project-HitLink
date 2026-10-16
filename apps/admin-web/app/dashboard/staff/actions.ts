"use server";
import { revalidatePath } from "next/cache";
import {
  createStaffLeave,
  revokeStaffLeave,
  StaffLeaveError,
  type StaffLeaveConflict,
} from "@flowstate/db";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
export interface StaffLeaveState {
  error: string | null;
  success: string | null;
  conflicts: StaffLeaveConflict[];
}
export async function staffLeaveAction(
  _state: StaffLeaveState,
  form: FormData,
): Promise<StaffLeaveState> {
  const context = await requireOwnerWorkspaceContext();
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const value = (name: string) => String(form.get(name) ?? "");
  try {
    const revoked = value("intent") === "revoke";
    if (revoked)
      await revokeStaffLeave(actor, {
        leaveId: value("leaveId"),
        reason: value("reason"),
      });
    else
      await createStaffLeave(actor, {
        requestId: value("requestId"),
        coachWorkspaceUserId: value("coachWorkspaceUserId"),
        startsAt: value("startsAt"),
        endsAt: value("endsAt"),
        reason: value("reason"),
      });
    revalidatePath("/dashboard/staff");
    revalidatePath("/dashboard/schedule");
    revalidatePath("/dashboard/coaching");
    return {
      error: null,
      conflicts: [],
      success: revoked
        ? "Leave withdrawn. Classes and appointments can be scheduled again; cancelled services stay cancelled."
        : "Leave recorded. This coach cannot be assigned during this period.",
    };
  } catch (error) {
    if (error instanceof StaffLeaveError)
      return {
        error: error.message,
        conflicts: error.conflicts,
        success: null,
      };
    throw error;
  }
}
