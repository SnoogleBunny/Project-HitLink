import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { formActionMock, loginActionMock, useActionStateMock } = vi.hoisted(() => ({
  formActionMock: vi.fn(),
  loginActionMock: vi.fn(),
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useActionState: useActionStateMock,
  };
});

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

vi.mock("../_components/submit-button", () => ({
  SubmitButton: ({ children }: PropsWithChildren<{ pendingLabel: string }>) => (
    <button type="submit">{children}</button>
  ),
}));

vi.mock("./actions", () => ({
  loginAction: loginActionMock,
}));

import { emptyFormState } from "../../lib/route-decisions";
import { LoginForm } from "./login-form";

describe("LoginForm action contract", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    useActionStateMock.mockReset();
    useActionStateMock.mockReturnValue([emptyFormState, formActionMock, false]);
  });

  it("keeps the existing login action, fields, autocomplete, and owner signup route", () => {
    const html = renderToStaticMarkup(<LoginForm />);
    const emailInput = html.match(/<input[^>]*name="email"[^>]*>/i)?.[0];
    const passwordInput = html.match(/<input[^>]*name="password"[^>]*>/i)?.[0];

    expect(useActionStateMock).toHaveBeenCalledWith(
      loginActionMock,
      emptyFormState,
    );
    expect(emailInput).toContain('autoComplete="email"');
    expect(emailInput).toContain('type="email"');
    expect(passwordInput).toContain('autoComplete="current-password"');
    expect(passwordInput).toContain('type="password"');
    expect(html).toContain('href="/signup"');
    expect(html).toContain("Need an owner account?");
    expect(html).toContain("Log in");
  });

  it("announces an action error without changing the form contract", () => {
    useActionStateMock.mockReturnValue([
      { error: "Invalid email or password." },
      formActionMock,
      false,
    ]);

    const html = renderToStaticMarkup(<LoginForm />);

    expect(html).toContain('role="alert"');
    expect(html).toContain("Invalid email or password.");
  });
});
