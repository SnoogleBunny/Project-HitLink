import { expect, test } from "./support/browser-diagnostics";

test("fails the case when Chromium emits an unallowlisted diagnostic", async ({
  page,
}) => {
  test.fail(
    true,
    "The diagnostics fixture must turn this otherwise-passing page into a failure.",
  );

  await page.setContent(
    "<main>diagnostics probe</main><script>console.error('RP-12 fail-closed probe')</script>",
  );
});

test("collects an allowlisted browser diagnostic in a real Chromium page", async ({
  browserDiagnostics,
  page,
}) => {
  const expectedDiagnostic = {
    kind: "console" as const,
    level: "error" as const,
    message: "[error] RP-12 unexpected console error",
    pageUrl: "about:blank",
  };
  browserDiagnostics.allow(expectedDiagnostic);

  await page.setContent(
    "<main>diagnostics probe</main><script>console.error('RP-12 unexpected console error')</script>",
  );

  expect(browserDiagnostics.diagnostics).toEqual([expectedDiagnostic]);
});

test("provider-unavailable fallback asserts zero external browser requests", async ({
  browserDiagnostics,
  page,
}) => {
  await page.setContent(
    "<main>Provider unavailable; local fallback only.</main>",
  );

  expect(browserDiagnostics.externalRequests).toEqual([]);
  expect(() => browserDiagnostics.assertNoExternalRequests()).not.toThrow();
});
