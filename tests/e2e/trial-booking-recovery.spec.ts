import { ensureDemoSchedulingPolicy } from "./support/demo-scheduling-policy";
import {
  expect,
  test,
  type Locator,
  type Page,
} from "./support/browser-diagnostics";
import type { TestInfo } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { saveGymWebsiteDraft, publishGymWebsite } from "@flowstate/db";
import { randomUUID } from "node:crypto";
import { prepareCleanEvidence } from "./support/clean-evidence";

const prisma = new PrismaClient();
const memberBaseURL =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const viewportEvidence = [
  { height: 844, name: "390", width: 390 },
  { height: 900, name: "768", width: 768 },
  { height: 1000, name: "1440", width: 1440 },
] as const;

async function submitAndSettle(page: Page, control: Locator) {
  const actionUrl = page.url();
  const request = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" &&
      candidate.url() === actionUrl &&
      !!candidate.headers()["next-action"],
  );
  await control.click();
  const response = await (await request).response();
  expect(response).not.toBeNull();
  await page.waitForLoadState("networkidle");
  return response!;
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function waitForRegistrationFonts(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForFunction(
    async () => {
      await document.fonts.ready;
      return document.fonts.status === "loaded";
    },
    undefined,
    { timeout: 10_000 },
  );
}

async function captureState(
  page: Page,
  testInfo: TestInfo,
  state: "zero-date" | "populated",
): Promise<void> {
  for (const viewport of viewportEvidence) {
    await page.setViewportSize(viewport);
    await expectNoOverflow(page);

    if (state === "populated") {
      const controls = page.locator(
        '.registration-form select, .registration-form input:not([type="hidden"]):not([type="checkbox"]), .registration-form button',
      );

      for (let index = 0; index < (await controls.count()); index += 1) {
        const box = await controls.nth(index).boundingBox();
        expect(box, `control ${index} at ${viewport.width}px`).not.toBeNull();
        expect(
          box!.height,
          `control ${index} at ${viewport.width}px`,
        ).toBeGreaterThanOrEqual(44);
      }
    }

    await prepareCleanEvidence(page);
    await page.screenshot({
      fullPage: true,
      path: process.env.RP08_EVIDENCE_DIR
        ? `${process.env.RP08_EVIDENCE_DIR.replace(/\\/g, "/")}/trial-${state}-${viewport.name}.png`
        : testInfo.outputPath(`trial-${state}-${viewport.name}.png`),
    });
  }
}

async function tabTo(page: Page, locator: Locator) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press("Tab");

    if (
      await locator.evaluate((element) => document.activeElement === element)
    ) {
      return;
    }
  }

  throw new Error("Keyboard focus did not reach the expected control.");
}

test.describe.serial("public trial booking recovery", () => {
  test.setTimeout(180_000);

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("keeps zero-date, populated, invalid, and server-failure states recoverable", async ({
    browserDiagnostics,
    page,
  }, testInfo) => {
    const owner = await prisma.workspaceUser.findFirstOrThrow({
      where: {
        role: "OWNER",
        isActive: true,
        user: { email: "demo-owner@flowstate.local" },
      },
    });
    const workspaceId = owner.workspaceId;
    let site = await prisma.workspaceWebsite.findUnique({
      where: { workspaceId },
    });
    const createdWebsite = !site;
    if (!site) {
      const actor = { workspaceId, userId: owner.userId };
      const draft = await saveGymWebsiteDraft(actor, {
        slug: `trial-recovery-${randomUUID()}`,
        expectedVersion: 0,
        content: {
          title: "Demo HitLink Gym",
          description: "Local trial recovery fixture",
          headline: "Try a class",
          introduction: "Choose a class and verify your account.",
          contactEmail: "trial-recovery@example.test",
          seoTitle: "Trial recovery fixture",
          seoDescription: "A local test of trial booking recovery.",
          shareImageUrl: "",
          offers: [],
        },
      });
      site = await publishGymWebsite(actor, draft.draftVersion, true);
    }
    if (!site)
      throw new Error(
        "The local trial fixture requires a published gym website.",
      );
    expect(site.publishedAt).not.toBeNull();
    const templates = await prisma.classTemplate.findMany({
      where: { archivedAt: null, workspaceId },
      select: { id: true },
    });
    expect(templates.length).toBeGreaterThan(0);
    const templateIds = templates.map((item) => item.id);
    const trialUrl = `${memberBaseURL}/gym/${site.slug}/trial`;
    const email = `trial-recovery-${randomUUID()}@example.test`;
    let selectedTemplateId: string | undefined;

    try {
      await prisma.classTemplate.updateMany({
        where: { id: { in: templateIds } },
        data: { archivedAt: new Date() },
      });
      // The legacy link must lead to the published, verified registration route.
      await page.goto(`${memberBaseURL}/trial/${workspaceId}`);
      await waitForRegistrationFonts(page);
      await expect(page).toHaveURL(trialUrl);
      await expect(
        page.getByText(/No trial dates are available\./),
      ).toBeVisible();
      await expect(page.locator("form.registration-form")).toHaveCount(0);
      await captureState(page, testInfo, "zero-date");

      await prisma.classTemplate.updateMany({
        where: { id: { in: templateIds } },
        data: { archivedAt: null },
      });
      await waitForRegistrationFonts(page);
      await page.goto(trialUrl);
      await waitForRegistrationFonts(page);
      const form = page.locator("form.registration-form");
      const bookingSelect = page.getByLabel("Trial class", { exact: true });
      const submitButton = page.getByRole("button", {
        name: "Verify my email",
        exact: true,
      });
      await expect(form).toBeVisible();
      await expect(bookingSelect).toBeEnabled();
      await expect(submitButton).toBeEnabled();
      await expect(
        page.getByLabel("Your full name", { exact: true }),
      ).toHaveAttribute("autocomplete", "name");
      await expect(
        page.getByLabel("Your email", { exact: true }),
      ).toHaveAttribute("autocomplete", "email");
      await captureState(page, testInfo, "populated");

      await page.setViewportSize({ width: 390, height: 844 });
      await waitForRegistrationFonts(page);
      await page.goto(trialUrl);
      await waitForRegistrationFonts(page);
      await tabTo(page, submitButton);
      await expect(submitButton).toBeFocused();
      await page.keyboard.press("Enter");
      // Native required-field validation blocks the request and focuses the
      // first missing value; no account or email is created by invalid input.
      await expect(bookingSelect).toBeFocused();
      expect(
        await bookingSelect.evaluate(
          (element) => (element as HTMLSelectElement).validity.valueMissing,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("heading", { name: "Verify your email", exact: true }),
      ).toHaveCount(0);

      const selectedOption = await page
        .locator('select[name="bookingOption"] option:not([value=""])')
        .first()
        .getAttribute("value");
      expect(selectedOption).not.toBeNull();
      selectedTemplateId = selectedOption!.split("|")[0];
      await bookingSelect.selectOption(selectedOption!);
      await page
        .getByLabel("Your full name", { exact: true })
        .fill("Recovery Fixture");
      await page
        .getByLabel("Your date of birth", { exact: true })
        .fill("1990-06-15");
      await page.getByLabel("Your email", { exact: true }).fill(email);
      await page.locator('input[name="serviceConsent"]').check();
      const emailResponse = await submitAndSettle(page, submitButton);
      await expect(
        page.getByRole("heading", { name: "Verify your email", exact: true }),
      ).toBeVisible();
      const enrollment = await prisma.publicEnrollment.findFirstOrThrow({
        where: { workspaceId, email },
      });
      expect(enrollment.verifiedAt).toBeNull();
      expect(enrollment.memberId).toBeNull();
      // Read the actual local outbox message, then submit its one-use code
      // through the UI. No external email provider is configured in this suite.
      const notice = await prisma.notificationJob.findUniqueOrThrow({
        where: {
          workspaceId_dedupeKey: {
            workspaceId,
            dedupeKey: `public-verification:${enrollment.id}`,
          },
        },
      });
      const code = notice.body.match(/verification code is (\d{6})/)?.[1];
      expect(code).toBeTruthy();
      browserDiagnostics.acknowledgeAction(
        emailResponse,
        "Verification screen, unverified enrollment and local outbox verified.",
      );
      await page.getByLabel("Verification code", { exact: true }).fill(code!);
      const verifyResponse = await submitAndSettle(
        page,
        page.getByRole("button", { name: "Verify email", exact: true }),
      );
      await expect(
        page.getByRole("heading", { name: "Your account", exact: true }),
      ).toBeVisible();
      expect(
        (
          await prisma.publicEnrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
          })
        ).verifiedAt,
      ).not.toBeNull();
      browserDiagnostics.acknowledgeAction(
        verifyResponse,
        "Account screen and verified enrollment timestamp verified.",
      );
      await page
        .getByLabel("Password", { exact: false })
        .fill("RecoveryPass123!");
      const accountResponse = await submitAndSettle(
        page,
        page.getByRole("button", { name: "Continue", exact: true }),
      );
      const prepare = page.getByRole("button", {
        name: "Review required forms",
        exact: true,
      });
      const book = page.getByRole("button", {
        name: "Book trial for Recovery Fixture",
        exact: true,
      });
      await expect(prepare.or(book)).toBeVisible();
      expect(
        (
          await prisma.publicEnrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
          })
        ).memberId,
      ).not.toBeNull();
      browserDiagnostics.acknowledgeAction(
        accountResponse,
        "Participant linked in database and required-form or booking control visible.",
      );
      const prepareResponse = (await prepare.isVisible())
        ? await submitAndSettle(page, prepare)
        : null;
      await expect(book).toBeVisible();
      const verified = await prisma.publicEnrollment.findUniqueOrThrow({
        where: { id: enrollment.id },
      });
      expect(verified.verifiedAt).not.toBeNull();
      expect(verified.memberId).not.toBeNull();
      if (prepareResponse)
        browserDiagnostics.acknowledgeAction(
          prepareResponse,
          "Booking control visible and verified participant retained after form review.",
        );
      await prisma.classTemplate.update({
        where: { id: selectedTemplateId! },
        data: { archivedAt: new Date() },
      });
      const rejectedResponse = await submitAndSettle(page, book);
      const serverAlert = page.locator(".registration-error[role=alert]");
      await expect(serverAlert).toHaveText(
        "This class changed. Choose another trial date.",
      );
      await expect(serverAlert).toBeFocused();
      expect(
        await prisma.classBooking.count({
          where: { workspaceId, memberId: verified.memberId! },
        }),
      ).toBe(0);
      browserDiagnostics.acknowledgeAction(
        rejectedResponse,
        "Changed-class error focused and database confirms no booking was created.",
      );
      await expect(book).toBeEnabled();
      // The failed attempt retains the verified participant. Restoring the
      // occurrence and retrying succeeds once without another registration.
      await prisma.classTemplate.update({
        where: { id: selectedTemplateId! },
        data: { archivedAt: null },
      });
      const bookedResponse = await submitAndSettle(page, book);
      await expect
        .poll(() =>
          prisma.classBooking.count({
            where: {
              workspaceId,
              memberId: verified.memberId!,
              status: "BOOKED",
            },
          }),
        )
        .toBe(1);
      await expect(
        page.getByText(
          "Your trial is booked. Check your forms again if the gym publishes an update before class.",
          { exact: true },
        ),
      ).toBeVisible({ timeout: 20000 });
      expect(
        await prisma.classBooking.count({
          where: {
            workspaceId,
            memberId: verified.memberId!,
            status: "BOOKED",
          },
        }),
      ).toBe(1);
      browserDiagnostics.acknowledgeAction(
        bookedResponse,
        "Booking confirmation visible and database contains exactly one booked occurrence.",
      );
      await waitForRegistrationFonts(page);
      await page.reload();
      await waitForRegistrationFonts(page);
      await expect(
        page.getByText(
          "Your trial is booked. Check your forms again if the gym publishes an update before class.",
          { exact: true },
        ),
      ).toBeVisible();
      expect(
        await prisma.classBooking.count({
          where: { workspaceId, memberId: verified.memberId! },
        }),
      ).toBe(1);
      expect(browserDiagnostics.diagnostics).toEqual([]);
      browserDiagnostics.assertNoExternalRequests();
    } finally {
      await prisma.classTemplate.updateMany({
        where: { id: { in: templateIds } },
        data: { archivedAt: null },
      });
      const createdUser = await prisma.user.findUnique({ where: { email } });
      await prisma.notificationJob.deleteMany({
        where: { workspaceId, recipientEmail: email },
      });
      await prisma.publicEnrollment.deleteMany({
        where: { workspaceId, email },
      });
      if (createdUser) {
        await prisma.financialAccount.deleteMany({
          where: { workspaceId, userId: createdUser.id },
        });
        await prisma.member.deleteMany({
          where: { workspaceId, userId: createdUser.id },
        });
        await prisma.workspaceUser.deleteMany({
          where: { workspaceId, userId: createdUser.id },
        });
        await prisma.authSession.deleteMany({
          where: { userId: createdUser.id },
        });
        await prisma.user.delete({ where: { id: createdUser.id } });
      }
      if (createdWebsite) {
        await prisma.websitePublication.deleteMany({
          where: { websiteId: site.id },
        });
        await prisma.workspaceWebsite.delete({ where: { id: site.id } });
      }
    }
  });
});

test.beforeAll(async () => { await ensureDemoSchedulingPolicy(prisma); });
