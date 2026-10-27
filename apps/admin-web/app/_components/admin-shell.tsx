import type { ReactNode } from "react";
import Link from "next/link";
import type { AppSession } from "@flowstate/auth";
import { WorkspaceShell } from "@flowstate/ui";
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

/** Page-level heading; persistent chrome is owned by dashboard/layout. */
export function AdminShell({
  children,
  title,
  description,
  actions,
}: AdminShellProps) {
  return (
    <div className="hl-route">
      <header className="hl-page-heading">
        <div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? (
          <div className="hl-page-heading-actions">{actions}</div>
        ) : null}
      </header>
      <div className="hl-route-content">{children}</div>
    </div>
  );
}

export function AdminWorkspace({
  children,
  session,
  workspaceName,
}: Pick<AdminShellProps, "children" | "session" | "workspaceName">) {
  const roleLabel =
    session.role === "COACH" ? "Coach workspace" : "Gym workspace";
  return (
    <WorkspaceShell
      workspaceName={workspaceName}
      contextLabel={roleLabel}
      navigation={<AdminNav role={session.role} />}
      compactNavigation={
        session.role === "OWNER" ? (
          <AdminNav role={session.role} compact />
        ) : undefined
      }
      account={
        <>
          <strong>{session.displayName}</strong>
          <span>{session.email}</span>
          <Link className="hl-text-link" href="/dashboard/settings/security">Account security</Link>
          <form action={logoutAction}>
            <button className="hl-text-link" type="submit">
              Log out
            </button>
          </form>
        </>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
