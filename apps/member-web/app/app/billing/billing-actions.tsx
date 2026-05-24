"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyBillingActionState } from "../../form-states";
import {
  retryOwnFailedPaymentAction,
  startPaymentMethodUpdateAction,
} from "./actions";

export function BillingActions({
  canUpdatePaymentMethod,
  canRetryPayment,
}: {
  canUpdatePaymentMethod: boolean;
  canRetryPayment: boolean;
}) {
  const [paymentMethodState, paymentMethodAction] = useActionState(
    startPaymentMethodUpdateAction,
    emptyBillingActionState,
  );
  const [retryState, retryAction] = useActionState(
    retryOwnFailedPaymentAction,
    emptyBillingActionState,
  );

  return (
    <div className="member-form-stack">
      <form action={paymentMethodAction} className="member-form-stack">
        {paymentMethodState.error ? (
          <p className="member-form-error">{paymentMethodState.error}</p>
        ) : null}
        <SubmitButton
          disabled={!canUpdatePaymentMethod}
          pendingLabel="Opening Stripe..."
        >
          {canUpdatePaymentMethod ? "Update payment method" : "Payment method unavailable"}
        </SubmitButton>
      </form>

      <form action={retryAction} className="member-form-stack">
        {retryState.error ? (
          <p className="member-form-error">{retryState.error}</p>
        ) : null}
        <SubmitButton
          disabled={!canRetryPayment}
          pendingLabel="Retrying payment..."
        >
          {canRetryPayment ? "Retry latest payment" : "Retry unavailable"}
        </SubmitButton>
      </form>
    </div>
  );
}
