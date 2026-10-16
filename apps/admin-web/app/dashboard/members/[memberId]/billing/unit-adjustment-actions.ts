"use server";
import { revalidatePath } from "next/cache";
import { adjustMembershipAllowance, adjustPunchCardUnits, lockClassSchedule, prisma } from "@flowstate/db";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
export async function adjustUnitsAction(_previous: { error?: string; saved?: boolean }, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  const { workspace, workspaceUserId, location } = await requireOwnerWorkspaceContext();
  const memberId = String(form.get("memberId") ?? ""), target = String(form.get("target") ?? ""), mutationId = String(form.get("mutationId") ?? ""), reason = String(form.get("reason") ?? "").trim(), delta = Number(form.get("delta"));
  if (!/^[\da-f-]{36}$/i.test(mutationId) || !Number.isSafeInteger(delta) || !delta || Math.abs(delta) > 10000 || !reason || reason.length > 1000 || form.get("reviewed") !== "on") return { error: "Review the class adjustment and enter a reason before saving." };
  if (!await prisma.member.findFirst({ where: { id: memberId, workspaceId: workspace.id }, select: { id: true } })) return { error: "Member not found." };
  let result: { ok: true } | { ok: false; message: string };
  if (target.startsWith("pack:")) result = await prisma.$transaction(async (db) => { await lockClassSchedule(db, workspace.id); return adjustPunchCardUnits({ workspaceId: workspace.id, memberId, cardId: target.slice(5), delta, operationKey: `owner-adjust:${mutationId}`, reason, actorWorkspaceUserId: workspaceUserId, db }); });
  else {
    const kind = target === "WEEK" ? "WEEK" : target === "BILLING_MONTH" ? "BILLING_MONTH" : null;
    if (!kind) return { error: "Choose the allowance to adjust." };
    const date = String(form.get("date") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a class date in the allowance period." };
    result = await adjustMembershipAllowance({ workspaceId: workspace.id, memberId, membershipId: String(form.get("membershipId") ?? ""), workspaceUserId, scheduledForDate: date, timezone: location.timezone, kind, delta, reason, mutationId });
  }
  if (!result.ok) return { error: result.message };
  revalidatePath(`/dashboard/members/${memberId}/billing`); revalidatePath("/classes");
  return { saved: true };
}
