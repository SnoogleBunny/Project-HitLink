"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { resetPasswordAction } from "./actions";
export function ResetPasswordForm() {
  const [token, setToken] = useState(""),
    [ready, setReady] = useState(false);
  const [state, action, pending] = useActionState(resetPasswordAction, {
    error: null,
    complete: false,
  });
  const readFragment = useRef(false);
  useEffect(() => {
    if (!readFragment.current) {
      readFragment.current = true;
      const value =
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      window.history.replaceState(null, "", window.location.pathname);
      setToken(/^[\w-]{43}$/.test(value) ? value : "");
      setReady(true);
    }
    // A second email link can target this same document. Reload the form state;
    // the fragment still never enters the HTTP request or consumes the token.
    const openNewLink = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).has("token")) {
        window.location.reload();
      }
    };
    window.addEventListener("hashchange", openNewLink);
    return () => window.removeEventListener("hashchange", openNewLink);
  }, []);
  if (state.complete)
    return (
      <div className="form-stack">
        <p role="status">
          Your password has changed and every device has been signed out.
        </p>
        <Link className="button" href="/login">
          Sign in with your new password
        </Link>
      </div>
    );
  if (!ready) return <p role="status">Opening your reset link…</p>;
  if (!token)
    return (
      <div className="form-stack">
        <p role="alert">
          This reset link is missing or invalid. Request a new link to continue.
        </p>
        <Link href="/forgot-password" className="text-link">
          Request a new reset link
        </Link>
      </div>
    );
  return (
    <form action={action} className="form-stack" aria-busy={pending}>
      <input name="token" type="hidden" value={token} />
      <label className="field">
        <span>Account email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
        />
      </label>
      <label className="field">
        <span>New password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
          aria-describedby="password-guidance"
        />
      </label>
      <p id="password-guidance">
        Use at least 12 characters and no more than 72 bytes. Emoji and accented
        characters can use more than one byte.
      </p>
      <label className="field">
        <span>Confirm new password</span>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          required
        />
      </label>
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      <button className="button" disabled={pending} type="submit">
        {pending
          ? "Changing password…"
          : "Change password and sign out all devices"}
      </button>
      <Link href="/forgot-password" className="text-link">
        Request a new reset link
      </Link>
    </form>
  );
}
