import {
  expect,
  test as base,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from "@playwright/test";

export type BrowserDiagnosticKind =
  | "console"
  | "external-request"
  | "hydration"
  | "pageerror"
  | "requestfailed"
  | "response";

export type BrowserDiagnostic = {
  kind: BrowserDiagnosticKind;
  isNavigationRequest?: boolean;
  message: string;
  level?: "error" | "warning";
  method?: string;
  pageUrl?: string;
  resourceType?: string;
  status?: number;
  url?: string;
};

type ConsoleObservation = {
  level: string;
  message: string;
  pageUrl: string;
};

type RequestObservation = {
  method: string;
  url: string;
};

type RequestFailureObservation = RequestObservation & {
  failureText: string;
  isNavigationRequest: boolean;
  resourceType: string;
};

type ResponseObservation = RequestObservation & {
  status: number;
};

const hydrationPattern =
  /hydration|hydrated but some attributes|server rendered html|text content did not match/i;

function isLocalBrowserUrl(rawUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return true;
  }

  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}

function diagnosticKey(diagnostic: BrowserDiagnostic): string {
  return JSON.stringify({
    kind: diagnostic.kind,
    isNavigationRequest: diagnostic.isNavigationRequest,
    level: diagnostic.level,
    message: diagnostic.message,
    method: diagnostic.method,
    pageUrl: diagnostic.pageUrl,
    resourceType: diagnostic.resourceType,
    status: diagnostic.status,
    url: diagnostic.url,
  });
}

function formatDiagnostics(diagnostics: BrowserDiagnostic[]): string {
  return diagnostics
    .map((diagnostic) => `- ${diagnosticKey(diagnostic)}`)
    .join("\n");
}

export class BrowserDiagnosticsCollector {
  readonly #allowances: BrowserDiagnostic[] = [];
  readonly #diagnostics: BrowserDiagnostic[] = [];

  get diagnostics(): readonly BrowserDiagnostic[] {
    return this.#diagnostics.map((diagnostic) => ({ ...diagnostic }));
  }

  get externalRequests(): readonly BrowserDiagnostic[] {
    return this.#diagnostics
      .filter((diagnostic) => diagnostic.kind === "external-request")
      .map((diagnostic) => ({ ...diagnostic }));
  }

  allow(diagnostic: BrowserDiagnostic): void {
    this.#allowances.push({ ...diagnostic });
  }

  observeConsole(observation: ConsoleObservation): void {
    if (observation.level !== "warning" && observation.level !== "error") {
      return;
    }

    this.#diagnostics.push({
      kind: hydrationPattern.test(observation.message)
        ? "hydration"
        : "console",
      level: observation.level,
      message: `[${observation.level}] ${observation.message}`,
      pageUrl: observation.pageUrl,
    });
  }

  observePageError(message: string, pageUrl: string): void {
    this.#diagnostics.push({ kind: "pageerror", message, pageUrl });
  }

  observeRequest(observation: RequestObservation): void {
    if (isLocalBrowserUrl(observation.url)) {
      return;
    }

    this.#diagnostics.push({
      kind: "external-request",
      message: `${observation.method} ${observation.url}`,
      method: observation.method,
      url: observation.url,
    });
  }

  observeRequestFailed(observation: RequestFailureObservation): void {
    this.#diagnostics.push({
      kind: "requestfailed",
      isNavigationRequest: observation.isNavigationRequest,
      message: `${observation.failureText}: ${observation.method} ${observation.url}`,
      method: observation.method,
      resourceType: observation.resourceType,
      url: observation.url,
    });
  }

  observeResponse(observation: ResponseObservation): void {
    if (observation.status < 400) {
      return;
    }

    this.#diagnostics.push({
      kind: "response",
      message: `HTTP ${observation.status}: ${observation.method} ${observation.url}`,
      method: observation.method,
      status: observation.status,
      url: observation.url,
    });
  }

  assertNoExternalRequests(): void {
    const externalRequests = this.externalRequests;

    if (externalRequests.length > 0) {
      throw new Error(
        `Expected zero external browser requests, received ${externalRequests.length}:\n${formatDiagnostics([...externalRequests])}`,
      );
    }
  }

  assertNoUnexpected(): void {
    const remainingAllowances = this.#allowances.map((allowance) => ({
      allowance,
      used: false,
    }));
    const unexpected = this.#diagnostics.filter((diagnostic) => {
      const matchingAllowance = remainingAllowances.find(
        (entry) =>
          !entry.used &&
          diagnosticKey(entry.allowance) === diagnosticKey(diagnostic),
      );

      if (!matchingAllowance) {
        return true;
      }

      matchingAllowance.used = true;
      return false;
    });
    const unusedAllowances = remainingAllowances
      .filter((entry) => !entry.used)
      .map((entry) => entry.allowance);

    if (unexpected.length === 0 && unusedAllowances.length === 0) {
      return;
    }

    const sections = [
      "Browser diagnostics did not match the per-case allowlist.",
    ];
    if (unexpected.length > 0) {
      sections.push(
        `Unexpected diagnostics (${unexpected.length}):\n${formatDiagnostics(unexpected)}`,
      );
    }
    if (unusedAllowances.length > 0) {
      sections.push(
        `Unused allowances (${unusedAllowances.length}):\n${formatDiagnostics(unusedAllowances)}`,
      );
    }

    throw new Error(sections.join("\n\n"));
  }
}

function attachBrowserDiagnostics(
  context: BrowserContext,
  collector: BrowserDiagnosticsCollector,
): () => void {
  const pageErrorHandlers = new Map<Page, (error: Error) => void>();
  const onConsole = (message: ConsoleMessage) => {
    collector.observeConsole({
      level: message.type(),
      message: message.text(),
      pageUrl: message.page()?.url() ?? "unknown",
    });
  };
  const onRequest = (request: Request) => {
    collector.observeRequest({ method: request.method(), url: request.url() });
  };
  const onRequestFailed = (request: Request) => {
    collector.observeRequestFailed({
      failureText: request.failure()?.errorText ?? "Unknown request failure",
      isNavigationRequest: request.isNavigationRequest(),
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
    });
  };
  const onResponse = (response: Response) => {
    collector.observeResponse({
      method: response.request().method(),
      status: response.status(),
      url: response.url(),
    });
  };
  const attachPage = (page: Page) => {
    const onPageError = (error: Error) => {
      collector.observePageError(error.message, page.url());
    };
    pageErrorHandlers.set(page, onPageError);
    page.on("pageerror", onPageError);
  };

  context.on("console", onConsole);
  context.on("page", attachPage);
  context.on("request", onRequest);
  context.on("requestfailed", onRequestFailed);
  context.on("response", onResponse);
  for (const page of context.pages()) {
    attachPage(page);
  }

  return () => {
    context.off("console", onConsole);
    context.off("page", attachPage);
    context.off("request", onRequest);
    context.off("requestfailed", onRequestFailed);
    context.off("response", onResponse);
    for (const [page, onPageError] of pageErrorHandlers) {
      page.off("pageerror", onPageError);
    }
  };
}

async function attachReceipt(
  testInfo: TestInfo,
  collector: BrowserDiagnosticsCollector,
): Promise<void> {
  await testInfo.attach("browser-diagnostics.json", {
    body: JSON.stringify(
      {
        diagnostics: collector.diagnostics,
        externalRequests: collector.externalRequests,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
}

type BrowserDiagnosticsFixtures = {
  browserDiagnostics: BrowserDiagnosticsCollector;
};

export const test = base.extend<BrowserDiagnosticsFixtures>({
  browserDiagnostics: [
    async ({ context }, use, testInfo) => {
      const collector = new BrowserDiagnosticsCollector();
      const dispose = attachBrowserDiagnostics(context, collector);

      await use(collector);

      dispose();
      await attachReceipt(testInfo, collector);
      collector.assertNoUnexpected();
    },
    { auto: true },
  ],
});

export { expect };
export type { Locator, Page } from "@playwright/test";
