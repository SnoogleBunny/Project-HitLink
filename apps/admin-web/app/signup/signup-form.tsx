"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "../_components/submit-button";
import { emptyFormState } from "../../lib/route-decisions";
import { signupAction } from "./actions";

export function SignupForm() {
  const [state, formAction] = useActionState(signupAction, emptyFormState);

  return (
    <form action={formAction} className="form-stack">
      <label className="field">
        <span>Full name</span>
        <input autoComplete="name" name="fullName" type="text" />
      </label>

      <label className="field">
        <span>Email</span>
        <input autoComplete="email" name="email" type="email" />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          autoComplete="new-password"
          name="password"
          type="password"
        />
      </label>

      <label className="field">
        <span>Confirm password</span>
        <input
          autoComplete="new-password"
          name="confirmPassword"
          type="password"
        />
      </label>

      {state.error ? <p className="form-error">{state.error}</p> : null}

      <SubmitButton pendingLabel="Creating account...">
        Create account
      </SubmitButton>

      <p className="form-meta">
        Already have an account?{" "}
        <Link className="text-link" href="/login">
          Log in
        </Link>
      </p>
    </form>
  );
}
