import { expectActionRedirect } from "./support/action-redirect";
import { loginToWorkspace } from "./support/workspace-login";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  attachBrowserDiagnostics,
  expect,
  test,
  type Locator,
  type BrowserDiagnosticsCollector,
  type Page,
} from "./support/browser-diagnostics";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
) {
  throw new Error(
    "Account recovery requires an explicitly configured disposable local test database.",
  );
}
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const requestedMessage =
  "If an account matches this address, a reset email has been requested. Check your inbox or contact your gym for help.";
const invalidMessage =
  "This reset link is invalid or expired. Request a new link.";
const resetMessage =
  "Your password has changed and every device has been signed out.";
const originalPassword = "DemoPass123!";
const newPassword = "RecoveryPass2026!";
const portals = [
  {
    kind: "admin",
    origin: process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100",
    protectedPath: "/dashboard",
    securityPath: "/dashboard/settings/security",
  },
  {
    kind: "member",
    origin:
      process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101",
    protectedPath: "/app/schedule",
    securityPath: "/app/account",
  },
] as const;
type Portal = (typeof portals)[number];

async function createAccount(portal: Portal) {
  const key = `recovery-e2e-${randomUUID()}`;
  const source = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const user = await db.user.create({
    data: {
      email: `${key}@example.test`,
      fullName: "Fictional recovery account",
      passwordHash: source.passwordHash,
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: key,
      status: "ACTIVE",
      location: {
        create: { name: "Fictional location", timezone: "America/Vancouver" },
      },
      workspaceUsers: {
        create: {
          userId: user.id,
          role: portal.kind === "admin" ? "OWNER" : "CUSTOMER",
        },
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional acceptance fixture ready",
          flowstateResponsibility: "Fictional local browser acceptance",
          ownerReviewAcknowledgedAt: new Date(),
          ownerReviewAcknowledgedByUserId: user.id,
          operationallyReadyAt: new Date(),
          operationallyReadyByUserId: user.id,
        },
      },
    },
  });
  if (portal.kind === "member") {
    await db.member.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        fullName: user.fullName!,
        email: user.email,
        status: "ACTIVE",
        dateOfBirth: new Date("1990-01-01T00:00:00Z"),
      },
    });
  }
  return { user, workspace };
}
type Account = Awaited<ReturnType<typeof createAccount>>;
async function removeAccount(account: Account) {
  await db.workspace.delete({ where: { id: account.workspace.id } });
  await db.user.delete({ where: { id: account.user.id } });
  // AccountSecurityEvent is intentionally append-only and has no user FK.
  // Retain these fictional audit rows; never disable that database protection.
}
async function submit(page: Page, control: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        Boolean(candidate.request().headers()["next-action"]),
      { timeout: 15_000 },
    ),
    control.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  return response;
}
async function login(
  page: Page,
  portal: Portal,
  account: Account,
  password: string,
  diagnostics: BrowserDiagnosticsCollector,
) {
  await loginToWorkspace({
    page,
    origin: portal.origin,
    email: account.user.email,
    password,
    expectedRedirect: portal.kind === "admin" ? "/dashboard;push" : "/app;push",
    destination: {
      path: portal.protectedPath,
      heading: portal.kind === "admin" ? "Today" : "Classes",
    },
    diagnostics,
    responseTimeout: 15_000,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
async function requestLink(page: Page, portal: Portal, email: string) {
  await page.goto(`${portal.origin}/forgot-password`);
  await page.getByLabel("Account email", { exact: true }).fill(email);
  const response = await submit(
    page,
    page.getByRole("button", { name: "Request reset link", exact: true }),
  );
  await expect(
    page.getByRole("status").filter({ hasText: requestedMessage }),
  ).toHaveText(requestedMessage);
  return response;
}
async function queuedLink(account: Account, portal: Portal) {
  // This is the local queue for this test's fictional recipient. It is not an
  // email-provider inbox and PENDING must never be reported as delivered.
  const delivery = await db.authRecoveryDelivery.findFirstOrThrow({
    where: {
      recipientEmail: account.user.email,
      challenge: { userId: account.user.id },
    },
    include: { challenge: true },
    orderBy: { createdAt: "desc" },
  });
  expect(delivery).toMatchObject({
    status: "PENDING",
    attempts: 0,
    sentAt: null,
    providerMessageId: null,
  });
  expect(delivery.challenge).toMatchObject({
    userId: account.user.id,
    portal: portal.kind,
    consumedAt: null,
    invalidatedAt: null,
  });
  const link = delivery.body.match(/https?:\/\/[^\s]+/)?.[0];
  expect(link).toBeTruthy();
  const url = new URL(link!);
  expect(url.origin).toBe(portal.origin);
  expect(url.pathname).toBe("/reset-password");
  expect(url.search).toBe("");
  const token = new URLSearchParams(url.hash.slice(1)).get("token");
  expect(token).toMatch(/^[\w-]{43}$/);
  expect(createHash("sha256").update(token!).digest("hex")).toBe(
    delivery.challenge.tokenHash,
  );
  return { delivery, link: link! };
}
async function openReset(page: Page, portal: Portal, link: string) {
  const navigations: string[] = [];
  const observe = (request: {
    isNavigationRequest(): boolean;
    url(): string;
  }) => {
    if (
      request.isNavigationRequest() &&
      new URL(request.url()).pathname === "/reset-password"
    )
      navigations.push(request.url());
  };
  page.on("request", observe);
  try {
    await page.goto(link);
    await expect(page).toHaveURL(`${portal.origin}/reset-password`);
    await expect(
      page.getByLabel("New password", { exact: true }),
    ).toBeVisible();
    expect(navigations).toEqual([`${portal.origin}/reset-password`]);
    // The bearer remains in form memory after history is cleared, never in the
    // HTTP request URL or a query parameter. GET itself does not consume it.
    expect(
      await page.evaluate(() => ({
        hash: location.hash,
        search: location.search,
      })),
    ).toEqual({ hash: "", search: "" });
  } finally {
    page.off("request", observe);
  }
}
async function fillReset(page: Page, email: string, password = newPassword) {
  await page.getByLabel("Account email", { exact: true }).fill(email);
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password", { exact: true }).fill(password);
}

async function assertMobileForm(
  page: Page,
  lastField: Locator,
  submit: Locator,
) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
  await lastField.focus();
  await page.keyboard.press("Tab");
  await expect(submit).toBeFocused();
  await expect(submit).toBeInViewport({ ratio: 1 });
  const headingContrast = await page
    .getByRole("heading", { level: 1 })
    .evaluate((heading) => {
      const rgba = (color: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      const foreground = rgba(getComputedStyle(heading).color);
      let background = [255, 255, 255, 255];
      for (
        let parent: Element | null = heading;
        parent;
        parent = parent.parentElement
      ) {
        const color = rgba(getComputedStyle(parent).backgroundColor);
        if (color[3]! >= 254) {
          background = color;
          break;
        }
      }
      const luminance = (color: number[]) =>
        color
          .slice(0, 3)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index]!,
            0,
          );
      const foregroundLuminance = luminance(foreground),
        backgroundLuminance = luminance(background);
      return (
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
        (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      );
    });
  expect(
    headingContrast,
    "Large recovery heading must stay readable against its actual panel",
  ).toBeGreaterThanOrEqual(3);
}

test.describe("Approved account recovery", () => {
  test.setTimeout(150_000);
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
  test.afterAll(() => db.$disconnect());

  for (const portal of portals) {
    test(`${portal.kind} recovery is generic, single use and revokes existing sessions`, async ({
      page,
      browser,
      browserDiagnostics,
    }, info) => {
      const account = await createAccount(portal);
      const firstContext = await browser.newContext(),
        secondContext = await browser.newContext();
      const disposeFirst = attachBrowserDiagnostics(
          firstContext,
          browserDiagnostics,
        ),
        disposeSecond = attachBrowserDiagnostics(
          secondContext,
          browserDiagnostics,
        );
      try {
        await page.setViewportSize({ width: 390, height: 844 });
        const first = await firstContext.newPage(),
          second = await secondContext.newPage();
        await login(
          first,
          portal,
          account,
          originalPassword,
          browserDiagnostics,
        );
        await login(
          second,
          portal,
          account,
          originalPassword,
          browserDiagnostics,
        );
        expect(
          await db.authSession.count({ where: { userId: account.user.id } }),
        ).toBe(2);

        const knownResponse = await requestLink(
          page,
          portal,
          account.user.email,
        );
        const { delivery, link } = await queuedLink(account, portal);
        await assertMobileForm(
          page,
          page.getByLabel("Account email", { exact: true }),
          page.getByRole("button", { name: "Request reset link", exact: true }),
        );
        await info.attach(`${portal.kind} forgot password phone`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
        browserDiagnostics.acknowledgeAction(
          knownResponse,
          "Generic request result rendered and only the fictional recipient's pending local delivery verified.",
        );
        const unknownEmail = `unknown-${randomUUID()}@example.test`;
        expect(
          await db.user.findUnique({ where: { email: unknownEmail } }),
        ).toBeNull();
        const unknownResponse = await requestLink(page, portal, unknownEmail);
        expect(
          await db.authRecoveryDelivery.count({
            where: { recipientEmail: unknownEmail },
          }),
        ).toBe(0);
        browserDiagnostics.acknowledgeAction(
          unknownResponse,
          "Identical generic result rendered for unknown account; no delivery was created.",
        );

        await openReset(page, portal, link);
        await assertMobileForm(
          page,
          page.getByLabel("Confirm new password", { exact: true }),
          page.getByRole("button", {
            name: "Change password and sign out all devices",
            exact: true,
          }),
        );
        await info.attach(`${portal.kind} reset password phone`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
        expect(
          (
            await db.passwordResetChallenge.findUniqueOrThrow({
              where: { id: delivery.challengeId },
            })
          ).consumedAt,
        ).toBeNull();
        expect(
          (await db.user.findUniqueOrThrow({ where: { id: account.user.id } }))
            .passwordHash,
        ).toBe(account.user.passwordHash);
        await fillReset(page, unknownEmail);
        const wrongEmailResponse = await submit(
          page,
          page.getByRole("button", {
            name: "Change password and sign out all devices",
            exact: true,
          }),
        );
        await expect(
          page.getByText(invalidMessage, { exact: true }),
        ).toBeVisible();
        expect(
          (
            await db.passwordResetChallenge.findUniqueOrThrow({
              where: { id: delivery.challengeId },
            })
          ).consumedAt,
        ).toBeNull();
        expect(
          await db.authSession.count({ where: { userId: account.user.id } }),
        ).toBe(2);
        browserDiagnostics.acknowledgeAction(
          wrongEmailResponse,
          "Wrong-email rejection rendered; challenge unconsumed and existing sessions unchanged.",
        );

        await fillReset(page, account.user.email);
        const resetResponse = await submit(
          page,
          page.getByRole("button", {
            name: "Change password and sign out all devices",
            exact: true,
          }),
        );
        await expect(
          page.getByText(resetMessage, { exact: true }),
        ).toBeVisible();
        const completed = await db.passwordResetChallenge.findUniqueOrThrow({
          where: { id: delivery.challengeId },
        });
        expect(completed.consumedAt).toBeInstanceOf(Date);
        const changed = await db.user.findUniqueOrThrow({
          where: { id: account.user.id },
        });
        expect(changed.passwordHash).not.toBe(account.user.passwordHash);
        expect(
          await db.authSession.count({ where: { userId: account.user.id } }),
        ).toBe(0);
        expect(
          await db.authRecoveryDelivery.findUniqueOrThrow({
            where: { id: delivery.id },
          }),
        ).toMatchObject({
          status: "CANCELLED",
          body: "",
          attempts: 0,
          sentAt: null,
          providerMessageId: null,
        });
        const audit = await db.accountSecurityEvent.findFirstOrThrow({
          where: { userId: account.user.id, kind: "PASSWORD_RESET_COMPLETED" },
        });
        expect(audit).toMatchObject({
          portal: portal.kind,
          challengeId: delivery.challengeId,
          revokedSessionCount: 2,
        });
        browserDiagnostics.acknowledgeAction(
          resetResponse,
          "Reset completion rendered; one consumed challenge, changed credential, two revoked sessions and immutable audit verified, without delivered mail claim.",
        );
        await first.goto(`${portal.origin}${portal.protectedPath}`);
        await expect(first).toHaveURL(`${portal.origin}/login`);
        await second.goto(`${portal.origin}${portal.protectedPath}`);
        await expect(second).toHaveURL(`${portal.origin}/login`);

        // Reopening a consumed link into the existing success document must
        // reload its form, clear the new fragment and reject the used bearer.
        await openReset(page, portal, link);
        await fillReset(page, account.user.email, "ReusedLinkMustFail2026!");
        const reusedResponse = await submit(
          page,
          page.getByRole("button", {
            name: "Change password and sign out all devices",
            exact: true,
          }),
        );
        await expect(
          page.getByText(invalidMessage, { exact: true }),
        ).toBeVisible();
        expect(
          (await db.user.findUniqueOrThrow({ where: { id: account.user.id } }))
            .passwordHash,
        ).toBe(changed.passwordHash);
        expect(
          await db.accountSecurityEvent.count({
            where: {
              userId: account.user.id,
              kind: "PASSWORD_RESET_COMPLETED",
            },
          }),
        ).toBe(1);
        browserDiagnostics.acknowledgeAction(
          reusedResponse,
          "Reused link rejected; credential unchanged and exactly one completion audit exists.",
        );

        await first.goto(`${portal.origin}/login`);
        await first
          .getByLabel("Email", { exact: true })
          .fill(account.user.email);
        await first
          .getByLabel("Password", { exact: true })
          .fill(originalPassword);
        const oldPasswordResponse = await submit(
          first,
          first.getByRole("button", { name: "Log in", exact: true }),
        );
        await expect(
          first.getByText("Invalid email or password.", { exact: true }),
        ).toBeVisible();
        expect(
          await db.authSession.count({ where: { userId: account.user.id } }),
        ).toBe(0);
        browserDiagnostics.acknowledgeAction(
          oldPasswordResponse,
          "Old password rejected in real login UI and no session exists.",
        );
        await login(first, portal, account, newPassword, browserDiagnostics);
        await login(second, portal, account, newPassword, browserDiagnostics);
        expect(
          await db.authSession.count({ where: { userId: account.user.id } }),
        ).toBe(2);

        {
          await first.goto(`${portal.origin}${portal.securityPath}`);
          await first
            .getByRole("checkbox", {
              name: "Sign out every device, including this one.",
              exact: true,
            })
            .check();
          const signedOut = await submit(
            first,
            first.getByRole("button", {
              name: "Sign out all devices",
              exact: true,
            }),
          );
          await expect(first).toHaveURL(`${portal.origin}/login?signedOut=all`);
          expect(
            await db.authSession.count({ where: { userId: account.user.id } }),
          ).toBe(0);
          expect(
            await db.accountSecurityEvent.findFirstOrThrow({
              where: { userId: account.user.id, kind: "ALL_SESSIONS_REVOKED" },
            }),
          ).toMatchObject({ portal: portal.kind, revokedSessionCount: 2 });
          await expect(
            first.getByRole("heading", {
              name:
                portal.kind === "admin"
                  ? "Welcome back"
                  : "Log in to your member portal",
              exact: true,
            }),
          ).toBeVisible();
          await expectActionRedirect(
            first,
            signedOut,
            `${portal.origin}/login?signedOut=all`,
          );
          if (signedOut.status() === 200)
            browserDiagnostics.acknowledgeAction(
              signedOut,
              "The login page is visible, both sessions are revoked, and the exact attributed all-devices event records2 revoked sessions.",
            );
          await second.goto(`${portal.origin}${portal.protectedPath}`);
          await expect(second).toHaveURL(`${portal.origin}/login`);
        }
        await Promise.all(
          [page, first, second].map((openPage) =>
            openPage.waitForLoadState("networkidle"),
          ),
        );
        await info.attach(`${portal.kind} recovery persistence`, {
          body: JSON.stringify({
            userId: account.user.id,
            challengeId: delivery.challengeId,
            completionAuditId: audit.id,
            previouslyRevokedSessions: audit.revokedSessionCount,
            recoveryDeliveryWasPending: true,
            bearerRemovedFromDelivery: true,
          }),
          contentType: "application/json",
        });
      } finally {
        await firstContext.close();
        await secondContext.close();
        disposeFirst();
        disposeSecond();
        await removeAccount(account);
      }
    });
  }

  test("member expired recovery link rejects the change and preserves the existing session", async ({
    page,
    browser,
    browserDiagnostics,
  }) => {
    const portal = portals[1],
      account = await createAccount(portal);
    const oldContext = await browser.newContext(),
      dispose = attachBrowserDiagnostics(oldContext, browserDiagnostics);
    try {
      const oldPage = await oldContext.newPage();
      await login(
        oldPage,
        portal,
        account,
        originalPassword,
        browserDiagnostics,
      );
      const requested = await requestLink(page, portal, account.user.email);
      const { delivery, link } = await queuedLink(account, portal);
      browserDiagnostics.acknowledgeAction(
        requested,
        "Generic request result rendered and fictional pending local delivery verified.",
      );
      await db.passwordResetChallenge.update({
        where: { id: delivery.challengeId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      await openReset(page, portal, link);
      await fillReset(page, account.user.email);
      const rejected = await submit(
        page,
        page.getByRole("button", {
          name: "Change password and sign out all devices",
          exact: true,
        }),
      );
      await expect(
        page.getByText(invalidMessage, { exact: true }),
      ).toBeVisible();
      expect(
        (
          await db.passwordResetChallenge.findUniqueOrThrow({
            where: { id: delivery.challengeId },
          })
        ).consumedAt,
      ).toBeNull();
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: account.user.id } }))
          .passwordHash,
      ).toBe(account.user.passwordHash);
      expect(
        await db.authSession.count({ where: { userId: account.user.id } }),
      ).toBe(1);
      expect(
        await db.accountSecurityEvent.count({
          where: { userId: account.user.id, kind: "PASSWORD_RESET_COMPLETED" },
        }),
      ).toBe(0);
      browserDiagnostics.acknowledgeAction(
        rejected,
        "Expired link rejection rendered; challenge unconsumed, credential and existing session unchanged, no completion audit.",
      );
      await oldPage.goto(`${portal.origin}${portal.protectedPath}`);
      await expect(oldPage.locator(".hl-workspace-shell")).toBeVisible();
      await expect(oldPage).toHaveURL(
        `${portal.origin}${portal.protectedPath}`,
      );
      await oldPage.waitForLoadState("networkidle");
    } finally {
      await oldContext.close();
      dispose();
      await removeAccount(account);
    }
  });
});
