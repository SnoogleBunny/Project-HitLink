import {
  expect,
  test,
  type Locator,
  type Page,
} from "./support/browser-diagnostics";
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prepareCleanEvidence } from "./support/clean-evidence";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/flowstate_dev?schema=public";

const prisma = new PrismaClient();

function dateOnlyKeyInTimeZone(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    calendar: "iso8601",
    day: "2-digit",
    month: "2-digit",
    numberingSystem: "latn",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");

  if (!year || !month || !day) {
    throw new Error(`Could not resolve a date in ${timezone}.`);
  }

  return `${year}-${month}-${day}`;
}

const runDate =
  process.env.ONBOARDING_TEST_DATE ??
  dateOnlyKeyInTimeZone(new Date(), "America/Vancouver");
function offsetDateOnly(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid onboarding test date: ${dateOnly}`);
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const scheduledGoLiveDate = offsetDateOnly(runDate, 14);
const passedGoLiveDate = offsetDateOnly(runDate, -1);
const runStamp =
  process.env.ONBOARDING_TEST_RUN_ID ?? `${runDate}-${Date.now()}`;
const emailPrefix = `codex-migration-onboarding-${runStamp}`;
const workspaceName = `Codex Migration Onboarding ${runStamp}`;
const screenshotDir =
  process.env.ONBOARDING_SCREENSHOT_DIR ??
  path.join(
    process.cwd(),
    "test-results",
    "migration-first-onboarding",
    runDate,
  );
const fixtureDir = path.join(screenshotDir, "fixtures");

let screenshotIndex = 0;

async function capture(page: Page, label: string): Promise<string> {
  screenshotIndex += 1;
  const fileName = `${String(screenshotIndex).padStart(2, "0")}-${label}.png`;
  const filePath = path.join(screenshotDir, fileName);

  await fs.mkdir(screenshotDir, { recursive: true });
  await prepareCleanEvidence(page);
  await page.screenshot({ fullPage: true, path: filePath });

  return filePath;
}

async function writeCsvFixture(
  fileName: string,
  content: string,
): Promise<string> {
  await fs.mkdir(fixtureDir, { recursive: true });
  const filePath = path.join(fixtureDir, fileName);

  await fs.writeFile(filePath, content, "utf-8");

  return filePath;
}

async function expectHealthyPage(page: Page): Promise<void> {
  await expect(page.locator("body")).not.toContainText(
    "This page couldn't load",
  );
  await expect(page.locator("body")).not.toContainText("server error");
  await expect(page.locator("body")).not.toContainText(
    "This page could not be found",
  );
}

const forbiddenOwnerPhrases = [
  "Included",
  "Latest reconciliation",
  "Operator approval",
  "Import jobs",
  "Source file",
  "Staging and reconciliation",
  "No exports uploaded yet",
  "notify the owner",
  "migration amendments",
  "Unlimited free amendments",
  "launch support",
] as const;

const ownerNavigationLabels = [
  "Dashboard",
  "Migration",
  "Programs",
  "Rooms",
  "Schedule",
  "Bookings",
  "Today roster",
  "Members",
  "Forms",
  "Membership plans",
  "Access products",
  "Billing",
  "Billing settings",
  "Staff invites",
] as const;

async function expectMinimumTargetSize(
  target: Locator,
  label: string,
): Promise<void> {
  await expect(target, label).toBeVisible();
  const box = await target.boundingBox();

  expect(box, `${label} has no rendered target`).not.toBeNull();
  expect(box!.width, `${label} target width`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} target height`).toBeGreaterThanOrEqual(44);
}

async function expectNoHorizontalOverflow(
  page: Page,
  label: string,
): Promise<void> {
  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const overflowingElements = Array.from(
      document.querySelectorAll<HTMLElement>("body *"),
    )
      .filter((element) => {
        if (element.getClientRects().length === 0) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.left < -0.5 || rect.right > viewportWidth + 0.5;
      })
      .slice(0, 5)
      .map((element) => ({
        className: element.className,
        tagName: element.tagName,
        text: element.textContent?.trim().slice(0, 80),
      }));

    return {
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      overflowingElements,
      viewportWidth,
    };
  });

  expect(
    Math.max(layout.bodyScrollWidth, layout.documentScrollWidth),
    `${label} overflow: ${JSON.stringify(layout)}`,
  ).toBeLessThanOrEqual(layout.viewportWidth);
}

async function expectNavigationAndAccountHidden(page: Page): Promise<void> {
  const desktopSidebar = page.locator(".shell-desktop-sidebar");
  const mobileMenuContent = page.locator(".shell-mobile-menu-content");

  await expect(desktopSidebar).toBeHidden();
  await expect(mobileMenuContent).toBeHidden();

  const hiddenState = await page
    .locator(
      [
        ".shell-desktop-sidebar .shell-nav",
        ".shell-desktop-sidebar .shell-nav *",
        ".shell-desktop-sidebar .shell-sidebar-footer",
        ".shell-desktop-sidebar .shell-sidebar-footer *",
        ".shell-mobile-menu-content .shell-nav",
        ".shell-mobile-menu-content .shell-nav *",
        ".shell-mobile-menu-content .shell-sidebar-footer",
        ".shell-mobile-menu-content .shell-sidebar-footer *",
      ].join(", "),
    )
    .evaluateAll((elements) => ({
      rendered: elements
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          className: (element as HTMLElement).className,
          tagName: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
        })),
      total: elements.length,
    }));

  expect(hiddenState.total).toBeGreaterThan(0);
  expect(hiddenState.rendered).toEqual([]);
}

async function expectDesktopOwnerNavigation(
  page: Page,
  ownerEmail: string,
): Promise<void> {
  await expect(page.locator(".shell-mobile-header")).toBeHidden();
  await expect(page.locator(".shell-mobile-menu > summary")).toBeHidden();
  await expect(page.locator(".shell-desktop-sidebar")).toBeVisible();

  const visibleNavigation = page.locator(
    'nav[aria-label="Primary admin navigation"]:visible',
  );
  await expect(visibleNavigation).toHaveCount(1);

  const navigationLinks = visibleNavigation.getByRole("link");
  await expect(navigationLinks).toHaveCount(ownerNavigationLabels.length);
  for (const label of ownerNavigationLabels) {
    await expect(
      visibleNavigation.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }

  const currentLinks = visibleNavigation.locator('[aria-current="page"]');
  await expect(currentLinks).toHaveCount(1);
  await expect(currentLinks).toHaveText("Migration");
  const accountName = page.locator(
    ".shell-desktop-sidebar .shell-sidebar-value",
  );
  const accountEmail = page
    .locator(".shell-desktop-sidebar .shell-sidebar-caption")
    .last();
  await expect(accountName).toBeVisible();
  await expect(accountName).toHaveText("Codex Migration Owner");
  await expect(accountEmail).toBeVisible();
  await expect(accountEmail).toHaveText(ownerEmail);
}

async function expectOwnerSafeMigrationResults(
  page: Page,
  resultHeading: "Migration results in progress" | "Import summary",
): Promise<void> {
  const resultsSection = page.locator(
    'section[aria-labelledby="results-title"]',
  );

  await expect(resultsSection).toContainText("Migration results");
  await expect(
    resultsSection.getByRole("heading", { name: resultHeading, exact: true }),
  ).toBeVisible();

  for (const rawToken of ["MAPPED", "VALIDATED", "COMPLETED", "MEMBER"]) {
    await expect(page.getByText(rawToken, { exact: true })).toHaveCount(0);
  }

  for (const phrase of [
    "recordKind",
    "full_name is required.",
    "invalid-members.csv",
    "valid-members.csv",
    ...forbiddenOwnerPhrases,
  ]) {
    await expect(page.locator("body")).not.toContainText(phrase);
  }
}

async function expectImportSummaryMetric(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const metric = page
    .locator("dl.inline-meta > div")
    .filter({ hasText: label });

  await expect(metric.locator("dt")).toHaveText(label);
  await expect(metric.locator("dd")).toHaveText(value);
}

async function expectSafeCorrectionLink(
  page: Page,
  phase: "pre-lock" | "post-lock",
): Promise<Locator> {
  const label =
    phase === "pre-lock"
      ? "Email a correction before acknowledging"
      : "Email a problem with the locked summary";
  const link = page.getByRole("link", { name: label, exact: true });

  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const mailto = new URL(href!);
  expect(decodeURIComponent(mailto.pathname)).toBe(
    "migration-corrections@example.test",
  );
  expect(mailto.searchParams.get("subject")).toBe(
    `Migration correction — ${workspaceName}`,
  );
  expect(mailto.searchParams.get("body")).toBe(
    [
      phase === "pre-lock"
        ? "I found a problem in the migration summary before acknowledgment."
        : "I found a problem after the migration summary was locked.",
      "",
      "Section that looks wrong:",
      "",
      "Do not include member data, credentials, export files, or private links.",
    ].join("\n"),
  );
  for (const forbidden of [
    "workspace_",
    "GO_LIVE_SCHEDULED",
    "COMPLETED",
    "validation",
    "http://",
    "https://",
  ]) {
    expect(href).not.toContain(forbidden);
  }

  return link;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.serial("migration-first onboarding integration flow", () => {
  test.setTimeout(300_000);

  test("captures signup, intake, migration operations, gating, and readiness", async ({
    page,
  }) => {
    const ownerEmail = `${emailPrefix}@flowstate.local`;

    await prisma.workspace.deleteMany({
      where: {
        name: workspaceName,
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: ownerEmail,
      },
    });

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expectHealthyPage(page);
    await capture(page, "login-redirect-from-protected-onboarding");

    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByRole("heading", { name: "Create your owner account" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Start a guided, validated, and reviewable migration handoff before gym operations open.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/white[- ]glove/i);
    await expectHealthyPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, "signup-page-mobile-390");
    await page.setViewportSize({ width: 1024, height: 768 });
    await capture(page, "signup-page-tablet-1024");
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, "signup-page-desktop-1440");
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.getByRole("button", { name: "Create account" }).click();
    const requiredSignupFields = [
      page.locator('input[name="fullName"]'),
      page.locator('input[name="email"]'),
      page.locator('input[name="password"]'),
      page.locator('input[name="confirmPassword"]'),
    ];
    for (const field of requiredSignupFields) {
      await expect(field).toHaveAttribute("required", "");
    }
    await expect(requiredSignupFields[0]).toBeFocused();
    expect(
      await requiredSignupFields[0].evaluate(
        (input: HTMLInputElement) => input.validity.valueMissing,
      ),
    ).toBe(true);
    await capture(page, "signup-validation");

    await page.locator('input[name="fullName"]').fill("Codex Migration Owner");
    await page.locator('input[name="email"]').fill(ownerEmail);
    await page.locator('input[name="password"]').fill("MigrationPass123!");
    await page
      .locator('input[name="confirmPassword"]')
      .fill("MigrationPass123!");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(
      page.getByRole("heading", { name: "Set up your gym migration" }),
    ).toBeVisible();
    await expectHealthyPage(page);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(
      page.getByRole("heading", { name: "Set up your gym migration" }),
    ).toBeVisible();
    await expectHealthyPage(page);
    await capture(page, "onboarding-intake-empty");

    await page.getByRole("button", { name: "Start migration handoff" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Check the highlighted fields and try again." }),
    ).toBeVisible();

    const gymNameField = page.getByRole("textbox", { name: /Gym name/ });
    await expect(gymNameField).toHaveAttribute("aria-invalid", "true");
    await expect(gymNameField).toHaveAttribute(
      "aria-describedby",
      /(?:^|\s)workspaceName-error(?:\s|$)/,
    );
    await expect(page.locator("#workspaceName-error")).toHaveText(
      "Enter your gym name.",
    );

    const currentSoftwareField = page.getByRole("textbox", {
      name: /Current software/,
    });
    await expect(currentSoftwareField).toHaveAttribute("aria-invalid", "true");
    await expect(currentSoftwareField).toHaveAttribute(
      "aria-describedby",
      /(?:^|\s)currentSoftware-error(?:\s|$)/,
    );
    await expect(page.locator("#currentSoftware-error")).toHaveText(
      "Enter the software you use today.",
    );

    const accessInstructionsField = page.getByRole("textbox", {
      name: /Export and access coordination/,
    });
    await expect(accessInstructionsField).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(accessInstructionsField).toHaveAttribute(
      "aria-describedby",
      /(?:^|\s)accessInstructions-error(?:\s|$)/,
    );
    await expect(page.locator("#accessInstructions-error")).toHaveText(
      "Tell us how to access your exports or where the handoff is blocked.",
    );
    await capture(page, "onboarding-required-field-validation");

    await page.locator('input[name="workspaceName"]').fill(workspaceName);
    await page.locator('input[name="timezone"]').fill("America/Vancouver");
    await page.locator('input[name="currentSoftware"]').fill("Zen Planner");
    await page
      .locator('textarea[name="accessInstructions"]')
      .fill("One member CSV is ready for this bounded migration example.");
    await page
      .locator('input[name="targetGoLiveDate"]')
      .fill(scheduledGoLiveDate);
    await page.locator("details.optional-details > summary").click();
    await page.locator('input[name="businessType"]').fill("Martial arts gym");
    await page.locator('input[name="memberCountEstimate"]').fill("1");
    await page
      .locator('textarea[name="billingStatus"]')
      .fill("Outside this one-member example.");
    await page
      .locator('textarea[name="scheduleComplexity"]')
      .fill("Outside this one-member example.");
    await page
      .locator('textarea[name="formsAndWaivers"]')
      .fill("Outside this one-member example.");
    await page.locator("details.nested-details > summary").click();
    await page.locator('input[name="addressLine1"]').fill("123 Migration Way");
    await page.locator('input[name="city"]').fill("Vancouver");
    await page.locator('input[name="region"]').fill("BC");
    await page.locator('input[name="postalCode"]').fill("V6B 1A1");
    await page.locator('input[name="countryCode"]').fill("CA");
    await capture(page, "onboarding-intake-filled");

    await page.getByRole("button", { name: "Start migration handoff" }).click();
    await expect(page).toHaveURL(/\/dashboard\/migration$/);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: ownerEmail },
      select: { id: true },
    });
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: { name: workspaceName },
      select: {
        id: true,
        location: { select: { id: true } },
      },
    });
    if (!workspace.location) {
      throw new Error("Onboarding did not create a location.");
    }
    await prisma.workspaceMigration.update({
      where: { workspaceId: workspace.id },
      data: {
        accessInstructions:
          "One member CSV is ready for this bounded migration example.",
        billingStatus: "Outside this one-member example.",
        dataScope: ["Members and contact details"],
        formsAndWaivers: "Outside this one-member example.",
        memberCountEstimate: 1,
        scheduleComplexity: "Outside this one-member example.",
      },
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Migration handoff" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Intake received" }),
    ).toBeVisible();
    await expect(page.getByText("Pre-launch", { exact: true })).toBeVisible();
    await expectHealthyPage(page);
    await capture(page, "migration-dashboard-intake-received");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard\/migration$/);
    await expect(page.getByText("Owner review", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Operator approval");
    await expect(
      page.getByRole("button", { name: "Stage and validate" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Run import" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Update service status" }),
    ).toHaveCount(0);
    await capture(page, "dashboard-gates-to-migration");

    const {
      cancelMigrationImport,
      markMigrationOperationallyReady,
      runMigrationImport,
      updateMigrationStage,
      uploadAndStageMigrationCsv,
    } = await import("../../apps/admin-web/lib/workspace-migration");
    const operator = {
      type: "FLOWSTATE_OPERATOR" as const,
      actorId: `e2e-operator-${runStamp}`,
    };

    const invalidCsvPath = await writeCsvFixture(
      "invalid-members.csv",
      "external_id,email\nbad_1,bad@example.com\n",
    );
    const invalidCsv = await fs.readFile(invalidCsvPath);
    await expect(
      uploadAndStageMigrationCsv({
        workspaceId: workspace.id,
        actor: operator,
        input: {
          recordKind: "MEMBER",
          fileName: path.basename(invalidCsvPath),
          mimeType: "text/csv",
          fileSizeBytes: invalidCsv.byteLength,
          fileData: invalidCsv,
        },
      }),
    ).resolves.toMatchObject({ status: "ok" });
    await page.reload();
    await expectOwnerSafeMigrationResults(
      page,
      "Migration results in progress",
    );
    await capture(page, "migration-upload-invalid-csv");

    const invalidJob = await prisma.importJob.findFirstOrThrow({
      where: { workspaceId: workspace.id, status: "MAPPED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    await expect(
      cancelMigrationImport({
        workspaceId: workspace.id,
        importJobId: invalidJob.id,
        reason: "Replace invalid E2E fixture",
        actor: operator,
      }),
    ).resolves.toEqual({ status: "ok" });

    const validCsvPath = await writeCsvFixture(
      "valid-members.csv",
      [
        "external_id,full_name,email,guardian_full_name,guardian_email,relationship",
        "m_1,Ada Migration,ada.migration@example.com,Pat Migration,pat.migration@example.com,Parent",
      ].join("\n"),
    );
    const validCsv = await fs.readFile(validCsvPath);
    await expect(
      uploadAndStageMigrationCsv({
        workspaceId: workspace.id,
        actor: operator,
        input: {
          recordKind: "MEMBER",
          fileName: path.basename(validCsvPath),
          mimeType: "text/csv",
          fileSizeBytes: validCsv.byteLength,
          fileData: validCsv,
        },
      }),
    ).resolves.toMatchObject({ status: "ok" });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Migration in progress", exact: true }),
    ).toBeVisible();
    await expectOwnerSafeMigrationResults(
      page,
      "Migration results in progress",
    );
    await capture(page, "migration-upload-valid-csv");

    const validatedJob = await prisma.importJob.findFirstOrThrow({
      where: { workspaceId: workspace.id, status: "VALIDATED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    await expect(
      runMigrationImport({
        workspaceId: workspace.id,
        locationId: workspace.location.id,
        importJobId: validatedJob.id,
        actor: operator,
      }),
    ).resolves.toMatchObject({ status: "ok" });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Review ready" }),
    ).toBeVisible();
    await expectOwnerSafeMigrationResults(page, "Import summary");
    await expectImportSummaryMetric(page, "Records added", "1");
    await expectImportSummaryMetric(page, "Records updated", "0");
    await expectImportSummaryMetric(page, "Records not imported", "0");
    await expect(
      page.getByText(
        "1 earlier import attempt did not complete and is excluded from these results.",
        { exact: true },
      ),
    ).toBeVisible();
    await capture(page, "migration-import-reconciliation-review-ready");

    await expect(
      updateMigrationStage({
        workspaceId: workspace.id,
        actor: operator,
        input: {
          stage: "GO_LIVE_SCHEDULED",
          nextOwnerAction: "Review the migration summary.",
          flowstateResponsibility:
            "Flowstate will complete the remaining launch checks.",
          expectedNextMilestone: "Owner review and launch readiness checks.",
          goLiveScheduledFor: scheduledGoLiveDate,
        },
      }),
    ).resolves.toEqual({ status: "ok" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Go-live scheduled" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Check the migration summary before continuing. When you acknowledge it, the reviewed snapshot is locked and Flowstate cannot change these migration results. Acknowledgment does not start daily operations; Flowstate must complete the remaining launch checks.",
        { exact: true },
      ),
    ).toBeVisible();
    const preLockCorrectionLink = await expectSafeCorrectionLink(
      page,
      "pre-lock",
    );
    await expect(
      page.getByText(/Send to migration-corrections@example\.test\./),
    ).toBeVisible();
    const snapshotLockConfirmation = page.getByRole("checkbox", {
      name: "I understand that acknowledging locks this reviewed snapshot and does not start daily operations.",
    });
    const acknowledgeButton = page.getByRole("button", {
      name: "Acknowledge and lock summary",
    });
    await expect(snapshotLockConfirmation).toHaveAttribute("required", "");
    await expect(snapshotLockConfirmation).not.toBeChecked();
    await expect(acknowledgeButton).toBeDisabled();
    await expect(acknowledgeButton).toHaveCSS("cursor", "not-allowed");
    await expectOwnerSafeMigrationResults(page, "Import summary");
    await capture(page, "migration-go-live-scheduled");
    const eligibleUrl = page.url();
    await preLockCorrectionLink.evaluate((link) => {
      link.addEventListener("click", (event) => event.preventDefault(), {
        once: true,
      });
    });
    await preLockCorrectionLink.focus();
    await expect(preLockCorrectionLink).toBeFocused();
    await preLockCorrectionLink.press("Enter");
    await expect(page).toHaveURL(eligibleUrl);
    await preLockCorrectionLink.focus();
    await preLockCorrectionLink.press("Tab");
    await expect(snapshotLockConfirmation).toBeFocused();
    await snapshotLockConfirmation.check();
    await expect(acknowledgeButton).toBeEnabled();
    await preLockCorrectionLink.focus();
    await preLockCorrectionLink.press("Tab");
    await snapshotLockConfirmation.press("Tab");
    await expect(acknowledgeButton).toBeFocused();

    await expect(
      markMigrationOperationallyReady({
        workspaceId: workspace.id,
        actor: operator,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Owner migration review must be acknowledged before activation.",
    });

    await prisma.workspaceMigration.update({
      where: { workspaceId: workspace.id },
      data: {
        goLiveScheduledFor: new Date(`${passedGoLiveDate}T00:00:00.000Z`),
      },
    });
    await acknowledgeButton.click();
    await expect(page).toHaveURL(
      /\/dashboard\/migration\?review=blocked&reason=schedule-passed$/,
    );
    const staleReviewAlert = page.getByRole("alert").filter({
      hasText: "Scheduled date passed — Flowstate review required",
    });
    await expect(staleReviewAlert).toBeVisible();
    await expect(staleReviewAlert).toBeFocused();
    await expect(staleReviewAlert).toContainText(
      "The scheduled go-live date has passed, but this migration is not complete. Flowstate needs to confirm the schedule. Use the configured migration correction action below if your timing has changed.",
    );
    await expectSafeCorrectionLink(page, "pre-lock");
    await expect(
      prisma.workspaceMigration.findUniqueOrThrow({
        where: { workspaceId: workspace.id },
        select: {
          ownerReviewAcknowledgedAt: true,
          ownerReviewAcknowledgedByUserId: true,
        },
      }),
    ).resolves.toEqual({
      ownerReviewAcknowledgedAt: null,
      ownerReviewAcknowledgedByUserId: null,
    });
    await expect(
      page.getByRole("button", { name: "Acknowledge and lock summary" }),
    ).toHaveCount(0);
    await capture(page, "migration-stale-schedule-recovery-mobile-390");
    await page.setViewportSize({ width: 1024, height: 768 });
    await capture(page, "migration-stale-schedule-recovery-tablet-1024");
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, "migration-stale-schedule-recovery-desktop-1440");
    await page.setViewportSize({ width: 390, height: 844 });

    await prisma.workspaceMigration.update({
      where: { workspaceId: workspace.id },
      data: {
        goLiveScheduledFor: new Date(`${scheduledGoLiveDate}T00:00:00.000Z`),
      },
    });
    await page.reload();
    const restoredSnapshotLockConfirmation = page.getByRole("checkbox", {
      name: "I understand that acknowledging locks this reviewed snapshot and does not start daily operations.",
    });
    await expect(restoredSnapshotLockConfirmation).toHaveAttribute(
      "required",
      "",
    );
    const restoredAcknowledgeButton = page.getByRole("button", {
      name: "Acknowledge and lock summary",
    });
    await expect(restoredSnapshotLockConfirmation).not.toBeChecked();
    await expect(restoredAcknowledgeButton).toBeDisabled();
    await expect(restoredAcknowledgeButton).toHaveCSS("cursor", "not-allowed");
    await restoredSnapshotLockConfirmation.check();
    await expect(restoredAcknowledgeButton).toBeEnabled();
    await restoredAcknowledgeButton.click();
    await expect(page).toHaveURL(
      /\/dashboard\/migration\?review=acknowledged$/,
    );
    await expect(
      page.getByRole("heading", { name: "Migration summary locked" }),
    ).toBeVisible();
    await expect(
      prisma.workspaceMigration.findUniqueOrThrow({
        where: { workspaceId: workspace.id },
        select: { ownerReviewAcknowledgedByUserId: true },
      }),
    ).resolves.toMatchObject({ ownerReviewAcknowledgedByUserId: owner.id });
    await expect(page.getByText("Data snapshot locked")).toBeVisible();
    await expect(
      page.getByText(
        /You acknowledged this summary on .* The reviewed snapshot cannot be changed\. Daily operations remain pre-launch until Flowstate completes the remaining launch checks\./,
      ),
    ).toBeVisible();
    await expectSafeCorrectionLink(page, "post-lock");
    await expect(page.getByText("Operational readiness pending")).toBeVisible();
    await expect(
      page.getByText(
        "Flowstate must complete the remaining readiness checks before daily operations can start.",
        { exact: true },
      ),
    ).toBeVisible();
    await expectOwnerSafeMigrationResults(page, "Import summary");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Migration summary locked" }),
    ).toBeVisible();
    await expect(page.getByText("Data snapshot locked")).toBeVisible();
    await expect(page.getByText("Operational readiness pending")).toBeVisible();

    await page.goto("/dashboard/bookings");
    await expect(
      page.getByText("Migration is not complete yet."),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Booking controls are available after migration is marked complete.",
      ),
    ).toBeVisible();
    await capture(page, "operational-booking-gate-before-readiness");

    await expect(
      markMigrationOperationallyReady({
        workspaceId: workspace.id,
        actor: operator,
      }),
    ).resolves.toEqual({ status: "ok" });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Today's readiness" }),
    ).toBeVisible();
    await expectHealthyPage(page);
    await capture(page, "normal-dashboard-after-readiness");

    await page.goto("/dashboard/migration");
    await expect(
      page.getByRole("heading", {
        name: "Migration handoff complete",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Your migration handoff is complete. Daily operations are active, and no further owner review is pending.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText("Operational", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Daily operations active", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Members and contact details", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Outside this one-member example.", { exact: true }),
    ).toHaveCount(3);
    await expect(
      page.locator(".detail-list").first().locator("div").first(),
    ).toContainText("1");
    await expect(page.getByText("Operational readiness pending")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("heading", { name: "Handoff complete", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "The acknowledged migration handoff is complete. Daily operations are active.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Flowstate completed the reviewed handoff and recorded the workspace as ready for daily operations.",
        { exact: true },
      ),
    ).toBeVisible();
    await expectOwnerSafeMigrationResults(page, "Import summary");
    await capture(page, "migration-dashboard-complete");
  });

  test("keeps the acknowledged migration snapshot immutable", async () => {
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: { name: workspaceName },
      select: { id: true },
    });
    const completedJob = await prisma.importJob.findFirstOrThrow({
      where: { workspaceId: workspace.id, status: "COMPLETED" },
      select: { id: true },
    });
    const {
      cancelMigrationImport,
      markMigrationOperationallyReady,
      runMigrationImport,
      updateMigrationStage,
      uploadAndStageMigrationCsv,
    } = await import("../../apps/admin-web/lib/workspace-migration");
    const operator = {
      type: "FLOWSTATE_OPERATOR" as const,
      actorId: `e2e-operator-${runStamp}`,
    };
    const frozenError = {
      status: "error",
      message:
        "Migration operations are frozen after owner review acknowledgment.",
    };

    await expect(
      updateMigrationStage({
        workspaceId: workspace.id,
        actor: operator,
        input: { stage: "GO_LIVE_SCHEDULED" },
      }),
    ).resolves.toEqual(frozenError);
    await expect(
      uploadAndStageMigrationCsv({
        workspaceId: workspace.id,
        actor: operator,
        input: {
          recordKind: "MEMBER",
          fileName: "post-review.csv",
          mimeType: "text/csv",
          fileSizeBytes: 63,
          fileData: new TextEncoder().encode(
            "external_id,full_name,email\npost_review,Post Review,post@example.com\n",
          ),
        },
      }),
    ).resolves.toEqual(frozenError);
    await expect(
      runMigrationImport({
        workspaceId: workspace.id,
        locationId: "unused_after_review",
        importJobId: completedJob.id,
        actor: operator,
      }),
    ).resolves.toEqual(frozenError);
    await expect(
      cancelMigrationImport({
        workspaceId: workspace.id,
        importJobId: completedJob.id,
        reason: "Must remain immutable",
        actor: operator,
      }),
    ).resolves.toEqual(frozenError);
    await expect(
      markMigrationOperationallyReady({
        workspaceId: workspace.id,
        actor: operator,
      }),
    ).resolves.toEqual({ status: "ok" });

    await expect(
      prisma.workspace.findUniqueOrThrow({
        where: { id: workspace.id },
        select: {
          status: true,
          migration: {
            select: {
              stage: true,
              ownerReviewAcknowledgedAt: true,
              operationallyReadyAt: true,
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      status: "ACTIVE",
      migration: {
        stage: "COMPLETE",
        ownerReviewAcknowledgedAt: expect.any(Date),
        operationallyReadyAt: expect.any(Date),
      },
    });
  });

  test("shows the persisted completed handoff to a fresh owner session", async ({
    page,
  }) => {
    const ownerEmail = `${emailPrefix}@flowstate.local`;

    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(ownerEmail);
    await page.locator('input[name="password"]').fill("MigrationPass123!");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/dashboard/migration");
    await expect(
      page.getByRole("heading", {
        name: "Migration handoff complete",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Migration summary locked" }),
    ).toBeVisible();
    await expect(page.getByText("Operational", { exact: true })).toBeVisible();
    await expectOwnerSafeMigrationResults(page, "Import summary");
    await expectImportSummaryMetric(page, "Records added", "1");
    await expectImportSummaryMetric(page, "Records updated", "0");
    await expectImportSummaryMetric(page, "Records not imported", "0");
    await expect(page.locator("body")).not.toContainText(
      "Latest reconciliation",
    );
    await expect(page.getByText("Data snapshot locked")).toBeVisible();
    const mobileCorrectionLink = await expectSafeCorrectionLink(
      page,
      "post-lock",
    );
    const completedUrl = page.url();
    await mobileCorrectionLink.evaluate((link) => {
      link.addEventListener("click", (event) => event.preventDefault(), {
        once: true,
      });
    });
    await mobileCorrectionLink.focus();
    await mobileCorrectionLink.press("Enter");
    await expect(page).toHaveURL(completedUrl);
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expectHealthyPage(page);

    const mobileMenu = page.locator("details.shell-mobile-menu");
    const mobileMenuSummary = mobileMenu.locator(":scope > summary");
    const routeHeading = page.locator(".shell-header h2");

    await expect(page.locator(".shell-brand-label:visible")).toHaveCount(1);
    await expect(page.locator(".shell-brand-label:visible")).toHaveText(
      "Flowstate Admin",
    );
    await expect(
      page.locator(".shell-mobile-menu > summary:visible"),
    ).toHaveCount(1);
    await expect(mobileMenuSummary).toHaveText("Menu");
    await expect(mobileMenu).not.toHaveAttribute("open", "");
    await expectMinimumTargetSize(mobileMenuSummary, "Mobile Menu summary");
    await expectNavigationAndAccountHidden(page);
    await expect(page.locator("h2")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(routeHeading).toHaveText("Migration handoff");

    const migrationCurrentLinks = page.locator(
      '.shell-nav-link[aria-current="page"]',
      { hasText: /^Migration$/ },
    );
    await expect(migrationCurrentLinks).toHaveCount(2);
    for (const currentLink of await migrationCurrentLinks.all()) {
      await expect(currentLink).toHaveAttribute("aria-current", "page");
      await expect(currentLink).toBeHidden();
    }

    const firstViewportOrder = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>(".shell-header h2");
      const main = document.querySelector<HTMLElement>("main");
      if (!heading || !main) {
        throw new Error("Expected route heading and main content landmark.");
      }

      const headingRect = heading.getBoundingClientRect();
      const mainRect = main.getBoundingClientRect();
      return {
        headingBottom: headingRect.bottom,
        headingTop: headingRect.top,
        mainTop: mainRect.top,
        viewportHeight: window.innerHeight,
      };
    });
    expect(firstViewportOrder.headingBottom).toBeLessThanOrEqual(
      firstViewportOrder.viewportHeight,
    );
    expect(firstViewportOrder.headingTop).toBeLessThan(
      firstViewportOrder.mainTop,
    );
    await expectNoHorizontalOverflow(page, "390px closed mobile navigation");
    await capture(page, "migration-dashboard-complete-mobile-390");

    await mobileMenuSummary.focus();
    await expect(mobileMenuSummary).toBeFocused();
    await mobileMenuSummary.press("Enter");
    await expect(mobileMenu).toHaveAttribute("open", "");

    const visibleNavigation = page.locator(
      'nav[aria-label="Mobile admin navigation"]:visible',
    );
    await expect(visibleNavigation).toHaveCount(1);
    const visibleNavigationLinks = visibleNavigation.getByRole("link");
    await expect(visibleNavigationLinks).toHaveCount(
      ownerNavigationLabels.length,
    );
    await mobileMenuSummary.press("Tab");
    await expect(visibleNavigationLinks.first()).toBeFocused();
    await mobileMenuSummary.focus();
    await mobileMenuSummary.press("Space");
    await expect(mobileMenu).not.toHaveAttribute("open", "");
    await expect(mobileMenuSummary).toBeFocused();
    await mobileMenuSummary.press("Enter");
    await expect(mobileMenu).toHaveAttribute("open", "");
    for (const label of ownerNavigationLabels) {
      const destination = visibleNavigation.getByRole("link", {
        name: label,
        exact: true,
      });
      await expect(destination).toBeVisible();
      await expect(destination).toBeEnabled();
      await expect(destination).toHaveAttribute("href", /\/dashboard/);
    }
    const visibleCurrentLinks = visibleNavigation.locator(
      '[aria-current="page"]',
    );
    await expect(visibleCurrentLinks).toHaveCount(1);
    await expect(visibleCurrentLinks).toHaveText("Migration");
    const mobileAccountName = page.locator(
      ".shell-mobile-menu-content .shell-sidebar-value",
    );
    const mobileAccountEmail = page
      .locator(".shell-mobile-menu-content .shell-sidebar-caption")
      .last();
    await expect(mobileAccountName).toBeVisible();
    await expect(mobileAccountName).toHaveText("Codex Migration Owner");
    await expect(mobileAccountEmail).toBeVisible();
    await expect(mobileAccountEmail).toHaveText(ownerEmail);

    const visibleSummaryAndLinks = page.locator("summary:visible, a:visible");
    expect(await visibleSummaryAndLinks.count()).toBeGreaterThan(
      ownerNavigationLabels.length,
    );
    for (const target of await visibleSummaryAndLinks.all()) {
      const targetLabel = (await target.innerText()).trim();
      await expectMinimumTargetSize(
        target,
        `Visible summary/link ${JSON.stringify(targetLabel)}`,
      );
    }
    await expectNoHorizontalOverflow(page, "390px open mobile navigation");
    await capture(page, "migration-dashboard-complete-mobile-menu-open-390");

    await mobileMenuSummary.focus();
    await mobileMenuSummary.press("Space");
    await expect(mobileMenu).not.toHaveAttribute("open", "");
    await expect(mobileMenuSummary).toBeFocused();
    await expectNavigationAndAccountHidden(page);
    await expectNoHorizontalOverflow(page, "390px re-closed mobile navigation");

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.reload();
    await expectDesktopOwnerNavigation(page, ownerEmail);
    await expect(page.getByText("Data snapshot locked")).toBeVisible();
    await expectNoHorizontalOverflow(page, "1024px desktop navigation");
    await capture(page, "migration-dashboard-complete-tablet-1024");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expectDesktopOwnerNavigation(page, ownerEmail);
    await expect(page.getByText("Data snapshot locked")).toBeVisible();
    await expectNoHorizontalOverflow(page, "1440px desktop navigation");
    await capture(page, "migration-dashboard-complete-desktop-1440");

    await prisma.workspace.deleteMany({ where: { name: workspaceName } });
    await prisma.user.deleteMany({ where: { email: ownerEmail } });
  });
});
