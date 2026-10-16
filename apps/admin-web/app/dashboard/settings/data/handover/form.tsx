"use client";
import { useActionState, type ReactNode } from "react";
import { Button, Notice } from "@flowstate/ui";
import { ownerHandoverAction } from "./actions";
export function HandoverForm({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [state, action, pending] = useActionState(ownerHandoverAction, {
    error: null,
    success: null,
  });
  return (
    <form action={action} className="form-stack">
      {children}
      <label className="field-checkbox">
        <input type="checkbox" name="confirmed" required /> I reviewed the exact
        balances, payer authority and receiving responsibilities.
      </label>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Checking handover…" : label}
        </Button>
      </div>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
    </form>
  );
}
