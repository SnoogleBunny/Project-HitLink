"use server";
import { redirect } from "next/navigation";
import { StaffAccessError } from "@flowstate/db";
import { type BasicFormState } from "../../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  inviteCoachToWorkspace,
  resendPendingCoachInvite,
  revokePendingCoachInvite,
  StaffInviteError,
} from "../../../lib/staff-invites";
const origin = () =>
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_FLOWSTATE_APP_URL ??
  "";
const message = (error: unknown) =>
  error instanceof StaffInviteError || error instanceof StaffAccessError
    ? error.message
    : "The invitation could not be updated. Try again.";
export async function createStaffInviteAction(
  _previousState: BasicFormState,
  form: FormData,
): Promise<BasicFormState> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  try {
    const result = await inviteCoachToWorkspace({
      workspaceId: workspace.id,
      invitedByUserId: session.userId,
      email: String(form.get("email") ?? ""),
      inviteOrigin: origin(),
    });
    if (result.status === "error") return { error: result.message };
  } catch (error) {
    return { error: message(error) };
  }
  redirect("/dashboard/staff-invites");
}
export async function resendStaffInviteAction(form: FormData): Promise<void> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  let error: string | undefined;
  try {
    const result = await resendPendingCoachInvite({
      inviteId: String(form.get("inviteId") ?? ""),
      workspaceId: workspace.id,
      invitedByUserId: session.userId,
      inviteOrigin: origin(),
    });
    if (result.status === "error") error = result.message;
  } catch (failure) {
    error = message(failure);
  }
  redirect(
    `/dashboard/staff-invites${error ? `?error=${encodeURIComponent(error)}` : ""}`,
  );
}
export async function revokeStaffInviteAction(form: FormData): Promise<void> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  let error: string | undefined;
  try {
    const result = await revokePendingCoachInvite({
      inviteId: String(form.get("inviteId") ?? ""),
      workspaceId: workspace.id,
      invitedByUserId: session.userId,
    });
    if (result.status === "error") error = result.message;
  } catch (failure) {
    error = message(failure);
  }
  redirect(
    `/dashboard/staff-invites${error ? `?error=${encodeURIComponent(error)}` : ""}`,
  );
}
