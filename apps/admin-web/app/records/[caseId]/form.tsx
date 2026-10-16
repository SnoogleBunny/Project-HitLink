"use client";
import { useActionState, type ReactNode } from "react";
import { Button, Notice } from "@flowstate/ui";
import { retentionAction } from "./actions";
export function RetentionForm({
  caseId,
  version,
  intent,
  label,
  children,
}: {
  caseId: string;
  version: number;
  intent: string;
  label: string;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(retentionAction, {
    error: null,
    success: null,
  });
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="intent" value={intent} />
      {children}
      <label className="field-checkbox">
        <input type="checkbox" name="confirmed" required /> I reviewed this
        action and its scope.
      </label>
      <div className="dashboard-actions">
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : label}
        </Button>
      </div>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
    </form>
  );
}
