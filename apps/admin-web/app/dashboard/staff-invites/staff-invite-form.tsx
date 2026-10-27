"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../_components/submit-button";
import { emptyFormState } from "../../../lib/route-decisions";
import { createStaffInviteAction } from "./actions";

export function StaffInviteForm() {
  const [state, formAction] = useActionState(
    createStaffInviteAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Coach email</span>
        <input
          autoComplete="email"
          name="email"
          placeholder="coach@example.com"
          type="email"
          required
          maxLength={320}
        />
      </label>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Queuing invitation…">
        Invite coach
      </SubmitButton>
    </form>
  );
}
