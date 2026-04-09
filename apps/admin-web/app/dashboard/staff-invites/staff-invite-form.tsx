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
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Saving invite...">
        Invite coach
      </SubmitButton>
    </form>
  );
}
