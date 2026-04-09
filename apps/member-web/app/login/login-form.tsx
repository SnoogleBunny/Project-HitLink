"use client";

import { useActionState } from "react";
import { SubmitButton } from "../_components/submit-button";
import { emptyMemberLoginFormState, loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction] = useActionState(
    loginAction,
    emptyMemberLoginFormState,
  );

  return (
    <form action={formAction} className="member-form-stack">
      <label className="member-field">
        <span>Email</span>
        <input autoComplete="email" name="email" type="email" />
      </label>

      <label className="member-field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          name="password"
          type="password"
        />
      </label>

      {state.error ? <p className="member-form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Logging in...">Log in</SubmitButton>

      <p className="member-form-meta">
        Member access is provisioned by the gym. Ask staff if you do not have a
        portal login yet.
      </p>
    </form>
  );
}
