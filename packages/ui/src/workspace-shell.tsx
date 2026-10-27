"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HitLinkBrand, PageSkeleton } from "./primitives";
import { Icon } from "./icon";
import { ThemeToggle } from "./theme";

const WorkspaceLoadingContext = createContext<(loading: boolean) => void>(
  () => {},
);
export const useWorkspaceLoading = () => useContext(WorkspaceLoadingContext);

export interface WorkspaceShellProps {
  children: ReactNode;
  workspaceName: string;
  contextLabel: string;
  navigation: ReactNode;
  compactNavigation?: ReactNode;
  account: ReactNode;
  identity?: ReactNode;
  breadcrumb?: ReactNode;
}

export function WorkspaceShell({
  children,
  workspaceName,
  contextLabel,
  navigation,
  compactNavigation,
  account,
  identity,
  breadcrumb,
}: WorkspaceShellProps) {
  const menu = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [recordLoading, setRecordLoading] = useState(false);
  const menuId = useId();
  useEffect(() => {
    const desktop = matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches && menu.current?.open) {
        menu.current.close();
        // The drawer trigger is hidden on desktop. Restore focus to the
        // corresponding visible destination instead of that hidden control.
        const destination = document.querySelector<HTMLElement>(
          '.hl-workspace-sidebar a[aria-current="page"]',
        );
        (destination ?? document.getElementById("workspace-content"))?.focus();
      }
    };
    desktop.addEventListener("change", closeOnDesktop);
    const updateVisibility = () => {
      document.documentElement.toggleAttribute(
        "data-page-hidden",
        document.hidden,
      );
    };
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  function openMenu() {
    menu.current?.showModal();
    setOpen(true);
  }

  return (
    <WorkspaceLoadingContext.Provider value={setRecordLoading}>
      <div
        className={`hl-workspace-shell${compactNavigation ? " hl-has-bottom-nav" : ""}`}
      >
        <a className="hl-skip-link" href="#workspace-content">
          Skip to content
        </a>
        <aside className="hl-workspace-sidebar">
          <HitLinkBrand />
          <div className="hl-workspace-identity">
            <span className="hl-avatar" aria-hidden="true">
              {workspaceName.slice(0, 1)}
            </span>
            <div>
              <strong>{workspaceName}</strong>
              <span>{contextLabel}</span>
            </div>
          </div>
          {navigation}
          <div className="hl-workspace-account">{account}</div>
        </aside>
        <div className="hl-workspace-stage">
          <header className="hl-workspace-topbar">
            <span className="hl-mobile-brand">
              <HitLinkBrand compact />
            </span>
            <div className="hl-workspace-breadcrumb">
              {breadcrumb || contextLabel}
            </div>
            <div className="hl-workspace-person">{identity}</div>
            <ThemeToggle />
            <button
              className="hl-icon-button hl-mobile-trigger"
              type="button"
              aria-label="Open workspace menu"
              aria-controls={menuId}
              aria-expanded={open}
              onClick={openMenu}
            >
              <Icon name="menu" />
            </button>
          </header>
          <main
            className="hl-workspace-content"
            id="workspace-content"
            tabIndex={-1}
            aria-busy={recordLoading || undefined}
          >
            {recordLoading ? (
              <PageSkeleton label="Loading member records" />
            ) : null}
            <div className="hl-workspace-page" hidden={recordLoading}>
              {children}
            </div>
          </main>
          {compactNavigation ? (
            <nav className="hl-bottom-nav" aria-label="Quick navigation">
              {compactNavigation}
              <button
                className="hl-bottom-link"
                type="button"
                aria-label="More destinations"
                aria-controls={menuId}
                aria-expanded={open}
                onClick={openMenu}
              >
                <Icon name="menu" />
                <span>More</span>
              </button>
            </nav>
          ) : null}
        </div>
        <dialog
          ref={menu}
          id={menuId}
          className="hl-workspace-menu"
          aria-labelledby={`${menuId}-title`}
          onClose={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
              ),
            ].filter((element) => element.getClientRects().length > 0);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          onClick={(event) => {
            if (
              event.target === event.currentTarget ||
              (event.target as HTMLElement).closest("a[href]")
            )
              menu.current?.close();
          }}
        >
          <div className="hl-menu-heading">
            <h2 id={`${menuId}-title`}>Workspace menu</h2>
            <button
              className="hl-icon-button"
              type="button"
              aria-label="Close workspace menu"
              onClick={() => menu.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="hl-menu-body">
            <div className="hl-workspace-identity">
              <strong>{workspaceName}</strong>
              <span>{contextLabel}</span>
            </div>
            {navigation}
            <div className="hl-workspace-account">{account}</div>
          </div>
        </dialog>
      </div>
    </WorkspaceLoadingContext.Provider>
  );
}
