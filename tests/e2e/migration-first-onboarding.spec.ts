import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/flowstate_dev?schema=public";

const prisma = new PrismaClient();
const runDate =
  process.env.ONBOARDING_TEST_DATE ?? new Date().toISOString().slice(0, 10);
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

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.serial("migration-first onboarding integration flow", () => {
  test.setTimeout(300_000);

  test("captures signup, intake, migration operations, gating, and readiness", async ({
    page,
  }) => {
    await prisma.workspace.deleteMany({
      where: {
        name: {
          startsWith: "Codex Migration Onboarding",
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: "codex-migration-onboarding-",
        },
      },
    });

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Log in to Flowstate Admin" }),
    ).toBeVisible();
    await expectHealthyPage(page);
    await capture(page, "login-redirect-from-protected-onboarding");

    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByRole("heading", { name: "Create your owner account" }),
    ).toBeVisible();
    await expectHealthyPage(page);
    await capture(page, "signup-page");

    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByText("Full name, email, and password are required."),
    ).toBeVisible();
    await capture(page, "signup-validation");

    const ownerEmail = `${emailPrefix}@flowstate.local`;
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
    await capture(page, "onboarding-intake-empty");

    await page.getByRole("button", { name: "Start migration handoff" }).click();
    await expect(
      page.getByText(
        "Gym name, launch timezone, current software, and access instructions are required.",
      ),
    ).toBeVisible();
    await capture(page, "onboarding-required-field-validation");

    await page.locator('input[name="workspaceName"]').fill(workspaceName);
    await page.locator('input[name="timezone"]').fill("America/Vancouver");
    await page.locator('input[name="currentSoftware"]').fill("Zen Planner");
    await page
      .locator('textarea[name="accessInstructions"]')
      .fill(
        "Exports are ready in CSV format. Flowstate should review guardians and punch balances carefully.",
      );
    await page.locator('input[name="targetGoLiveDate"]').fill("2026-06-20");
    await page.locator("details.optional-details > summary").click();
    await page.locator('input[name="businessType"]').fill("Martial arts gym");
    await page.locator('input[name="memberCountEstimate"]').fill("84");
    await page
      .locator('textarea[name="billingStatus"]')
      .fill(
        "Active subscriptions, prepaid punch cards, and a few failed payments.",
      );
    await page
      .locator('textarea[name="scheduleComplexity"]')
      .fill("Two rooms, six weekly programs, and recurring evening classes.");
    await page
      .locator('textarea[name="formsAndWaivers"]')
      .fill("Adult waiver, youth guardian waiver, and legacy agreement PDFs.");
    await page.locator("details.nested-details > summary").click();
    await page.locator('input[name="addressLine1"]').fill("123 Migration Way");
    await page.locator('input[name="city"]').fill("Vancouver");
    await page.locator('input[name="region"]').fill("BC");
    await page.locator('input[name="postalCode"]').fill("V6B 1A1");
    await page.locator('input[name="countryCode"]').fill("CA");
    await capture(page, "onboarding-intake-filled");

    await page.getByRole("button", { name: "Start migration handoff" }).click();
    await expect(page).toHaveURL(/\/dashboard\/migration$/);
    await expect(
      page.getByRole("heading", { name: "Migration handoff" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Intake received" }),
    ).toBeVisible();
    await expect(page.getByText("Pre-launch")).toBeVisible();
    await expectHealthyPage(page);
    await capture(page, "migration-dashboard-intake-received");

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard\/migration$/);
    await expect(page.getByText("Operator approval")).toBeVisible();
    await capture(page, "dashboard-gates-to-migration");

    const invalidCsvPath = await writeCsvFixture(
      "invalid-members.csv",
      "external_id,email\nbad_1,bad@example.com\n",
    );
    await page.locator('input[name="csv"]').setInputFiles(invalidCsvPath);
    await page.getByRole("button", { name: "Stage and validate" }).click();
    await expect(page.getByText("MAPPED")).toBeVisible();
    await expect(page.getByText("full_name is required.")).toBeVisible();
    await capture(page, "migration-upload-invalid-csv");

    const validCsvPath = await writeCsvFixture(
      "valid-members.csv",
      [
        "external_id,full_name,email,guardian_full_name,guardian_email,relationship",
        "m_1,Ada Migration,ada.migration@example.com,Pat Migration,pat.migration@example.com,Parent",
      ].join("\n"),
    );
    await page.locator('input[name="csv"]').setInputFiles(validCsvPath);
    await page.getByRole("button", { name: "Stage and validate" }).click();
    await expect(
      page.locator("article").filter({ hasText: "VALIDATED" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Migration in progress", exact: true }),
    ).toBeVisible();
    await capture(page, "migration-upload-valid-csv");

    const validatedJob = page
      .locator("article")
      .filter({ hasText: "VALIDATED" });
    await validatedJob.getByRole("button", { name: "Run import" }).click();
    await expect(
      page.locator("article").filter({ hasText: "COMPLETED" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Review ready" }),
    ).toBeVisible();
    await expect(page.getByText("Latest reconciliation")).toBeVisible();
    await capture(page, "migration-import-reconciliation-review-ready");

    await page
      .locator('select[name="stage"]')
      .selectOption("GO_LIVE_SCHEDULED");
    await page
      .locator('textarea[name="nextOwnerAction"]')
      .fill("Confirm final launch timing with Flowstate.");
    await page
      .locator('textarea[name="flowstateResponsibility"]')
      .fill("Flowstate will hold the go-live checklist and final data review.");
    await page
      .locator('input[name="expectedNextMilestone"]')
      .fill("Go-live review call.");
    await page.locator('input[name="goLiveScheduledFor"]').fill("2026-06-20");
    await page.getByRole("button", { name: "Update service status" }).click();
    await expect(
      page.getByRole("heading", { name: "Go-live scheduled" }),
    ).toBeVisible();
    await capture(page, "migration-go-live-scheduled");

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

    await page.goto("/dashboard/migration");
    await page
      .getByRole("button", { name: "Complete handoff and notify owner" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Today's readiness" }),
    ).toBeVisible();
    await expectHealthyPage(page);
    await capture(page, "normal-dashboard-after-readiness");

    await page.goto("/dashboard/migration");
    await expect(
      page.getByRole("heading", { name: "Complete", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Operational", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Complete handoff and notify owner" }),
    ).toBeDisabled();
    await capture(page, "migration-dashboard-complete");
  });
});
