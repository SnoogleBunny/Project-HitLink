"use client";

import { useActionState } from "react";
import { SubmitButton } from "../_components/submit-button";
import { emptyMemberLoginFormState } from "../form-states";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction] = useActionState(
    loginAction,
    emptyMemberLoginFormState,
  );

  return (
    <form
      action={formAction}
      aria-label="Member login"
      className="member-form-stack"
    >
      <label className="member-field">
        <span>Email</span>
        <input autoComplete="email" name="email" required type="email" />
      </label>

      <label className="member-field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
      </label>

      {state.error ? (
        <p className="member-form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Logging in...">Log in</SubmitButton>

      <p className="member-form-meta">
        Member access is provided by your gym. Ask the gym team if you need help
        with your portal login.
      </p>
    </form>
  );
}
