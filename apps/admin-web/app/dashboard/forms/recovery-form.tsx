"use client";
import { useActionState } from "react";
import {
  ownerFormRecoveryAction,
  type OwnerFormRecoveryState,
} from "./recoveries/actions";
export function OwnerFormRecoveryChoices(props: {
  recoveryId: string;
  version: number;
  state: string;
  operationId: string;
  replacements: Array<{ value: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(
    ownerFormRecoveryAction,
    {} as OwnerFormRecoveryState,
  );
  if (state.success) return <p role="status">{state.success}</p>;
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="recoveryId" value={props.recoveryId} />
      <input type="hidden" name="version" value={props.version} />
      <input type="hidden" name="operationId" value={props.operationId} />
      {props.state === "REFUND_REVIEW" ? (
        <button
          className="button button-secondary"
          name="choice"
          value="REFUND_CONFIRMED"
          disabled={pending}
        >
          Verify completed refund review
        </button>
      ) : (
        <>
          <label className="field">
            <span>Replacement class</span>
            <select name="replacement" defaultValue="">
              <option value="">Choose a replacement</option>
              {props.replacements.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="field-help">
              The dated class, forms, capacity and original funding are
              rechecked together. A failed move leaves the original seat and
              units unchanged.
            </span>
          </label>
          <button
            className="button button-secondary"
            name="choice"
            value="KEEP_BOOKING"
            disabled={pending}
          >
            Keep this booking with its completed forms
          </button>
          <button
            className="button button-secondary"
            name="choice"
            value="REBOOK"
            disabled={pending}
          >
            Rebook without a form-change penalty
          </button>
          <button
            className="button button-secondary"
            name="choice"
            value="CANCEL"
            disabled={pending}
          >
            Cancel and release original units
          </button>
          <button
            className="button button-primary"
            name="choice"
            value="REFUND_REVIEW"
            disabled={pending}
          >
            Cancel and open refund review
          </button>
        </>
      )}
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
