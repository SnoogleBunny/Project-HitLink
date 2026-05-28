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
      <aside className="member-sidebar">
        <div className="member-brand">
          <p className="member-eyebrow">Flowstate Member</p>
          <h1>{context.workspace.name}</h1>
          <p>{context.member.fullName}</p>
        </div>

        <MemberNav />

        <div className="member-sidebar-footer">
          <p className="member-sidebar-label">Signed in as</p>
          <p className="member-sidebar-value">{context.session.displayName}</p>
          <p className="member-sidebar-label">{context.session.email}</p>
        </div>
      </aside>

      <div className="member-main">
        <header className="member-header">
          <div>
            <p className="member-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p className="member-header-description">{description}</p>
          </div>

          <div className="member-header-actions">
            {actions}
            <form action={logoutAction}>
              <button className="member-button member-button-secondary" type="submit">
                Log out
              </button>
            </form>
          </div>
        </header>

        <main className="member-content">{children}</main>
      </div>
    </div>
  );
}
