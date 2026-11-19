import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { prepareCleanEvidence } from "./support/clean-evidence";

const prisma = new PrismaClient();
const memberBaseURL =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const viewportEvidence = [
  { height: 844, name: "390", width: 390 },
  { height: 900, name: "768", width: 768 },
  { height: 1000, name: "1440", width: 1440 },
] as const;

function watchDiagnostics(page: Page) {
  const diagnostics: string[] = [];
  const externalHosts = new Set<string>();

  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    diagnostics.push(
      `requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("request", (request) => {
    const url = new URL(request.url());

    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      externalHosts.add(url.hostname);
    }
  });

  return { diagnostics, externalHosts };
}

async function expectNoOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
        '.trial-form select, .trial-form input:not([type="hidden"]), .trial-form button',
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
    page,
  }, testInfo) => {
    const diagnostics = watchDiagnostics(page);
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: { name: "Demo Flowstate Gym" },
    });
    const classTemplate = await prisma.classTemplate.findFirstOrThrow({
      where: { archivedAt: null, workspaceId: workspace.id },
      orderBy: { createdAt: "asc" },
    });
    const trialUrl = `${memberBaseURL}/trial/${workspace.id}`;

    try {
      await prisma.classTemplate.update({
        where: { id: classTemplate.id },
        data: { bookingCutoffMinutes: 100_000 },
      });
      await page.goto(trialUrl);
      await expect(
        page.getByRole("heading", {
          name: "Classes are not available right now",
        }),
      ).toBeVisible();
      await expect(page.locator("form")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Book trial" }),
      ).toHaveCount(0);
      await captureState(page, testInfo, "zero-date");

      await prisma.classTemplate.update({
        where: { id: classTemplate.id },
        data: { bookingCutoffMinutes: classTemplate.bookingCutoffMinutes },
      });
      await page.goto(trialUrl);
      const form = page.locator("form.trial-form");
      const bookingSelect = page.getByLabel("Trial class");
      const submitButton = page.getByRole("button", { name: "Book trial" });

      await expect(form).toBeVisible();
      await expect(bookingSelect).toBeEnabled();
      await expect(submitButton).toBeEnabled();
      await expect(page.getByLabel("Participant full name")).toHaveAttribute(
        "autocomplete",
        "name",
      );
      await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
        "aria-describedby",
        "trial-contact-help",
      );
      await captureState(page, testInfo, "populated");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(trialUrl);
      const keyboardSubmit = page.getByRole("button", { name: "Book trial" });
      await tabTo(page, keyboardSubmit);
      await expect(keyboardSubmit).toBeFocused();
      await page.keyboard.press("Enter");

      const clientAlert = page.locator("#trial-booking-error-summary");
      await expect(clientAlert).toContainText("Check these details:");
      await expect(clientAlert.locator("li")).toHaveCount(3);
      await expect(page.getByLabel("Trial class")).toBeFocused();
      await expect(page.getByLabel("Trial class")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByLabel("Trial class")).toHaveAttribute(
        "aria-describedby",
        "trial-booking-error-summary",
      );
      await expect(clientAlert).toHaveAttribute("aria-live", "assertive");

      await page.goto(trialUrl);
      const selectedOption = await page
        .locator('select[name="bookingOption"] option:not([value=""])')
        .first()
        .getAttribute("value");
      expect(selectedOption).not.toBeNull();
      await page.getByLabel("Trial class").selectOption(selectedOption!);
      await page.getByLabel("Participant full name").fill("Recovery Fixture");
      await page
        .getByLabel("Email", { exact: true })
        .fill("recovery@example.test");
      await prisma.classTemplate.update({
        where: { id: classTemplate.id },
        data: { bookingCutoffMinutes: 100_000 },
      });
      await page.getByRole("button", { name: "Book trial" }).click();

      const serverAlert = page.locator("#trial-booking-error-summary");
      await expect(serverAlert).toHaveText(
        "Choose an available upcoming trial date.",
      );
      await expect(page.getByLabel("Trial class")).toBeFocused();

      expect(diagnostics.diagnostics).toEqual([]);
      expect([...diagnostics.externalHosts]).toEqual([]);
    } finally {
      await prisma.classTemplate.update({
        where: { id: classTemplate.id },
        data: { bookingCutoffMinutes: classTemplate.bookingCutoffMinutes },
      });
    }
  });
});
