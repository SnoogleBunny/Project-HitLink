import type { ReactNode } from "react";

type EntryShellIntent = "member-login" | "restricted";

interface EntryShellProps {
  children: ReactNode;
  description: string;
  eyebrow: string;
  intent: EntryShellIntent;
  title: string;
}

const identityCopy: Record<
  EntryShellIntent,
  { heading: string; description: string; footer: string }
> = {
  "member-login": {
    heading: "Member access, provided by your gym",
    description:
      "Your gym creates and manages your portal access. Once inside, your schedule and account details stay together in one clear place.",
    footer: "One gym. One member account. The essentials for training.",
  },
  restricted: {
    heading: "A protected space for gym members",
    description:
      "Portal access stays connected to the member record managed by your gym team.",
    footer: "If something looks wrong, return to login or ask your gym team to check access.",
  },
};

export function EntryShell({
  children,
  description,
  eyebrow,
  intent,
  title,
}: EntryShellProps) {
  const identity = identityCopy[intent];

  return (
    <main className="member-entry-shell">
      <section
        aria-labelledby="member-entry-context"
        className="member-entry-identity"
      >
        <div className="member-entry-mark" aria-hidden="true">
          F
        </div>
        <p className="member-entry-product">Flowstate member portal</p>
        <div className="member-entry-message">
          <p className="member-entry-kicker">Your training, in view</p>
          <h2 id="member-entry-context">{identity.heading}</h2>
          <p>{identity.description}</p>
        </div>
        <p className="member-entry-footer">{identity.footer}</p>
      </section>

      <section className="member-entry-task">
        <div className="member-entry-task-inner">
          <p className="member-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="member-auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
