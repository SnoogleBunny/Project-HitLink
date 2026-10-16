"use server";
import { revalidatePath } from "next/cache";
import { prisma, requestMembershipLifecycleChange, reviewMembershipLifecycleChange, MembershipLifecycleError, FinancialError, type MembershipLifecycleKind, type MembershipLifecycleOverride } from "@flowstate/db";
import { processMembershipLifecycleChange, retryMembershipLifecycleChange } from "@flowstate/payments";
import type { LifecycleFormState } from "@flowstate/ui";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
export async function ownerLifecycleAction(previous: LifecycleFormState, form: FormData): Promise<LifecycleFormState> {
  const context = await requireOwnerWorkspaceContext();
  const memberId = String(form.get("memberId") ?? "");
  const membershipId = String(form.get("membershipId") ?? ""), requestId = String(form.get("requestId") ?? "");
  const actor = { workspaceId: context.workspace.id, userId: context.session.userId };
  if (!await prisma.memberMembership.findFirst({ where: { id: membershipId, workspaceId: actor.workspaceId, memberId }, select: { id: true } })) return { error: "Membership not found for this person." };
  const mode = String(form.get("mode") ?? "");
  try {
    if (mode === "request") {
      const kind = String(form.get("kind") ?? "");
      if (!["CANCEL", "FREEZE", "WITHDRAW", "RESUME"].includes(kind)) return { error: "Choose a membership change." };
      await requestMembershipLifecycleChange(actor, { membershipId, kind: kind as MembershipLifecycleKind, operationKey: String(form.get("operationKey") ?? ""), fromDate: String(form.get("fromDate") ?? "") || undefined, toDate: String(form.get("toDate") ?? "") || undefined, reason: String(form.get("reason") ?? "") || undefined, parentRequestId: String(form.get("parentRequestId") ?? "") || undefined });
      revalidatePath(`/dashboard/members/${memberId}/billing`);
      return { message: "Request received. Its receipt and status appear below." };
    }
    if (!await prisma.membershipLifecycleRequest.findFirst({ where: { id: requestId, workspaceId: actor.workspaceId, membershipId }, select: { id: true } })) return { error: "Membership request not found for this person." };
    const rawDecision = String(form.get("noticeBillingDecision") ?? "");
    if (rawDecision && !["CONTINUE", "WAIVE_FUTURE"].includes(rawDecision)) return { error: "Choose a valid billing decision." };
    const override: MembershipLifecycleOverride = { effectiveOn: String(form.get("effectiveOn") ?? "") || undefined, noticeBillingDecision: rawDecision as MembershipLifecycleOverride["noticeBillingDecision"] || undefined, reason: String(form.get("overrideReason") ?? "") || undefined };
    if (mode === "review") return { review: await reviewMembershipLifecycleChange(actor, { requestId, override }) };
    if (mode === "approve" && form.get("confirmed") !== "on") return { review: previous.review, error: "Confirm that you reviewed the dates, renewals and classes." };
    const result = mode === "approve" ? await processMembershipLifecycleChange(actor, { requestId, reviewToken: String(form.get("reviewToken") ?? ""), override }) : mode === "check" ? await retryMembershipLifecycleChange(actor, requestId) : null;
    if (!result) return { error: "Choose a membership action." };
    revalidatePath(`/dashboard/members/${memberId}/billing`);
    return { message: ["CONFIRMED", "COMPLETE"].includes(result.state) ? "The payment provider confirmed the change. The saved receipt shows its dates and status." : "This change still needs confirmation or review. The saved receipt keeps its original date." };
  } catch (error) {
    if (error instanceof MembershipLifecycleError || error instanceof FinancialError) return { error: error.message, review: previous.review };
    throw error;
  }
}
