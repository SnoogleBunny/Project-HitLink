import type { ReactNode } from "react";
import type { AppSession } from "@flowstate/auth";
import { logoutAction } from "../actions/logout";
import { AdminNav } from "./admin-nav";

interface AdminShellProps {
  children: ReactNode;
  session: AppSession;
  workspaceName: string;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function AdminShell({
  children,
  session,
  workspaceName,
  title,
  description,
  eyebrow = "Protected dashboard",
  actions,
}: AdminShellProps) {
  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <span className="shell-brand-label">Flowstate Admin</span>
          <h1>{workspaceName}</h1>
          <p>Daily operations for the current scheduling slice.</p>
        </div>

        <AdminNav role={session.role} />

        <div className="shell-sidebar-footer">
          <p className="shell-sidebar-caption">Signed in as</p>
          <p className="shell-sidebar-value">{session.displayName}</p>
          <p className="shell-sidebar-caption">{session.email}</p>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header">
          <div>
            <p className="shell-header-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p className="shell-header-description">{description}</p>
          </div>

          <div className="shell-header-actions">
            {actions}
            <form action={logoutAction}>
              <button className="button button-secondary" type="submit">
                Log out
              </button>
            </form>
          </div>
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
