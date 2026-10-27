"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { verifySetupOwnerAction } from "../actions";
export function SetupVerificationForm() {
  const [token, setToken] = useState(""),
    [ready, setReady] = useState(false);
  const read = useRef(false);
  const [state, action, pending] = useActionState(verifySetupOwnerAction, {
    error: null,
    verified: false,
  });
  useEffect(() => {
    if (!read.current) {
      read.current = true;
      const value =
        new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      window.history.replaceState(null, "", window.location.pathname);
      setToken(/^[\w-]{43}$/.test(value) ? value : "");
      setReady(true);
    }
    const newLink = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).has("token"))
        window.location.reload();
    };
    window.addEventListener("hashchange", newLink);
    return () => window.removeEventListener("hashchange", newLink);
  }, []);
  if (!ready) return <p role="status">Opening verification link…</p>;
  if (state.verified)
    return (
      <section className="management-card form-stack">
        <p role="status">
          Your owner email is verified. Review the business snapshot within 15
          minutes to activate.
        </p>
        <Link className="button" href="/dashboard/setup">
          Review business setup
        </Link>
      </section>
    );
  if (!token)
    return (
      <section className="management-card form-stack">
        <p role="alert">
          This verification link is missing or invalid. Request a new link.
        </p>
        <Link href="/dashboard/setup">Return to business setup</Link>
      </section>
    );
  return (
    <form
      action={action}
      className="management-card form-stack"
      aria-busy={pending}
    >
      <input type="hidden" name="token" value={token} />
      <p>
        Verification proves access to your owner email. It does not activate the
        business, send customer messages or authorize a payment.
      </p>
      {state.error ? (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify my owner email"}
      </button>
      <Link href="/dashboard/setup">Return to business setup</Link>
    </form>
  );
}
