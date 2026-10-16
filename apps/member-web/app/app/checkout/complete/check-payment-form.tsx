"use client";
import { useActionState } from "react";
import { SubmitButton } from "../../../_components/submit-button";
import { checkCheckoutAction } from "./actions";
export function CheckPaymentForm({ operationId }: { operationId: string }) {
  const [state, action] = useActionState(checkCheckoutAction, { error: null });
  return <form action={action} className="member-stack-list">
    <input type="hidden" name="operationId" value={operationId} />
    {state.error ? <p className="member-form-error" role="alert">{state.error}</p> : null}
    <div><SubmitButton pendingLabel="Checking payment…">Check or resume payment</SubmitButton></div>
  </form>;
}
