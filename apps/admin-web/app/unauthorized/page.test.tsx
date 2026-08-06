import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { getSessionOrNullMock } = vi.hoisted(() => ({
  getSessionOrNullMock: vi.fn(),
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

vi.mock("../../lib/admin-access", () => ({
  getSessionOrNull: getSessionOrNullMock,
}));

import UnauthorizedPage from "./page";

describe("UnauthorizedPage recovery", () => {
  it("explains role-aware admin access with one heading and a home route", async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    getSessionOrNullMock.mockResolvedValue(null);

    const html = renderToStaticMarkup(await UnauthorizedPage());

    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("Access stays role-aware");
    expect(html).toContain("You can’t open this admin page");
    expect(html).toContain('href="/"');
  });

  it("gives coaches a truthful readiness-or-access explanation", async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    getSessionOrNullMock.mockResolvedValue({ role: "COACH" });

    const html = renderToStaticMarkup(await UnauthorizedPage());

    expect(html).toContain(
      "This page may be unavailable while your workspace is being prepared, or because your access does not include it.",
    );
    expect(html).not.toContain("can use the coach workspace");
    expect(html).not.toContain("this owner route");
  });
});
