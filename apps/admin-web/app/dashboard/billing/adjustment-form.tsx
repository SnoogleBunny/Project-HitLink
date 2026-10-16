"use client";
import { useActionState } from "react";
import { Money, Notice } from "@flowstate/ui";
import { SubmitButton } from "../../_components/submit-button";
import type { AdjustmentFormState } from "../../../lib/financial-adjustment-form";
import { reviewFinancialAdjustment } from "./adjustment-actions";

export function AdjustmentForm({
  initialValues,
  maxCents,
  disabled = false,
}: {
  initialValues: Record<string, string>;
  maxCents?: number;
  disabled?: boolean;
}) {
  const [state, action] = useActionState<AdjustmentFormState, FormData>(
    reviewFinancialAdjustment,
    { values: initialValues },
  );
  const values = state.values;
  const refund = values.kind === "refund" || values.kind === "resolve-refund",
    issue = values.kind === "issue-credit";
  const review = Boolean(state.reviewHash);
  const accessOnly = values.kind === "resolve-refund";
  return (
    <form action={action} className="form-stack hl-adjustment-form">
      {accessOnly ? (
        <Notice>
          The refund is already confirmed. This review changes access only; no
          further money is returned.
        </Notice>
      ) : null}
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      {["kind", "targetId", "requestId"].map((key) => (
        <input key={key} type="hidden" name={key} value={values[key]} />
      ))}
      {review ? (
        <>
          <input type="hidden" name="reviewHash" value={state.reviewHash} />
          {["amount", "currency", "reason", "disposition"].map((key) => (
            <input
              key={key}
              type="hidden"
              name={key}
              value={values[key] ?? ""}
            />
          ))}
          <h3>
            Review{" "}
            {accessOnly
              ? "access outcome"
              : refund
                ? "refund"
                : issue
                  ? "credit"
                  : "credit transfer"}
          </h3>
          <dl className="detail-list">
            <div>
              <dt>Payer</dt>
              <dd>{state.payer}</dd>
            </div>
            {state.beneficiary ? (
              <div>
                <dt>For</dt>
                <dd>{state.beneficiary}</dd>
              </div>
            ) : null}
            <div>
              <dt>Amount</dt>
              <dd>
                <Money
                  amountMinor={state.amountCents!}
                  currency={state.currency!}
                />
              </dd>
            </div>
            {values.reason ? (
              <div>
                <dt>Reason</dt>
                <dd>{values.reason}</dd>
              </div>
            ) : null}
          </dl>
          {refund ? (
            <>
              <Notice tone="warning">
                {values.disposition === "RETAIN_ACCESS"
                  ? "Class reservations, unused visits and coaching access will remain available."
                  : accessOnly
                    ? "The listed future reservations will be cancelled and the remaining access from this purchase will end. Past attendance stays recorded."
                    : "After the processor confirms the refund, the listed future reservations will be cancelled and the remaining access from this purchase will end. Access stays on hold while the result is uncertain."}{" "}
                A refund does not stop future membership billing.
              </Notice>
              {state.remainingVisits !== undefined ? (
                <p>
                  {state.remainingVisits} unused visits currently available.
                </p>
              ) : null}
              {state.affectedBookings?.length ? (
                <>
                  <h4>Future reservations</h4>
                  <ul>
                    {state.affectedBookings.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  No future class reservations are attached to this payment.
                </p>
              )}
              {state.hasCoaching ? (
                <p>
                  {values.disposition === "RETAIN_ACCESS"
                    ? "The coaching program will remain open."
                    : "The coaching program will close and unused future appointments will be cancelled. Published client records remain available for the agreed retrieval period."}
                </p>
              ) : null}
            </>
          ) : (
            <Notice>
              This credit belongs to {state.payer}, has no expiry, and can be
              applied to a membership invoice in the same currency. Class packs
              and drop-in purchases cannot use it yet.
              {!issue
                ? " This transfers the credit to the processor balance; an invoice is only settled after the processor confirms it."
                : " Issuing credit does not return cash or change existing access."}
            </Notice>
          )}
          <div className="dashboard-actions">
            <SubmitButton name="intent" value="confirm" pendingLabel="Saving…">
              Confirm{" "}
              {accessOnly
                ? "access outcome"
                : refund
                  ? "refund"
                  : issue
                    ? "credit"
                    : "transfer"}
            </SubmitButton>
            <SubmitButton
              name="intent"
              value="edit"
              className="button button-secondary"
              pendingLabel="Opening…"
            >
              Edit details
            </SubmitButton>
          </div>
        </>
      ) : (
        <>
          {accessOnly ? (
            <input type="hidden" name="amount" value={values.amount} />
          ) : (
            <>
              <label>
                Amount
                <input
                  name="amount"
                  inputMode="decimal"
                  type="text"
                  required
                  defaultValue={values.amount}
                  disabled={disabled}
                  aria-describedby="amount-help"
                />
              </label>
              <p id="amount-help" className="muted-text">
                {maxCents !== undefined ? (
                  <>
                    Available:{" "}
                    <Money
                      amountMinor={maxCents}
                      currency={values.currency ?? "cad"}
                    />
                    .
                  </>
                ) : (
                  "Use two decimal places."
                )}
              </p>
            </>
          )}
          {issue ? (
            <label>
              Currency
              <select name="currency" defaultValue={values.currency ?? "cad"}>
                <option value="cad">CAD</option>
                <option value="usd">USD</option>
              </select>
            </label>
          ) : (
            <input
              type="hidden"
              name="currency"
              value={values.currency ?? "cad"}
            />
          )}
          {refund ? (
            <label>
              Unused access
              <select
                name="disposition"
                required
                defaultValue={values.disposition ?? ""}
              >
                <option value="" disabled>
                  Choose an outcome
                </option>
                <option value="RETAIN_ACCESS">
                  Keep current access and reservations
                </option>
                <option value="REVOKE_UNUSED_ACCESS">
                  End unused access and cancel future reservations
                </option>
              </select>
            </label>
          ) : null}
          {refund || issue ? (
            <label>
              Reason
              <textarea
                name="reason"
                required
                maxLength={1000}
                defaultValue={values.reason ?? ""}
              />
            </label>
          ) : null}
          <SubmitButton
            name="intent"
            value="review"
            disabled={disabled}
            pendingLabel="Reviewing…"
          >
            Review{" "}
            {accessOnly
              ? "access outcome"
              : refund
                ? "refund"
                : issue
                  ? "credit"
                  : "transfer"}
          </SubmitButton>
        </>
      )}
    </form>
  );
}
