import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { redirectAuthenticatedUserMock } = vi.hoisted(() => ({
  redirectAuthenticatedUserMock: vi.fn(),
}));

vi.mock("../../lib/admin-access", () => ({
  redirectAuthenticatedUser: redirectAuthenticatedUserMock,
}));

vi.mock("./login-form", () => ({
  LoginForm: () => <form aria-label="Admin login" />,
}));

import LoginPage from "./page";

describe("LoginPage role clarity", () => {
  it("presents one admin login for owners and coaches", async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;

    const html = renderToStaticMarkup(await LoginPage());

    expect(redirectAuthenticatedUserMock).toHaveBeenCalledOnce();
    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("Owner + coach access");
    expect(html).toContain("Owners and coaches");
    expect(html).toContain("Welcome back");
  });
});
