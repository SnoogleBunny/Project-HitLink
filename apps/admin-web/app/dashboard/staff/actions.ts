"use server";
import { revalidatePath } from "next/cache";
import {
  changeStaffAccess,
  StaffAccessError,
  createStaffLeave,
  revokeStaffLeave,
  StaffLeaveError,
  type StaffLeaveConflict,
} from "@flowstate/db";
import { clearSessionCookie } from "@flowstate/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
export interface StaffAccessState {
  error: string | null;
  success: string | null;
}
export async function staffAccessAction(
  _state: StaffAccessState,
  form: FormData,
): Promise<StaffAccessState> {
  const context = await requireOwnerWorkspaceContext();
  if (form.get("confirmAccessChange") !== "on")
    return {
      error: "Review and confirm the named staff access change.",
      success: null,
    };
  const target = String(form.get("workspaceUserId") ?? "");
  if (!["true", "false"].includes(String(form.get("isActive"))))
    return { error: "Choose active or inactive staff access.", success: null };
  try {
    await changeStaffAccess(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      {
        workspaceUserId: target,
        role: String(form.get("role") ?? ""),
        isActive: form.get("isActive") === "true",
        expectedUpdatedAt: String(form.get("expectedUpdatedAt") ?? ""),
        reason: String(form.get("reason") ?? ""),
        operationId: String(form.get("operationId") ?? ""),
      },
    );
  } catch (error) {
    if (error instanceof StaffAccessError)
      return { error: error.message, success: null };
    throw error;
  }
  revalidatePath("/dashboard/staff");
  revalidatePath("/dashboard/coaching");
  if (target === context.workspaceUserId) {
    clearSessionCookie(await cookies());
    redirect("/login");
  }
  return {
    error: null,
    success:
      "Staff access updated. Existing sessions were revoked; retained services need any indicated owner review.",
  };
}
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
