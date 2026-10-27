import { loginToWorkspace } from "./support/workspace-login";
import { createHash, randomUUID } from "node:crypto";
import type { Request, Response } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  schedulingPolicyHash,
  schedulingWeekdays,
  snapshotMembershipTerms,
  type Prisma,
} from "../../packages/db/src/index";
import {
  test,
  expect,
  type Locator,
  type Page,
  type BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";
const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  !/test|e2e/i.test(new URL(url).pathname)
)
  throw Error(
    "Late-booking acceptance requires an explicit dedicated local test database.",
  );
const db = new PrismaClient({ datasourceUrl: url });
const adminOrigin =
    process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100",
  memberOrigin =
    process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
type LateActionPhase =
  | "preview-initial"
  | "deny-unchecked"
  | "preview-fresh"
  | "confirm-checked";
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

// Passive observations only. Never await a response body or change action matching.
function observeOwnerLateActions(page: Page) {
  const startedAt = Date.now();
  let order = 0;
  let phase: LateActionPhase | null = null;
  let unmatchedHelperResponses = 0;
  const requests = new Map<Request, {
    ordinal: number;
    phase: LateActionPhase | null;
    requestOrder: number;
    requestMs: number;
    actionSha256: string;
    requestBodySha256: string | null;
    requestBodyBytes: number;
    responseOrder: number | null;
    responseMs: number | null;
    status: number | null;
    responseType: "rsc" | "html" | "other" | null;
    finishedOrder: number | null;
    finishedMs: number | null;
    failedOrder: number | null;
    failedMs: number | null;
    aborted: boolean;
    selectedByHelperOrder: number | null;
    helperReturnedOrder: number | null;
    helperReturnedMs: number | null;
  }>();
  const elapsed = () => Date.now() - startedAt;
  const onRequest = (request: Request) => {
    const action = request.headers()["next-action"];
    const requestUrl = new URL(request.url());
    if (request.method() !== "POST" || !action ||
      requestUrl.origin !== new URL(adminOrigin).origin ||
      requestUrl.pathname !== "/dashboard/bookings/late") return;
    const body = request.postDataBuffer();
    requests.set(request, {
      ordinal: requests.size + 1, phase, requestOrder: ++order,
      requestMs: elapsed(), actionSha256: sha256(action),
      requestBodySha256: body ? sha256(body) : null,
      requestBodyBytes: body?.length ?? 0,
      responseOrder: null, responseMs: null, status: null, responseType: null,
      finishedOrder: null, finishedMs: null, failedOrder: null, failedMs: null,
      aborted: false, selectedByHelperOrder: null,
      helperReturnedOrder: null, helperReturnedMs: null,
    });
  };
  const onResponse = (response: Response) => {
    const record = requests.get(response.request());
    if (!record) return;
    const contentType = response.headers()["content-type"] ?? "";
    record.responseOrder = ++order;
    record.responseMs = elapsed();
    record.status = response.status();
    record.responseType = contentType.startsWith("text/x-component") ? "rsc" :
      contentType.startsWith("text/html") ? "html" : "other";
  };
  const onFinished = (request: Request) => {
    const record = requests.get(request);
    if (record) { record.finishedOrder = ++order; record.finishedMs = elapsed(); }
  };
  const onFailed = (request: Request) => {
    const record = requests.get(request);
    if (record) {
      record.failedOrder = ++order;
      record.failedMs = elapsed();
      record.aborted = request.failure()?.errorText === "net::ERR_ABORTED";
    }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);
  return {
    begin(value: LateActionPhase) { phase = value; },
    selected(response: Response) {
      const record = requests.get(response.request());
      if (record) record.selectedByHelperOrder = ++order;
      else unmatchedHelperResponses++;
    },
    returned(response: Response) {
      const record = requests.get(response.request());
      if (record) {
        record.helperReturnedOrder = ++order;
        record.helperReturnedMs = elapsed();
      }
    },
    snapshot: () => ({
      elapsedMs: elapsed(), order, phase, unmatchedHelperResponses,
      requests: [...requests.values()].map((record) => ({ ...record })),
    }),
    dispose() {
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("requestfinished", onFinished);
      page.off("requestfailed", onFailed);
    },
  };
}

type LateDiagnosticFixture = {
  memberId: string;
  classTemplateId: string;
  membershipId: string;
  date: string;
};
const safeInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

async function ownerLatePersistedSnapshot(
  workspaceId: string,
  ownerId: string,
  fixture: LateDiagnosticFixture | null,
  operationId: string | null,
) {
  // One read-only repeatable snapshot; no lock, mutation, retry or completion wait.
  return db.$transaction(async (tx) => {
    const [clock] = await tx.$queryRaw<Array<{ capturedAt: string }>>`
      SELECT clock_timestamp()::text AS "capturedAt"`;
    const where = { workspaceId };
    const [bookings, allocations, entries, receipts, operations, holds,
      cards, cardEntries, notices, paymentCount] = await Promise.all([
      tx.classBooking.findMany({ where, orderBy: { id: "asc" }, select: {
        id: true, memberId: true, classTemplateId: true, scheduledForDate: true,
        status: true, bookingType: true, source: true, fundingRevision: true,
        fundingMembershipId: true, memberPunchCardId: true,
        consumedPunchCount: true, dropInProductId: true,
        dropInPaidAt: true, pendingPaymentExpiresAt: true,
      } }),
      tx.membershipAllowanceAllocation.findMany({ where, orderBy: { id: "asc" },
        select: { id: true, bookingId: true, memberMembershipId: true,
          kind: true, state: true, revision: true, bookingRevision: true,
          limit: true, periodStart: true, periodEnd: true } }),
      tx.membershipAllowanceEntry.findMany({ where,
        select: { allocationId: true, revision: true, reservedDelta: true, usedDelta: true } }),
      // Extract only listed proof keys in SQL. Private reason is never selected.
      tx.$queryRaw<Array<{
        id: string; actorMatches: boolean; operationId: string | null;
        bookingId: string | null; memberMatches: boolean | null;
        templateMatches: boolean | null; dateMatches: boolean | null;
        schemaVersion: Prisma.JsonValue | null;
        fundingRevision: Prisma.JsonValue | null;
        policyVersion: Prisma.JsonValue | null;
      }>>`SELECT id, ("actorUserId" = ${ownerId}) AS "actorMatches",
        metadata->>'operationId' AS "operationId", metadata->>'bookingId' AS "bookingId",
        (metadata->>'memberId' = ${fixture?.memberId ?? ""}) AS "memberMatches",
        (metadata->>'classTemplateId' = ${fixture?.classTemplateId ?? ""}) AS "templateMatches",
        (metadata->>'scheduledForDate' = ${fixture?.date ?? ""}) AS "dateMatches",
        metadata->'schemaVersion' AS "schemaVersion",
        metadata->'fundingRevision' AS "fundingRevision",
        metadata->'policyVersion' AS "policyVersion"
        FROM workspace_data_events WHERE "workspaceId" = ${workspaceId}
        AND kind = 'OWNER_LATE_BOOKING_CONFIRMED' ORDER BY id`,
      tx.financialOperation.findMany({ where, orderBy: { id: "asc" },
        select: { id: true, kind: true, status: true, version: true } }),
      tx.financialEntitlementHold.findMany({ where, orderBy: { id: "asc" },
        select: { targetKind: true, targetId: true, activeSlot: true, units: true,
          releasedAt: true, operationId: true } }),
      tx.memberPunchCard.findMany({ where, select: {
        status: true, originalPunches: true, remainingPunches: true } }),
      tx.punchCardEntry.findMany({ where, select: { delta: true } }),
      tx.notificationJob.findMany({ where, select: {
        templateKind: true, status: true, attempts: true } }),
      tx.payment.count({ where }),
    ]);
    const bookingIds = new Set(bookings.map((booking) => booking.id));
    return {
      captured: true, capturedAt: clock?.capturedAt ?? null,
      fixtureCaptured: fixture !== null,
      operationIdSha256: operationId ? sha256(operationId) : null,
      bookingCount: bookings.length,
      exactDatedBookingCount: bookings.filter((booking) =>
        fixture !== null && booking.memberId === fixture.memberId &&
        booking.classTemplateId === fixture.classTemplateId &&
        booking.scheduledForDate.toISOString().slice(0, 10) === fixture.date).length,
      bookings: bookings.map((booking) => ({
        idSha256: sha256(booking.id), status: booking.status,
        bookingType: booking.bookingType, source: booking.source,
        scheduledForDate: booking.scheduledForDate.toISOString().slice(0, 10),
        fundingRevision: booking.fundingRevision,
        exactMember: booking.memberId === fixture?.memberId,
        exactTemplate: booking.classTemplateId === fixture?.classTemplateId,
        exactMembership: booking.fundingMembershipId === fixture?.membershipId,
        hasMembershipFunding: booking.fundingMembershipId !== null,
        hasPunchCardFunding: booking.memberPunchCardId !== null,
        hasDropInFunding: booking.dropInProductId !== null,
        consumedPunchCount: booking.consumedPunchCount,
        paidAtPresent: booking.dropInPaidAt !== null,
        pendingPaymentExpiresAtPresent: booking.pendingPaymentExpiresAt !== null,
      })),
      ownerReceiptCount: receipts.length,
      ownerOperationCount: new Set(receipts.map((receipt) => receipt.operationId)
        .filter((id) => id !== null)).size,
      exactOwnerOperationReceiptCount: operationId === null ? null :
        receipts.filter((receipt) => receipt.operationId === operationId &&
          receipt.id === `owner-late-booking:${workspaceId}:${operationId}`).length,
      ownerReceipts: receipts.map((receipt) => ({
        idSha256: sha256(receipt.id), kind: "OWNER_LATE_BOOKING_CONFIRMED",
        operationIdSha256: receipt.operationId ? sha256(receipt.operationId) : null,
        schemaVersion: safeInteger(receipt.schemaVersion),
        fundingRevision: safeInteger(receipt.fundingRevision),
        policyVersion: safeInteger(receipt.policyVersion),
        actorMatches: receipt.actorMatches, memberMatches: receipt.memberMatches,
        templateMatches: receipt.templateMatches, dateMatches: receipt.dateMatches,
        bookingPresent: receipt.bookingId !== null && bookingIds.has(receipt.bookingId),
      })),
      allowance: {
        allocationCount: allocations.length, entryCount: entries.length,
        reservedBalance: entries.reduce((sum, entry) => sum + entry.reservedDelta, 0),
        usedBalance: entries.reduce((sum, entry) => sum + entry.usedDelta, 0),
        allocations: allocations.map((allocation) => ({
          idSha256: sha256(allocation.id), kind: allocation.kind, state: allocation.state,
          revision: allocation.revision, bookingRevision: allocation.bookingRevision,
          limit: allocation.limit,
          periodStart: allocation.periodStart.toISOString().slice(0, 10),
          periodEnd: allocation.periodEnd.toISOString().slice(0, 10),
          bookingPresent: bookingIds.has(allocation.bookingId),
          exactMembership: allocation.memberMembershipId === fixture?.membershipId,
          entries: entries.filter((entry) => entry.allocationId === allocation.id)
            .map((entry) => ({ revision: entry.revision,
              reservedDelta: entry.reservedDelta, usedDelta: entry.usedDelta })),
        })),
      },
      financialOperationCount: operations.length,
      financialOperations: operations.map((operation) => ({
        idSha256: sha256(operation.id), kind: operation.kind,
        status: operation.status, version: operation.version,
      })),
      holdCount: holds.length,
      activeHoldCount: holds.filter((hold) => hold.activeSlot === "ACTIVE").length,
      holds: holds.map((hold) => ({
        targetKind: ["BOOKING", "MEMBERSHIP", "PUNCH_CARD", "COACHING"]
          .includes(hold.targetKind) ? hold.targetKind : "OTHER",
        targetIdSha256: sha256(hold.targetId), units: hold.units,
        active: hold.activeSlot === "ACTIVE", released: hold.releasedAt !== null,
        operationPresent: hold.operationId !== null,
      })),
      punchCards: { count: cards.length, cards,
        entryCount: cardEntries.length,
        ledgerDelta: cardEntries.reduce((sum, entry) => sum + entry.delta, 0) },
      notificationCount: notices.length, notices, paymentCount,
    };
  }, { isolationLevel: "RepeatableRead" });
}

async function action(
  page: Page,
  button: Locator,
  tracking?: { observer: ReturnType<typeof observeOwnerLateActions>; phase: LateActionPhase },
) {
  tracking?.observer.begin(tracking.phase);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        !!r.request().headers()["next-action"],
    ),
    button.click(),
  ]);
  tracking?.observer.selected(response);
  expect(response.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  tracking?.observer.returned(response);
  return response;
}
async function login(
  page: Page,
  origin: string,
  email: string,
  destination: RegExp,
  diagnostics: BrowserDiagnosticsCollector,
) {
  await loginToWorkspace({
    page,
    origin,
    email,
    password: "DemoPass123!",
    expectedRedirect: origin === adminOrigin ? "/dashboard;push" : "/app;push",
    destination: {
      path: origin === adminOrigin ? "/dashboard" : "/app/schedule",
      heading: origin === adminOrigin ? "Today" : "Classes",
    },
    diagnostics,
  });
  await expect(page).toHaveURL(destination);
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
test.afterAll(() => db.$disconnect());
test("WS06 current owner reviews an explicit lead exception and confirms a normal member booking with private reason hidden", async ({
  page,
  context,
  browserDiagnostics,
}, info) => {
  test.setTimeout(120000);
  const prefix = `owner-late-${randomUUID()}`,
    seed = await db.user.findUniqueOrThrow({
      where: { email: "demo-owner@flowstate.local" },
      select: { passwordHash: true },
    });
  const owner = await db.user.create({
      data: {
        email: `${prefix}-owner@example.test`,
        fullName: "Late acceptance owner",
        passwordHash: seed.passwordHash,
      },
    }),
    customer = await db.user.create({
      data: {
        email: `${prefix}-member@example.test`,
        fullName: "Late acceptance member",
        passwordHash: seed.passwordHash,
      },
    });
  const now = new Date(),
    future = new Date(now.getTime() + 3 * 86400000),
    date = future.toISOString().slice(0, 10),
    weekday = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ][future.getUTCDay()]! as Prisma.ClassTemplateCreateInput["weekday"];
  const workspace = await db.workspace.create({
    data: {
      name: prefix,
      status: "ACTIVE",
      location: {
        create: { name: "Fictional late class gym", timezone: "UTC" },
      },
      settings: { create: { locale: "en-CA", currency: "cad" } },
      workspaceUsers: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: customer.id, role: "CUSTOMER" },
        ],
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Ready",
          flowstateResponsibility: "Fictional acceptance fixture",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: { location: true },
  });
  const memberPage = await context.newPage();
  let lateObservation: ReturnType<typeof observeOwnerLateActions> | null = null;
  let diagnosticFixture: LateDiagnosticFixture | null = null;
  let ownerOperationId: string | null = null;
  let workflowFailed = false;
  try {
    const policy = {
      schemaVersion: 1 as const,
      classes: {
        weeklyHours: schedulingWeekdays.map((weekday) => ({
          weekday,
          intervals: [{ startMinute: 0, endMinute: 1440 }],
        })),
        maxAdvanceMinutes: 60 * 1440,
        minimumLeadMinutes: 14 * 1440,
      },
    };
    await db.workspaceSchedulingPolicyRevision.create({
      data: {
        workspaceId: workspace.id,
        version: 1,
        policy,
        policyHash: schedulingPolicyHash(policy),
        previewHash: schedulingPolicyHash(policy),
        actorUserId: owner.id,
        reason:
          "Fictional reviewed policy: fourteen-day notice; one explicit exception is under review",
        activatedAt: now,
      },
    });
    const member = await db.member.create({
      data: {
        workspaceId: workspace.id,
        userId: customer.id,
        fullName: customer.fullName!,
        email: customer.email,
        dateOfBirth: new Date("1990-01-01"),
        status: "ACTIVE",
      },
    });
    const program = await db.program.create({
        data: { workspaceId: workspace.id, name: "Late acceptance program" },
      }),
      room = await db.room.create({
        data: {
          locationId: workspace.location!.id,
          name: "Fictional mat",
          capacity: 1,
        },
      });
    const template = await db.classTemplate.create({
      data: {
        workspaceId: workspace.id,
        programId: program.id,
        roomId: room.id,
        title: "Reviewed late class",
        weekday,
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: 120,
      },
    });
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId: workspace.id,
        name: "Weekly two",
        weeklyClassLimit: 2,
        monthlyPriceCents: 12000,
      },
    });
    const membership = await db.memberMembership.create({
      data: {
        workspaceId: workspace.id,
        memberId: member.id,
        membershipPlanId: plan.id,
        status: "ACTIVE",
        startedAt: new Date(now.getTime() - 86400000),
        allowanceAnchorDate: new Date(
          `${now.toISOString().slice(0, 10)}T00:00:00Z`,
        ),
        allowanceTimezone: "UTC",
        acceptedTerms: JSON.parse(
          JSON.stringify(snapshotMembershipTerms(plan)),
        ),
      },
    });
    diagnosticFixture = {
      memberId: member.id, classTemplateId: template.id,
      membershipId: membership.id, date,
    };
    await login(page, adminOrigin, owner.email, /\/dashboard$/, browserDiagnostics);
    await page.goto(`${adminOrigin}/dashboard/bookings`);
    await expect(
      page.locator(
        `select[name="bookingOption"] option[value="${template.id}|${date}"]`,
      ),
    ).toHaveCount(0);
    // Later occurrences of this weekly class still have a normal open window.
    await expect(
      page
        .locator('select[name="bookingOption"] option')
        .filter({ hasText: "Reviewed late class" }),
    ).not.toHaveCount(0);
    await page
      .getByRole("link", {
        name: "Review a late booking exception",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Late booking exception",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: /^Person/ })
      .selectOption(member.id);
    await page
      .getByRole("combobox", { name: /^Class template/ })
      .selectOption(template.id);
    await page.getByLabel("Class date", { exact: true }).fill(date);
    await page
      .getByLabel("Private reason for the exception", { exact: true })
      .fill("PRIVATE_LATE_BROWSER_REASON_SENTINEL");
    ownerOperationId = await page.locator('input[name="operationId"]').inputValue();
    lateObservation = observeOwnerLateActions(page);
    let previewResponse = await action(
      page,
      page.getByRole("button", { name: "Preview late booking", exact: true }),
      { observer: lateObservation, phase: "preview-initial" },
    );
    let review = page.getByRole("region", {
      name: "Late booking review",
      exact: true,
    });
    await expect(review).toContainText(customer.fullName!);
    await expect(review).toContainText(date);
    await expect(review).toContainText("Membership");
    await expect(review).toContainText("Policy version 1");
    const confirmation = page.getByRole("checkbox", {
      name: "I confirm the booking cutoff and minimum-notice exception for this person and class.",
      exact: true,
    });
    await expect(confirmation).not.toBeChecked();
    browserDiagnostics.acknowledgeAction(
      previewResponse,
      "Owner sees exact person, dated class, policy and existing funding; confirmation remains unchecked.",
    );
    const denied = await action(
      page,
      page.getByRole("button", { name: "Confirm late booking", exact: true }),
      { observer: lateObservation, phase: "deny-unchecked" },
    );
    const exceptionForm = page.locator("form").filter({
      has: page.getByRole("button", {
        name: "Preview late booking",
        exact: true,
      }),
    });
    await expect(exceptionForm.getByRole("alert")).toContainText(
      "Explicitly confirm",
    );
    expect(
      await db.classBooking.count({ where: { workspaceId: workspace.id } }),
    ).toBe(0);
    browserDiagnostics.acknowledgeAction(
      denied,
      "Unchecked server confirmation is denied with no booking persisted.",
    );
    previewResponse = await action(
      page,
      page.getByRole("button", { name: "Preview late booking", exact: true }),
      { observer: lateObservation, phase: "preview-fresh" },
    );
    review = page.getByRole("region", {
      name: "Late booking review",
      exact: true,
    });
    await expect(review).toContainText(customer.fullName!);
    browserDiagnostics.acknowledgeAction(
      previewResponse,
      "Fresh owner preview is visibly restored.",
    );
    await page
      .getByRole("checkbox", {
        name: "I confirm the booking cutoff and minimum-notice exception for this person and class.",
        exact: true,
      })
      .check();
    const confirmed = await action(
      page,
      page.getByRole("button", { name: "Confirm late booking", exact: true }),
      { observer: lateObservation, phase: "confirm-checked" },
    );
    await expect(page.getByRole("status")).toContainText(
      "Class booking confirmed",
    );
    const booking = await db.classBooking.findFirstOrThrow({
      where: { workspaceId: workspace.id },
    });
    expect(booking.status).toBe("BOOKED");
    expect(
      await db.membershipAllowanceAllocation.count({
        where: { bookingId: booking.id, state: "RESERVED" },
      }),
    ).toBe(1);
    expect(
      await db.workspaceDataEvent.count({
        where: {
          workspaceId: workspace.id,
          kind: "OWNER_LATE_BOOKING_CONFIRMED",
        },
      }),
    ).toBe(1);
    expect(
      await db.notificationJob.count({ where: { workspaceId: workspace.id } }),
    ).toBe(1);
    expect(
      await db.payment.count({ where: { workspaceId: workspace.id } }),
    ).toBe(0);
    browserDiagnostics.acknowledgeAction(
      confirmed,
      "Actual booking, one allowance reservation, one private receipt and one queued normal notice persist without a payment.",
    );
    const notice = await db.notificationJob.findFirstOrThrow({
      where: { workspaceId: workspace.id },
    });
    expect(notice.body).not.toContain("PRIVATE_LATE_BROWSER_REASON_SENTINEL");
    await login(memberPage, memberOrigin, customer.email, /\/app\/schedule$/, browserDiagnostics);
    await memberPage.goto(`${memberOrigin}/app/schedule?date=${date}`);
    await expect(
      memberPage
        .getByRole("region", { name: "Upcoming bookings", exact: true })
        .getByRole("heading", {
          name: "Reviewed late class",
          exact: true,
        }),
    ).toBeVisible();
    await expect(memberPage.locator("body")).not.toContainText(
      "PRIVATE_LATE_BROWSER_REASON_SENTINEL",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("owner-late-booking-phone.png"),
      fullPage: true,
    });
  } catch (error) {
    workflowFailed = true;
    throw error;
  } finally {
    // Freeze the workflow-boundary lifecycle before any evidence query or cleanup.
    const lifecycleAtWorkflowBoundary = lateObservation?.snapshot() ?? null;
    let evidenceFailed = false;
    let persisted: unknown;
    let ui: unknown;
    try {
      persisted = await ownerLatePersistedSnapshot(
        workspace.id, owner.id, diagnosticFixture, ownerOperationId,
      );
    } catch {
      evidenceFailed = true;
      persisted = { captured: false, reason: "database-evidence-capture-failed" };
    }
    const lifecycleAfterDatabaseSnapshot = lateObservation?.snapshot() ?? null;
    try {
      // Fixed booleans only; no DOM text, form values, cookie or private reason.
      ui = await page.evaluate(() => {
        const confirm = document.querySelector<HTMLButtonElement>(
          'button[name="step"][value="confirm"]',
        );
        const preview = document.querySelector<HTMLButtonElement>(
          'button[name="step"][value="preview"]',
        );
        const checkbox = document.querySelector<HTMLInputElement>(
          'input[name="confirmCutoffException"]',
        );
        return {
          captured: true, confirmPresent: confirm !== null,
          confirmDisabled: confirm?.disabled ?? null,
          previewDisabled: preview?.disabled ?? null,
          confirmationChecked: checkbox?.checked ?? null,
          confirmationDisabled: checkbox?.disabled ?? null,
          reviewPresent: document.querySelector('[aria-label="Late booking review"]') !== null,
          statusCount: document.querySelectorAll('[role="status"]').length,
          confirmationCopyPresent: Array.from(document.querySelectorAll('[role="status"]'))
            .some((element) => element.textContent?.includes("Class booking confirmed")),
          alertCount: document.querySelectorAll('[role="alert"]').length,
        };
      });
    } catch {
      evidenceFailed = true;
      ui = { captured: false, reason: "ui-evidence-capture-failed" };
    }
    const lifecycleBeforeCleanup = lateObservation?.snapshot() ?? null;
    lateObservation?.dispose();
    try {
      await info.attach("owner-late-booking-before-cleanup.json", {
        body: Buffer.from(JSON.stringify({
          schemaVersion: 1, workflowFailed,
          limits: "Passive action lifecycle and one read-only repeatable DB snapshot before fixture cleanup; no action completion wait or proof that an uncommitted request cannot later commit.",
          lifecycleAtWorkflowBoundary, lifecycleAfterDatabaseSnapshot,
          lifecycleBeforeCleanup, persisted, ui,
        }, null, 2)),
        contentType: "application/json",
      });
    } catch {
      evidenceFailed = true;
    }
    try {
      // Preserve the original cleanup commands and their order.
      await memberPage.close();
      const where = { workspaceId: workspace.id };
      await db.membershipAllowanceAllocation.deleteMany({ where });
      await db.classBooking.deleteMany({ where });
      await db.classTemplate.deleteMany({ where });
      await db.workspace.delete({ where: { id: workspace.id } });
      await db.user.deleteMany({
        where: { id: { in: [owner.id, customer.id] } },
      });
    } catch (cleanupError) {
      if (!workflowFailed) throw cleanupError;
      // Record a supplemental fixed failure without masking the primary assertion.
      try {
        await info.attach("owner-late-booking-cleanup-failure.json", {
          body: Buffer.from(JSON.stringify({ cleanupFailed: true,
            primaryWorkflowFailurePreserved: true })),
          contentType: "application/json",
        });
      } catch {
        // The original workflow exception is still the primary failure.
      }
    }
    if (evidenceFailed && !workflowFailed)
      throw new Error("Owner late-booking diagnostic evidence capture failed.");
  }
});
