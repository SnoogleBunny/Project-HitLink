import { createHmac } from "node:crypto";
import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireContextMock } = vi.hoisted(() => ({
  requireContextMock: vi.fn(),
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

vi.mock("../../../_components/member-shell", () => ({
  MemberShell: ({
    actions,
    children,
    title,
    description,
  }: PropsWithChildren<{ title: string; description: string; actions?: ReactNode }>) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {children}
    </main>
  ),
}));

vi.mock("../../../../lib/member-auth", () => ({
  requireMemberPortalContext: requireContextMock,
}));

import CheckoutCompletePage from "./page";

const fixtureKey = "local-checkout-return-test-key";
const fixtureKeyEnv = "FLOWSTATE_LOCAL_CHECKOUT_RETURN_KEY";
const now = new Date("2026-08-18T19:00:00.000Z");
const context = {
  session: {
    userId: "user_1",
    workspaceId: "workspace_1",
    displayName: "Jordan Lee",
    email: "jordan@example.com",
  },
  workspace: {
    id: "workspace_1",
    name: "North Star Muay Thai",
  },
  member: {
    id: "member_1",
    fullName: "Jordan Lee",
  },
};

type CheckoutOutcome = "pending" | "success" | "failure";
type SearchParams = Record<string, string | string[] | undefined>;

function createLocalReturnFixture(
  outcome: CheckoutOutcome,
  issuedAt = now,
): string {
  const payload = `v1.${outcome}.${issuedAt.getTime()}`;
  const signature = createHmac("sha256", fixtureKey)
    .update(`${payload}.${context.workspace.id}.${context.member.id}`)
    .digest("base64url");

  return `${payload}.${signature}`;
}

async function renderPage(searchParams: SearchParams = {}): Promise<string> {
  return renderToStaticMarkup(
    await CheckoutCompletePage({
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

function expectUnverified(html: string): void {
  expect(html).toContain("Checkout status not verified");
  expect(html).not.toMatch(/checkout complete|payment received|paid successfully/i);
}

describe("CheckoutCompletePage return truth", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    requireContextMock.mockResolvedValue(context);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv(fixtureKeyEnv, fixtureKey);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not claim payment completion on a direct GET", async () => {
    expectUnverified(await renderPage());
  });

  it("does not trust missing return inputs", async () => {
    expectUnverified(
      await renderPage({
        checkout_return: "v1.success",
      }),
    );
  });

  it("does not trust a forged return fixture", async () => {
    const fixture = createLocalReturnFixture("success");
    const forgedFixture = `${fixture.slice(0, -1)}${fixture.endsWith("a") ? "b" : "a"}`;

    expectUnverified(
      await renderPage({
        checkout_return: forgedFixture,
      }),
    );
  });

  it("does not trust a stale signed return fixture", async () => {
    expectUnverified(
      await renderPage({
        checkout_return: createLocalReturnFixture(
          "success",
          new Date(now.getTime() - 16 * 60 * 1000),
        ),
      }),
    );
  });

  it.each([
    ["pending", "Checkout is still pending", "Pending return reported"],
    ["success", "Checkout returned successfully", "Successful return reported"],
    ["failure", "Checkout did not succeed", "Failed return reported"],
  ] as const)(
    "renders verified local %s return evidence distinctly",
    async (outcome, title, detail) => {
      const html = await renderPage({
        checkout_return: createLocalReturnFixture(outcome),
      });

      expect(html).toContain(title);
      expect(html).toContain(detail);
      expect(html).toContain("Verified local fixture");
      expect(html).toContain("does not confirm a live Stripe payment");
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('href="/app/bookings"');
    },
  );

  it("makes zero external requests when the local fixture key is unavailable", async () => {
    vi.stubEnv(fixtureKeyEnv, "");
    const html = await renderPage({
      checkout_return: createLocalReturnFixture("success"),
    });

    expectUnverified(html);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
