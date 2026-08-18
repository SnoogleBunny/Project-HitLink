import { expect, test } from "@playwright/test";
import {
  BrowserDiagnosticsCollector,
  type BrowserDiagnostic,
} from "./support/browser-diagnostics";

const everyDiagnosticClass: BrowserDiagnostic[] = [
  {
    kind: "console",
    level: "error",
    message: "[error] unexpected console error",
    pageUrl: "about:blank",
  },
  {
    kind: "console",
    level: "warning",
    message: "[warning] unexpected console warning",
    pageUrl: "about:blank",
  },
  {
    kind: "hydration",
    level: "warning",
    message:
      "[warning] Hydration failed because the server rendered HTML did not match",
    pageUrl: "about:blank",
  },
  {
    kind: "pageerror",
    message: "uncaught browser error",
    pageUrl: "about:blank",
  },
  {
    kind: "requestfailed",
    isNavigationRequest: false,
    message: "net::ERR_FAILED: GET http://localhost:3000/failure",
    method: "GET",
    resourceType: "fetch",
    url: "http://localhost:3000/failure",
  },
  {
    kind: "response",
    message: "HTTP 400: GET http://localhost:3000/failure",
    method: "GET",
    status: 400,
    url: "http://localhost:3000/failure",
  },
  {
    kind: "external-request",
    message: "POST https://telemetry.invalid/collect",
    method: "POST",
    url: "https://telemetry.invalid/collect",
  },
];

function observeEveryDiagnosticClass(
  collector: BrowserDiagnosticsCollector,
): void {
  collector.observeConsole({
    level: "error",
    message: "unexpected console error",
    pageUrl: "about:blank",
  });
  collector.observeConsole({
    level: "warning",
    message: "unexpected console warning",
    pageUrl: "about:blank",
  });
  collector.observeConsole({
    level: "warning",
    message: "Hydration failed because the server rendered HTML did not match",
    pageUrl: "about:blank",
  });
  collector.observePageError("uncaught browser error", "about:blank");
  collector.observeRequestFailed({
    failureText: "net::ERR_FAILED",
    isNavigationRequest: false,
    method: "GET",
    resourceType: "fetch",
    url: "http://localhost:3000/failure",
  });
  collector.observeResponse({
    method: "GET",
    status: 400,
    url: "http://localhost:3000/failure",
  });
  collector.observeRequest({
    method: "POST",
    url: "https://telemetry.invalid/collect",
  });
}

test("fails closed on every required browser diagnostic class", () => {
  const collector = new BrowserDiagnosticsCollector();
  observeEveryDiagnosticClass(collector);

  expect(collector.diagnostics).toEqual(everyDiagnosticClass);
  expect(() => collector.assertNoUnexpected()).toThrow(
    /Unexpected diagnostics \(7\)/,
  );
});

test("uses exact one-event per-case allowances and rejects stale allowances", () => {
  const collector = new BrowserDiagnosticsCollector();
  const allowedDiagnostic = everyDiagnosticClass[0];

  collector.observeConsole({
    level: "error",
    message: "unexpected console error",
    pageUrl: "about:blank",
  });
  collector.allow(allowedDiagnostic);
  expect(() => collector.assertNoUnexpected()).not.toThrow();

  collector.allow(allowedDiagnostic);
  expect(() => collector.assertNoUnexpected()).toThrow(
    /Unused allowances \(1\)/,
  );
});

test("does not let a broad request-failure allowance hide a document navigation", () => {
  const collector = new BrowserDiagnosticsCollector();
  const url =
    "http://127.0.0.1:3100/dashboard/forms/form_1/versions/version_1/file";

  collector.observeRequestFailed({
    failureText: "net::ERR_ABORTED",
    isNavigationRequest: true,
    method: "GET",
    resourceType: "document",
    url,
  });
  collector.allow({
    kind: "requestfailed",
    message: `net::ERR_ABORTED: GET ${url}`,
    method: "GET",
    url,
  });

  expect(() => collector.assertNoUnexpected()).toThrow(
    /Unexpected diagnostics \(1\)[\s\S]*Unused allowances \(1\)/,
  );
});

test("classifies an unexpected external host without making a network request", () => {
  const collector = new BrowserDiagnosticsCollector();

  collector.observeRequest({
    method: "POST",
    url: "https://telemetry.invalid/collect",
  });

  expect(collector.externalRequests).toEqual([everyDiagnosticClass[6]]);
  expect(() => collector.assertNoExternalRequests()).toThrow(
    /Expected zero external browser requests, received 1/,
  );
});

test("ignores non-failing console levels, successful responses, and local hosts", () => {
  const collector = new BrowserDiagnosticsCollector();

  collector.observeConsole({
    level: "log",
    message: "expected information",
    pageUrl: "about:blank",
  });
  collector.observeResponse({
    method: "GET",
    status: 399,
    url: "http://localhost:3000/redirect",
  });
  for (const url of [
    "http://localhost:3000/",
    "http://127.0.0.1:3001/",
    "http://[::1]:3002/",
    "data:text/html,local",
    "about:blank",
  ]) {
    collector.observeRequest({ method: "GET", url });
  }

  expect(collector.diagnostics).toEqual([]);
  expect(() => collector.assertNoExternalRequests()).not.toThrow();
  expect(() => collector.assertNoUnexpected()).not.toThrow();
});
