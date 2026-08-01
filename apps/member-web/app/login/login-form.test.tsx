import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { formAction, loginActionMock, useActionStateMock } = vi.hoisted(() => ({
  formAction: "/member-login-test",
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

vi.mock("./actions", () => ({
  loginAction: loginActionMock,
}));

vi.mock("../_components/submit-button", () => ({
  SubmitButton: ({
    children,
    pendingLabel,
  }: React.PropsWithChildren<{ pendingLabel: string }>) => (
    <button data-pending-label={pendingLabel} type="submit">
      {children}
    </button>
  ),
}));

import { emptyMemberLoginFormState } from "../form-states";
import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  it("preserves the server action, fields, autocomplete, pending label, and announced errors", () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    useActionStateMock.mockReturnValue([
      { error: "Invalid email or password." },
      formAction,
    ]);

    const html = renderToStaticMarkup(<LoginForm />);

    expect(useActionStateMock).toHaveBeenCalledWith(
      loginActionMock,
      emptyMemberLoginFormState,
    );
    expect(html).toContain('action="/member-login-test"');
    const inputs = html.match(/<input[^>]*>/g) ?? [];
    const emailInput = inputs.find((input) => input.includes('name="email"'));
    const passwordInput = inputs.find((input) =>
      input.includes('name="password"'),
    );

    expect(emailInput).toContain('autoComplete="email"');
    expect(emailInput).toContain('type="email"');
    expect(emailInput).toContain('required=""');
    expect(passwordInput).toContain('autoComplete="current-password"');
    expect(passwordInput).toContain('type="password"');
    expect(passwordInput).toContain('required=""');
    expect(html).toContain('data-pending-label="Logging in..."');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Invalid email or password.");
    expect(html).toContain("Member access is provided by your gym");
    expect(html).not.toMatch(/sign up|create (?:an |your )?account/i);
  });
});
