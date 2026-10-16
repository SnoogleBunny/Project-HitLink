import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/dashboard/migration"),
}));
vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));
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
vi.mock("../actions/logout", () => ({ logoutAction: vi.fn() }));
import { AdminNav } from "./admin-nav";
import { AdminShell, AdminWorkspace } from "./admin-shell";

const session = {
  userId: "owner_1",
  email: "owner@example.com",
  displayName: "Owner Example",
  workspaceId: "workspace_1",
  role: "OWNER" as const,
};
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  pathnameMock.mockReturnValue("/dashboard/migration");
});

describe("approved owner navigation", () => {
  it("has eight primary destinations with Settings owning migration", () => {
    const html = renderToStaticMarkup(<AdminNav role="OWNER" />);
    expect(html.match(/<a /g)).toHaveLength(8);
    for (const label of [
      "Today",
      "Classes",
      "Members",
      "Billing",
      "Plans",
      "Forms",
      "Website",
      "Settings",
    ])
      expect(html).toContain(">" + label + "</span>");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/dashboard\/settings" aria-current="page"/);
  });
  it.each([
    ["/dashboard/schedule/class_1/roster", "/dashboard/schedule"],
    ["/dashboard/members/member_1/billing", "/dashboard/members"],
    [
      "/dashboard/access-products/punch-cards/pack_1/edit",
      "/dashboard/membership-plans",
    ],
    ["/dashboard/settings/billing", "/dashboard/settings"],
  ])("keeps %s under %s", (path, parent) => {
    pathnameMock.mockReturnValue(path);
    const html = renderToStaticMarkup(<AdminNav role="OWNER" />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('href="' + parent + '" aria-current="page"');
  });
  it("does not grant owner destinations to coaches or an unknown role", () => {
    pathnameMock.mockReturnValue("/dashboard/coaching/client_1");
    const html = renderToStaticMarkup(<AdminNav role="COACH" />);
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain(">Clients</span>");
    expect(html).not.toContain("/dashboard/billing");
    expect(renderToStaticMarkup(<AdminNav role={null} />)).not.toContain("<a ");
  });
  it("limits common phone actions to Today, Classes and Members", () => {
    const html = renderToStaticMarkup(<AdminNav role="OWNER" compact />);
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).not.toContain("/dashboard/billing");
  });
});

describe("persistent workspace shell", () => {
  it("renders one main landmark and one page heading with native dialog navigation", () => {
    const html = renderToStaticMarkup(
      <AdminWorkspace session={session} workspaceName="North Shore Muay Thai">
        <AdminShell
          session={session}
          workspaceName="North Shore Muay Thai"
          title="Import members"
          description="Review your import."
        >
          <input defaultValue="Draft retained" />
        </AdminShell>
      </AdminWorkspace>,
    );
    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]* open=/);
    expect(html).toContain("Open workspace menu");
    expect(html).toContain("More destinations");
    expect(html).toContain("HitLink");
    expect(html).toContain("North Shore Muay Thai");
    expect(html).toContain("owner@example.com");
    expect(html).toContain("Switch to dark mode");
    expect(html).not.toContain("Protected dashboard");
  });
  it("omits the redundant coach bottom bar", () => {
    const html = renderToStaticMarkup(
      <AdminWorkspace
        session={{ ...session, role: "COACH" }}
        workspaceName="Gym"
      >
        <p>Client plan</p>
      </AdminWorkspace>,
    );
    expect(html).not.toContain('aria-label="Quick navigation"');
    expect(html).toContain("Open workspace menu");
  });
});
