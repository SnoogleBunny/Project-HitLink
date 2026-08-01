import type { ReactNode } from "react";
import type { MemberPortalContext } from "../../lib/member-auth";
import { logoutAction } from "../actions/logout";
import { MemberNav } from "./member-nav";

interface MemberShellProps {
  children: ReactNode;
  context: MemberPortalContext;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function MemberShell({
  children,
  context,
  title,
  description,
  eyebrow = "Member portal",
  actions,
}: MemberShellProps) {
  return (
    <div className="member-shell">
      <header className="member-top-shell">
        <div className="member-identity-row">
          <div className="member-brand">
            <p className="member-gym-name">{context.workspace.name}</p>
            <p className="member-product-name">Flowstate member portal</p>
          </div>

          <div className="member-account-utility">
            <div>
              <p className="member-account-name">{context.session.displayName}</p>
              <p className="member-account-email">{context.session.email}</p>
            </div>
            <form action={logoutAction}>
              <button
                className="member-button member-button-secondary"
                type="submit"
              >
                Log out
              </button>
            </form>
          </div>
        </div>

        <div className="member-page-heading">
          <div>
            <p className="member-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="member-header-description">{description}</p>
          </div>
          {actions ? <div className="member-header-actions">{actions}</div> : null}
        </div>

        <div className="member-desktop-nav">
          <MemberNav ariaLabel="Member portal navigation" />
        </div>
      </header>

      <details className="member-mobile-menu">
        <summary>Menu</summary>
        <div className="member-mobile-menu-content">
          <MemberNav ariaLabel="Mobile member portal navigation" />
          <div className="member-mobile-account">
            <p>{context.member.fullName}</p>
            <p>{context.session.email}</p>
            <form action={logoutAction}>
              <button
                className="member-button member-button-secondary"
                type="submit"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </details>

      <main className="member-content">
        <div className="member-content-inner">{children}</div>
      </main>
    </div>
  );
}
