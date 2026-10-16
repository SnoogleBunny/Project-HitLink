"use server";
import {
  FinancialError,
  previewOwnerRefund,
  reserveOwnerRefund,
  previewOwnerCredit,
  issueOwnerCredit,
  previewOwnerCreditApplication,
  reserveOwnerCreditApplication,
  resumeOwnerAdjustment,
  previewConfirmedRefundAccess,
  resolveConfirmedRefundAccess,
} from "@flowstate/db";
import { createStripeAdjustmentGateway } from "@flowstate/payments";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  parseAdjustmentAmount,
  type AdjustmentFormState,
} from "../../../lib/financial-adjustment-form";

export async function reviewFinancialAdjustment(
  _previous: AdjustmentFormState,
  form: FormData,
): Promise<AdjustmentFormState> {
  const context = await requireOwnerWorkspaceContext();
  const values = Object.fromEntries(
    [
      "kind",
      "targetId",
      "amount",
      "currency",
      "reason",
      "disposition",
      "requestId",
    ].map((key) => [key, String(form.get(key) ?? "")]),
  );
  if (form.get("intent") === "edit") return { values };
  let operationId: string | undefined;
  try {
    const args = {
      workspaceId: context.workspace.id,
      actorUserId: context.session.userId,
    };
    const amountCents = parseAdjustmentAmount(values.amount!);
    const confirm = form.get("intent") === "confirm";
    const request = {
      amountCents,
      requestId: values.requestId!,
      reviewHash: String(form.get("reviewHash") ?? ""),
    };
    if (values.kind === "resolve-refund") {
      if (
        values.disposition !== "RETAIN_ACCESS" &&
        values.disposition !== "REVOKE_UNUSED_ACCESS"
      )
        throw new FinancialError("Choose what should happen to unused access.");
      if (!values.reason?.trim())
        throw new FinancialError(
          "Record why this access outcome is appropriate.",
        );
      const command = {
        ...args,
        operationId: values.targetId!,
        disposition: values.disposition as
          | "RETAIN_ACCESS"
          | "REVOKE_UNUSED_ACCESS",
        reason: values.reason!,
        requestId: request.requestId,
        reviewHash: request.reviewHash,
      };
      if (!confirm) {
        const current = await previewConfirmedRefundAccess(command),
          review = current.review;
        if (command.disposition === "REVOKE_UNUSED_ACCESS" && !review.canRevoke)
          throw new FinancialError(review.revokeUnavailableReason!);
        return {
          values,
          reviewHash: current.reviewHash,
          payer: review.payer,
          beneficiary: review.beneficiary,
          currency: review.currency,
          amountCents: current.operation.amountCents!,
          affectedBookings: review.bookings.map(
            (item) => `${item.title} · ${item.date}`,
          ),
          remainingVisits: review.card?.remainingPunches,
          hasCoaching: Boolean(review.coaching),
        };
      }
      operationId = (await resolveConfirmedRefundAccess(command)).id;
    } else if (values.kind === "refund") {
      if (
        values.disposition !== "RETAIN_ACCESS" &&
        values.disposition !== "REVOKE_UNUSED_ACCESS"
      )
        throw new FinancialError("Choose what should happen to unused access.");
      const command = {
        ...args,
        ...request,
        paymentId: values.targetId!,
        disposition: values.disposition as
          | "RETAIN_ACCESS"
          | "REVOKE_UNUSED_ACCESS",
        reason: values.reason!,
      };
      if (!confirm) {
        const review = await previewOwnerRefund(command);
        if (amountCents > review.refundableCents)
          throw new FinancialError(
            "The amount exceeds this payment's available refund balance.",
          );
        if (!review.onlineAvailable)
          throw new FinancialError(
            "The original processor payment needs reconciliation before refunding.",
          );
        if (values.disposition === "REVOKE_UNUSED_ACCESS" && !review.canRevoke)
          throw new FinancialError(review.revokeUnavailableReason!);
        if (!values.reason?.trim())
          throw new FinancialError("Record a reason for this refund.");
        return {
          values,
          reviewHash: review.reviewHash,
          payer: review.payer,
          beneficiary: review.beneficiary,
          currency: review.currency,
          amountCents,
          affectedBookings: review.bookings.map(
            (item) => `${item.title} · ${item.date}`,
          ),
          remainingVisits: review.card?.remainingPunches,
          hasCoaching: Boolean(review.coaching),
        };
      }
      operationId = (await reserveOwnerRefund(command)).id;
    } else if (values.kind === "issue-credit") {
      const command = {
        ...args,
        ...request,
        payerAccountId: values.targetId!,
        currency: values.currency!,
        reason: values.reason!,
      };
      if (!confirm) {
        const review = await previewOwnerCredit(command);
        return {
          values,
          reviewHash: review.reviewHash,
          payer: review.payer,
          currency: review.currency,
          amountCents,
        };
      }
      operationId = (await issueOwnerCredit(command)).id;
    } else if (values.kind === "apply-credit") {
      const command = { ...args, ...request, creditId: values.targetId! };
      if (!confirm) {
        const review = await previewOwnerCreditApplication(command);
        if (!review.canApply)
          throw new FinancialError(
            "This payer needs a matching membership and verified processor customer before using this credit.",
          );
        if (amountCents > review.availableCents)
          throw new FinancialError(
            "The amount exceeds the available credit balance.",
          );
        return {
          values,
          reviewHash: review.reviewHash,
          payer: review.payer,
          currency: review.currency,
          amountCents,
        };
      }
      operationId = (await reserveOwnerCreditApplication(command)).id;
    } else
      throw new FinancialError("Open a valid financial review to continue.");
    if (values.kind !== "issue-credit" && values.kind !== "resolve-refund") {
      // Reservation commits before any provider request. A missing provider setup leaves a recoverable request.
      try {
        await resumeOwnerAdjustment({
          ...args,
          operationId,
          gateway: createStripeAdjustmentGateway(),
        });
      } catch {
        /* The status page retains the durable reservation and allows the same request to resume. */
      }
    }
  } catch (error) {
    return {
      values,
      error:
        error instanceof FinancialError
          ? error.message
          : "This request could not be saved. Refresh the review before trying again.",
    };
  }
  revalidatePath("/dashboard/billing");
  revalidatePath("/app/billing");
  revalidatePath("/app/schedule");
  redirect(`/dashboard/billing/operations/${operationId}`);
}

export async function resumeFinancialAdjustment(form: FormData) {
  const context = await requireOwnerWorkspaceContext();
  const operationId = String(form.get("operationId") ?? "");
  let error: string | undefined;
  try {
    await resumeOwnerAdjustment({
      workspaceId: context.workspace.id,
      actorUserId: context.session.userId,
      operationId,
      gateway: createStripeAdjustmentGateway(),
    });
  } catch (problem) {
    error =
      problem instanceof FinancialError
        ? problem.message
        : "The processor could not be checked. The original request is still saved.";
  }
  revalidatePath("/dashboard/billing");
  revalidatePath("/app/billing");
  revalidatePath("/app/schedule");
  redirect(
    `/dashboard/billing/operations/${encodeURIComponent(operationId)}${error ? `?error=${encodeURIComponent(error)}` : ""}`,
  );
}
