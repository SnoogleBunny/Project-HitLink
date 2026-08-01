import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

import UnauthorizedPage from "./page";

describe("UnauthorizedPage recovery", () => {
  it("requires signing out before retrying member login", async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;

    const html = renderToStaticMarkup(await UnauthorizedPage());

    expect(html.match(/<form(?:\s|>)/g) ?? []).toHaveLength(1);
    expect(html).toMatch(
      /<button(?=[^>]*\btype="submit")[^>]*>\s*Sign out and return to login\s*<\/button>/,
    );
    expect(html).toMatch(/Sign out before (?:trying|you try|retrying)/i);
    expect(html).not.toMatch(/<a\b[^>]*\bhref="\/login"/);
  });
});
