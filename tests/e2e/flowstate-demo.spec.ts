import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/flowstate_dev?schema=public";

const prisma = new PrismaClient();

const demo = {
  ownerEmail: "demo-owner@flowstate.local",
  ownerPassword: "DemoPass123!",
  memberEmail: "demo-member@flowstate.local",
  memberPassword: "MemberPass123!",
  trialEmail: "demo-trial@flowstate.local",
};

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

async function expectHealthyPage(page: Page): Promise<string> {
  const text = await bodyText(page);

  await expect(page.locator("body")).not.toContainText(
    "This page couldn't load",
  );
  await expect(page.locator("body")).not.toContainText("server error");
  await expect(page.locator("body")).not.toContainText(
    "This page could not be found",
  );

  return text;
}

const forbiddenCompletedMigrationContent = [
  "Import jobs",
  "Source file",
  "Validation issues",
  "Latest reconciliation",
  "Reconciliation report",
  "Staging and reconciliation",
  "Operator approval",
  "demo-import-job-member",
  "fictional-demo-members.csv",
  "recordKind",
  '"created"',
  '"updated"',
  '"skipped"',
  "Unlimited free amendments",
  "migration amendments",
  "launch support",
  "one business day",
  "15% off",
  "grandfathered",
  "white-glove migration with no chaos",
  "perfect one-click migration",
] as const;

async function expectCompletedMigrationOwnerSummary(page: Page): Promise<void> {
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

  const resultsSection = page.locator(
    'section[aria-labelledby="results-title"]',
  );
  await expect(
    resultsSection.getByRole("heading", {
      name: "Import summary",
      exact: true,
    }),
  ).toBeVisible();
  for (const [label, value] of [
    ["Records added", "1"],
    ["Records updated", "0"],
    ["Records not imported", "0"],
  ] as const) {
    const metric = resultsSection
      .locator("dl.inline-meta > div")
      .filter({ hasText: label });
    await expect(metric.locator("dt")).toHaveText(label);
    await expect(metric.locator("dd")).toHaveText(value);
  }
  await expect(
    resultsSection.getByText(
      "All records in the completed imports were added or updated.",
      { exact: true },
    ),
  ).toBeVisible();

  for (const rawToken of ["MAPPED", "VALIDATED", "COMPLETED", "MEMBER"]) {
    await expect(page.getByText(rawToken, { exact: true })).toHaveCount(0);
  }
  for (const phrase of forbiddenCompletedMigrationContent) {
    await expect(page.locator("body")).not.toContainText(phrase);
  }
}

function parseRgb(color: string): [number, number, number] {
  const channels = color
    .match(/\d+(?:\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Unsupported browser color: ${color}`);
  }
  return channels as [number, number, number];
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = parseRgb(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

async function loginAdmin(page: Page) {
  await page.goto("http://localhost:3000/login");
  if (/\/dashboard/.test(page.url())) {
    return;
  }

  await page.getByLabel("Email").fill(demo.ownerEmail);
  await page.getByLabel("Password").fill(demo.ownerPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function loginMember(page: Page) {
  await page.goto("http://localhost:3001/login");
  await page.getByLabel("Email").fill(demo.memberEmail);
  await page.getByLabel("Password").fill(demo.memberPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.serial("Flowstate working demo", () => {
  test.setTimeout(300_000);

  test("seeded demo owner reaches the dashboard without onboarding redirect", async ({
    page,
  }) => {
    await loginAdmin(page);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page).not.toHaveURL(/\/onboarding$/);
    await expect(page.getByText("Demo Flowstate Gym").first()).toBeVisible();
    await expectHealthyPage(page);
  });

  test("a lower schedule action keeps its pending and failure feedback in context", async ({
    page,
  }) => {
    const classTemplate = await prisma.classTemplate.findFirstOrThrow({
      where: { title: "Today Fundamentals" },
    });
    let releaseRequest = () => {};
    let clickPromise: Promise<void> | undefined;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });

    await loginMember(page);
    await page.goto("http://localhost:3001/app/schedule");

    const actionButtons = page.locator(
      ".member-stack-item .member-occurrence-action button:not([disabled])",
    );
    await expect(actionButtons.first()).toBeVisible();
    expect(await actionButtons.count()).toBeGreaterThan(2);

    const actionLabels = await actionButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label") ?? ""),
    );
    expect(new Set(actionLabels).size).toBe(actionLabels.length);
    for (const label of actionLabels) {
      expect(label).toContain("Book class — Today Fundamentals");
      expect(label).toContain(" at ");
    }

    const lowerCard = page.locator(".member-stack-item").nth(2);
    const lowerButton = lowerCard.locator("button");
    await lowerButton.scrollIntoViewIfNeeded();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);

    await page.route("**/app/schedule", async (route) => {
      if (route.request().method() === "POST") {
        await requestGate;
      }
      await route.continue();
    });

    try {
      await prisma.classTemplate.update({
        where: { id: classTemplate.id },
        data: { bookingCutoffMinutes: 100_000 },
      });

      clickPromise = lowerButton.click();
      await expect(lowerButton).toBeDisabled();
      await expect(lowerButton).toHaveText("Booking…");
      releaseRequest();
      await clickPromise;

      const alert = lowerCard.getByRole("alert");
      await expect(alert).toContainText("Today Fundamentals");
      await expect(alert).toContainText("Choose a valid upcoming date");
      await expect(alert).toContainText("try again");
      await expect(alert).toBeFocused();
      await lowerButton.click();
      await expect(alert).toBeFocused();
      await expect(
        page.locator('.member-stack-item [role="alert"]'),
      ).toHaveCount(1);
      await expect(
        page.locator(".member-stack-item").first().getByRole("alert"),
      ).toHaveCount(0);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    } finally {
      releaseRequest();
      await clickPromise?.catch(() => undefined);
      await page.unroute("**/app/schedule");
      await prisma.classTemplate.update({
        where: { id: classTemplate.id },
        data: { bookingCutoffMinutes: classTemplate.bookingCutoffMinutes },
      });
    }
  });

  test("member schedule actions remain readable and responsive", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginMember(page);
    await page.goto("http://localhost:3001/app/schedule");

    const actionButton = page
      .locator(".member-occurrence-action button")
      .first();
    await expect(actionButton).toBeVisible();

    const defaultColors = await actionButton.evaluate((button) => {
      const styles = getComputedStyle(button);
      return {
        background: styles.backgroundColor,
        foreground: styles.color,
      };
    });
    expect(defaultColors).toEqual({
      background: "rgb(167, 81, 40)",
      foreground: "rgb(255, 255, 255)",
    });
    expect(
      contrastRatio(defaultColors.background, defaultColors.foreground),
    ).toBeGreaterThanOrEqual(4.5);

    await actionButton.hover();
    await expect(actionButton).toHaveCSS(
      "background-color",
      "rgb(143, 67, 29)",
    );
    const hoverBackground = await actionButton.evaluate(
      (button) => getComputedStyle(button).backgroundColor,
    );
    expect(hoverBackground).toBe("rgb(143, 67, 29)");
    expect(
      contrastRatio(hoverBackground, defaultColors.foreground),
    ).toBeGreaterThanOrEqual(4.5);

    await actionButton.focus();
    const focusColors = await actionButton.evaluate((button) => {
      const card = button.closest(".member-stack-item");
      if (!card) {
        throw new Error("Schedule action card not found");
      }
      return {
        outline: getComputedStyle(button).outlineColor,
        surface: getComputedStyle(card).backgroundColor,
      };
    });
    expect(focusColors.outline).toBe("rgb(23, 53, 43)");
    expect(
      contrastRatio(focusColors.outline, focusColors.surface),
    ).toBeGreaterThanOrEqual(4.5);

    for (const viewport of [
      { name: "desktop", width: 1440, height: 1000 },
      { name: "tablet", width: 1024, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const actionBox = await actionButton.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox!.height).toBeLessThanOrEqual(64);
      await page.screenshot({
        path: testInfo.outputPath(`member-schedule-${viewport.name}.png`),
        fullPage: true,
      });
    }
  });

  test("admin, member, public trial, and API flows are connected", async ({
    page,
    request,
  }) => {
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: {
        name: "Demo Flowstate Gym",
      },
      include: {
        migration: true,
        programs: true,
        location: {
          include: {
            rooms: true,
          },
        },
        classTemplates: true,
        membershipPlans: true,
        punchCardProducts: true,
        dropInProducts: true,
        formDocuments: true,
        members: true,
      },
    });

    expect(workspace.status).toBe("ACTIVE");
    expect(workspace.migration?.stage).toBe("COMPLETE");
    expect(workspace.migration?.operationallyReadyAt).toBeInstanceOf(Date);
    expect(workspace.programs).toHaveLength(1);
    expect(workspace.location?.rooms).toHaveLength(1);
    expect(workspace.classTemplates).toHaveLength(1);
    expect(workspace.membershipPlans).toHaveLength(1);
    expect(workspace.punchCardProducts).toHaveLength(1);
    expect(workspace.dropInProducts).toHaveLength(1);
    expect(workspace.formDocuments).toHaveLength(1);
    expect(workspace.members).toHaveLength(1);

    const health = await request.get("http://localhost:3002/api/v1/health");
    await expect(health).toBeOK();
    expect(await health.json()).toEqual({ ok: true });

    await loginAdmin(page);
    await expectHealthyPage(page);
    await expect(page.getByText("Demo Flowstate Gym").first()).toBeVisible();

    const adminRoutes = [
      "/dashboard",
      "/dashboard/programs",
      `/dashboard/programs/${workspace.programs[0].id}/edit`,
      "/dashboard/rooms",
      `/dashboard/rooms/${workspace.location?.rooms[0].id}/edit`,
      "/dashboard/schedule",
      "/dashboard/schedule/new",
      `/dashboard/schedule/${workspace.classTemplates[0].id}/edit`,
      "/dashboard/bookings",
      "/dashboard/coach/today",
      "/dashboard/members",
      `/dashboard/members/${workspace.members[0].id}`,
      `/dashboard/members/${workspace.members[0].id}/billing`,
      "/dashboard/forms",
      `/dashboard/forms/${workspace.formDocuments[0].id}`,
      "/dashboard/membership-plans",
      `/dashboard/membership-plans/${workspace.membershipPlans[0].id}/edit`,
      "/dashboard/access-products",
      `/dashboard/access-products/punch-cards/${workspace.punchCardProducts[0].id}/edit`,
      `/dashboard/access-products/drop-ins/${workspace.dropInProducts[0].id}/edit`,
      "/dashboard/billing",
      "/dashboard/settings/billing",
      "/dashboard/staff-invites",
      "/dashboard/migration",
    ];

    for (const route of adminRoutes) {
      const response = await page.goto(`http://localhost:3000${route}`);
      expect(response?.status(), route).toBeLessThan(400);
      await expectHealthyPage(page);
    }

    await page.goto("http://localhost:3000/dashboard/migration");
    await expectCompletedMigrationOwnerSummary(page);
    await expect(page.getByText("Handoff complete").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "Daily operations stay inactive",
    );
    await expect(page.locator("body")).not.toContainText(
      "No exports uploaded yet",
    );
    await expect(page.locator("body")).not.toContainText("ready for review");

    await loginMember(page);
    await expectHealthyPage(page);
    await expect(page.getByText("Demo Member").first()).toBeVisible();

    const memberRoutes = [
      "/app",
      "/app/schedule",
      "/app/bookings",
      "/app/membership",
      "/app/forms",
      "/app/billing",
      "/app/checkout/complete",
    ];

    for (const route of memberRoutes) {
      const response = await page.goto(`http://localhost:3001${route}`);
      expect(response?.status(), route).toBeLessThan(400);
      await expectHealthyPage(page);
    }

    await page.goto("http://localhost:3001/app/schedule");
    await expect(
      page.getByRole("button", { name: "Book class" }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Book class" }).first().click();
    await expect(page).toHaveURL(/\/app\/bookings$/);
    await expect(page.getByText("1 active booking")).toBeVisible();
    await expect(page.getByText("Today Fundamentals")).toBeVisible();

    const memberBooking = await prisma.classBooking.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        member: {
          email: demo.memberEmail,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const rosterDate = memberBooking.scheduledForDate
      .toISOString()
      .slice(0, 10);
    const connectedOccurrenceValue = `${memberBooking.classTemplateId}|${rosterDate}`;

    await page.goto(`http://localhost:3001/trial/${workspace.id}`);
    await expectHealthyPage(page);
    await page
      .locator('select[name="bookingOption"]')
      .selectOption(connectedOccurrenceValue);
    await page.locator('input[name="fullName"]').fill("Demo Trial Prospect");
    await page.locator('input[name="email"]').fill(demo.trialEmail);
    await page.locator('input[name="phone"]').fill("555-0303");
    await page.getByRole("button", { name: "Book trial" }).click();
    await expect(page.getByText("Trial booked")).toBeVisible();

    const trialBooking = await prisma.classBooking.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        member: {
          email: demo.trialEmail,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(trialBooking).toMatchObject({
      bookingType: "TRIAL",
      classTemplateId: memberBooking.classTemplateId,
      scheduledForDate: memberBooking.scheduledForDate,
      source: "PUBLIC_TRIAL",
      status: "BOOKED",
    });

    await loginAdmin(page);
    await page.goto(
      `http://localhost:3000/dashboard/schedule/${memberBooking.classTemplateId}/roster?date=${rosterDate}`,
    );
    await expect(
      page.locator("dd").filter({ hasText: /^2 \/ 20 booked$/ }),
    ).toBeVisible();
    await expect(page.getByText("Demo Member")).toBeVisible();
    await expect(page.getByText("Demo Trial Prospect")).toBeVisible();
    await page.locator('select[name="state"]').first().selectOption("PRESENT");
    await page
      .locator('input[name="note"]')
      .first()
      .fill("Playwright attendance check.");
    await page.getByRole("button", { name: "Save attendance" }).first().click();
    const demoMemberCard = page
      .locator("article")
      .filter({ hasText: "Demo Member" });
    await expect(demoMemberCard.getByText("Attended")).toBeVisible();
    await expect(
      demoMemberCard.locator("span").filter({ hasText: /^Present$/ }),
    ).toBeVisible();
  });
});
