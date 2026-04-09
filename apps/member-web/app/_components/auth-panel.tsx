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
    <main className="member-auth-page">
      <section className="member-auth-card">
        {eyebrow ? <p className="member-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p className="member-auth-description">{description}</p>
        {children}
      </section>
    </main>
  );
}
