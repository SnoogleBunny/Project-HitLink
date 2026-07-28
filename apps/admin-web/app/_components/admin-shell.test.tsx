import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/dashboard/migration"),
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../actions/logout", () => ({
  logoutAction: vi.fn(),
}));

import { AdminNav } from "./admin-nav";
import { AdminShell } from "./admin-shell";

const ownerSession = {
  userId: "owner_1",
  email: "owner@example.com",
  displayName: "Owner Example",
  workspaceId: "workspace_1",
  role: "OWNER" as const,
};

const ownerDestinations = [
  "Dashboard",
  "Migration",
  "Programs",
  "Rooms",
  "Schedule",
  "Bookings",
  "Today roster",
  "Members",
  "Forms",
  "Membership plans",
  "Access products",
  "Billing",
  "Billing settings",
  "Staff invites",
];

function renderShell() {
  return renderToStaticMarkup(
    <AdminShell
      description="Review the current migration handoff."
      session={ownerSession}
      title="Migration handoff"
      workspaceName="North Shore Muay Thai"
    >
      <h3>Review and lock this migration snapshot</h3>
    </AdminShell>,
  );
}

describe("AdminShell responsive navigation structure", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    pathnameMock.mockReturnValue("/dashboard/migration");
  });

  it("provides a collapsed native Menu disclosure before the route header", () => {
    const html = renderShell();
    const disclosureStart = html.indexOf('<details class="shell-mobile-menu">');
    const routeHeaderStart = html.indexOf('<header class="shell-header">');

    expect(disclosureStart).toBeGreaterThan(-1);
    expect(html).toContain("<summary>Menu</summary>");
    expect(html).not.toContain('<details class="shell-mobile-menu" open="">');
    expect(disclosureStart).toBeLessThan(routeHeaderStart);
  });

  it("keeps the brand and signed-in account context in the responsive shell", () => {
    const html = renderShell();

    expect(html).toContain("Flowstate Admin");
    expect(html).toContain("North Shore Muay Thai");
    expect(html).toContain("Signed in as");
    expect(html).toContain("Owner Example");
    expect(html).toContain("owner@example.com");
  });

  it("renders one route heading and one main content landmark", () => {
    const html = renderShell();

    expect(html.match(/<h2>/g)).toHaveLength(1);
    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("Migration handoff");
  });

  it("keeps each inactive responsive navigation rendering out of layout", () => {
    const css = readFileSync(
      new URL("../globals.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(/\.shell-mobile-header\s*{\s*display:\s*none;/);
    expect(css).toMatch(/\.shell-desktop-sidebar\s*{\s*display:\s*none;/);
    expect(css).toMatch(/\.shell-mobile-menu-content\s*{\s*display:\s*none;/);
    expect(css).toMatch(
      /\.shell-mobile-menu\[open\] \.shell-mobile-menu-content\s*{[^}]*display:\s*grid;/,
    );
  });

  it("uses the established high-contrast sidebar token for account context", () => {
    const css = readFileSync(
      new URL("../globals.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(
      /\.shell-sidebar-caption\s*{[^}]*color:\s*var\(--color-sidebar-muted\);/,
    );
  });
});

describe("AdminNav role destinations", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    pathnameMock.mockReturnValue("/dashboard/migration");
  });

  it("renders all 14 owner destinations with only Migration current", () => {
    const html = renderToStaticMarkup(<AdminNav role="OWNER" />);

    for (const destination of ownerDestinations) {
      expect(html).toContain(`>${destination}</a>`);
    }
    expect(html.match(/<a /g)).toHaveLength(14);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(
      'href="/dashboard/migration" aria-current="page" class="shell-nav-link active">Migration</a>',
    );
  });

  it("renders only the coach destination and marks it current", () => {
    pathnameMock.mockReturnValue("/dashboard/coach/today");
    const html = renderToStaticMarkup(<AdminNav role="COACH" />);

    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(
      'href="/dashboard/coach/today" aria-current="page" class="shell-nav-link active">Today roster</a>',
    );
    expect(html).not.toContain(">Migration</a>");
  });
});
