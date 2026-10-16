"use server";
import { revalidatePath } from "next/cache";
import {
  prisma,
  getZonedDateTimeAsUtc,
  isUnambiguousClassTime,
  recordSourceMembershipLifecycleEvidence,
  requestMembershipLifecycleChange,
  reviewMembershipLifecycleChange,
  MembershipLifecycleError,
  FinancialError,
  type MembershipLifecycleKind,
  type MembershipLifecycleOverride,
} from "@flowstate/db";
import {
  processMembershipLifecycleChange,
  retryMembershipLifecycleChange,
} from "@flowstate/payments";
import type { LifecycleFormState } from "@flowstate/ui";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
export async function ownerLifecycleAction(
  previous: LifecycleFormState,
  form: FormData,
): Promise<LifecycleFormState> {
  const context = await requireOwnerWorkspaceContext();
  const memberId = String(form.get("memberId") ?? "");
  const membershipId = String(form.get("membershipId") ?? ""),
    requestId = String(form.get("requestId") ?? "");
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const membership = await prisma.memberMembership.findFirst({
    where: { id: membershipId, workspaceId: actor.workspaceId, memberId },
    select: { id: true, allowanceTimezone: true },
  });
  if (!membership) return { error: "Membership not found for this person." };
  const mode = String(form.get("mode") ?? "");
  try {
    if (mode === "request") {
      const kind = String(form.get("kind") ?? "");
      if (!["CANCEL", "FREEZE", "WITHDRAW", "RESUME"].includes(kind))
        return { error: "Choose a membership change." };
      await requestMembershipLifecycleChange(actor, {
        membershipId,
        kind: kind as MembershipLifecycleKind,
        operationKey: String(form.get("operationKey") ?? ""),
        fromDate: String(form.get("fromDate") ?? "") || undefined,
        toDate: String(form.get("toDate") ?? "") || undefined,
        reason: String(form.get("reason") ?? "") || undefined,
        parentRequestId: String(form.get("parentRequestId") ?? "") || undefined,
      });
      revalidatePath(`/dashboard/members/${memberId}/billing`);
      return {
        message: "Request received. Its receipt and status appear below.",
      };
    }
    if (
      !(await prisma.membershipLifecycleRequest.findFirst({
        where: { id: requestId, workspaceId: actor.workspaceId, membershipId },
        select: { id: true },
      }))
    )
      return { error: "Membership request not found for this person." };
    const rawDecision = String(form.get("noticeBillingDecision") ?? "");
    if (rawDecision && !["CONTINUE", "WAIVE_FUTURE"].includes(rawDecision))
      return { error: "Choose a valid billing decision." };
    const override: MembershipLifecycleOverride = {
      effectiveOn: String(form.get("effectiveOn") ?? "") || undefined,
      noticeBillingDecision:
        (rawDecision as MembershipLifecycleOverride["noticeBillingDecision"]) ||
        undefined,
      reason: String(form.get("overrideReason") ?? "") || undefined,
    };
    if (mode === "review")
      return {
        review: await reviewMembershipLifecycleChange(actor, {
          requestId,
          override,
        }),
      };
    if (
      ["approve", "source-evidence"].includes(mode) &&
      form.get("confirmed") !== "on"
    )
      return {
        review: previous.review,
        error: "Confirm that you reviewed the dates, renewals and classes.",
      };
    if (mode === "source-evidence") {
      const file = form.get("sourceReceipt");
      if (!(file instanceof File) || file.size > 5_000_000)
        return {
          review: previous.review,
          error: "Attach the original source receipt PDF, up to 5 MB.",
        };
      const stamp = String(form.get("sourceConfirmedAt") ?? "");
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stamp))
        return {
          review: previous.review,
          error: "Choose the source confirmation date and time.",
        };
      const timezone =
        membership.allowanceTimezone ?? context.location.timezone;
      const [date, time] = stamp.split("T"),
        [hour, minute] = time!.split(":").map(Number),
        minutes = hour! * 60 + minute!;
      if (!isUnambiguousClassTime(date!, minutes, timezone))
        return {
          review: previous.review,
          error:
            "That local time is missing or ambiguous. Use the unambiguous source confirmation time.",
        };
      const confirmedAt = getZonedDateTimeAsUtc({
        dateString: date!,
        minutes,
        timezone,
      }).toISOString();
      const request = await recordSourceMembershipLifecycleEvidence(actor, {
        requestId,
        reviewToken: String(form.get("reviewToken") ?? ""),
        override,
        operationKey: String(form.get("operationKey") ?? ""),
        sourceAccountReference: String(
          form.get("sourceAccountReference") ?? "",
        ),
        sourceContractReference: String(
          form.get("sourceContractReference") ?? "",
        ),
        sourceReference: String(form.get("sourceReference") ?? ""),
        evidenceState: String(form.get("evidenceState")) as
          | "CONFIGURED"
          | "COMPLETED",
        confirmedAt,
        receiptData: new Uint8Array(await file.arrayBuffer()),
        billingAndAccessConfirmed: form.get("sourceConfirmed") === "on",
      });
      revalidatePath(`/dashboard/members/${memberId}/billing`);
      return {
        message:
          request.state === "SOURCE_SCHEDULED"
            ? "Configured source change recorded. The gym must confirm its completed result at the effective date."
            : "Original-system receipt recorded. Review the saved membership status; billing stays with that system.",
      };
    }
    const result =
      mode === "approve"
        ? await processMembershipLifecycleChange(actor, {
            requestId,
            reviewToken: String(form.get("reviewToken") ?? ""),
            override,
          })
        : mode === "check"
          ? await retryMembershipLifecycleChange(actor, requestId)
          : null;
    if (!result) return { error: "Choose a membership action." };
    revalidatePath(`/dashboard/members/${memberId}/billing`);
    return {
      message: ["CONFIRMED", "COMPLETE"].includes(result.state)
        ? "The payment provider confirmed the change. The saved receipt shows its dates and status."
        : "This change still needs confirmation or review. The saved receipt keeps its original date.",
    };
  } catch (error) {
    if (
      error instanceof MembershipLifecycleError ||
      error instanceof FinancialError
    )
      return { error: error.message, review: previous.review };
    throw error;
  }
}
