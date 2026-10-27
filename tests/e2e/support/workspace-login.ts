import {
  expect,
  type BrowserDiagnosticsCollector,
  type Page,
} from "./browser-diagnostics";
import type { Response } from "@playwright/test";

type WorkspaceLogin = {
  page: Page;
  origin: string;
  email: string;
  password: string;
  expectedRedirect: string;
  destination: { path: string; heading: string };
  diagnostics?: BrowserDiagnosticsCollector;
  responseTimeout?: number;
  allowExistingSession?: boolean;
};

/** Positive login only. Rejection, onboarding and non-login actions stay local. */
export async function loginToWorkspace({
  page,
  origin,
  email,
  password,
  expectedRedirect,
  destination,
  diagnostics,
  responseTimeout,
  allowExistingSession = false,
}: WorkspaceLogin): Promise<void> {
  const loginUrl = new URL("/login", origin).href;
  await page.goto(loginUrl);
  const emailField = page.getByLabel("Email", { exact: true });
  let response: Response | null = null;
  if (!allowExistingSession || (await emailField.isVisible())) {
    await emailField.fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.waitForLoadState("networkidle");
    [response] = await Promise.all([
      page.waitForResponse(
        (candidate) => {
          const request = candidate.request();
          return (
            candidate.url() === loginUrl &&
            request.method() === "POST" &&
            !!request.headers()["next-action"] &&
            !request.serviceWorker() &&
            request.frame() === page.mainFrame()
          );
        },
        responseTimeout === undefined
          ? undefined
          : { timeout: responseTimeout },
      ),
      page.getByRole("button", { name: "Log in", exact: true }).click(),
    ]);
    expect([200, 303]).toContain(response.status());
    expect(response.request().isNavigationRequest()).toBe(false);
    expect(response.request().resourceType()).toBe("fetch");
    expect(response.request().headers().accept).toContain("text/x-component");
    expect(response.headers()["content-type"]?.toLowerCase()).toMatch(
      /^text\/x-component(?:;|$)/,
    );
    expect(response.headers()["x-action-redirect"]).toBe(expectedRedirect);
  }
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(new URL(destination.path, origin).href);
  await expect(
    page.getByRole("heading", {
      name: destination.heading,
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.locator(".hl-workspace-shell")).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const menuTrigger = page.getByRole("button", {
    name: "Open workspace menu",
    exact: true,
  });
  if (await menuTrigger.isVisible()) {
    await menuTrigger.click();
    const menu = page.getByRole("dialog", {
      name: "Workspace menu",
      exact: true,
    });
    await expect(menu).toBeVisible();
    const accountEmail = menu
      .locator(".hl-workspace-account:visible")
      .locator(":scope > span");
    await expect(accountEmail).toBeVisible();
    await expect(accountEmail).toHaveText(email);
    await menu
      .getByRole("button", { name: "Close workspace menu", exact: true })
      .click();
    await expect(menu).toBeHidden();
  } else {
    const accountEmail = page
      .locator(".hl-workspace-account:visible")
      .locator(":scope > span");
    await expect(accountEmail).toBeVisible();
    await expect(accountEmail).toHaveText(email);
  }
  // Only a captured200 may be acknowledged, after exact destination/account
  // proof.303 retains the collector's existing document-visit rule. Existing
  // sessions fabricate no response. Untracked setup contexts add no allowance.
  if (response?.status() === 200 && diagnostics) {
    diagnostics.acknowledgeAction(
      response,
      "The exact login RSC action rendered its expected protected destination, heading and visible signed-in account.",
    );
  }
}
