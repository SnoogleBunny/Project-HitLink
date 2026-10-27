import type { ReactNode } from "react";
import { HitLinkBrand, ThemeToggle } from "@flowstate/ui";

type EntryShellIntent = "member-login" | "restricted" | "account-recovery";

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
  "account-recovery": {
    heading: "Your account access",
    description: "Recover your account with a single-use link. Your membership, bookings and records stay with your account.",
    footer: "Need help with your account email? Contact your gym team.",
  },
  "member-login": {
    heading: "Your member portal",
    description:
      "Book classes, check your membership and see your payments. Use the login supplied by your gym.",
    footer: "Need access? Ask your gym team.",
  },
  restricted: {
    heading: "Check your access",
    description: "Your gym team can check which member records you can access.",
    footer:
      "If something looks wrong, return to login or ask your gym team to check access.",
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
        <HitLinkBrand />
        <p className="member-entry-product">Member portal</p>
        <div className="member-entry-message">
          <h2 id="member-entry-context">{identity.heading}</h2>
          <p>{identity.description}</p>
        </div>
        <p className="member-entry-footer">{identity.footer}</p>
      </section>

      <section className="member-entry-task">
        <div className="member-entry-task-inner">
          <div className="hl-entry-theme">
            <ThemeToggle />
          </div>
          <p className="member-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="member-auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
