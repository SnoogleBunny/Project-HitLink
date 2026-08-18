"use client";

import { type ReactNode, useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "../../../_components/submit-button";
import { emptyFormState } from "../../../../lib/route-decisions";
import { updateFailedPaymentGracePeriodAction } from "./actions";

function FocusedAlert({ children, id }: { children: ReactNode; id?: string }) {
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alertRef.current?.focus();
  }, []);

  return (
    <div
      aria-atomic="true"
      className="form-error"
      id={id}
      ref={alertRef}
      role="alert"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

export function BillingSettingsRecoveryAlert({ message }: { message: string }) {
  return (
    <FocusedAlert>
      <strong>Stripe connection unavailable</strong>
      <p>{message}</p>
    </FocusedAlert>
  );
}

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
          aria-describedby={state.error ? "grace-period-error" : undefined}
          aria-invalid={state.error ? true : undefined}
          defaultValue={failedPaymentGracePeriodDays}
          max="60"
          min="0"
          name="failedPaymentGracePeriodDays"
          step="1"
          type="number"
        />
      </label>

      {state.error ? (
        <FocusedAlert id="grace-period-error">{state.error}</FocusedAlert>
      ) : null}

      <SubmitButton pendingLabel="Saving grace period...">
        Save grace period
      </SubmitButton>
    </form>
  );
}
