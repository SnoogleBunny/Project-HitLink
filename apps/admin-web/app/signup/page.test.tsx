import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { redirectAuthenticatedUserMock } = vi.hoisted(() => ({
  redirectAuthenticatedUserMock: vi.fn(),
}));

vi.mock("../../lib/admin-access", () => ({
  redirectAuthenticatedUser: redirectAuthenticatedUserMock,
}));

vi.mock("./signup-form", () => ({
  SignupForm: () => <form aria-label="Owner signup" />,
}));

import SignupPage from "./page";

describe("SignupPage migration copy", () => {
  it("makes signup owner-only and the migration handoff explicit", async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;

    const html = renderToStaticMarkup(await SignupPage());

    expect(redirectAuthenticatedUserMock).toHaveBeenCalledOnce();
    expect(html).toContain("Owner signup");
    expect(html).toContain("Create your owner account");
    expect(html).toContain("guided, validated, and reviewable migration handoff");
    expect(html).not.toContain("one-click");
    expect(html).not.toContain("coach signup");
  });
});
