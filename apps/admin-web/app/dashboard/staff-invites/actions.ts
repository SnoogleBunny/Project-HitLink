"use server";

import { redirect } from "next/navigation";
import {
  emptyFormState,
  type BasicFormState,
} from "../../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  inviteCoachToWorkspace,
  resendPendingCoachInvite,
  revokePendingCoachInvite,
} from "../../../lib/staff-invites";

export async function createStaffInviteAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const result = await inviteCoachToWorkspace({
    workspaceId: workspace.id,
    invitedByUserId: session.userId,
    email: String(formData.get("email") ?? ""),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/staff-invites");

  return emptyFormState;
}

export async function resendStaffInviteAction(formData: FormData): Promise<void> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const inviteId = String(formData.get("inviteId") ?? "");

  await resendPendingCoachInvite({
    inviteId,
    workspaceId: workspace.id,
    invitedByUserId: session.userId,
  });

  redirect("/dashboard/staff-invites");
}

export async function revokeStaffInviteAction(formData: FormData): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const inviteId = String(formData.get("inviteId") ?? "");

  await revokePendingCoachInvite({
    inviteId,
    workspaceId: workspace.id,
  });

  redirect("/dashboard/staff-invites");
}
