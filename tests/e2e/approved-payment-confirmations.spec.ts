import { loginToWorkspace } from "./support/workspace-login";
import { expectActionRedirect } from "./support/action-redirect";
import { randomUUID } from "node:crypto";
import { PrismaClient, issuePaymentConfirmationTx } from "@flowstate/db";
import {
  attachBrowserDiagnostics,
  expect,
  test,
  type Page,
  type Locator,
  type BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";
const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
)
  throw new Error(
    "Payment confirmation proof requires a disposable local test database.",
  );
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const admin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const member =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const fixtureId = `receipt-e2e-${randomUUID()}`;
const password = "DemoPass123!";
let workspaceId = "",
  confirmationId = "",
  jobId = "",
  originalBody = "",
  ownerId = "",
  payerId = "";
test.beforeAll(async () => {
  const source = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const owner = await db.user.create({
    data: {
      email: `${fixtureId}-owner@example.test`,
      passwordHash: source.passwordHash,
      fullName: "Fictional Receipt Owner",
    },
  });
  ownerId = owner.id;
  const payer = await db.user.create({
    data: {
      email: `${fixtureId}-payer@example.test`,
      passwordHash: source.passwordHash,
      fullName: "Fictional Receipt Payer",
    },
  });
  payerId = payer.id;
  const now = new Date();
  const workspace = await db.workspace.create({
    data: {
      name: fixtureId,
      status: "ACTIVE",
      location: { create: { name: "Fictional Gym", timezone: "UTC" } },
      workspaceUsers: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: payer.id, role: "CUSTOMER" },
        ],
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional browser fixture ready",
          flowstateResponsibility: "Fictional receipt proof",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: owner.id,
        },
      },
    },
  });
  workspaceId = workspace.id;
  const accountMember = await db.member.create({
    data: {
      workspaceId,
      userId: payer.id,
      fullName: "Fictional Receipt Payer",
      status: "ACTIVE",
    },
  });
  const child = await db.member.create({
    data: {
      workspaceId,
      fullName: "Fictional Receipt Beneficiary",
      status: "ACTIVE",
    },
  });
  const account = await db.financialAccount.create({
    data: { workspaceId, userId: payer.id, memberId: accountMember.id },
  });
  const payment = await db.payment.create({
    data: {
      workspaceId,
      payerAccountId: account.id,
      memberId: child.id,
      status: "SUCCEEDED",
      amountCents: 12345,
      currency: "cad",
      paidAt: now,
      stripePaymentIntentId: `pi_fictional_${randomUUID()}`,
    },
  });
  const confirmation = await db.$transaction((tx) =>
    issuePaymentConfirmationTx(tx, {
      paymentId: payment.id,
      description: "Accepted fictional class pack",
      now,
    }),
  );
  if (!confirmation) throw new Error("Fictional confirmation setup failed");
  confirmationId = confirmation.id;
  const job = await db.notificationJob.findFirstOrThrow({
    where: { workspaceId, dedupeKey: `payment-confirmation:${payment.id}` },
  });
  jobId = job.id;
  originalBody = job.body;
  await db.notificationJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      attempts: 6,
      nextAttemptAt: null,
      lastError: "Fictional provider response needs review",
    },
  });
});
test.afterAll(async () => {
  if (workspaceId)
    await db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT set_config('hitlink.reviewed_retention_workspace', $1, true)",
        workspaceId,
      );
      await tx.paymentConfirmation.deleteMany({ where: { workspaceId } });
      await tx.payment.deleteMany({ where: { workspaceId } });
      await tx.financialAccount.deleteMany({ where: { workspaceId } });
      await tx.workspace.deleteMany({ where: { id: workspaceId } });
    });
  await db.user.deleteMany({
    where: { id: { in: [ownerId, payerId].filter(Boolean) } },
  });
  await db.$disconnect();
});
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
async function submit(page: Page, button: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        !!res.request().headers()["next-action"],
    ),
    button.click(),
  ]);
  return response;
}
async function login(
  page: Page,
  base: string,
  email: string,
  diagnostics: BrowserDiagnosticsCollector,
) {
  await loginToWorkspace({
    page,
    origin: base,
    email,
    password,
    expectedRedirect: base === admin ? "/dashboard;push" : "/app;push",
    destination: {
      path: base === admin ? "/dashboard" : "/app/schedule",
      heading: base === admin ? "Today" : "Classes",
    },
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
test("owner retries the same failed receipt without business effects, and the exact payer reads and requests a separate copy", async ({
  page,
  browser,
  browserDiagnostics,
}, info) => {
  const payerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const detach = attachBrowserDiagnostics(payerContext, browserDiagnostics);
  try {
    await login(
      page,
      admin,
      `${fixtureId}-owner@example.test`,
      browserDiagnostics,
    );
    await page.goto(`${admin}/dashboard/settings/email`);
    await expect(
      page.getByRole("heading", { name: "Email delivery", exact: true }),
    ).toBeVisible();
    await settled(page);
    const delivery = page
      .locator("article")
      .filter({
        has: page.getByRole("button", { name: "Retry delivery", exact: true }),
      })
      .filter({ hasText: `${fixtureId}-payer@example.test` });
    await delivery
      .getByLabel("Reason for retry", { exact: true })
      .fill(
        "Reviewed the fictional provider outcome; retry the same delivery.",
      );
    const retried = await submit(
      page,
      delivery.getByRole("button", { name: "Retry delivery", exact: true }),
    );
    await expectActionRedirect(
      page,
      retried,
      `${admin}/dashboard/settings/email?queued=1`,
    );
    await expect(page.getByRole("status")).toContainText(
      "The same message is queued",
    );
    await settled(page);
    expect(
      await db.notificationJob.findUniqueOrThrow({ where: { id: jobId } }),
    ).toMatchObject({
      status: "FAILED",
      attempts: 6,
      attemptLimit: 12,
      body: originalBody,
      providerMessageId: null,
      nextAttemptAt: expect.any(Date),
    });
    expect(await db.payment.count({ where: { workspaceId } })).toBe(1);
    expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
    expect(
      await db.workspaceDataEvent.count({
        where: {
          workspaceId,
          kind: "NOTIFICATION_RETRY_REQUESTED",
          actorUserId: ownerId,
        },
      }),
    ).toBe(1);
    if (retried.status() === 200)
      browserDiagnostics.acknowledgeAction(
        retried,
        "The visible retry confirmation matches the same persisted failed job, unchanged message and money, and one owner-attributed retry event.",
      );
    await page.goto(`${admin}/dashboard/billing/receipts/${confirmationId}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Payment confirmation",
        exact: true,
      }),
    ).toBeVisible();
    await settled(page);
    const ownerCopy = await submit(
      page,
      page.getByRole("button", { name: "Email another copy", exact: true }),
    );
    await expectActionRedirect(
      page,
      ownerCopy,
      `${admin}/dashboard/billing/receipts/${confirmationId}?queued=1`,
    );
    await expect(page.getByRole("status")).toContainText(
      "Another copy is queued",
    );
    await settled(page);
    const payerPage = await payerContext.newPage();
    await login(
      payerPage,
      member,
      `${fixtureId}-payer@example.test`,
      browserDiagnostics,
    );
    await payerPage.goto(`${member}/app/billing?view=history`);
    await expect(
      payerPage.getByRole("heading", { name: "Payment history", exact: true }),
    ).toBeVisible();
    await settled(payerPage);
    await payerPage
      .getByRole("link", { name: "View payment confirmation", exact: true })
      .click();
    await expect(
      payerPage.getByRole("heading", {
        level: 1,
        name: "Payment confirmation",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      payerPage.getByText("Accepted fictional class pack", { exact: true }),
    ).toBeVisible();
    await expect(
      payerPage.getByText("Fictional Receipt Beneficiary", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        payerPage
          .locator("body")
          .evaluate((el) => el.scrollWidth - el.clientWidth),
      )
      .toBeLessThanOrEqual(1);
    await settled(payerPage);
    await info.attach("payer receipt phone", {
      body: await payerPage.screenshot(),
      contentType: "image/png",
    });
    const payerCopy = await submit(
      payerPage,
      payerPage.getByRole("button", {
        name: "Email another copy",
        exact: true,
      }),
    );
    await expectActionRedirect(
      payerPage,
      payerCopy,
      `${member}/app/billing/receipts/${confirmationId}?queued=1`,
    );
    await expect(payerPage.getByRole("status")).toContainText(
      "Another copy is queued",
    );
    await settled(payerPage);
    const jobs = await db.notificationJob.findMany({
      where: {
        workspaceId,
        context: { path: ["kind"], equals: "PAYMENT_CONFIRMATION" },
      },
    });
    expect(jobs).toHaveLength(3);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(3);
    expect(
      jobs.every(
        (job) =>
          job.recipientEmail === `${fixtureId}-payer@example.test` &&
          job.providerMessageId === null,
      ),
    ).toBe(true);
    expect(await db.paymentConfirmation.count({ where: { workspaceId } })).toBe(
      1,
    );
    expect(await db.payment.count({ where: { workspaceId } })).toBe(1);
    if (ownerCopy.status() === 200)
      browserDiagnostics.acknowledgeAction(
        ownerCopy,
        "The owner saw the exact receipt copy confirmation; the final three distinct payer-only jobs persist without duplicating the payment or confirmation.",
      );
    if (payerCopy.status() === 200)
      browserDiagnostics.acknowledgeAction(
        payerCopy,
        "The exact payer saw the named beneficiary receipt and copy confirmation; the final distinct payer-only jobs persist with one payment and one confirmation.",
      );
  } finally {
    detach();
    await payerContext.close();
  }
});
