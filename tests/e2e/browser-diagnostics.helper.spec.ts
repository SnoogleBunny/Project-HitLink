import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import {
  attachBrowserDiagnostics,
  BrowserDiagnosticsCollector,
  type BrowserDiagnostic,
  type RequestFailureObservation,
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

function completedActionAbort(): RequestFailureObservation {
  return {
    method: "POST",
    url: "http://localhost:3100/login",
    failureText: "net::ERR_ABORTED",
    isNavigationRequest: false,
    resourceType: "fetch",
    headers: { "next-action": "test-action", accept: "text/x-component" },
    lifecycle: {
      requestOrder: 1,
      response: {
        order: 2,
        status: 303,
        contentType: "text/x-component",
        redirect: "/dashboard;push",
      },
      failureOrder: 5,
      document: {
        visits: [{ order: 3, url: "http://localhost:3100/dashboard" }],
        replacements: [
          {
            startedOrder: 4,
            committedOrder: 6,
            status: 200,
            url: "http://localhost:3100/dashboard/members",
          },
        ],
      },
    },
  };
}

test("requires the exact successful SPA redirect before or after its abort", () => {
  const request = completedActionAbort();
  const collector = new BrowserDiagnosticsCollector();
  request.lifecycle!.document.replacements = [];
  request.lifecycle!.document.visits = [];
  collector.observeRequestFailed(request);
  expect(() => collector.assertNoUnexpected()).toThrow(
    /Unexpected diagnostics/,
  );
  request.lifecycle!.document.visits.push({
    order: 6,
    url: "http://localhost:3100/dashboard",
  });
  expect(() => collector.assertNoUnexpected()).not.toThrow();
  expect(collector.verifiedCancellations).toEqual([
    {
      reason: "completed-action-redirect",
      method: "POST",
      url: request.url,
      responseStatus: 303,
      responseType: "text/x-component",
      redirect: "http://localhost:3100/dashboard",
      visitedUrl: "http://localhost:3100/dashboard",
    },
  ]);
});

test("keeps generic requests, failed actions and unproven supersessions strict", () => {
  const mutations: ((request: RequestFailureObservation) => void)[] = [
    (r) => {
      r.failureText = "net::ERR_FAILED";
    },
    (r) => {
      r.isNavigationRequest = true;
    },
    (r) => {
      r.resourceType = "document";
    },
    (r) => {
      r.method = "GET";
    },
    (r) => {
      r.url = "https://example.test/login";
    },
    (r) => {
      r.headers = {};
    },
    (r) => {
      r.headers = { "next-action": "test-action" };
    },
    (r) => {
      delete r.lifecycle;
    },
    (r) => {
      delete r.lifecycle!.response;
    },
    (r) => {
      r.lifecycle!.response!.status = 400;
    },
    (r) => {
      r.lifecycle!.response!.contentType = "text/html";
    },
    (r) => {
      r.lifecycle!.response!.redirect = undefined;
    },
    (r) => {
      r.lifecycle!.response!.redirect = "//example.test/dashboard;push";
    },
    (r) => {
      r.lifecycle!.response!.redirect = "//[invalid;push";
    },
    (r) => {
      r.lifecycle!.response!.redirect = "/dashboard;unknown";
    },
    (r) => {
      r.lifecycle!.document.visits = [];
    },
    (r) => {
      r.lifecycle!.document.visits[0].url += "/different";
    },
    (r) => {
      r.lifecycle!.document.visits[0].order = 1;
    },
    (r) => {
      r.lifecycle!.document.visits[0].url = "http://localhost:3200/dashboard";
    },
    (r) => {
      r.lifecycle!.response!.status = 200;
    },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const request = completedActionAbort();
    mutate(request);
    const collector = new BrowserDiagnosticsCollector();
    collector.observeRequestFailed(request);
    expect(
      () => collector.assertNoUnexpected(),
      `negative case ${index}`,
    ).toThrow(/Unexpected diagnostics/);
    expect(collector.verifiedCancellations).toEqual([]);
  }
});

test("requires successful RSC headers and the exact rendered route for GET", () => {
  const request = completedActionAbort();
  request.method = "GET";
  request.url = "http://localhost:3100/app/schedule?_rsc=probe";
  request.headers = { rsc: "1", "next-router-state-tree": "test-tree" };
  request.lifecycle!.response = {
    order: 2,
    status: 200,
    contentType: "text/x-component; charset=utf-8",
  };
  request.lifecycle!.document.visits = [
    { order: 3, url: "http://localhost:3100/app/schedule" },
  ];
  const collector = new BrowserDiagnosticsCollector();
  collector.observeRequestFailed(request);
  expect(() => collector.assertNoUnexpected()).not.toThrow();
  expect(collector.verifiedCancellations[0].reason).toBe("rendered-rsc-route");
  const changes: Partial<RequestFailureObservation>[] = [
    { url: "http://localhost:3100/app/schedule" },
    { headers: { rsc: "1" } },
    { headers: { "next-router-state-tree": "test-tree" } },
    { url: "http://localhost:3100/app/schedule?date=other&_rsc=probe" },
  ];
  for (const changed of changes) {
    const failed = new BrowserDiagnosticsCollector();
    failed.observeRequestFailed({ ...request, ...changed });
    expect(() => failed.assertNoUnexpected()).toThrow(/Unexpected diagnostics/);
  }
});

test("requires exact browser redirect ancestry for a non-RSC GET", () => {
  const request = completedActionAbort();
  request.method = "GET";
  request.url = "http://localhost:3100/app";
  request.headers = {};
  request.lifecycle!.response = {
    order: 2,
    status: 200,
    contentType: "text/x-component",
  };
  request.lifecycle!.document.visits = [];
  const source = completedActionAbort();
  source.lifecycle!.response!.redirect = "/app;push";
  source.lifecycle!.response!.location = "/app";
  request.lifecycle!.redirectedFrom = {
    method: "POST",
    url: source.url,
    action: true,
    lifecycle: source.lifecycle,
  };
  const collector = new BrowserDiagnosticsCollector();
  collector.observeRequestFailed(request);
  expect(() => collector.assertNoUnexpected()).not.toThrow();
  expect(collector.verifiedCancellations[0].reason).toBe(
    "acknowledged-action-http-redirect",
  );
  for (const change of [
    { action: false },
    { method: "GET" },
    { url: "http://localhost:3200/login" },
    { lifecycle: undefined },
  ]) {
    const failed = new BrowserDiagnosticsCollector();
    failed.observeRequestFailed({
      ...request,
      lifecycle: {
        ...request.lifecycle!,
        redirectedFrom: { ...request.lifecycle!.redirectedFrom!, ...change },
      },
    });
    expect(() => failed.assertNoUnexpected()).toThrow(/Unexpected diagnostics/);
  }
  source.lifecycle!.response!.location = "/different";
  expect(() => collector.assertNoUnexpected()).toThrow(
    /Unexpected diagnostics/,
  );
});

test("requires exact marked ancestry for a redirected route prefetch", () => {
  const request = completedActionAbort();
  request.method = "GET";
  request.url = "http://localhost:3100/app";
  request.headers = {};
  request.lifecycle!.response = {
    order: 4,
    status: 200,
    contentType: "text/x-component",
  };
  request.lifecycle!.document.visits = [];
  request.lifecycle!.redirectedFrom = {
    method: "GET",
    url: "http://localhost:3100/login?_rsc=probe",
    action: false,
    rsc: "1",
    prefetch: "1",
    lifecycle: {
      requestOrder: 0,
      response: { order: 1, status: 307, location: "/app" },
      document: { visits: [], replacements: [] },
    },
  };
  const collector = new BrowserDiagnosticsCollector();
  collector.observeRequestFailed(request);
  expect(() => collector.assertNoUnexpected()).not.toThrow();
  expect(collector.verifiedCancellations[0]).toMatchObject({
    reason: "redirected-route-prefetch",
    sourceUrl: "http://localhost:3100/login?_rsc=probe",
    redirect: request.url,
  });
  const changes: ((value: RequestFailureObservation) => void)[] = [
    (r) => {
      r.lifecycle!.redirectedFrom!.url =
        "http://localhost:3200/login?_rsc=probe";
    },
    (r) => {
      r.lifecycle!.redirectedFrom!.url =
        "https://example.test/login?_rsc=probe";
    },
    (r) => {
      r.lifecycle!.redirectedFrom!.url = "http://localhost:3100/login";
    },
    (r) => {
      r.lifecycle!.redirectedFrom!.lifecycle!.response!.status = 303;
    },
    (r) => {
      r.lifecycle!.redirectedFrom!.lifecycle!.response!.location = "/different";
    },
    (r) => {
      r.lifecycle!.redirectedFrom!.prefetch = undefined;
    },
    (r) => {
      r.lifecycle!.redirectedFrom!.rsc = undefined;
    },
    (r) => {
      r.lifecycle!.redirectedFrom!.action = true;
    },
    (r) => {
      r.lifecycle!.redirectedFrom!.method = "POST";
    },
    (r) => {
      r.lifecycle!.response!.status = 500;
    },
  ];
  for (const change of changes) {
    const altered = structuredClone(request);
    change(altered);
    const failed = new BrowserDiagnosticsCollector();
    failed.observeRequestFailed(altered);
    expect(() => failed.assertNoUnexpected()).toThrow(/Unexpected diagnostics/);
  }
});

test("tracks exact real Chromium action, route and acknowledged outcomes", async ({
  browser,
}) => {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/action")) {
      response.writeHead(303, {
        "content-type": "text/x-component",
        "x-action-redirect": request.url.includes("unvisited")
          ? "/unvisited;push"
          : "/dashboard;push",
      });
      response.write("action-result");
    } else if (
      request.url?.startsWith("/rsc") ||
      request.url?.startsWith("/outcome")
    ) {
      response.writeHead(200, { "content-type": "text/x-component" });
      response.write("route-result");
    } else {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<main>Local streaming fixture</main>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture address.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const context = await browser.newContext();
  const collector = new BrowserDiagnosticsCollector();
  const dispose = attachBrowserDiagnostics(context, collector);
  try {
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.evaluate(async () => {
      const response = await fetch("/action", {
        method: "POST",
        headers: { "next-action": "fixture", accept: "text/x-component" },
      });
      await response.body!.getReader().read();
      history.pushState({}, "", "/dashboard");
      const rsc = await fetch("/rsc?_rsc=fixture", {
        headers: { rsc: "1", "next-router-state-tree": "fixture" },
      });
      await rsc.body!.getReader().read();
      history.pushState({}, "", "/rsc");
    });
    // A different page's document replacement cannot justify these requests.
    const other = await context.newPage();
    await other.goto(`${baseUrl}/other`);
    expect(collector.verifiedCancellations).toEqual([]);
    await page.goto(`${baseUrl}/next`);
    await expect.poll(() => collector.verifiedCancellations.length).toBe(2);
    expect(
      collector.verifiedCancellations.map((item) => item.reason).sort(),
    ).toEqual(["completed-action-redirect", "rendered-rsc-route"]);
    expect(() => collector.assertNoUnexpected()).not.toThrow();
    const outcomeResponsePromise = page.waitForResponse(
      (response) => response.url() === `${baseUrl}/outcome`,
    );
    await page.evaluate(async () => {
      const response = await fetch("/outcome", {
        method: "POST",
        headers: { "next-action": "fixture", accept: "text/x-component" },
      });
      await response.body!.getReader().read();
      document.querySelector("main")!.textContent = "Outcome verified";
    });
    const outcomeResponse = await outcomeResponsePromise;
    await expect(
      page.getByText("Outcome verified", { exact: true }),
    ).toBeVisible();
    collector.acknowledgeAction(
      outcomeResponse,
      "Exact action outcome verified in fixture UI.",
    );
    const ordinaryResponse = await page.goto(`${baseUrl}/acknowledged`);
    await expect.poll(() => collector.verifiedCancellations.length).toBe(3);
    expect(() =>
      collector.acknowledgeAction(ordinaryResponse!, "Unrelated response."),
    ).toThrow(/Only an observed successful Next action/);
    expect(collector.verifiedCancellations[2].reason).toBe(
      "acknowledged-action-outcome",
    );
    await page.evaluate(async () => {
      const controller = new AbortController();
      Object.assign(window, { abortProbe: () => controller.abort() });
      const response = await fetch("/action-unvisited", {
        method: "POST",
        headers: { "next-action": "fixture", accept: "text/x-component" },
        signal: controller.signal,
      });
      await response.body!.getReader().read();
      history.pushState({}, "", "/dashboard");
    });
    await other.goto(`${baseUrl}/different-page`);
    await page.evaluate(() => {
      (window as unknown as { abortProbe: () => void }).abortProbe();
    });
    await expect.poll(() => collector.diagnostics.length).toBe(1);
    // Neither another page's navigation nor a later navigation can excuse an
    // action that failed before this document started being replaced.
    await page.goto(`${baseUrl}/after-failure`);
    expect(() => collector.assertNoUnexpected()).toThrow(
      /Unexpected diagnostics/,
    );
    expect(collector.verifiedCancellations).toHaveLength(3);
  } finally {
    dispose();
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
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

test("records only explicitly marked cancelled local prefetches as benign", () => {
  const request = {
    method: "GET",
    url: "http://localhost:3100/dashboard?_rsc=test",
    failureText: "net::ERR_ABORTED",
    isNavigationRequest: false,
    resourceType: "fetch",
    headers: { rsc: "1", "next-router-prefetch": "1" },
  };
  const collector = new BrowserDiagnosticsCollector();
  collector.observeRequestFailed(request);
  expect(collector.cancelledPrefetches).toEqual([request.url]);
  expect(() => collector.assertNoUnexpected()).not.toThrow();
  for (const changed of [
    { headers: {} },
    { isNavigationRequest: true },
    { method: "POST" },
    { resourceType: "script" },
    { failureText: "net::ERR_FAILED" },
    { url: "https://example.test/dashboard?_rsc=test" },
  ]) {
    const failed = new BrowserDiagnosticsCollector();
    failed.observeRequestFailed({ ...request, ...changed });
    expect(() => failed.assertNoUnexpected()).toThrow(
      /Unexpected diagnostics \(1\)/,
    );
  }
});
