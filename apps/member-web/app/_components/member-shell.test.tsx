import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/app/membership"),
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

import { MemberNav } from "./member-nav";
import { MemberShell } from "./member-shell";

const context = {
  session: {
    userId: "user_1",
    email: "alex@example.com",
    displayName: "Alex Rivera",
    workspaceId: "workspace_1",
    role: "CUSTOMER" as const,
  },
  workspace: {
    id: "workspace_1",
    name: "North Shore Muay Thai",
    status: "ACTIVE" as const,
    migration: {
      stage: "COMPLETE" as const,
      ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
      ownerReviewAcknowledgedByUserId: "owner_1",
      operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
      operationallyReadyByUserId: "flowstate_operator_1",
    },
    location: {
      id: "location_1",
      name: "Main gym",
      timezone: "America/Vancouver",
    },
  },
  location: {
    id: "location_1",
    name: "Main gym",
    timezone: "America/Vancouver",
  },
  member: {
    id: "member_1",
    fullName: "Alex Rivera",
    email: "alex@example.com",
    status: "ACTIVE" as const,
  },
};

const destinations = [
  ["/app", "Overview"],
  ["/app/schedule", "Schedule"],
  ["/app/bookings", "Bookings"],
  ["/app/membership", "Membership"],
  ["/app/forms", "Forms"],
  ["/app/billing", "Billing"],
] as const;

function renderShell() {
  return renderToStaticMarkup(
    <MemberShell
      context={context}
      description="Your next classes and account status, in priority order."
      title="Overview"
    >
      <section aria-label="Upcoming bookings" />
    </MemberShell>,
  );
}

describe("MemberNav destinations", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    pathnameMock.mockReturnValue("/app/membership");
  });

  it("names the landmark, preserves all six routes, and marks the current page without color alone", () => {
    const html = renderToStaticMarkup(
      <MemberNav ariaLabel="Member portal navigation" />,
    );

    expect(html).toContain('<nav aria-label="Member portal navigation"');
    expect(html.match(/<a /g)).toHaveLength(6);

    for (const [href, label] of destinations) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(`>${label}</a>`);
    }

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(
      'href="/app/membership" aria-current="page" class="member-nav-link active">Membership</a>',
    );
  });
});

describe("MemberShell responsive structure", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
  });

  it("puts gym identity and page comprehension before native navigation utilities", () => {
    const html = renderShell();
    const gymStart = html.indexOf("North Shore Muay Thai");
    const productStart = html.indexOf("Flowstate member portal");
    const headingStart = html.indexOf("<h1>Overview</h1>");
    const disclosureStart = html.indexOf('<details class="member-mobile-menu">');

    expect(gymStart).toBeGreaterThan(-1);
    expect(productStart).toBeGreaterThan(gymStart);
    expect(headingStart).toBeGreaterThan(productStart);
    expect(disclosureStart).toBeGreaterThan(headingStart);
    expect(html).toContain("<summary>Menu</summary>");
    expect(html).not.toContain('<details class="member-mobile-menu" open="">');
    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("Alex Rivera");
    expect(html).toContain("alex@example.com");
    expect(html).toContain("Log out");
  });

  it("keeps closed disclosure content out of focus order and defines resilient controls", () => {
    const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");

    expect(css).toMatch(
      /\.member-mobile-menu-content\s*{[^}]*display:\s*none;/,
    );
    expect(css).toMatch(
      /\.member-mobile-menu\[open\] \.member-mobile-menu-content\s*{[^}]*display:\s*grid;/,
    );
    expect(css).toMatch(/min-height:\s*(?:44px|2\.75rem)/);
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (max-width: 320px)");
  });
});
