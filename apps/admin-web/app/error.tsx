"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { logoutAction } from "./actions/logout";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

let retryAttemptedAcrossRemount = false;
let clearRetryAttemptTimer: ReturnType<typeof setTimeout> | undefined;

export default function ErrorBoundary({
  error,
  reset,
}: ErrorBoundaryProps) {
  const [hasRetried, setHasRetried] = useState(
    () => retryAttemptedAcrossRemount,
  );
  const [isPending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const retryStartedRef = useRef(false);
  const isPersistent = hasRetried && !isPending;

  void error;

  useEffect(() => {
    if (!isPending) {
      headingRef.current?.focus();
    }
  }, [isPending, isPersistent]);

  useEffect(() => {
    if (clearRetryAttemptTimer) {
      clearTimeout(clearRetryAttemptTimer);
      clearRetryAttemptTimer = undefined;
    }

    return () => {
      if (retryAttemptedAcrossRemount) {
        clearRetryAttemptTimer = setTimeout(() => {
          retryAttemptedAcrossRemount = false;
          clearRetryAttemptTimer = undefined;
        }, 0);
      }
    };
  }, []);

  function handleRetry() {
    if (isPending || retryStartedRef.current) return;

    retryStartedRef.current = true;
    retryAttemptedAcrossRemount = true;
    startTransition(() => {
      setHasRetried(true);
      reset();
    });
  }

  return (
    <main
      aria-busy={isPending || undefined}
      className="auth-page"
      style={{ alignItems: "start", paddingTop: "clamp(4rem, 18vh, 9rem)" }}
    >
      <section
        className="auth-card"
        style={{
          borderColor: "var(--color-status-error-border)",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <p
          className="auth-eyebrow"
          style={{ color: "var(--color-status-error)" }}
        >
          Admin page unavailable
        </p>
        <h1 ref={headingRef} style={{ outline: "none" }} tabIndex={-1}>
          {isPersistent
            ? "This page still isn’t available"
            : "We couldn’t open this page"}
        </h1>
        <p className="auth-description">
          {isPersistent
            ? "Sign out and return to login."
            : "Try again once. If the page still won’t open, sign out and return to login."}
        </p>

        {isPending ? (
          <p
            aria-atomic="true"
            aria-live="polite"
            className="auth-description"
            role="status"
          >
            Trying again.
          </p>
        ) : null}

        <div className="form-stack">
          {!isPersistent ? (
            <button
              aria-disabled={isPending || undefined}
              className="button"
              onClick={handleRetry}
              type="button"
            >
              {isPending ? "Trying again…" : "Try again"}
            </button>
          ) : null}

          <form action={logoutAction}>
            <button
              className={isPersistent ? "button" : "button button-secondary"}
              style={{ width: "100%" }}
              type="submit"
            >
              Sign out and return to login
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
