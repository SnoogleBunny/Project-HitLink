"use client";
import { useActionState } from "react";
import { Notice } from "@flowstate/ui";
import { SubmitButton } from "../../../../_components/submit-button";
import { sourceRenewalAction } from "./source-renewal-action";
type Review = {
  membershipId: string;
  memberId: string;
  memberName: string;
  sourceSystem: string;
  sourceContractReference: string;
  sourceAccountReference: string | null;
  bindingPaidFrom: string;
  bindingNextRenewalOn: string;
  paidFrom: string;
  suggestedPaidThrough: string;
  reviewToken: string;
};
export function SourceRenewalForm({
  review,
  operationKey,
}: {
  review: Review;
  operationKey: string;
}) {
  const [state, action] = useActionState(sourceRenewalAction, {
    ok: false,
    message: "",
  });
  return (
    <section className="management-card">
      <h3>Billing remains with {review.sourceSystem}</h3>
      <p>
        {review.memberName}&apos;s current source payment covers classes before{" "}
        {review.paidFrom}. To extend access, review the next completed source
        payment and attach its receipt. Contract:{" "}
        {review.sourceContractReference}.
      </p>
      {state.message ? (
        <Notice
          tone={state.ok ? "success" : "warning"}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </Notice>
      ) : null}
      <details>
        <summary className="text-link">
          {review.sourceAccountReference
            ? "Record the next paid source period"
            : "Verify the original source account"}
        </summary>
        <form action={action} className="form-stack">
          <input
            type="hidden"
            name="membershipId"
            value={review.membershipId}
          />
          <input type="hidden" name="memberId" value={review.memberId} />
          <input type="hidden" name="reviewToken" value={review.reviewToken} />
          <input type="hidden" name="operationKey" value={operationKey} />
          <input
            type="hidden"
            name="bindingOnly"
            value={String(!review.sourceAccountReference)}
          />
          <input
            type="hidden"
            name="paidFrom"
            value={
              review.sourceAccountReference
                ? review.paidFrom
                : review.bindingPaidFrom
            }
          />
          <label className="field">
            <span>Original billing account reference</span>
            <input
              name="sourceAccountReference"
              required
              maxLength={200}
              defaultValue={review.sourceAccountReference ?? ""}
              readOnly={!!review.sourceAccountReference}
            />
          </label>
          {!review.sourceAccountReference ? (
            <>
              <p>
                Attach the original contract or paid receipt proving this
                account and contract. This records the binding without extending
                access or changing billing.
              </p>
              <input type="hidden" name="paidThrough" value={review.paidFrom} />
              <input
                type="hidden"
                name="nextRenewalOn"
                value={review.bindingNextRenewalOn}
              />
            </>
          ) : (
            <>
              <p>New paid period starts {review.paidFrom}.</p>
              <label className="field">
                <span>Paid through (classes on this date are excluded)</span>
                <input
                  type="date"
                  name="paidThrough"
                  required
                  min={review.paidFrom}
                  defaultValue={review.suggestedPaidThrough}
                />
              </label>
              <label className="field">
                <span>Next source renewal date</span>
                <input
                  type="date"
                  name="nextRenewalOn"
                  required
                  min={review.paidFrom}
                  defaultValue={review.suggestedPaidThrough}
                />
              </label>
            </>
          )}
          <label className="field">
            <span>Source payment receipt reference</span>
            <input name="sourceReference" required maxLength={1000} />
          </label>
          <label className="field">
            <span>Original paid receipt PDF</span>
            <input
              name="receipt"
              type="file"
              accept="application/pdf"
              required
            />
          </label>
          <SubmitButton pendingLabel="Recording source payment…">
            {review.sourceAccountReference
              ? "Record verified source period"
              : "Record source account binding"}
          </SubmitButton>
        </form>
      </details>
    </section>
  );
}
