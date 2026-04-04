import type { ReactNode } from "react";
import type { AppSession } from "@hitlink/auth";
import Link from "next/link";
import { logoutAction } from "../actions/logout";

interface AdminShellProps {
  children: ReactNode;
  session: AppSession;
  workspaceName: string;
}

export function AdminShell({
  children,
  session,
  workspaceName,
}: AdminShellProps) {
  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <span className="shell-brand-label">HitLink Admin</span>
          <h1>{workspaceName}</h1>
          <p>Owner operations for your first Slice 1 workspace.</p>
        </div>

        <nav className="shell-nav" aria-label="Admin navigation">
          <Link className="shell-nav-link active" href="/dashboard">
            Dashboard
          </Link>
          <span
            aria-disabled="true"
            className="shell-nav-link shell-nav-link-disabled"
          >
            Staff invites (next phase)
          </span>
        </nav>

        <div className="shell-sidebar-footer">
          <p className="shell-sidebar-caption">Signed in as</p>
          <p className="shell-sidebar-value">{session.displayName}</p>
          <p className="shell-sidebar-caption">{session.email}</p>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header">
          <div>
            <p className="shell-header-eyebrow">Protected dashboard</p>
            <h2>Workspace overview</h2>
          </div>

          <form action={logoutAction}>
            <button className="button button-secondary" type="submit">
              Log out
            </button>
          </form>
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
