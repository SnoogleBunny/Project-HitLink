import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expectActionRedirect } from "./support/action-redirect";
import {
  expect,
  test,
  type Locator,
  type Page,
} from "./support/browser-diagnostics";
const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
)
  throw Error(
    "New-business acceptance requires a disposable local test database.",
  );
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const origin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
async function submit(page: Page, control: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (value) =>
        value.request().method() === "POST" &&
        Boolean(value.request().headers()["next-action"]),
      { timeout: 20_000 },
    ),
    control.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  return response;
}
test.afterAll(() => db.$disconnect());
test.use({ actionTimeout: 15_000 });
test("WS01 a new coaching-only owner verifies and activates an empty business without legacy import or fabricated service", async ({
  page,
  browserDiagnostics,
}, info) => {
  test.setTimeout(120_000);
  const email = `clean-business-${randomUUID()}@example.test`,
    businessName = `Clean coaching ${randomUUID()}`;
  let workspaceId: string | undefined, userId: string | undefined;
  try {
    await page.goto(`${origin}/signup`);
    await page.waitForLoadState("networkidle");
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Fictional new business owner");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("NewBusinessPassword2030!");
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill("NewBusinessPassword2030!");
    const signedUp = await submit(
      page,
      page.getByRole("button", { name: "Create account", exact: true }),
    );
    await expect(page).toHaveURL(`${origin}/onboarding`);
    await expectActionRedirect(page, signedUp, `${origin}/onboarding`);
    userId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
    if (signedUp.status() === 200)
      browserDiagnostics.acknowledgeAction(
        signedUp,
        "The exact fictional signup account exists and its onboarding destination is rendered.",
      );
    await page
      .getByRole("radio", {
        name: "Start a new business with no legacy import",
        exact: true,
      })
      .check();
    await expect(page.getByLabel(/^Current software/)).toHaveCount(0);
    await page.getByLabel("Business name", { exact: true }).fill(businessName);
    await page
      .getByRole("combobox", { name: /^Services to configure/ })
      .selectOption("COACHING");
    await page.getByLabel("Business timezone", { exact: true }).fill("UTC");
    await page
      .getByRole("combobox", { name: /^Business currency/ })
      .selectOption("cad");
    await page
      .getByLabel("Date and number locale", { exact: true })
      .fill("en-CA");
    const prepared = await submit(
      page,
      page.getByRole("button", { name: "Prepare new business", exact: true }),
    );
    await expect(page).toHaveURL(`${origin}/dashboard/setup`);
    await expectActionRedirect(page, prepared, `${origin}/dashboard/setup`);
    const workspace = await db.workspace.findFirstOrThrow({
      where: { name: businessName },
      include: { setup: true, migration: true },
    });
    workspaceId = workspace.id;
    expect(workspace).toMatchObject({
      status: "SETUP_INCOMPLETE",
      migration: null,
      setup: {
        ownerUserId: userId,
        serviceMode: "COACHING",
        ownerVerifiedAt: null,
      },
    });
    await expect(
      page.getByRole("heading", { name: "New business setup", exact: true }),
    ).toBeVisible();
    if (prepared.status() === 200)
      browserDiagnostics.acknowledgeAction(
        prepared,
        "The named coaching-only workspace is persisted as setup-incomplete with no migration, and its setup heading is visible.",
      );
    const requested = await submit(
      page,
      page.getByRole("button", {
        name: "Request owner verification",
        exact: true,
      }),
    );
    await expect(page.getByRole("status")).toContainText(
      "A verification email has been requested",
    );
    const job = await db.notificationJob.findFirstOrThrow({
      where: { workspaceId, recipientEmail: email },
      orderBy: { createdAt: "desc" },
    });
    expect(job).toMatchObject({
      status: "PENDING",
      attempts: 0,
      sentAt: null,
      providerMessageId: null,
    });
    const link = new URL(job.body.match(/https?:\/\/[^\s]+/)![0]);
    expect(link.origin).toBe(origin);
    expect(link.pathname).toBe("/dashboard/setup/verify");
    expect(link.search).toBe("");
    expect(link.hash).toMatch(/^#token=[\w-]{43}$/);
    browserDiagnostics.acknowledgeAction(
      requested,
      "Owner request is visible and a fictional pending setup-verification outbox entry exists; no delivered-email receipt is fabricated.",
    );
    const navigations: string[] = [];
    const observe = (request: {
      isNavigationRequest(): boolean;
      url(): string;
    }) => {
      if (
        request.isNavigationRequest() &&
        new URL(request.url()).pathname === "/dashboard/setup/verify"
      )
        navigations.push(request.url());
    };
    page.on("request", observe);
    await page.goto(link.href);
    await expect(page).toHaveURL(`${origin}/dashboard/setup/verify`);
    page.off("request", observe);
    expect(navigations).toEqual([`${origin}/dashboard/setup/verify`]);
    expect(
      (await db.workspaceSetup.findUniqueOrThrow({ where: { workspaceId } }))
        .ownerVerifiedAt,
    ).toBeNull();
    const verified = await submit(
      page,
      page.getByRole("button", { name: "Verify my owner email", exact: true }),
    );
    await expect(page.getByRole("status")).toContainText(
      "Your owner email is verified.",
    );
    expect(
      (await db.workspaceSetup.findUniqueOrThrow({ where: { workspaceId } }))
        .verificationHash,
    ).toBeNull();
    expect(
      (await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .body,
    ).toBe("");
    browserDiagnostics.acknowledgeAction(
      verified,
      "Fresh owner mailbox verification consumes the one-use hash and clears the queued bearer body without activating the workspace.",
    );
    await page
      .getByRole("link", { name: "Review business setup", exact: true })
      .click();
    const reviewed = await submit(
      page,
      page.getByRole("button", {
        name: "Review setup for activation",
        exact: true,
      }),
    );
    const preview = page.getByRole("region", {
      name: "Business setup preview",
      exact: true,
    });
    await expect(preview).toContainText("Adult life coaching only");
    await expect(preview).toContainText(
      "0 programs, 0 rooms and 0 coaching templates configured",
    );
    await expect(preview).toContainText(
      "Online payments are not connected. Activation does not enable charging.",
    );
    const consent = page.getByLabel(
      "I reviewed these exact business details and authorize activation.",
      { exact: true },
    );
    await expect(consent).not.toBeChecked();
    browserDiagnostics.acknowledgeAction(
      reviewed,
      "Server-derived empty coaching-only snapshot is visible with truthful provider-unavailable state and unchecked activation consent.",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    await consent.scrollIntoViewIfNeeded();
    await expect(preview).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Activate new business", exact: true }),
    ).toBeEnabled();
    await info.attach("WS01 coaching-only setup phone", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await consent.check();
    const activated = await submit(
      page,
      page.getByRole("button", { name: "Activate new business", exact: true }),
    );
    await expect(page).toHaveURL(`${origin}/dashboard/setup?activated=1`);
    await expectActionRedirect(
      page,
      activated,
      `${origin}/dashboard/setup?activated=1`,
    );
    await expect(page.getByRole("status")).toContainText(
      "Your reviewed new-business setup is active.",
    );
    const complete = await db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { setupActivation: true, migration: true },
    });
    expect(complete).toMatchObject({
      status: "ACTIVE",
      migration: null,
      setupActivation: { ownerUserId: userId, serviceMode: "COACHING" },
    });
    expect(await db.importJob.count({ where: { workspaceId } })).toBe(0);
    expect(await db.room.count({ where: { location: { workspaceId } } })).toBe(
      0,
    );
    expect(await db.member.count({ where: { workspaceId } })).toBe(0);
    expect(await db.membershipPlan.count({ where: { workspaceId } })).toBe(0);
    expect(await db.classTemplate.count({ where: { workspaceId } })).toBe(0);
    expect(await db.coachingProgram.count({ where: { workspaceId } })).toBe(0);
    expect(await db.payment.count({ where: { workspaceId } })).toBe(0);
    expect(
      await db.workspaceSetupActivation.count({ where: { workspaceId } }),
    ).toBe(1);
    if (activated.status() === 200)
      browserDiagnostics.acknowledgeAction(
        activated,
        "The active coaching-only workspace and single attributed activation receipt persist with visible confirmation and no fabricated imports, service, members or payments.",
      );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Business is active", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Open workspace", exact: true })
      .click();
    await expect(page).toHaveURL(`${origin}/dashboard/coaching`);
    await expect(
      page.getByRole("heading", { name: "Clients", exact: true }).first(),
    ).toBeVisible();
    await page.goto(`${origin}/dashboard`);
    await expect(page).toHaveURL(`${origin}/dashboard/coaching`);
    await info.attach("WS01 activation receipt", {
      body: JSON.stringify({
        workspaceId,
        activationId: complete.setupActivation!.id,
        snapshotHash: complete.setupActivation!.snapshotHash,
        serviceMode: "COACHING",
        imports: 0,
        rooms: 0,
        members: 0,
        payments: 0,
      }),
      contentType: "application/json",
    });
  } finally {
    if (!userId)
      userId = (
        await db.user.findUnique({ where: { email }, select: { id: true } })
      )?.id;
    if (!workspaceId && userId)
      workspaceId = (
        await db.workspaceUser.findUnique({
          where: { userId },
          select: { workspaceId: true },
        })
      )?.workspaceId;
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (userId) await db.user.delete({ where: { id: userId } });
  }
});
