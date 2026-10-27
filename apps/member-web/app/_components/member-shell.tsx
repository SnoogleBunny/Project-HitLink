import { Suspense, type ReactNode } from "react";
import { WorkspaceShell, WorkspaceLocaleProvider } from "@flowstate/ui";
import type { MemberPortalContext } from "../../lib/member-auth";
import { logoutAction } from "../actions/logout";
import {
  MemberIdentity,
  MemberNav,
  type CoachingNavigationContext,
} from "./member-nav";

interface MemberShellProps {
  children: ReactNode;
  context: MemberPortalContext;
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
}

/** Page-level heading; persistent chrome is owned by app/layout. */
export function MemberShell({
  children,
  title,
  description,
  actions,
}: MemberShellProps) {
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

export function MemberWorkspace({
  children,
  context,
  memberControl,
  hasCoaching = false,
  coachingNavigation,
}: {
  children: ReactNode;
  context: MemberPortalContext;
  memberControl?: ReactNode;
  hasCoaching?: boolean;
  coachingNavigation?: CoachingNavigationContext;
}) {
  return (
    <WorkspaceLocaleProvider locale={context.workspace.settings?.locale}>
      <WorkspaceShell
        workspaceName={context.workspace.name}
        contextLabel="Member portal"
        identity={
          <MemberIdentity
            name={context.member.fullName}
            control={memberControl}
          />
        }
        navigation={
          <Suspense>
            <MemberNav
              hasCoaching={hasCoaching}
              coachingNavigation={coachingNavigation}
            />
          </Suspense>
        }
        compactNavigation={
          <Suspense>
            <MemberNav
              compact
              hasCoaching={hasCoaching}
              coachingNavigation={coachingNavigation}
            />
          </Suspense>
        }
        account={
          <>
            <strong>{context.session.displayName}</strong>
            <span>{context.session.email}</span>
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
    </WorkspaceLocaleProvider>
  );
}
