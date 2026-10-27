"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestResetAction } from "./actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestResetAction, {
    error: null,
    message: "",
  });
  return (
    <form action={action} className="member-form-stack" aria-busy={pending}>
      <label className="member-field">
        <span>Account email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
        />
      </label>
      {state.error ? (
        <p role="alert" className="member-form-error">
          {state.error}
        </p>
      ) : null}
      {state.message ? <p role="status">{state.message}</p> : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Requesting…" : "Request reset link"}
      </button>
      <Link href="/login" className="member-text-link">
        Back to sign in
      </Link>
    </form>
  );
}
