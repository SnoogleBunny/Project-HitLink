"use client";
import { useActionState } from "react";
import { Button, Notice } from "@flowstate/ui";
import { acceptHandoverAction } from "./actions";
export function AcceptHandoverForm({
  id,
  fingerprint,
}: {
  id: string;
  fingerprint: string;
}) {
  const [state, action, pending] = useActionState(acceptHandoverAction, {
    error: null,
    success: null,
  });
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="handoverId" value={id} />
      <input type="hidden" name="fingerprint" value={fingerprint} />
      <label className="field">
        <span>My acceptance receipt or agreement reference</span>
        <input name="evidenceReference" required maxLength={1000} />
      </label>
      <label className="field-checkbox">
        <input name="confirmed" type="checkbox" required /> I accept
        responsibility for the exact remaining packs and credits, the named
        billing arrangements and source dispositions shown above. I have
        reviewed payer authority. No card transfer or new payer authorization is
        implied.
      </label>
      <div>
        <Button disabled={pending} type="submit">
          {pending ? "Recording acceptance…" : "Accept this handover"}
        </Button>
      </div>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.success ? <Notice tone="success">{state.success}</Notice> : null}
    </form>
  );
}
