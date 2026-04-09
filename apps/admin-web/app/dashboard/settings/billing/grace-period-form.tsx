"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../../_components/submit-button";
import { emptyFormState } from "../../../../lib/route-decisions";
import { updateFailedPaymentGracePeriodAction } from "./actions";

export function GracePeriodForm({
  failedPaymentGracePeriodDays,
}: {
  failedPaymentGracePeriodDays: number;
}) {
  const [state, formAction] = useActionState(
    updateFailedPaymentGracePeriodAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Failed payment grace period days</span>
        <input
          defaultValue={failedPaymentGracePeriodDays}
          max="60"
          min="0"
          name="failedPaymentGracePeriodDays"
          type="number"
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving grace period...">
        Save grace period
      </SubmitButton>
    </form>
  );
}
