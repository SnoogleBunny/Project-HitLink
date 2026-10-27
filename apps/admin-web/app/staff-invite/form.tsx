"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { acceptStaffInviteAction } from "./actions";
export function StaffInviteAcceptanceForm() {
  const [token, setToken] = useState(""),
    [ready, setReady] = useState(false);
  const [state, action, pending] = useActionState(acceptStaffInviteAction, {
    error: null,
    complete: false,
  });
  const read = useRef(false);
  useEffect(() => {
    if (!read.current) {
      read.current = true;
      const value =
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      window.history.replaceState(null, "", window.location.pathname);
      setToken(/^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : "");
      setReady(true);
    }
    const openLink = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).has("token"))
        window.location.reload();
    };
    window.addEventListener("hashchange", openLink);
    return () => window.removeEventListener("hashchange", openLink);
  }, []);
  if (state.complete)
    return (
      <div className="form-stack">
        <p role="status">
          Your coach invitation is accepted. Sign in to continue when the owner
          has finished preparing the workspace.
        </p>
        <Link className="button" href="/login">
          Sign in
        </Link>
      </div>
    );
  if (!ready) return <p role="status">Opening your invitation…</p>;
  if (!token)
    return (
      <p role="alert">
        This invitation link is missing or invalid. Ask the owner for a new
        invitation.
      </p>
    );
  return (
    <form action={action} className="form-stack" aria-busy={pending}>
      <input type="hidden" name="token" value={token} />
      <label className="field">
        <span>Invited email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={320}
        />
      </label>
      <label className="field">
        <span>Full name for a new account</span>
        <input name="fullName" autoComplete="name" maxLength={160} />
      </label>
      <label className="field">
        <span>Account password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={72}
          aria-describedby="invite-password-help"
        />
      </label>
      <p id="invite-password-help">
        Use your existing account password. For a new account, choose at least
        12 characters and no more than 72 bytes.
      </p>
      <p>
        Accepting adds coach access only to the workspace that sent this
        invitation. If this email already has workspace access, ask its owner to
        manage your role.
      </p>
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Accepting…" : "Accept coach invitation"}
      </button>
      <Link className="text-link" href="/forgot-password">
        Reset an existing account password
      </Link>
    </form>
  );
}
