"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
export default function NotFound() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p>404 · Page not found</p>
        <h1 ref={heading} tabIndex={-1}>
          This page is not available.
        </h1>
        <p>
          Check the address or return to your member account. Your gym can send
          you its current public website link.
        </p>
        <Link className="button" href="/login">
          Open member portal
        </Link>
      </section>
    </main>
  );
}
