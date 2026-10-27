import { expectActionRedirect } from "./support/action-redirect";
import { loginToWorkspace } from "./support/workspace-login";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Weekday } from "@prisma/client";
import {
  classOccurrenceInclude,
  getOccurrenceStartsAt,
  resolveClassOccurrence,
} from "@flowstate/db";
import {
  expect,
  test,
  type Locator,
  type Page,
  type BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
) {
  throw new Error(
    "Timezone acceptance requires an explicitly configured disposable local test database.",
  );
}
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const adminOrigin =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const memberOrigin =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const weekdays: Weekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
const today = new Date().toISOString().slice(0, 10);
const day = (offset: number) => {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

async function fixture() {
  const key = `timezone-e2e-${randomUUID()}`;
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const owner = await db.user.create({
    data: {
      email: `${key}-owner@example.test`,
      fullName: "Fictional timezone owner",
      passwordHash: seed.passwordHash,
    },
  });
  const customer = await db.user.create({
    data: {
      email: `${key}-member@example.test`,
      fullName: "Fictional timezone participant",
      passwordHash: seed.passwordHash,
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: key,
      status: "ACTIVE",
      location: {
        create: { name: "Fictional timezone location", timezone: "UTC" },
      },
      workspaceUsers: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: customer.id, role: "CUSTOMER" },
        ],
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional handoff complete",
          flowstateResponsibility: "Local timezone acceptance fixture",
          ownerReviewAcknowledgedAt: new Date(),
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: new Date(),
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: { location: true },
  });
  await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
  const member = await db.member.create({
    data: {
      workspaceId: workspace.id,
      userId: customer.id,
      fullName: customer.fullName!,
      email: customer.email,
      status: "ACTIVE",
      dateOfBirth: asDate("1990-01-01"),
    },
  });
  const program = await db.program.create({
    data: { workspaceId: workspace.id, name: "Timezone test program" },
  });
  const room = await db.room.create({
    data: {
      locationId: workspace.location!.id,
      name: "Timezone test mat",
      capacity: 4,
    },
  });
  const bookedDate = day(14),
    futureDate = day(21),
    pastDate = day(-7),
    effectiveDate = day(15);
  const template = await db.classTemplate.create({
    data: {
      workspaceId: workspace.id,
      roomId: room.id,
      programId: program.id,
      title: "Timezone review class",
      weekday: weekdays[asDate(bookedDate).getUTCDay()],
      startTimeMinutes: 1080,
      endTimeMinutes: 1140,
      bookingCutoffMinutes: 0,
      cancellationCutoffMinutes: 0,
    },
  });
  const plan = await db.membershipPlan.create({
    data: {
      workspaceId: workspace.id,
      name: "Accepted UTC weekly plan",
      monthlyPriceCents: 10000,
      weeklyClassLimit: 2,
    },
  });
  const terms = {
    version: 1,
    monthlyPriceCents: 10000,
    currency: "usd",
    weeklyClassLimit: 2,
    monthlyClassLimit: null,
    allowanceCountingMode: "ATTENDANCE",
    lateCancellationConsumesClass: true,
    noShowConsumesClass: true,
    programIds: [],
    cancellationPolicyReference: null,
    freezePolicyReference: null,
    capturedAt: new Date().toISOString(),
  };
  const membership = await db.memberMembership.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      membershipPlanId: plan.id,
      status: "ACTIVE",
      startedAt: asDate(day(-40)),
      allowanceAnchorDate: asDate(day(-6)),
      allowanceTimezone: "UTC",
      acceptedTerms: terms,
    },
  });
  return {
    workspace,
    owner,
    customer,
    member,
    template,
    membership,
    bookedDate,
    futureDate,
    pastDate,
    effectiveDate,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function cleanup(data: Fixture) {
  const where = { workspaceId: data.workspace.id };
  await db.notificationJob.deleteMany({ where });
  await db.classBooking.deleteMany({ where });
  await db.classTemplate.deleteMany({ where });
  await db.memberMembership.deleteMany({ where });
  // Confirmed timezone history can only leave through the parent workspace
  // cascade; do not disable its immutable-history protection for a fixture.
  await db.workspace.delete({ where: { id: data.workspace.id } });
  await db.user.deleteMany({
    where: { id: { in: [data.owner.id, data.customer.id] } },
  });
}
async function action(page: Page, control: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        Boolean(candidate.request().headers()["next-action"]),
      { timeout: 20_000 },
    ),
    control.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
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
    responseTimeout: 20_000,
  });
  await expect(page).toHaveURL(destination);
}
async function occurrence(templateId: string, date: string) {
  const template = await db.classTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: classOccurrenceInclude,
  });
  const resolved = resolveClassOccurrence({
    template,
    scheduledForDate: date,
  })!;
  return {
    timezone: resolved.timezone,
    startsAt: getOccurrenceStartsAt({
      scheduledForDate: date,
      startTimeMinutes: resolved.startTimeMinutes,
      timezone: resolved.timezone!,
    }).toISOString(),
  };
}

test.use({ actionTimeout: 15_000 });
test.afterAll(() => db.$disconnect());
test("WS03 owner reviews blockers and a future timezone change while class instants and accepted funding history survive", async ({
  page,
  context,
  browserDiagnostics,
}, info) => {
  test.setTimeout(120_000);
  const data = await fixture();
  const memberPage = await context.newPage();
  try {
    const oldPast = await occurrence(data.template.id, data.pastDate);
    const oldCommitted = await occurrence(data.template.id, data.bookedDate);
    await login(
      memberPage,
      memberOrigin,
      data.customer.email,
      /\/app\/schedule$/,
      browserDiagnostics,
    );
    await memberPage.goto(
      `${memberOrigin}/app/schedule?date=${data.bookedDate}`,
    );
    await memberPage
      .getByRole("button", { name: /^Book class — Timezone review class,/ })
      .click();
    let dialog = memberPage.getByRole("dialog", {
      name: "Review booking",
      exact: true,
    });
    await expect(dialog).toContainText("UTC");
    const booked = await action(
      memberPage,
      dialog.getByRole("button", { name: "Book class", exact: true }),
    );
    await expect(memberPage.getByRole("status")).toContainText(
      "Your place is booked.",
    );
    const beforeBooking = await db.classBooking.findFirstOrThrow({
      where: {
        workspaceId: data.workspace.id,
        scheduledForDate: asDate(data.bookedDate),
      },
    });
    const beforeAllocation = await db.membershipAllowanceAllocation.findMany({
      where: { bookingId: beforeBooking.id },
      orderBy: { id: "asc" },
    });
    expect(beforeAllocation).toHaveLength(1);
    expect(beforeAllocation[0]!.state).toBe("RESERVED");
    await expectActionRedirect(memberPage, booked, `${memberOrigin}/app/schedule?${new URLSearchParams({date:data.bookedDate,booking:beforeBooking.id,notice:"booked"})}`);
    if (booked.status() === 200) browserDiagnostics.acknowledgeAction(
      booked,
      "Your place is booked is visible and the exact booking has one reserved membership allowance allocation before the timezone revision.",
    );

    await login(page, adminOrigin, data.owner.email, /\/dashboard$/, browserDiagnostics);
    await page.goto(`${adminOrigin}/dashboard/settings/business`);
    const card = page.locator("section.management-card").filter({
      has: page.getByRole("heading", {
        name: "Business timezone",
        exact: true,
      }),
    });
    await expect(card).toBeVisible();
    await card
      .getByRole("combobox", { name: /^New business timezone/ })
      .selectOption("America/Los_Angeles");
    await card
      .getByLabel("Effective from class date", { exact: true })
      .fill(day(13));
    const blocked = await action(
      page,
      card.getByRole("button", {
        name: "Preview timezone change",
        exact: true,
      }),
    );
    await expect(
      card.getByRole("region", { name: "Timezone change preview" }),
    ).toContainText(data.bookedDate);
    await expect(card).toContainText(
      "Choose an effective date after the committed class dates below.",
    );
    await expect(card).toContainText(
      `Earliest date after these commitments: ${data.effectiveDate}`,
    );
    await expect(
      card.getByRole("combobox", { name: /^New business timezone/ }),
    ).toHaveValue("America/Los_Angeles");
    await expect(
      card.getByLabel("Effective from class date", { exact: true }),
    ).toHaveValue(day(13));
    await expect(
      card.getByRole("button", {
        name: "Confirm timezone change",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      await db.workspaceTimezoneRevision.count({
        where: { workspaceId: data.workspace.id },
      }),
    ).toBe(0);
    browserDiagnostics.acknowledgeAction(
      blocked,
      "Blocked preview names the existing booking and an actionable later date, with no history write or confirmation control.",
    );

    await card
      .getByLabel("Effective from class date", { exact: true })
      .fill(data.effectiveDate);
    const reviewed = await action(
      page,
      card.getByRole("button", {
        name: "Preview timezone change",
        exact: true,
      }),
    );
    await expect(
      card.getByRole("button", {
        name: "Confirm timezone change",
        exact: true,
      }),
    ).toBeVisible();
    await expect(card).toContainText("Upcoming class examples");
    const confirmation = card.getByLabel(
      "I reviewed the dates and confirm this future timezone change.",
      { exact: true },
    );
    await expect(confirmation).not.toBeChecked();
    await expect(confirmation).toHaveAttribute("required", "");
    browserDiagnostics.acknowledgeAction(
      reviewed,
      "Safe preview shows before/after class offsets and an unchecked required explicit confirmation.",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    await info.attach("WS03 reviewed timezone phone", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await confirmation.check();
    const confirmed = await action(
      page,
      card.getByRole("button", {
        name: "Confirm timezone change",
        exact: true,
      }),
    );
    await expect(card).toContainText(
      `Timezone change to America/Los_Angeles scheduled for ${data.effectiveDate}.`,
    );
    await page.reload();
    await expect(card).toContainText("Timezone change history");
    await expect(card).toContainText(
      `Version 1: UTC → America/Los_Angeles, effective from ${data.effectiveDate}.`,
    );
    const history = await db.workspaceTimezoneRevision.findMany({
      where: { workspaceId: data.workspace.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      version: 1,
      actorUserId: data.owner.id,
      previousTimezone: "UTC",
      timezone: "America/Los_Angeles",
      effectiveFromDate: asDate(data.effectiveDate),
    });
    expect(
      (
        await db.location.findUniqueOrThrow({
          where: { workspaceId: data.workspace.id },
        })
      ).timezone,
    ).toBe("UTC");
    expect(await occurrence(data.template.id, data.pastDate)).toEqual(oldPast);
    expect(await occurrence(data.template.id, data.bookedDate)).toEqual(
      oldCommitted,
    );
    expect(
      await db.classBooking.findUniqueOrThrow({
        where: { id: beforeBooking.id },
      }),
    ).toEqual(beforeBooking);
    expect(
      await db.membershipAllowanceAllocation.findMany({
        where: { bookingId: beforeBooking.id },
        orderBy: { id: "asc" },
      }),
    ).toEqual(beforeAllocation);
    expect(
      (
        await db.memberMembership.findUniqueOrThrow({
          where: { id: data.membership.id },
        })
      ).acceptedTerms,
    ).toEqual(data.membership.acceptedTerms);
    browserDiagnostics.acknowledgeAction(
      confirmed,
      "Confirmed history survives reload while the original location baseline, past and committed class instants, booking and allowance ledger remain unchanged.",
    );

    await memberPage.goto(
      `${memberOrigin}/app/schedule?date=${data.bookedDate}&booking=${beforeBooking.id}`,
    );
    await expect(
      memberPage.getByRole("dialog", { name: "Booking details", exact: true }),
    ).toContainText("UTC");
    await memberPage.goto(
      `${memberOrigin}/app/schedule?date=${data.futureDate}`,
    );
    await memberPage
      .getByRole("button", { name: /^Book class — Timezone review class,/ })
      .click();
    dialog = memberPage.getByRole("dialog", {
      name: "Review booking",
      exact: true,
    });
    await expect(dialog).toContainText("America/Los_Angeles");
    await expect(dialog).toContainText("accepted timezone (UTC)");
    await expect(dialog).toContainText("2 of 2 classes remaining");
    const nextBooking = await action(
      memberPage,
      dialog.getByRole("button", { name: "Book class", exact: true }),
    );
    await expect(memberPage.getByRole("status")).toContainText(
      "Your place is booked.",
    );
    const futureBooking = await db.classBooking.findFirstOrThrow({
      where: {
        workspaceId: data.workspace.id,
        scheduledForDate: asDate(data.futureDate),
      },
    });
    const allocation = await db.membershipAllowanceAllocation.findFirstOrThrow({
      where: { bookingId: futureBooking.id },
    });
    expect(allocation.periodStart).toEqual(asDate(day(22)));
    expect(allocation.state).toBe("RESERVED");
    expect(
      (
        await db.memberMembership.findUniqueOrThrow({
          where: { id: data.membership.id },
        })
      ).allowanceTimezone,
    ).toBe("UTC");
    await expectActionRedirect(memberPage, nextBooking, `${memberOrigin}/app/schedule?${new URLSearchParams({date:data.futureDate,booking:futureBooking.id,notice:"booked"})}`);
    if (nextBooking.status() === 200) browserDiagnostics.acknowledgeAction(
      nextBooking,
      "The future booking is visible and its reserved allocation starts at the accepted UTC period while allowance timezone remains UTC.",
    );
    await info.attach("WS03 preserved clocks and funding", {
      body: JSON.stringify({
        historyVersion: history[0]!.version,
        past: oldPast,
        committed: oldCommitted,
        future: await occurrence(data.template.id, data.futureDate),
        preservedAllocationId: beforeAllocation[0]!.id,
        newPeriodStart: allocation.periodStart.toISOString(),
        acceptedTimezone: "UTC",
      }),
      contentType: "application/json",
    });
  } finally {
    await memberPage.close();
    await cleanup(data);
  }
});
