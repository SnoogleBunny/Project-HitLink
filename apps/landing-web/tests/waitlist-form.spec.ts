import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const baseUrl = "http://127.0.0.1:3003";
const baseHost = new URL(baseUrl).host;
const evidenceDirectory = join(tmpdir(), "flowstate-rp06-evidence");
const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 1000 },
] as const;

function getWaitlistPath() {
  const configuredPath = process.env.FLOWSTATE_WAITLIST_PATH;
  if (!configuredPath) {
    throw new Error(
      "FLOWSTATE_WAITLIST_PATH is required for the focused landing test.",
    );
  }
  return configuredPath;
}

const waitlistPath = getWaitlistPath();

async function resetWaitlistFile() {
  await rm(dirname(waitlistPath), { recursive: true, force: true });
  await mkdir(dirname(waitlistPath), { recursive: true });
}

async function openWaitlist(page: Page) {
  await page.goto(`${baseUrl}/#waitlist`);
  await page.locator("#waitlist").scrollIntoViewIfNeeded();
  await expect(page.locator("#waitlist")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".waitlist-form")
        .evaluate((form) =>
          Object.keys(form).some((key) => key.startsWith("__reactProps")),
        ),
    )
    .toBe(true);
}

async function fillValidWaitlist(page: Page) {
  await page.locator("#ownerName").fill("Jacky Owner");
  await page.locator("#gymName").fill("Flow State Muay Thai");
  await page.locator("#email").fill("owner@example.com");
  await page.locator("#style").selectOption("Muay Thai");
  await page.locator("#note").fill("Replace brittle gym software.");
}

async function captureState(page: Page, viewport: string, state: string) {
  await page.locator("#waitlist").screenshot({
    animations: "disabled",
    path: join(evidenceDirectory, `${viewport}-${state}.png`),
  });
}

async function capturePendingState(page: Page, evidencePath: string) {
  const cdp = await page.context().newCDPSession(page);
  const sectionBox = await page.locator("#waitlist").boundingBox();
  expect(sectionBox).not.toBeNull();
  const scrollY = await page.evaluate(() => window.scrollY);

  await page.route(`${baseUrl}/**`, async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    await route.continue();
  });

  await cdp.send("Runtime.evaluate", {
    expression: 'document.querySelector(".form-submit")?.click()',
  });

  let pending = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await cdp.send("Runtime.evaluate", {
      expression:
        'document.querySelector(".form-submit")?.textContent === "Saving your request…" && document.querySelector(".form-submit")?.disabled === true',
      returnByValue: true,
    });
    pending = result.result.value === true;
    if (pending) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(pending).toBe(true);

  const screenshot = await cdp.send("Page.captureScreenshot", {
    captureBeyondViewport: true,
    clip: {
      x: sectionBox?.x ?? 0,
      y: (sectionBox?.y ?? 0) + scrollY,
      width: sectionBox?.width ?? 0,
      height: sectionBox?.height ?? 0,
      scale: 1,
    },
    format: "png",
  });
  await writeFile(evidencePath, Buffer.from(screenshot.data, "base64"));
  await cdp.detach();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  return dimensions;
}

async function expectMinimumTarget(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  return box?.height ?? 0;
}

test.describe.configure({ mode: "serial" });

test("local-receipt states are truthful, accessible, responsive, and network-local", async ({
  browser,
}) => {
  await mkdir(evidenceDirectory, { recursive: true });

  const diagnostics = {
    consoleErrors: [] as string[],
    externalHosts: [] as string[],
    pageErrors: [] as string[],
    requestFailures: [] as string[],
    viewportChecks: [] as Array<Record<string, string | number>>,
  };

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        const consoleError = `${viewport.name}: ${message.text()}`;
        diagnostics.consoleErrors.push(consoleError);
        console.error(consoleError);
      }
    });
    page.on("pageerror", (error) => {
      const pageError = `${viewport.name}: ${error.message}`;
      diagnostics.pageErrors.push(pageError);
      console.error(pageError);
    });
    page.on("requestfailed", (request) => {
      const requestFailure = `${viewport.name}: ${request.url()} ${request.failure()?.errorText}`;
      diagnostics.requestFailures.push(requestFailure);
      console.error(requestFailure);
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.host && url.host !== baseHost) {
        diagnostics.externalHosts.push(`${viewport.name}: ${url.host}`);
      }
    });

    await resetWaitlistFile();
    await openWaitlist(page);
    await expect(
      page.getByText("Qualifying gyms that join the Founding Gym waitlist"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Join the Founding Gym waitlist" }),
    ).toBeEnabled();
    await captureState(page, viewport.name, "idle");

    const idleDimensions = await expectNoHorizontalOverflow(page);
    const submitHeight = await expectMinimumTarget(page, ".form-submit");
    const inputHeight = await expectMinimumTarget(page, "#ownerName");

    await fillValidWaitlist(page);
    await capturePendingState(
      page,
      join(evidenceDirectory, `${viewport.name}-submitting.png`),
    );

    await expect(page.getByRole("status")).toHaveText(
      "Your Founding Gym waitlist request was saved locally. No email was sent.",
    );
    await page.unroute(`${baseUrl}/**`);
    await expect(
      page.getByRole("button", { name: "Request saved locally" }),
    ).toBeDisabled();
    await expect(page.locator("#style")).toHaveValue("Muay Thai");
    await captureState(page, viewport.name, "success");
    expect(
      (await readFile(waitlistPath, "utf8")).trim().split("\n"),
    ).toHaveLength(1);

    await resetWaitlistFile();
    await page.reload();
    await page.locator("#waitlist").scrollIntoViewIfNeeded();
    await page.locator("#ownerName").fill("Jacky Owner");
    await page.locator("#gymName").fill("Flow State Muay Thai");
    await page.locator("#email").fill("owner@example.com");
    await page.locator("#note").fill("Keep these values for recovery.");
    await page
      .getByRole("button", { name: "Join the Founding Gym waitlist" })
      .click();

    const validationAlert = page.locator('.form-message[role="alert"]');
    await expect(validationAlert).toBeFocused();
    await expect(validationAlert).toHaveText(
      "Check the fields with errors, then submit your request again.",
    );
    await expect(page.locator("#style")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator("#style-error")).toHaveText(
      "Choose a primary style.",
    );
    await expect(page.locator("#ownerName")).toHaveValue("Jacky Owner");
    await expect(page.locator("#note")).toHaveValue(
      "Keep these values for recovery.",
    );
    await captureState(page, viewport.name, "validation-error");
    await page.keyboard.press("Tab");
    await expect(validationAlert.getByRole("link")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#style")).toBeFocused();

    await rm(dirname(waitlistPath), { recursive: true, force: true });
    await writeFile(dirname(waitlistPath), "blocks directory creation", "utf8");
    await page.reload();
    await page.locator("#waitlist").scrollIntoViewIfNeeded();
    await fillValidWaitlist(page);
    await page
      .getByRole("button", { name: "Join the Founding Gym waitlist" })
      .click();

    const writeAlert = page.locator('.form-message[role="alert"]');
    await expect(writeAlert).toBeFocused();
    await expect(writeAlert).toHaveText(
      "We couldn't confirm that your waitlist request was saved locally. Please try again.",
    );
    await expect(page.locator("#ownerName")).toHaveValue("Jacky Owner");
    await expect(page.locator("#note")).toHaveValue(
      "Replace brittle gym software.",
    );
    await expect(page.locator("#style")).toHaveValue("Muay Thai");
    await expect(
      page.getByRole("button", { name: "Join the Founding Gym waitlist" }),
    ).toBeEnabled();
    await captureState(page, viewport.name, "write-error");

    const retryAttemptId = await page
      .locator('input[name="attemptId"]')
      .inputValue();
    expect(retryAttemptId).not.toBe("");
    await resetWaitlistFile();
    await page
      .getByRole("button", { name: "Join the Founding Gym waitlist" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Your Founding Gym waitlist request was saved locally. No email was sent.",
    );
    await expect(page.locator('input[name="attemptId"]')).toHaveValue(
      retryAttemptId,
    );
    const retryRecord = JSON.parse(
      (await readFile(waitlistPath, "utf8")).trim(),
    ) as {
      attemptId: string;
    };
    expect(retryRecord.attemptId).toBe(retryAttemptId);

    await resetWaitlistFile();
    await page.reload();
    await page.locator("#waitlist").scrollIntoViewIfNeeded();
    await fillValidWaitlist(page);
    const attemptId = `duplicate-${viewport.name}`;
    await page.locator('input[name="attemptId"]').evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
    }, attemptId);
    await writeFile(
      waitlistPath,
      `${JSON.stringify({
        attemptId,
        ownerName: "Jacky Owner",
        gymName: "Flow State Muay Thai",
        email: "owner@example.com",
        style: "Muay Thai",
        note: "Replace brittle gym software.",
        submittedAt: "2026-08-18T00:00:00.000Z",
      })}\n`,
      "utf8",
    );
    await page
      .getByRole("button", { name: "Join the Founding Gym waitlist" })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "This same waitlist request is already saved locally. You do not need to submit it again.",
    );
    await expect(
      page.getByRole("button", { name: "Request saved locally" }),
    ).toBeDisabled();
    await expect(page.locator("#style")).toHaveValue("Muay Thai");
    await captureState(page, viewport.name, "duplicate");
    expect(
      (await readFile(waitlistPath, "utf8")).trim().split("\n"),
    ).toHaveLength(1);

    const finalDimensions = await expectNoHorizontalOverflow(page);
    diagnostics.viewportChecks.push({
      clientWidth: finalDimensions.clientWidth,
      inputHeight,
      scrollWidth: finalDimensions.scrollWidth,
      submitHeight,
      viewport: viewport.name,
      idleClientWidth: idleDimensions.clientWidth,
      idleScrollWidth: idleDimensions.scrollWidth,
    });

    await context.close();
  }

  const uniqueExternalHosts = [...new Set(diagnostics.externalHosts)];
  await writeFile(
    join(evidenceDirectory, "diagnostics.json"),
    `${JSON.stringify({ ...diagnostics, externalHosts: uniqueExternalHosts }, null, 2)}\n`,
    "utf8",
  );

  expect(uniqueExternalHosts).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.requestFailures).toEqual([]);
});

test("a fresh browser interaction can save the same entered values again", async ({
  browser,
}) => {
  await resetWaitlistFile();
  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  await openWaitlist(firstPage);
  await fillValidWaitlist(firstPage);
  await firstPage
    .getByRole("button", { name: "Join the Founding Gym waitlist" })
    .focus();
  await firstPage.keyboard.press("Enter");
  await expect(firstPage.getByRole("status")).toHaveText(
    "Your Founding Gym waitlist request was saved locally. No email was sent.",
  );
  await firstContext.close();

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await openWaitlist(secondPage);
  await fillValidWaitlist(secondPage);
  await secondPage
    .getByRole("button", { name: "Join the Founding Gym waitlist" })
    .click();
  await expect(secondPage.getByRole("status")).toHaveText(
    "Your Founding Gym waitlist request was saved locally. No email was sent.",
  );
  await secondContext.close();

  expect(
    (await readFile(waitlistPath, "utf8")).trim().split("\n"),
  ).toHaveLength(2);
});
