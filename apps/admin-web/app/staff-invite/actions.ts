"use server";
import { createSession } from "@flowstate/auth";
import { isWorkspaceOperationallyReady, prisma } from "@flowstate/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  acceptStaffInvite,
  INVALID_STAFF_INVITE_MESSAGE,
} from "../../lib/staff-invites";
export async function acceptStaffInviteAction(
  _state: { error: string | null; complete: boolean },
  form: FormData,
) {
  let accepted: Awaited<ReturnType<typeof acceptStaffInvite>>;
  try {
    accepted = await acceptStaffInvite({
      token: String(form.get("token") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      fullName: String(form.get("fullName") ?? ""),
    });
  } catch {
    return { error: INVALID_STAFF_INVITE_MESSAGE, complete: false };
  }
  const workspace = await prisma.workspace.findUnique({
    where: { id: accepted.workspaceId },
    include: { migration: true, setupActivation: true },
  });
  const ready =
    workspace &&
    isWorkspaceOperationallyReady({
      workspaceStatus: workspace.status,
      setupActivation: workspace.setupActivation,
      migrationStage: workspace.migration?.stage,
      ownerReviewAcknowledgedAt: workspace.migration?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId:
        workspace.migration?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: workspace.migration?.operationallyReadyAt,
      operationallyReadyByUserId:
        workspace.migration?.operationallyReadyByUserId,
    });
  if (!ready) return { error: null, complete: true };
  try {
    await createSession({
      userId: accepted.userId,
      cookieStore: await cookies(),
      expectedPasswordHash: accepted.passwordHash,
    });
  } catch {
    return { error: null, complete: true };
  }
  redirect("/dashboard/coach/today");
}
