"use client";
import { useActionState } from "react";
import { Money, Notice } from "@flowstate/ui";
import { SubmitButton } from "../../../../_components/submit-button";
import { recordSourceRefundAction } from "./source-refund-action";
export function SourceRefundForm({
  caseId,
  review,
}: {
  caseId: string;
  review: {
    sourceSystem: string;
    sourcePaymentReference: string;
    currency: string;
    remainingCents: number;
    reviewToken: string;
    canRecord: boolean;
  };
}) {
  const [state, action] = useActionState(recordSourceRefundAction, {
    message: "",
    ok: false,
  });
  return (
    <section className="management-card">
      <h3>Refund through {review.sourceSystem}</h3>
      <p>
        Original payment: {review.sourcePaymentReference}. Refund the payer
        through that system, then attach its completed refund receipt here.
      </p>
      <p>
        Balance for this cancelled class:{" "}
        <Money amountMinor={review.remainingCents} currency={review.currency} />
      </p>
      {state.message ? (
        <Notice tone={state.ok ? "success" : "warning"}>{state.message}</Notice>
      ) : null}
      {review.canRecord ? (
        <form action={action} className="form-stack">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="reviewToken" value={review.reviewToken} />
          <label className="field"><span>Source refund reference</span><input name="sourceReference" required maxLength={200} />
          </label>
          <label className="field"><span>Refund amount ({review.currency.toUpperCase()})</span><input
              name="amount"
              type="number"
              min="0.01"
              max={(review.remainingCents / 100).toFixed(2)}
              step="0.01"
              required
              defaultValue={(review.remainingCents / 100).toFixed(2)}
            />
          </label>
          <label className="field"><span>Receipt timestamp with timezone</span><input
              name="refundedAt"
              required
              placeholder="2026-10-16T14:30:00-07:00"
            />
          </label>
          <label className="field"><span>Original refund PDF</span><input
              name="receipt"
              type="file"
              accept="application/pdf"
              required
            />
          </label>
          <label className="field"><span>Reason</span><textarea
              name="reason"
              required
              maxLength={1000}
              defaultValue="Gym cancelled the class"
            />
          </label>
          <SubmitButton pendingLabel="Recording receipt…">
            Record completed source refund
          </SubmitButton>
        </form>
      ) : (
        <Notice>
          Resolve the class cancellation and current payment review before
          adding a receipt.
        </Notice>
      )}
    </section>
  );
}
