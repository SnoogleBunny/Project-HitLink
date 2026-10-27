"use client";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Notice } from "@flowstate/ui";
import { workspaceDataAction } from "./actions";
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "Checking…" : label}
    </button>
  );
}
export function DataForm({
  intent,
  label,
  children,
}: {
  intent: string;
  label: string;
  children?: ReactNode;
}) {
  const [state, action] = useActionState(workspaceDataAction, {
    error: null,
    success: null,
  });
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="intent" value={intent} />
      {state.error ? (
        <Notice tone="danger" role="alert">
          {state.error}
        </Notice>
      ) : state.success ? (
        <Notice tone="success" role="status">
          {state.success}
        </Notice>
      ) : null}
      {children}
      <div className="dashboard-actions">
        <Submit label={label} />
      </div>
    </form>
  );
}
