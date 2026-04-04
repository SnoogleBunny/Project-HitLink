"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "../_components/submit-button";
import { loginAction } from "./actions";
import { emptyFormState } from "../../lib/admin-access";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, emptyFormState);

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Email</span>
        <input autoComplete="email" name="email" type="email" />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          name="password"
          type="password"
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Logging in...">Log in</SubmitButton>

      <p className="form-meta">
        Need an owner account?{" "}
        <Link className="text-link" href="/signup">
          Sign up
        </Link>
      </p>
    </form>
  );
}
