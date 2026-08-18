import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  focus: vi.fn(),
  hasRetried: false,
  isPending: false,
  reset: vi.fn(),
  setHasRetried: vi.fn(),
  startTransition: vi.fn((callback: () => void) => callback()),
  useInitializer: false,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useEffect: (effect: () => void) => effect(),
    useRef: (initialValue: unknown) =>
      initialValue === false
        ? { current: false }
        : { current: { focus: hooks.focus } },
    useState: (initialValue: boolean | (() => boolean)) => [
      hooks.useInitializer
        ? typeof initialValue === "function"
          ? initialValue()
          : initialValue
        : hooks.hasRetried,
      hooks.setHasRetried,
    ],
    useTransition: () => [hooks.isPending, hooks.startTransition],
  };
});

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./actions/logout", () => ({
  logoutAction: vi.fn(),
}));

import ErrorBoundary from "./error";
import Loading from "./loading";
import NotFound from "./not-found";

function findButton(
  node: ReactElement<{ children?: ReactNode }>,
  label: string,
): ReactElement<{ onClick?: () => void }> | undefined {
  if (node.type === "button" && node.props.children === label) {
    return node as ReactElement<{ onClick?: () => void }>;
  }

  const children = React.Children.toArray(node.props.children);

  for (const child of children) {
    if (React.isValidElement(child)) {
      const match = findButton(
        child as ReactElement<{ children?: ReactNode }>,
        label,
      );
      if (match) return match;
    }
  }

  return undefined;
}

function renderError() {
  const error = Object.assign(
    new Error("Stripe saved member-42 for North Gym at /private?token=secret"),
    { digest: "sensitive-digest" },
  );

  return renderToStaticMarkup(
    <ErrorBoundary error={error} reset={hooks.reset} />,
  );
}

describe("admin app-root recovery", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    hooks.focus.mockClear();
    hooks.hasRetried = false;
    hooks.isPending = false;
    hooks.reset.mockClear();
    hooks.setHasRetried.mockClear();
    hooks.startTransition.mockClear();
    hooks.useInitializer = false;
  });

  it("renders a static, polite loading status without moving focus", () => {
    const html = renderToStaticMarkup(<Loading />);

    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Flowstate admin");
    expect(html).toContain("Opening your admin workspace");
    expect(html).toContain("Please wait while this page gets ready.");
    expect(html).not.toMatch(/<button|<a\s/i);
    expect(hooks.focus).not.toHaveBeenCalled();
  });

  it("renders the bounded initial error with focused heading and ordered recovery actions", () => {
    const html = renderError();

    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Admin page unavailable");
    expect(html).toContain("We couldn’t open this page");
    expect(html).toContain(
      "Try again once. If the page still won’t open, sign out and return to login.",
    );
    expect(html.indexOf("Try again")).toBeLessThan(
      html.indexOf("Sign out and return to login"),
    );
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("sensitive-digest");
    expect(html).not.toContain("member-42");
    expect(html).not.toContain("North Gym");
    expect(html).not.toContain("Stripe");
    expect(html).not.toContain("saved");
    expect(hooks.focus).toHaveBeenCalledTimes(1);
  });

  it("accepts one retry activation and suppresses repeats immediately", () => {
    hooks.useInitializer = true;
    const element = ErrorBoundary({
      error: new Error("private detail"),
      reset: hooks.reset,
    });
    const retry = findButton(element, "Try again");

    expect(retry?.props.onClick).toBeTypeOf("function");
    retry?.props.onClick?.();
    retry?.props.onClick?.();

    expect(hooks.startTransition).toHaveBeenCalledTimes(1);
    expect(hooks.setHasRetried).toHaveBeenCalledTimes(1);
    expect(hooks.reset).toHaveBeenCalledTimes(1);

    const remountedHtml = renderError();
    expect(remountedHtml).toContain("This page still isn’t available");
    expect(remountedHtml).not.toContain("Try again");
  });

  it("keeps retry focus and a dedicated polite status while retry is pending", () => {
    hooks.hasRetried = true;
    hooks.isPending = true;

    const html = renderError();

    expect(html).toContain("Trying again…");
    expect(html).toContain("Trying again.");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("Sign out and return to login");
    expect(hooks.focus).not.toHaveBeenCalled();
  });

  it("removes retry after a persistent failure and focuses the updated heading", () => {
    hooks.hasRetried = true;

    const html = renderError();

    expect(html).toContain("This page still isn’t available");
    expect(html).toContain("Sign out and return to login.");
    expect(html).not.toContain("Try again");
    expect(html.match(/Sign out and return to login/g)).toHaveLength(2);
    expect(hooks.focus).toHaveBeenCalledTimes(1);
  });

  it("renders a privacy-equivalent not-found state with one role-aware root link", () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("Page not found");
    expect(html).toContain("This admin page isn’t available");
    expect(html).toContain(
      "The address may be incorrect. Return to Flowstate admin to continue.",
    );
    expect(html).toContain('href="/"');
    expect(html).toContain("Back to Flowstate admin");
    expect(html.match(/<a\s/g)).toHaveLength(1);
    expect(html).not.toMatch(/try again|dashboard|member|workspace|account|object|query/i);
    expect(hooks.focus).toHaveBeenCalledTimes(1);
  });
});
