import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberPortalContext } from "../../lib/member-auth";
const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/app/schedule"),
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
import { MemberNav, MemberIdentity } from "./member-nav";
import { MemberShell, MemberWorkspace } from "./member-shell";
const context = {
  session: {
    userId: "user_1",
    email: "alex@example.com",
    displayName: "Alex Rivera",
    workspaceId: "workspace_1",
    role: "CUSTOMER",
  },
  workspace: {
    id: "workspace_1",
    name: "North Shore Muay Thai",
    status: "ACTIVE",
    migration: null,
    location: { id: "location_1", name: "Gym", timezone: "America/Vancouver" },
  },
  location: { id: "location_1", name: "Gym", timezone: "America/Vancouver" },
  member: {
    id: "member_1",
    fullName: "Alex Rivera",
    email: "alex@example.com",
    status: "ACTIVE",
  },
} as MemberPortalContext;
beforeEach(() => {
  (globalThis as typeof globalThis & { React: typeof React }).React = React;
  pathnameMock.mockReturnValue("/app/schedule");
});

describe("member route ownership", () => {
  it("consolidates navigation into Classes, Membership, Payments and Account", () => {
    const html = renderToStaticMarkup(<MemberNav />);
    expect(html.match(/<a /g)).toHaveLength(4);
    for (const label of ["Classes", "Membership", "Payments", "Account"])
      expect(html).toContain(">" + label + "</span>");
    expect(html).not.toContain(">Overview<");
    expect(html).not.toContain(">Bookings<");
    expect(html).not.toContain(">Forms<");
  });
  it.each([
    ["/app/forms/request_1", "/app/membership"],
    ["/app/checkout/complete", "/app/billing"],
    ["/app/bookings", "/app/schedule"],
    ["/app/family", "/app/account"],
  ])("keeps %s in its correct parent", (path, parent) => {
    pathnameMock.mockReturnValue(path);
    const html = renderToStaticMarkup(<MemberNav />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('href="' + parent + '" aria-current="page"');
  });
  it("keeps the selected person out of payer/account page context", () => {
    pathnameMock.mockReturnValue("/app/billing");
    const html = renderToStaticMarkup(
      <MemberIdentity
        name="Child Example"
        control={<button>Choose person</button>}
      />,
    );
    expect(html).toContain("Your account");
    expect(html).not.toContain("Child Example");
    expect(html).not.toContain("Choose person");
  });
  it("renders only the supplied verified person control on scoped pages", () => {
    const html = renderToStaticMarkup(
      <MemberIdentity
        name="Alex Rivera"
        control={<button>Choose person</button>}
      />,
    );
    expect(html).toContain("Choose person");
    expect(html).not.toContain("Alex Rivera");
  });
});

describe("member persistent chrome", () => {
  it("has one main and one heading, a compact header identity and an isolated phone menu", () => {
    const html = renderToStaticMarkup(
      <MemberWorkspace context={context}>
        <MemberShell
          context={context}
          title="Classes"
          description="Find your next class."
        >
          <section aria-label="Available classes" />
        </MemberShell>
      </MemberWorkspace>,
    );
    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("HitLink");
    expect(html).toContain("North Shore Muay Thai");
    expect(html).toContain("Alex Rivera");
    expect(html).toContain("<dialog");
    expect(html).not.toMatch(/<dialog[^>]* open=/);
    expect(html).toContain("More destinations");
    expect(html).toContain("Log out");
  });
});
