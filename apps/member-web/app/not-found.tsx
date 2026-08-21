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
      className="member-auth-page"
      style={{ alignItems: "start", paddingTop: "clamp(4rem, 18vh, 9rem)" }}
    >
      <section className="member-auth-card">
        <p
          className="member-eyebrow"
          style={{ color: "var(--member-sidebar)" }}
        >
          Page not found
        </p>
        <h1 ref={headingRef} style={{ outline: "none" }} tabIndex={-1}>
          This member page isn’t available
        </h1>
        <p className="member-auth-description">
          The address may be incorrect. Return to the member portal to continue.
        </p>
        <Link
          className="member-button"
          href="/"
          style={{ borderRadius: "999px", width: "100%" }}
        >
          Back to member portal
        </Link>
      </section>
    </main>
  );
}
