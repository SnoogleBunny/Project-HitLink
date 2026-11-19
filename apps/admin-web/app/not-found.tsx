"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export default function NotFound() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main
      className="auth-page"
      style={{ alignItems: "start", paddingTop: "clamp(4rem, 18vh, 9rem)" }}
    >
      <section
        className="auth-card"
        style={{ boxShadow: "var(--shadow-xs)" }}
      >
        <p className="auth-eyebrow">Page not found</p>
        <h1 ref={headingRef} style={{ outline: "none" }} tabIndex={-1}>
          This admin page isn’t available
        </h1>
        <p className="auth-description">
          The address may be incorrect. Return to Flowstate admin to continue.
        </p>
        <Link className="button" href="/">
          Back to Flowstate admin
        </Link>
      </section>
    </main>
  );
}
