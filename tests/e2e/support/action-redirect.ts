import { expect, type Page } from "./browser-diagnostics";
import type { Response } from "@playwright/test";

/** Capture the action on this document; route and business proof follow later. */
export async function captureAction(
  page: Page,
  trigger: () => Promise<unknown>,
): Promise<Response> {
  const source = page.url();
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => {
      const request = candidate.request();
      return (
        candidate.url() === source &&
        request.method() === "POST" &&
        !!request.headers()["next-action"] &&
        !request.serviceWorker() &&
        request.frame() === page.mainFrame()
      );
    }),
    trigger(),
  ]);
  return response;
}

/** Transport and rendered-route proof only. Callers must prove their own UI and
 * database outcome before acknowledging a captured200 in browser diagnostics. */
export async function expectActionRedirect(
  page: Page,
  response: Response,
  destination: string,
): Promise<void> {
  const target = new URL(destination);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(target.hostname);
  const request = response.request();
  expect(new URL(request.url()).origin).toBe(target.origin);
  expect(request.method()).toBe("POST");
  expect(request.headers()["next-action"]).toBeTruthy();
  expect(request.serviceWorker()).toBeNull();
  expect(request.frame()).toBe(page.mainFrame());
  expect(request.isNavigationRequest()).toBe(false);
  expect(request.resourceType()).toBe("fetch");
  expect(request.headers().accept).toContain("text/x-component");
  expect([200, 303]).toContain(response.status());
  expect(response.headers()["content-type"]?.toLowerCase()).toMatch(
    /^text\/x-component(?:;|$)/,
  );
  expect(response.headers()["x-action-redirect"]).toBe(
    `${target.pathname}${target.search};push`,
  );
  await expect(page).toHaveURL(target.href);
}
