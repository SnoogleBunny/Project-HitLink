import {
  expect,
  test as base,
  type BrowserContext,
  type ConsoleMessage,
  type Frame,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from "@playwright/test";
import { writeFile } from "node:fs/promises";

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

type DocumentReplacement = {
  startedOrder: number;
  committedOrder?: number;
  status?: number;
  url: string;
};

type DocumentEvidence = {
  visits: { order: number; url: string }[];
  replacements: DocumentReplacement[];
};

type RequestLifecycleEvidence = {
  document: DocumentEvidence;
  requestOrder: number;
  response?: {
    order: number;
    status: number;
    contentType?: string;
    redirect?: string;
    location?: string;
  };
  failureOrder?: number;
  acknowledgedOutcome?: string;
  acknowledgedNavigation?: { visitedUrl: string; outcome: string };
  redirectedFrom?: {
    method: string;
    url: string;
    action: boolean;
    rsc?: string;
    prefetch?: string;
    lifecycle?: RequestLifecycleEvidence;
  };
};

export type RequestFailureObservation = RequestObservation & {
  failureText: string;
  isNavigationRequest: boolean;
  resourceType: string;
  headers?: Record<string, string>;
  lifecycle?: RequestLifecycleEvidence;
};

type VerifiedCancellation = {
  reason:
    | "rendered-rsc-route"
    | "acknowledged-rendered-navigation"
    | "completed-action-redirect"
    | "acknowledged-action-outcome"
    | "acknowledged-action-http-redirect"
    | "redirected-route-prefetch";
  method: string;
  url: string;
  responseStatus: number;
  responseType: string;
  redirect?: string;
  visitedUrl?: string;
  outcome?: string;
  sourceUrl?: string;
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

function localHttpUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    return /^(http|https):$/.test(url.protocol) && isLocalBrowserUrl(rawUrl)
      ? url
      : null;
  } catch {
    return null;
  }
}

function documentUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  return url.href;
}

function verifiedCancellation(
  observation: RequestFailureObservation,
): VerifiedCancellation | null {
  const requestUrl = localHttpUrl(observation.url);
  const evidence = observation.lifecycle;
  const response = evidence?.response;
  if (
    !requestUrl ||
    observation.failureText !== "net::ERR_ABORTED" ||
    observation.isNavigationRequest ||
    observation.resourceType !== "fetch" ||
    !evidence ||
    !response ||
    response.status < 200 ||
    response.status >= 400 ||
    !response.contentType?.toLowerCase().startsWith("text/x-component") ||
    response.order <= evidence.requestOrder ||
    evidence.failureOrder === undefined
  )
    return null;

  const receipt = {
    method: observation.method,
    url: observation.url,
    responseStatus: response.status,
    responseType: response.contentType,
  };
  const visited = (url: string) =>
    evidence.document.visits.find(
      (visit) =>
        visit.order > response.order &&
        documentUrl(visit.url) === documentUrl(url),
    );
  if (
    observation.method === "GET" &&
    observation.headers?.rsc === "1" &&
    !!observation.headers["next-router-state-tree"] &&
    requestUrl.searchParams.has("_rsc")
  ) {
    const routeUrl = new URL(requestUrl);
    routeUrl.searchParams.delete("_rsc");
    const acknowledged = evidence.acknowledgedNavigation;
    if (
      response.status === 200 &&
      acknowledged &&
      documentUrl(acknowledged.visitedUrl) === documentUrl(routeUrl.href)
    ) {
      return {
        ...receipt,
        visitedUrl: acknowledged.visitedUrl,
        outcome: acknowledged.outcome,
        reason: "acknowledged-rendered-navigation",
      };
    }
    const visit = visited(routeUrl.href);
    return visit
      ? { ...receipt, visitedUrl: visit.url, reason: "rendered-rsc-route" }
      : null;
  }

  // Browser-followed HTTP redirects remain linked to their exact source
  // Request. An unrelated GET, URL match, or other action cannot qualify.
  const source = evidence.redirectedFrom;
  const sourceResponse = source?.lifecycle?.response;
  if (
    observation.method === "GET" &&
    source?.method === "GET" &&
    !source.action &&
    source.rsc === "1" &&
    source.prefetch === "1" &&
    sourceResponse?.status === 307 &&
    sourceResponse.location
  ) {
    const sourceUrl = localHttpUrl(source.url);
    let destination: URL;
    try {
      destination = new URL(sourceResponse.location, source.url);
    } catch {
      return null;
    }
    if (
      sourceUrl?.origin === requestUrl.origin &&
      sourceUrl.searchParams.has("_rsc") &&
      destination.href === requestUrl.href
    )
      return {
        ...receipt,
        sourceUrl: source.url,
        redirect: destination.href,
        reason: "redirected-route-prefetch",
      };
  }
  if (
    observation.method === "GET" &&
    source?.method === "POST" &&
    source.action &&
    sourceResponse?.status === 303
  ) {
    let destination: URL | undefined;
    let actionDestination: URL | undefined;
    try {
      if (sourceResponse.location)
        destination = new URL(sourceResponse.location, source.url);
      const redirect = sourceResponse.redirect;
      if (redirect && /;(push|replace)$/.test(redirect))
        actionDestination = new URL(
          redirect.slice(0, redirect.lastIndexOf(";")),
          source.url,
        );
    } catch {
      return null;
    }
    if (
      localHttpUrl(source.url)?.origin === requestUrl.origin &&
      destination?.href === requestUrl.href &&
      (source.lifecycle?.acknowledgedOutcome ||
        actionDestination?.href === destination.href)
    )
      return {
        ...receipt,
        sourceUrl: source.url,
        outcome: source.lifecycle?.acknowledgedOutcome,
        redirect: destination.href,
        reason: "acknowledged-action-http-redirect",
      };
  }

  if (
    observation.method !== "POST" ||
    !observation.headers?.["next-action"] ||
    !observation.headers.accept?.includes("text/x-component")
  )
    return null;
  if (response.status === 200 && evidence.acknowledgedOutcome) {
    return {
      ...receipt,
      outcome: evidence.acknowledgedOutcome,
      reason: "acknowledged-action-outcome",
    };
  }
  if (response.status !== 303 || !response.redirect) return null;
  const separator = response.redirect.lastIndexOf(";");
  if (
    separator < 0 ||
    !["push", "replace"].includes(response.redirect.slice(separator + 1))
  )
    return null;
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(response.redirect.slice(0, separator), requestUrl);
  } catch {
    return null;
  }
  if (redirectUrl.origin !== requestUrl.origin) return null;
  // SPA navigation can be reported just before or just after requestfailed.
  // Require the exact redirect destination on this request's own document.
  const visit = visited(redirectUrl.href);
  if (!visit) return null;
  return {
    ...receipt,
    redirect: redirectUrl.href,
    visitedUrl: visit.url,
    reason: "completed-action-redirect",
  };
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

type RenderedNavigationIntent = {
  page: Page;
  document: DocumentEvidence;
  sourceUrl: string;
  destinationUrl: string;
  startedOrder: number;
  requests: Set<Request>;
  boundRequest?: Request;
  closed: boolean;
};
const navigationAcknowledgementError = () =>
  new Error(
    "Only an observed successful same-document RSC navigation bound to a unique new navigation intent can be acknowledged after its rendered outcome is verified.",
  );

export class BrowserDiagnosticsCollector {
  readonly #allowances: BrowserDiagnostic[] = [];
  readonly #diagnostics: BrowserDiagnostic[] = [];
  readonly #requestFailures = new Map<
    BrowserDiagnostic,
    RequestFailureObservation
  >();
  readonly #trackedActions = new WeakMap<Request, RequestLifecycleEvidence>();
  readonly #trackedNavigations = new WeakMap<
    Request,
    {
      lifecycle: RequestLifecycleEvidence;
      page: Page;
      isCurrentDocument: () => boolean;
      response?: Response;
      intent?: RenderedNavigationIntent;
    }
  >();
  readonly #navigationPages = new WeakMap<
    Page,
    () => { document: DocumentEvidence; order: number } | undefined
  >();
  readonly #navigationIntents = new WeakMap<object, RenderedNavigationIntent>();
  readonly #activeNavigationIntents = new WeakMap<
    Page,
    RenderedNavigationIntent
  >();
  readonly cancelledPrefetches: string[] = [];
  readonly failureEvidence: unknown[] = [];

  trackAction(request: Request, lifecycle: RequestLifecycleEvidence): void {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      this.#trackedActions.set(request, lifecycle);
    }
  }

  /** Attachment-owned state; product tests never supply document/ordering fields. */
  trackNavigationPage(
    page: Page,
    read: () => { document: DocumentEvidence; order: number } | undefined,
  ): void {
    this.#navigationPages.set(page, read);
  }

  /** Opaque, single-use observable interval. This does not claim router causality. */
  beginRenderedNavigation(page: Page, destination: string): object {
    const state = this.#navigationPages.get(page)?.();
    const source = localHttpUrl(page.url());
    const target = source
      ? localHttpUrl(new URL(destination, source).href)
      : null;
    if (
      !state ||
      !state.document.visits.length ||
      page.isClosed() ||
      !source ||
      !target ||
      source.origin !== target.origin ||
      target.searchParams.has("_rsc") ||
      documentUrl(source.href) === documentUrl(target.href) ||
      documentUrl(state.document.visits.at(-1)?.url ?? source.href) !==
        documentUrl(source.href)
    )
      throw navigationAcknowledgementError();
    const prior = this.#activeNavigationIntents.get(page);
    if (prior && !prior.closed && prior.document === state.document)
      throw navigationAcknowledgementError();
    if (prior) prior.closed = true;
    const intent: RenderedNavigationIntent = {
      page,
      document: state.document,
      sourceUrl: documentUrl(source.href),
      destinationUrl: documentUrl(target.href),
      startedOrder: state.order,
      requests: new Set(),
      closed: false,
    };
    const token: object = Object.freeze({});
    this.#navigationIntents.set(token, intent);
    this.#activeNavigationIntents.set(page, intent);
    return token;
  }

  /** Only attachment-observed main-frame Requests can enter an active intent. */
  trackRenderedNavigation(
    request: Request,
    lifecycle: RequestLifecycleEvidence,
    page: Page,
    isCurrentDocument: () => boolean,
  ): void {
    const url = localHttpUrl(request.url());
    const headers = request.headers();
    if (
      url &&
      request.method() === "GET" &&
      !request.isNavigationRequest() &&
      request.resourceType() === "fetch" &&
      headers.rsc === "1" &&
      !!headers["next-router-state-tree"] &&
      headers["next-router-prefetch"] !== "1" &&
      url.searchParams.has("_rsc")
    ) {
      url.searchParams.delete("_rsc");
      const intent = this.#activeNavigationIntents.get(page);
      const matchesIntent =
        !!intent &&
        !intent.closed &&
        intent.document === lifecycle.document &&
        lifecycle.requestOrder > intent.startedOrder &&
        documentUrl(url.href) === intent.destinationUrl;
      if (matchesIntent) intent.requests.add(request);
      this.#trackedNavigations.set(request, {
        lifecycle,
        page,
        isCurrentDocument,
        ...(matchesIntent ? { intent } : {}),
      });
    }
  }

  trackNavigationResponse(response: Response): void {
    const tracked = this.#trackedNavigations.get(response.request());
    if (tracked) tracked.response = response;
  }

  bindRenderedNavigationRequest(token: object, request: Request): void {
    const intent = this.#navigationIntents.get(token);
    const tracked = this.#trackedNavigations.get(request);
    if (
      !intent ||
      intent.closed ||
      intent.boundRequest ||
      intent.requests.size !== 1 ||
      !intent.requests.has(request) ||
      !tracked ||
      tracked.intent !== intent ||
      tracked.page !== intent.page ||
      !tracked.isCurrentDocument() ||
      this.#activeNavigationIntents.get(intent.page) !== intent
    )
      throw navigationAcknowledgementError();
    intent.boundRequest = request;
  }

  /** The caller verifies visible/DB outcome, then acknowledges this exact Response. */
  acknowledgeRenderedNavigation(
    token: object,
    response: Response,
    outcome: string,
  ): void {
    const intent = this.#navigationIntents.get(token);
    const request = response.request();
    const tracked = this.#trackedNavigations.get(request);
    const url = localHttpUrl(request.url());
    if (
      !intent ||
      intent.closed ||
      intent.boundRequest !== request ||
      intent.requests.size !== 1 ||
      !intent.requests.has(request) ||
      !tracked ||
      tracked.intent !== intent ||
      tracked.response !== response ||
      tracked.page !== intent.page ||
      !url ||
      !outcome.trim() ||
      tracked.page.isClosed() ||
      !tracked.isCurrentDocument() ||
      this.#activeNavigationIntents.get(intent.page) !== intent
    )
      throw navigationAcknowledgementError();
    url.searchParams.delete("_rsc");
    const { lifecycle, page } = tracked;
    const visits = lifecycle.document.visits.filter(
      (item) => item.order > intent.startedOrder,
    );
    const transitionIndex = visits.findIndex(
      (item) => documentUrl(item.url) !== intent.sourceUrl,
    );
    const visit = transitionIndex < 0 ? undefined : visits[transitionIndex];
    const previous = lifecycle.document.visits
      .filter((item) => item.order < lifecycle.requestOrder)
      .at(-1);
    if (
      response.status() !== 200 ||
      lifecycle.response?.status !== 200 ||
      lifecycle.response.order <= lifecycle.requestOrder ||
      !response
        .headers()
        ["content-type"]?.toLowerCase()
        .startsWith("text/x-component") ||
      !lifecycle.response.contentType
        ?.toLowerCase()
        .startsWith("text/x-component") ||
      !visit ||
      visit.order <= lifecycle.requestOrder ||
      documentUrl(visit.url) !== intent.destinationUrl ||
      visits
        .slice(transitionIndex)
        .some((item) => documentUrl(item.url) !== intent.destinationUrl) ||
      !previous ||
      documentUrl(previous.url) !== intent.sourceUrl ||
      documentUrl(url.href) !== intent.destinationUrl ||
      documentUrl(page.url()) !== intent.destinationUrl
    )
      throw navigationAcknowledgementError();
    lifecycle.acknowledgedNavigation = {
      visitedUrl: visit.url,
      outcome: outcome.trim(),
    };
    intent.closed = true;
    this.#activeNavigationIntents.delete(page);
  }

  acknowledgeAction(response: Response, outcome: string): void {
    const request = response.request();
    const lifecycle = this.#trackedActions.get(request);
    if (
      !lifecycle ||
      !outcome.trim() ||
      !localHttpUrl(request.url()) ||
      request.isNavigationRequest() ||
      request.resourceType() !== "fetch" ||
      response.status() !== 200 ||
      !request.headers().accept?.includes("text/x-component") ||
      !response.headers()["content-type"]?.startsWith("text/x-component")
    )
      throw new Error(
        "Only an observed successful Next action can be acknowledged after its outcome is verified.",
      );
    lifecycle.acknowledgedOutcome = outcome;
  }

  get diagnostics(): readonly BrowserDiagnostic[] {
    return this.#diagnostics
      .filter((diagnostic) => {
        const failure = this.#requestFailures.get(diagnostic);
        return !failure || !verifiedCancellation(failure);
      })
      .map((diagnostic) => ({ ...diagnostic }));
  }

  get verifiedCancellations(): readonly VerifiedCancellation[] {
    return [...this.#requestFailures.values()].flatMap((failure) => {
      const receipt = verifiedCancellation(failure);
      return receipt ? [receipt] : [];
    });
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
    // Next cancels speculative route prefetches when a full navigation replaces
    // the page. Keep an explicit receipt; actual navigations, assets, ordinary
    // fetches and failed prefetch responses still fail the case.
    if (
      observation.failureText === "net::ERR_ABORTED" &&
      observation.method === "GET" &&
      !observation.isNavigationRequest &&
      observation.resourceType === "fetch" &&
      observation.headers?.["next-router-prefetch"] === "1" &&
      observation.headers?.rsc === "1" &&
      isLocalBrowserUrl(observation.url) &&
      new URL(observation.url).searchParams.has("_rsc")
    ) {
      this.cancelledPrefetches.push(observation.url);
      return;
    }
    const diagnostic: BrowserDiagnostic = {
      kind: "requestfailed",
      isNavigationRequest: observation.isNavigationRequest,
      message: `${observation.failureText}: ${observation.method} ${observation.url}`,
      method: observation.method,
      resourceType: observation.resourceType,
      url: observation.url,
    };
    this.#requestFailures.set(diagnostic, observation);
    this.#diagnostics.push(diagnostic);
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
    const unexpected = this.diagnostics.filter((diagnostic) => {
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

export function attachBrowserDiagnostics(
  context: BrowserContext,
  collector: BrowserDiagnosticsCollector,
): () => void {
  const pageErrorHandlers = new Map<Page, (error: Error) => void>();
  const navigationHandlers = new Map<Page, (frame: Frame) => void>();
  const responses = new WeakMap<Request, Response>();
  const lifecycles = new WeakMap<Request, RequestLifecycleEvidence>();
  const navigationRequests = new WeakMap<Request, DocumentReplacement>();
  const pageDocuments = new Map<
    Page,
    {
      current: DocumentEvidence;
      pending?: DocumentReplacement;
    }
  >();
  let order = 0;
  const onConsole = (message: ConsoleMessage) => {
    collector.observeConsole({
      level: message.type(),
      message: message.text(),
      pageUrl: message.page()?.url() ?? "unknown",
    });
  };
  const onRequest = (request: Request) => {
    collector.observeRequest({ method: request.method(), url: request.url() });
    // Worker requests have no frame and can never qualify for this exception.
    if (request.serviceWorker()) return;
    const frame = request.frame();
    const page = frame.page();
    const state = pageDocuments.get(page);
    if (!state || frame !== page.mainFrame()) return;
    const source = request.redirectedFrom();
    const lifecycle: RequestLifecycleEvidence = {
      document: state.current,
      requestOrder: ++order,
      redirectedFrom: source
        ? {
            url: source.url(),
            method: source.method(),
            action: !!source.headers()["next-action"],
            rsc: source.headers().rsc,
            prefetch: source.headers()["next-router-prefetch"],
            lifecycle: lifecycles.get(source),
          }
        : undefined,
    };
    lifecycles.set(request, lifecycle);
    collector.trackAction(request, lifecycle);
    collector.trackRenderedNavigation(
      request,
      lifecycle,
      page,
      () => pageDocuments.get(page)?.current === lifecycle.document,
    );
    if (
      request.isNavigationRequest() &&
      request.resourceType() === "document"
    ) {
      const redirectedFrom = request.redirectedFrom();
      const replacement = redirectedFrom
        ? navigationRequests.get(redirectedFrom)
        : undefined;
      const pending = replacement ?? {
        startedOrder: ++order,
        url: request.url(),
      };
      pending.url = request.url();
      if (!replacement) state.current.replacements.push(pending);
      navigationRequests.set(request, pending);
      state.pending = pending;
    }
  };
  const onRequestFailed = (request: Request) => {
    const headers = request.headers();
    const response = responses.get(request);
    const lifecycle = lifecycles.get(request);
    if (lifecycle) lifecycle.failureOrder = ++order;
    collector.failureEvidence.push({
      url: request.url(),
      method: request.method(),
      rsc: headers.rsc,
      prefetch: headers["next-router-prefetch"],
      segmentPrefetch: headers["next-router-segment-prefetch"],
      action: !!headers["next-action"],
      responseStatus: response?.status(),
      responseType: response?.headers()["content-type"],
      redirect: response?.headers()["x-action-redirect"],
      // Keep these safe objects by reference: replacement commits can arrive
      // after requestfailed, before the final receipt is serialized.
      lifecycle: lifecycle
        ? {
            requestOrder: lifecycle.requestOrder,
            response: lifecycle.response,
            failureOrder: lifecycle.failureOrder,
            visits: lifecycle.document.visits,
            replacements: lifecycle.document.replacements,
            redirectedFrom: lifecycle.redirectedFrom,
          }
        : undefined,
    });
    collector.observeRequestFailed({
      failureText: request.failure()?.errorText ?? "Unknown request failure",
      isNavigationRequest: request.isNavigationRequest(),
      method: request.method(),
      resourceType: request.resourceType(),
      headers: request.headers(),
      lifecycle,
      url: request.url(),
    });
  };
  const onResponse = (response: Response) => {
    responses.set(response.request(), response);
    const lifecycle = lifecycles.get(response.request());
    if (lifecycle)
      lifecycle.response = {
        order: ++order,
        status: response.status(),
        contentType: response.headers()["content-type"],
        redirect: response.headers()["x-action-redirect"],
        location: response.headers().location,
      };
    collector.trackNavigationResponse(response);
    const replacement = navigationRequests.get(response.request());
    if (replacement) {
      replacement.status = response.status();
      replacement.url = response.url();
    }
    collector.observeResponse({
      method: response.request().method(),
      status: response.status(),
      url: response.url(),
    });
  };
  const attachPage = (page: Page) => {
    if (pageDocuments.has(page)) return;
    pageDocuments.set(page, {
      current: {
        visits: [{ order: ++order, url: page.url() }],
        replacements: [],
      },
    });
    collector.trackNavigationPage(page, () => {
      const state = pageDocuments.get(page);
      return state ? { document: state.current, order } : undefined;
    });
    const onNavigation = (frame: Frame) => {
      if (frame !== page.mainFrame()) return;
      const state = pageDocuments.get(page)!;
      const pending = state.pending;
      if (
        pending?.status !== undefined &&
        documentUrl(pending.url) === documentUrl(frame.url())
      ) {
        pending.committedOrder = ++order;
        state.current = { visits: [], replacements: [] };
        state.pending = undefined;
      }
      state.current.visits.push({ order: ++order, url: frame.url() });
    };
    navigationHandlers.set(page, onNavigation);
    page.on("framenavigated", onNavigation);
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
    for (const [page, onNavigation] of navigationHandlers) {
      page.off("framenavigated", onNavigation);
    }
  };
}

async function attachReceipt(
  testInfo: TestInfo,
  collector: BrowserDiagnosticsCollector,
): Promise<void> {
  const receiptPath = testInfo.outputPath("browser-diagnostics.json");
  await writeFile(
    receiptPath,
    JSON.stringify(
      {
        diagnostics: collector.diagnostics,
        externalRequests: collector.externalRequests,
        cancelledPrefetches: collector.cancelledPrefetches,
        failureEvidence: collector.failureEvidence,
        verifiedCancellations: collector.verifiedCancellations,
      },
      null,
      2,
    ),
  );
  await testInfo.attach("browser-diagnostics.json", {
    path: receiptPath,
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
