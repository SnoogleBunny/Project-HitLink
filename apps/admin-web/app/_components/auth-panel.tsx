import type { ReactNode } from "react";

interface AuthPanelProps {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
}

export function AuthPanel({
  children,
  eyebrow,
  title,
  description,
}: AuthPanelProps) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        {eyebrow ? <p className="auth-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
    </main>
  );
}
