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
  it("uses the approved guided migration wording", async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;

    const html = renderToStaticMarkup(await SignupPage());

    expect(redirectAuthenticatedUserMock).toHaveBeenCalledOnce();
    expect(html).toContain(
      "Start a guided migration handoff. Flowstate will review your current system, plan the import, and guide launch readiness with you.",
    );
  });
});
