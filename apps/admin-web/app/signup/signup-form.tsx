"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "../_components/submit-button";
import { emptyFormState } from "../../lib/route-decisions";
import { signupAction } from "./actions";

export function SignupForm() {
  const [state, formAction] = useActionState(signupAction, emptyFormState);

  return (
    <form action={formAction} className="form-stack" aria-label="Owner signup">
      <label className="field">
        <span>Full name</span>
        <input autoComplete="name" name="fullName" required type="text" />
      </label>

      <label className="field">
        <span>Email</span>
        <input autoComplete="email" name="email" required type="email" />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          autoComplete="new-password"
          name="password"
          minLength={12}
          maxLength={72}
          aria-describedby="signup-password-help"
          required
          type="password"
        />
      </label>

      <p id="signup-password-help" className="management-copy">
        Use at least 12 characters and no more than 72 bytes. Accented characters
        and emoji can use more than one byte.
      </p>

      <label className="field">
        <span>Confirm password</span>
        <input
          autoComplete="new-password"
          name="confirmPassword"
          minLength={12}
          maxLength={72}
          required
          type="password"
        />
      </label>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

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
