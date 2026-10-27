import { expectActionRedirect } from "./support/action-redirect";
import { loginToWorkspace } from "./support/workspace-login";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";
import { evaluateClassSchedulingPolicy } from "../../packages/db/src/scheduling-policy.js";
import { lockClassSchedule } from "../../packages/db/src/index";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../packages/db/src/retention-inventory";
import {
  expect,
  test,
  type Locator,
  type Page,
  type BrowserDiagnosticsCollector,
} from "./support/browser-diagnostics";
import { PrismaClient, type Prisma, type Weekday } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Request, Response } from "@playwright/test";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
) {
  throw new Error(
    "Approved gym workflows require an explicitly configured disposable local test database.",
  );
}
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const adminBaseURL =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const memberBaseURL =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const timezone = "America/Vancouver";
const weekdays: Weekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
function day(offset = 0) {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const value = new Date(`${local}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

type GymFixture = Awaited<ReturnType<typeof createGym>>;
async function createGym() {
  const key = `approved-gym-${randomUUID()}`;
  // Reuse the seeded fictional password, never a real account or customer.
  const seed = await prisma.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const owner = await prisma.user.create({
    data: {
      email: `${key}@example.test`,
      fullName: "Workflow Test Owner",
      passwordHash: seed.passwordHash,
    },
  });
  const workspace = await prisma.workspace.create({
    data: { name: key, status: "ACTIVE" },
  });
  await createFixtureClassSchedulingPolicy(prisma, workspace.id, owner.id);
  const location = await prisma.location.create({
    data: { workspaceId: workspace.id, name: "Test location", timezone },
  });
  const staff = await prisma.workspaceUser.create({
    data: { workspaceId: workspace.id, userId: owner.id, role: "OWNER" },
  });
  await prisma.workspaceMigration.create({
    data: {
      workspaceId: workspace.id,
      stage: "COMPLETE",
      nextOwnerAction: "Test handoff complete",
      flowstateResponsibility: "Fictional local test fixture",
      ownerReviewAcknowledgedAt: new Date(),
      ownerReviewAcknowledgedByUserId: owner.id,
      operationallyReadyAt: new Date(),
      operationallyReadyByUserId: owner.id,
    },
  });
  const program = await prisma.program.create({
    data: { workspaceId: workspace.id, name: "Test martial arts" },
  });
  const room = await prisma.room.create({
    data: { locationId: location.id, name: "Test mat", capacity: 10 },
  });
  return {
    key,
    workspace,
    owner,
    location,
    staff,
    program,
    room,
    extraUserIds: [] as string[],
  };
}
async function removeGym(gym: GymFixture) {
  await prisma.$transaction(
    async (tx) => {
      const workspaceId = gym.workspace.id;
      await lockClassSchedule(tx, workspaceId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${workspaceId}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention:${workspaceId}`}))`;
      const inventory = await inspectRetentionInventory(tx, workspaceId);
      await deleteReviewedWorkspaceRecords(
        tx,
        workspaceId,
        inventory.fingerprint,
      );
    },
    { isolationLevel: "Serializable", timeout: 120000 },
  );
  await prisma.user.deleteMany({
    where: { id: { in: [gym.owner.id, ...gym.extraUserIds] } },
  });
}
async function member(gym: GymFixture, name: string) {
  return prisma.member.create({
    data: {
      workspaceId: gym.workspace.id,
      fullName: name,
      status: "ACTIVE",
      dateOfBirth: asDate("1990-01-01"),
    },
  });
}
async function participantAccount(
  gym: GymFixture,
  memberId: string,
  name: string,
) {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@approved-gym.example.test`,
      fullName: name,
      passwordHash: gym.owner.passwordHash,
    },
  });
  gym.extraUserIds.push(user.id);
  await prisma.workspaceUser.create({
    data: { workspaceId: gym.workspace.id, userId: user.id, role: "CUSTOMER" },
  });
  await prisma.member.update({
    where: { id: memberId },
    data: { userId: user.id, email: user.email },
  });
  return user;
}
async function fixtureMembership(
  gym: GymFixture,
  memberId: string,
  weeklyClassLimit: number | null = null,
) {
  const plan = await prisma.membershipPlan.create({
    data: {
      workspaceId: gym.workspace.id,
      name: `Workflow plan ${randomUUID()}`,
      monthlyPriceCents: 10000,
      currency: "cad",
      weeklyClassLimit,
    },
  });
  return prisma.memberMembership.create({
    data: {
      workspaceId: gym.workspace.id,
      memberId,
      membershipPlanId: plan.id,
      status: "ACTIVE",
      startedAt: asDate(day(-30)),
      allowanceAnchorDate: asDate(day(-30)),
      allowanceTimezone: timezone,
      acceptedTerms: {
        version: 1,
        monthlyPriceCents: 10000,
        currency: "cad",
        weeklyClassLimit,
        monthlyClassLimit: null,
        allowanceCountingMode: "ATTENDANCE",
        lateCancellationConsumesClass: true,
        noShowConsumesClass: true,
        programIds: [],
        cancellationPolicyReference: null,
        freezePolicyReference: null,
        capturedAt: new Date().toISOString(),
      },
    },
  });
}
async function fixtureClass(
  gym: GymFixture,
  date: string,
  title: string,
  capacity = 2,
) {
  return prisma.classTemplate.create({
    data: {
      workspaceId: gym.workspace.id,
      programId: gym.program.id,
      roomId: gym.room.id,
      title,
      weekday: weekdays[asDate(date).getUTCDay()],
      startTimeMinutes: 600,
      endTimeMinutes: 660,
      capacityOverride: capacity,
      bookingCutoffMinutes: 0,
      cancellationCutoffMinutes: 0,
    },
  });
}
async function login(
  page: Page,
  gym: GymFixture,
  diagnostics: BrowserDiagnosticsCollector,
) {
  await loginToWorkspace({
    page,
    origin: adminBaseURL,
    email: gym.owner.email,
    password: "DemoPass123!",
    expectedRedirect: "/dashboard;push",
    destination: { path: "/dashboard", heading: "Today" },
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
async function act(page: Page, control: Locator) {
  const [completed] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        Boolean(candidate.request().headers()["next-action"]),
      { timeout: 15_000 },
    ),
    control.click(),
  ]);
  expect(completed.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  return completed;
}
async function roster(page: Page, classId: string, date: string) {
  await page.goto(
    `${adminBaseURL}/dashboard/schedule/${classId}/roster?date=${date}`,
  );
  await expect(page.getByRole("heading", { name: /attendee/ })).toBeVisible();
}
function attendee(page: Page, name: string) {
  return page
    .locator("article.stack-item")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function selectFamilyMember(
  page: Page,
  member: { id: string; fullName: string },
  workspaceId: string,
) {
  await page
    .getByRole("button", { name: /^Select member, currently / })
    .click();
  const actionUrl = page.url();
  const response = await act(
    page,
    page
      .getByRole("dialog", { name: "Choose a member", exact: true })
      .getByRole("button", { name: member.fullName, exact: true }),
  );
  expect(response.url()).toBe(actionUrl);
  expect(response.status()).toBe(200);
  expect(response.request().postData()).toContain(member.id);
  const forms = new URL(actionUrl).pathname.startsWith("/app/forms");
  await expect(page).toHaveURL(
    `${memberBaseURL}/app/${forms ? "forms" : "schedule"}`,
  );
  await expect(
    page.getByRole("heading", {
      name: forms ? "Forms" : "Classes",
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(
    page.getByRole("button", {
      name: `Select member, currently ${member.fullName}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
  const selected = (
    await page.context().cookies(`${memberBaseURL}/app/forms`)
  ).find((cookie) => cookie.name === "hitlink_member_selection");
  expect(selected).toBeDefined();
  expect(decodeURIComponent(selected!.value)).toBe(
    `${workspaceId}:${member.id}`,
  );
  return response;
}

test.describe("Approved gym transactional workflows", () => {
  test.setTimeout(150_000);
  test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });
  test.afterAll(() => prisma.$disconnect());

  test("MF07 owner previews retained balances, archives a member and reactivates without new entitlement", async ({
    page,
    browserDiagnostics,
  }) => {
    const gym = await createGym();
    const name = `Archive proof ${gym.key}`;
    try {
      await login(page, gym, browserDiagnostics);
      await page.goto(`${adminBaseURL}/dashboard/members/new`);
      await page.getByLabel("Full name", { exact: true }).fill(name);
      const created = await act(
        page,
        page.getByRole("button", { name: "Create member", exact: true }),
      );
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      const person = await prisma.member.findFirstOrThrow({
        where: { workspaceId: gym.workspace.id, fullName: name },
      });
      await expectActionRedirect(page, created, `${adminBaseURL}/dashboard/members/${person.id}`);
      if (created.status() === 200) browserDiagnostics.acknowledgeAction(
        created,
        "The created member's exact heading is visible and the named member record exists in this workspace.",
      );
      const invoice = await prisma.invoice.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: person.id,
          subtotalCents: 7500,
          totalCents: 7500,
          amountDueCents: 7500,
          currency: "cad",
          status: "OPEN",
        },
      });
      const product = await prisma.punchCardProduct.create({
        data: {
          workspaceId: gym.workspace.id,
          name: "Retained fictional pack",
          punchesIncluded: 3,
          priceCents: 3000,
          currency: "cad",
        },
      });
      const pack = await prisma.memberPunchCard.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: person.id,
          punchCardProductId: product.id,
          originalPunches: 3,
          remainingPunches: 3,
          purchasePriceCents: 3000,
          purchaseCurrency: "cad",
        },
      });
      await page.reload();
      let card = page.locator("section.management-card").filter({
        has: page.getByRole("heading", {
          name: "Archive member",
          exact: true,
        }),
      });
      await expect(card.getByText("CAD 75.00", { exact: true })).toBeVisible();
      await expect(
        card.getByText("3 retained with their original products", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        card.getByRole("checkbox", { name: /^Keep all debts/ }),
      ).not.toBeChecked();
      await card.getByRole("checkbox", { name: /^Keep all debts/ }).check();
      await card
        .getByLabel("Reason for archiving", { exact: true })
        .fill("Member moved away; keep original financial records.");
      const archived = await act(
        page,
        card.getByRole("button", { name: "Archive member", exact: true }),
      );
      await expect(
        page.getByRole("heading", { name: "Archived member", exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          prisma.member.count({
            where: {
              id: person.id,
              archivedAt: { not: null },
              archiveVersion: 1,
            },
          }),
        )
        .toBe(1);
      expect(
        (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
          .amountDueCents,
      ).toBe(7500);
      expect(
        (
          await prisma.memberPunchCard.findUniqueOrThrow({
            where: { id: pack.id },
          })
        ).remainingPunches,
      ).toBe(3);
      browserDiagnostics.acknowledgeAction(
        archived,
        "Archived member state rendered; original invoice and pack balances retained exactly.",
      );
      await page.goto(
        `${adminBaseURL}/dashboard/members?q=${encodeURIComponent(name)}`,
      );
      await expect(
        page.getByRole("link", { name: "View profile", exact: true }),
      ).toHaveCount(0);
      await page.goto(
        `${adminBaseURL}/dashboard/members?archived=1&q=${encodeURIComponent(name)}`,
      );
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "View profile", exact: true })
        .click();
      card = page.locator("section.management-card").filter({
        has: page.getByRole("heading", {
          name: "Archived member",
          exact: true,
        }),
      });
      await card
        .getByLabel("Reason for reactivation", { exact: true })
        .fill("Member returned; review current product eligibility.");
      const reactivated = await act(
        page,
        card.getByRole("button", { name: "Reactivate member", exact: true }),
      );
      await expect(
        page.getByRole("heading", { name: "Archive member", exact: true }),
      ).toBeVisible();
      await page.reload();
      expect(
        await prisma.member.findUniqueOrThrow({ where: { id: person.id } }),
      ).toMatchObject({ archivedAt: null, archiveVersion: 2 });
      expect(
        await prisma.memberMembership.count({
          where: { workspaceId: gym.workspace.id, memberId: person.id },
        }),
      ).toBe(0);
      expect(
        await prisma.memberPunchCard.count({
          where: { workspaceId: gym.workspace.id, memberId: person.id },
        }),
      ).toBe(1);
      expect(
        await prisma.workspaceDataEvent.count({
          where: {
            workspaceId: gym.workspace.id,
            kind: { in: ["MEMBER_ARCHIVED", "MEMBER_REACTIVATED"] },
          },
        }),
      ).toBe(2);
      browserDiagnostics.acknowledgeAction(
        reactivated,
        "Reactivated profile survives reload with two attributed history events and no new membership or pack.",
      );
    } finally {
      await removeGym(gym);
    }
  });

  test("CF02 owner reviews a daily series and one-date edit preserves neighboring dates", async ({
    page,
    browserDiagnostics,
  }, info) => {
    const gym = await createGym();
    const date = day(14),
      next = day(15),
      end = day(16);
    try {
      await login(page, gym, browserDiagnostics);
      await page.goto(`${adminBaseURL}/dashboard/schedule/new?date=${date}`);
      await page
        .getByLabel("Class name", { exact: true })
        .fill("Approved daily class");
      await page
        .getByLabel("Program", { exact: true })
        .selectOption(gym.program.id);
      await page.getByLabel("Room", { exact: true }).selectOption(gym.room.id);
      await page.getByLabel("Starts", { exact: true }).fill("10:00");
      await page.getByLabel("Ends", { exact: true }).fill("11:00");
      await page.getByLabel("Capacity", { exact: true }).fill("3");
      await page.getByLabel("Repeat", { exact: true }).selectOption("DAILY");
      await page
        .getByRole("textbox", { name: /^Repeat until \(optional\)/ })
        .fill(end);
      const seriesReview = await act(
        page,
        page.getByRole("button", { name: "Review changes", exact: true }),
      );
      await expect(
        page.getByRole("heading", {
          name: "Review class changes",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeEnabled();
      browserDiagnostics.acknowledgeAction(
        seriesReview,
        "Daily-series review is visible and can be saved.",
      );
      const seriesSave = await act(
        page,
        page.getByRole("button", { name: "Save changes", exact: true }),
      );
      await expect(page).toHaveURL(new RegExp(`date=${date}&saved=1`));
      const saved = await prisma.classTemplate.findFirstOrThrow({
        where: { workspaceId: gym.workspace.id, title: "Approved daily class" },
        include: { scheduleRevisions: true },
      });
      expect(saved.scheduleRevisions).toHaveLength(1);
      expect(saved.scheduleRevisions[0]).toMatchObject({
        recurrence: "DAILY",
        startDate: asDate(date),
        endDate: asDate(end),
        capacityOverride: 3,
      });
      await expectActionRedirect(page, seriesSave, `${adminBaseURL}/dashboard/schedule?date=${date}&saved=1`);
      if (seriesSave.status() === 200) browserDiagnostics.acknowledgeAction(
        seriesSave,
        "The saved schedule route is rendered and one exact daily revision persists with reviewed dates and capacity.",
      );
      await roster(page, saved.id, date);
      await page.getByRole("link", { name: "Edit class", exact: true }).click();
      await page
        .getByRole("combobox", { name: "Applies to", exact: true })
        .selectOption("occurrence");
      await page
        .getByLabel("Class name", { exact: true })
        .fill("One-date workshop");
      await page.getByLabel("Starts", { exact: true }).fill("11:00");
      await page.getByLabel("Ends", { exact: true }).fill("12:00");
      const dateReview = await act(
        page,
        page.getByRole("button", { name: "Review changes", exact: true }),
      );
      await expect(
        page.getByRole("heading", {
          name: "Review class changes",
          exact: true,
        }),
      ).toBeVisible();
      browserDiagnostics.acknowledgeAction(
        dateReview,
        "One-date review is visible before committing.",
      );
      const dateSave = await act(
        page,
        page.getByRole("button", { name: "Save changes", exact: true }),
      );
      const exception = await prisma.classInstance.findFirstOrThrow({
        where: {
          workspaceId: gym.workspace.id,
          classTemplateId: saved.id,
          scheduledForDate: asDate(date),
        },
      });
      expect(exception).toMatchObject({
        title: "One-date workshop",
        isScheduleOverride: true,
        startTimeMinutes: 660,
        endTimeMinutes: 720,
      });
      await expect(page).toHaveURL(new RegExp(`date=${date}&saved=1`));
      await expectActionRedirect(page, dateSave, `${adminBaseURL}/dashboard/schedule?date=${date}&saved=1`);
      await expect(page.getByRole("status")).toContainText("Class changes saved.");
      if (dateSave.status() === 200) browserDiagnostics.acknowledgeAction(
        dateSave,
        "Class changes saved is visible and the exact one-date override persists with reviewed title and start/end times.",
      );
      await roster(page, saved.id, date);
      await expect(
        page.getByRole("heading", { name: "One-date workshop", exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "One-date workshop", exact: true }),
      ).toBeVisible();
      await roster(page, saved.id, next);
      await expect(
        page.getByRole("heading", {
          name: "Approved daily class",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await prisma.classInstance.count({
          where: { workspaceId: gym.workspace.id, classTemplateId: saved.id },
        }),
      ).toBe(1);
      expect(
        await prisma.classScheduleChange.count({
          where: { workspaceId: gym.workspace.id, classTemplateId: saved.id },
        }),
      ).toBe(2);
      await info.attach("CF02 persisted series and exception", {
        body: JSON.stringify({
          classId: saved.id,
          recurrence: "DAILY",
          date,
          next,
          exception: exception.id,
        }),
        contentType: "application/json",
      });
    } finally {
      await removeGym(gym);
    }
  });

  test("CF02 stale review and capacity reduction preserve existing bookings", async ({
    page,
    browserDiagnostics,
  }) => {
    const gym = await createGym(),
      date = day(14);
    try {
      const item = await fixtureClass(gym, date, "Protected class", 3);
      const first = await member(gym, "First booked participant"),
        second = await member(gym, "Second booked participant");
      await login(page, gym, browserDiagnostics);
      await page.goto(
        `${adminBaseURL}/dashboard/schedule/${item.id}/edit?date=${date}`,
      );
      await page
        .getByLabel("Class name", { exact: true })
        .fill("Stale proposed name");
      const initialReview = await act(
        page,
        page.getByRole("button", { name: "Review changes", exact: true }),
      );
      await expect(
        page.getByRole("heading", {
          name: "Review class changes",
          exact: true,
        }),
      ).toBeVisible();
      browserDiagnostics.acknowledgeAction(
        initialReview,
        "Initial edit review is visible before reservation changes.",
      );
      const booking = await prisma.classBooking.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: first.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
          status: "BOOKED",
        },
      });
      const staleSave = await act(
        page,
        page.getByRole("button", { name: "Save changes", exact: true }),
      );
      await expect(page.locator(".form-error[role=alert]")).toContainText(
        "changed after your review",
      );
      expect(
        (
          await prisma.classTemplate.findUniqueOrThrow({
            where: { id: item.id },
          })
        ).title,
      ).toBe("Protected class");
      expect(
        await prisma.classScheduleChange.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(0);
      browserDiagnostics.acknowledgeAction(
        staleSave,
        "Stale-review rejection rendered; original title and audit count remain unchanged.",
      );
      await prisma.classBooking.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: second.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
          status: "BOOKED",
        },
      });
      await page
        .getByRole("button", { name: "Back to edit", exact: true })
        .click();
      await page.getByLabel("Capacity", { exact: true }).fill("1");
      const capacityReview = await act(
        page,
        page.getByRole("button", { name: "Review changes", exact: true }),
      );
      await expect(page.locator(".form-error").first()).toContainText(
        /capacity|bookings/i,
      );
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();
      expect(
        await prisma.classBooking.count({
          where: { workspaceId: gym.workspace.id, status: "BOOKED" },
        }),
      ).toBe(2);
      expect(
        (
          await prisma.classBooking.findUniqueOrThrow({
            where: { id: booking.id },
          })
        ).status,
      ).toBe("BOOKED");
      browserDiagnostics.acknowledgeAction(
        capacityReview,
        "Capacity rejection rendered with save disabled; both existing bookings remain booked.",
      );
    } finally {
      await removeGym(gym);
    }
  });

  test("CF03 full capacity blocks promotion; an opening promotes the earliest eligible person once", async ({
    page,
    browserDiagnostics,
  }, info) => {
    const gym = await createGym(),
      date = day(14);
    try {
      const item = await fixtureClass(gym, date, "FIFO class", 1);
      const occupant = await member(gym, "Booked participant"),
        ineligible = await member(gym, "Waiting without current access"),
        first = await member(gym, "First waiting participant"),
        second = await member(gym, "Second waiting participant");
      await fixtureMembership(gym, first.id);
      await fixtureMembership(gym, second.id);
      const firstAccount = await participantAccount(
        gym,
        first.id,
        first.fullName,
      );
      const secondAccount = await participantAccount(
        gym,
        second.id,
        second.fullName,
      );
      const ineligibleAccount = await participantAccount(
        gym,
        ineligible.id,
        ineligible.fullName,
      );
      const booked = await prisma.classBooking.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: occupant.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
          status: "BOOKED",
        },
      });
      const revision =
        await prisma.workspaceSchedulingPolicyRevision.findFirstOrThrow({
          where: { workspaceId: gym.workspace.id },
        });
      const evaluation = evaluateClassSchedulingPolicy({
        revision,
        date,
        timezone,
        startTimeMinutes: item.startTimeMinutes,
        endTimeMinutes: item.endTimeMinutes,
        bookingCutoffMinutes: Math.max(
          item.bookingCutoffMinutes,
          item.cancellationCutoffMinutes,
        ),
        now: new Date(),
      });
      if (!evaluation.allowed) throw new Error(evaluation.message);
      const schedulingPolicySnapshot = {
        ...evaluation.snapshot,
        autoPromotionClosesAt: evaluation.snapshot.closesAt!,
      };
      const head = await prisma.waitlistEntry.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: first.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
          joinedAt: new Date(Date.now() - 60_000),
          autoPromotionOptedInAt: new Date(Date.now() - 60_000),
          autoPromotionConsentUserId: firstAccount.id,
          autoPromotionPolicyVersion: "FIFO_AUTO_V1",
          schedulingPolicySnapshot,
          allowPunchCardFunding: false,
        },
      });
      const skippedHead = await prisma.waitlistEntry.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: ineligible.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
          joinedAt: new Date(Date.now() - 120_000),
          autoPromotionOptedInAt: new Date(Date.now() - 120_000),
          autoPromotionConsentUserId: ineligibleAccount.id,
          autoPromotionPolicyVersion: "FIFO_AUTO_V1",
          schedulingPolicySnapshot,
          allowPunchCardFunding: false,
        },
      });
      const later = await prisma.waitlistEntry.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: second.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
          joinedAt: new Date(),
          autoPromotionOptedInAt: new Date(),
          autoPromotionConsentUserId: secondAccount.id,
          autoPromotionPolicyVersion: "FIFO_AUTO_V1",
          schedulingPolicySnapshot,
          allowPunchCardFunding: false,
        },
      });
      await login(page, gym, browserDiagnostics);
      await roster(page, item.id, date);
      const fullResponse = await act(
        page,
        page.getByRole("button", { name: "Promote next", exact: true }),
      );
      await expect(
        page.getByText("No booking spot is available for promotion yet.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await prisma.waitlistEntry.count({
          where: { workspaceId: gym.workspace.id, status: "ACTIVE" },
        }),
      ).toBe(3);
      expect(
        await prisma.classBooking.count({
          where: {
            workspaceId: gym.workspace.id,
            memberId: { in: [ineligible.id, first.id, second.id] },
          },
        }),
      ).toBe(0);
      browserDiagnostics.acknowledgeAction(
        fullResponse,
        "Full-capacity message rendered and database has no promoted booking.",
      );
      // A controlled fixture seat release isolates the promotion transaction.
      await prisma.classBooking.update({
        where: { id: booked.id },
        data: { status: "CANCELLED" },
      });
      await page.reload();
      const promotionResponse = await act(
        page,
        page.getByRole("button", { name: "Promote next", exact: true }),
      );
      await expect
        .poll(
          async () =>
            (
              await prisma.waitlistEntry.findUniqueOrThrow({
                where: { id: head.id },
              })
            ).status,
        )
        .toBe("PROMOTED");
      const promoted = await prisma.waitlistEntry.findUniqueOrThrow({
        where: { id: head.id },
      });
      expect(promoted.promotedBookingId).not.toBeNull();
      const skipped = await prisma.waitlistEntry.findUniqueOrThrow({
        where: { id: skippedHead.id },
      });
      expect(skipped.status).toBe("ACTIVE");
      expect(skipped.lastSkippedAt).toBeInstanceOf(Date);
      expect(skipped.lastSkipReason).toMatch(/membership|access|punch|pack/i);
      expect(skipped.promotionHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "SKIPPED",
            reason: skipped.lastSkipReason,
          }),
        ]),
      );
      expect(
        await prisma.classBooking.findUniqueOrThrow({
          where: { id: promoted.promotedBookingId! },
        }),
      ).toMatchObject({
        memberId: first.id,
        classTemplateId: item.id,
        scheduledForDate: asDate(date),
        status: "BOOKED",
        bookingType: "MEMBERSHIP",
      });
      expect(
        (
          await prisma.waitlistEntry.findUniqueOrThrow({
            where: { id: later.id },
          })
        ).status,
      ).toBe("ACTIVE");
      // Unlimited access creates neither an allowance debit nor a punch debit.
      expect(
        await prisma.membershipAllowanceAllocation.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(0);
      expect(
        await prisma.punchCardEntry.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(0);
      expect(
        await prisma.notificationJob.count({
          where: {
            workspaceId: gym.workspace.id,
            recipientEmail: firstAccount.email,
          },
        }),
      ).toBe(1);
      await expect(attendee(page, first.fullName)).toBeVisible();
      browserDiagnostics.acknowledgeAction(
        promotionResponse,
        "Promoted attendee rendered; booking, FIFO skip history, funding and one outbox notice verified.",
      );
      await page.reload();
      await expect(attendee(page, first.fullName)).toBeVisible();
      const retryResponse = await act(
        page,
        page.getByRole("button", { name: "Promote next", exact: true }),
      );
      await expect(
        page.getByText("No booking spot is available for promotion yet.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await prisma.classBooking.count({
          where: { workspaceId: gym.workspace.id, status: "BOOKED" },
        }),
      ).toBe(1);
      expect(
        await prisma.notificationJob.count({
          where: {
            workspaceId: gym.workspace.id,
            recipientEmail: firstAccount.email,
          },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.waitlistEntry.findUniqueOrThrow({
            where: { id: later.id },
          })
        ).status,
      ).toBe("ACTIVE");
      browserDiagnostics.acknowledgeAction(
        retryResponse,
        "Full retry message rendered; one booking, one notice and later queue position preserved.",
      );
      await info.attach("CF03 persisted promotion", {
        body: JSON.stringify({
          promoted: promoted.id,
          booking: promoted.promotedBookingId,
          stillWaiting: later.id,
          skippedWithPositionKept: skipped.id,
          skipReason: skipped.lastSkipReason,
        }),
        contentType: "application/json",
      });
    } finally {
      await removeGym(gym);
    }
  });

  test("CF04 future attendance and unsigned consent are rejected; present and correction survive reload", async ({
    page,
    browserDiagnostics,
  }, info) => {
    const gym = await createGym();
    try {
      const date = day(),
        future = day(14),
        participant = await member(gym, "Attendance participant");
      const todayClass = await fixtureClass(gym, date, "Attendance today"),
        futureClass = await fixtureClass(gym, future, "Attendance future");
      const membership = await fixtureMembership(gym, participant.id, 2);
      const booking = await prisma.classBooking.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: participant.id,
          classTemplateId: todayClass.id,
          scheduledForDate: asDate(date),
          status: "BOOKED",
          fundingMembershipId: membership.id,
          acceptedPolicy: membership.acceptedTerms as Prisma.InputJsonValue,
        },
      });
      const periodStart = asDate(date);
      periodStart.setUTCDate(
        periodStart.getUTCDate() - ((periodStart.getUTCDay() + 6) % 7),
      );
      const periodEnd = new Date(periodStart);
      periodEnd.setUTCDate(periodEnd.getUTCDate() + 7);
      // A valid fixture reservation in the accepted Monday-to-Monday window.
      // The browser action must settle/correct this same source exactly once.
      const allocation = await prisma.membershipAllowanceAllocation.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: participant.id,
          memberMembershipId: membership.id,
          bookingId: booking.id,
          kind: "WEEK",
          periodStart,
          periodEnd,
          limit: 2,
          entries: {
            create: {
              workspaceId: gym.workspace.id,
              revision: 1,
              reservedDelta: 1,
              usedDelta: 0,
              reason: "Fictional test booking reservation",
            },
          },
        },
      });
      await prisma.classBooking.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: participant.id,
          classTemplateId: futureClass.id,
          scheduledForDate: asDate(future),
          status: "BOOKED",
        },
      });
      await login(page, gym, browserDiagnostics);
      await roster(page, futureClass.id, future);
      let row = attendee(page, participant.fullName);
      await expect(row).toHaveCount(1);
      await row
        .getByRole("combobox", { name: "Attendance", exact: true })
        .selectOption("PRESENT");
      const futureResponse = await act(
        page,
        row.getByRole("button", { name: "Save attendance", exact: true }),
      );
      await expect(
        row.getByText(
          "Attendance can only be recorded for today or a past class date.",
          { exact: true },
        ),
      ).toBeVisible();
      expect(
        await prisma.attendanceRecord.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(0);
      browserDiagnostics.acknowledgeAction(
        futureResponse,
        "Future attendance rejection rendered and no attendance exists.",
      );
      const source = await prisma.formVersion.findUniqueOrThrow({
        where: { id: "demo-form-version-waiver-v1" },
      });
      const document = await prisma.formDocument.create({
        data: {
          workspaceId: gym.workspace.id,
          name: "Attendance consent",
          formType: "WAIVER",
        },
      });
      const version = await prisma.formVersion.create({
        data: {
          workspaceId: gym.workspace.id,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: source.fileName,
          mimeType: source.mimeType,
          fileSizeBytes: source.fileSizeBytes,
          fileSha256: source.fileSha256,
          fileData: source.fileData,
          uploadedByWorkspaceUserId: gym.staff.id,
        },
      });
      await prisma.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      const requirement = await prisma.requiredFormAssignment.create({
        data: {
          workspaceId: gym.workspace.id,
          formDocumentId: document.id,
          requirementTarget: "MEMBER",
        },
      });
      await roster(page, todayClass.id, date);
      row = attendee(page, participant.fullName);
      await row
        .getByRole("combobox", { name: "Attendance", exact: true })
        .selectOption("PRESENT");
      const unsignedResponse = await act(
        page,
        row.getByRole("button", { name: "Save attendance", exact: true }),
      );
      await expect(
        row.getByText(
          "The accepted form evidence needs owner review before attendance or a funding consequence can be recorded.",
          { exact: true },
        ),
      ).toBeVisible();
      expect(
        await prisma.attendanceRecord.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(0);
      // This deliberately old booking has no acceptance snapshot. Unknown
      // historic consent requires review and must not settle its reserved use.
      expect(
        await prisma.membershipAllowanceAllocation.findUniqueOrThrow({
          where: { id: allocation.id },
        }),
      ).toMatchObject({ state: "RESERVED" });
      expect(
        await prisma.membershipAllowanceEntry.count({
          where: { allocationId: allocation.id },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.classBooking.findUniqueOrThrow({
            where: { id: booking.id },
          })
        ).status,
      ).toBe("BOOKED");
      browserDiagnostics.acknowledgeAction(
        unsignedResponse,
        "Required-form rejection rendered; no attendance exists and original booking remains booked.",
      );
      // Remove only this test's temporary requirement; this is attendance proof,
      // not a claim that a guardian has signed a form or payment has settled.
      await prisma.requiredFormAssignment.update({
        where: { id: requirement.id },
        data: { isActive: false },
      });
      await page.reload();
      row = attendee(page, participant.fullName);
      await row
        .getByRole("combobox", { name: "Attendance", exact: true })
        .selectOption("PRESENT");
      await row
        .getByRole("textbox", { name: "Note", exact: true })
        .fill("Observed in class by the test owner");
      const presentResponse = await act(
        page,
        row.getByRole("button", { name: "Save attendance", exact: true }),
      );
      await expect
        .poll(
          async () =>
            (
              await prisma.classBooking.findUniqueOrThrow({
                where: { id: booking.id },
              })
            ).status,
        )
        .toBe("ATTENDED");
      const recorded = await prisma.attendanceRecord.findFirstOrThrow({
        where: {
          workspaceId: gym.workspace.id,
          classTemplateId: todayClass.id,
        },
      });
      expect(recorded).toMatchObject({
        state: "PRESENT",
        coachWorkspaceUserId: gym.staff.id,
      });
      expect(
        await prisma.membershipAllowanceAllocation.findUniqueOrThrow({
          where: { id: allocation.id },
        }),
      ).toMatchObject({ state: "USED", periodStart, periodEnd });
      expect(
        await prisma.membershipAllowanceEntry.count({
          where: { allocationId: allocation.id },
        }),
      ).toBe(2);
      await expect(
        row.getByRole("button", { name: "Save attendance", exact: true }),
      ).toBeEnabled();
      browserDiagnostics.acknowledgeAction(
        presentResponse,
        "Attendance control settled; present record, attended booking and single allowance settlement verified.",
      );
      await page.reload();
      row = attendee(page, participant.fullName);
      await expect(
        row.getByRole("combobox", { name: "Attendance", exact: true }),
      ).toHaveValue("PRESENT");
      await row
        .getByRole("combobox", { name: "Attendance", exact: true })
        .selectOption("LATE");
      await row
        .getByRole("textbox", { name: "Note", exact: true })
        .fill("Correction: participant arrived ten minutes late");
      await row
        .getByLabel("Correction reason", { exact: true })
        .fill("Arrival time was corrected against the class register");
      const lateResponse = await act(
        page,
        row.getByRole("button", { name: "Save attendance", exact: true }),
      );
      await expect
        .poll(
          async () =>
            (
              await prisma.attendanceRecord.findUniqueOrThrow({
                where: { id: recorded.id },
              })
            ).state,
        )
        .toBe("LATE");
      await expect(
        row.getByRole("button", { name: "Save attendance", exact: true }),
      ).toBeEnabled();
      browserDiagnostics.acknowledgeAction(
        lateResponse,
        "Attendance control settled and original attendance record persisted the late correction.",
      );
      await page.reload();
      row = attendee(page, participant.fullName);
      await expect(
        row.getByRole("combobox", { name: "Attendance", exact: true }),
      ).toHaveValue("LATE");
      expect(
        await prisma.attendanceRecord.findUniqueOrThrow({
          where: { id: recorded.id },
        }),
      ).toMatchObject({
        state: "LATE",
        note: "Correction: participant arrived ten minutes late",
      });
      expect(
        await prisma.attendanceRecord.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.classBooking.findUniqueOrThrow({
            where: { id: booking.id },
          })
        ).status,
      ).toBe("ATTENDED");
      // Present -> late is the same counted visit, so it creates no second debit.
      expect(
        await prisma.membershipAllowanceEntry.count({
          where: { allocationId: allocation.id },
        }),
      ).toBe(2);
      await row
        .getByRole("combobox", { name: "Attendance", exact: true })
        .selectOption("ABSENT");
      await row
        .getByRole("textbox", { name: "Note", exact: true })
        .fill(
          "Correction: participant was excused; release the original visit",
        );
      await row
        .getByLabel("Correction reason", { exact: true })
        .fill("Excused absence confirmed by the owner");
      const absentResponse = await act(
        page,
        row.getByRole("button", { name: "Save attendance", exact: true }),
      );
      await expect
        .poll(
          async () =>
            (
              await prisma.classBooking.findUniqueOrThrow({
                where: { id: booking.id },
              })
            ).status,
        )
        .toBe("ABSENT");
      await expect(
        row.getByRole("button", { name: "Save attendance", exact: true }),
      ).toBeEnabled();
      browserDiagnostics.acknowledgeAction(
        absentResponse,
        "Attendance control settled and original booking persisted its excused correction.",
      );
      await page.reload();
      row = attendee(page, participant.fullName);
      await expect(
        row.getByRole("combobox", { name: "Attendance", exact: true }),
      ).toHaveValue("ABSENT");
      expect(
        (
          await prisma.classBooking.findUniqueOrThrow({
            where: { id: booking.id },
          })
        ).status,
      ).toBe("ABSENT");
      expect(
        await prisma.membershipAllowanceAllocation.findUniqueOrThrow({
          where: { id: allocation.id },
        }),
      ).toMatchObject({ state: "RELEASED", periodStart, periodEnd });
      const ledger = await prisma.membershipAllowanceEntry.findMany({
        where: { allocationId: allocation.id },
        orderBy: { revision: "asc" },
      });
      expect(
        ledger.map((entry) => [entry.reservedDelta, entry.usedDelta]),
      ).toEqual([
        [1, 0],
        [-1, 1],
        [0, -1],
      ]);
      await info.attach("CF04 persisted attendance", {
        body: JSON.stringify({
          attendance: recorded.id,
          booking: booking.id,
          classDate: date,
          correctedState: "ABSENT",
          allocation: allocation.id,
          ledgerEntries: ledger.length,
        }),
        contentType: "application/json",
      });
    } finally {
      await removeGym(gym);
    }
  });
  test("CF11 guardian consent rechecks access and signs the intended child across tabs", async ({
    page,
    context,
    browserDiagnostics,
  }, info) => {
    const gym = await createGym();
    let verifiedPdfUrl: string | null = null;
    try {
      const parent = await member(gym, "Workflow Guardian");
      const account = await participantAccount(gym, parent.id, parent.fullName);
      const child = await member(gym, "Workflow Child");
      await prisma.member.update({
        where: { id: child.id },
        data: { dateOfBirth: asDate("2015-01-01") },
      });
      const guardian = await prisma.guardian.create({
        data: {
          workspaceId: gym.workspace.id,
          fullName: parent.fullName,
          email: account.email,
        },
      });
      await prisma.familyLink.create({
        data: {
          workspaceId: gym.workspace.id,
          guardianId: guardian.id,
          childMemberId: child.id,
          isPrimary: true,
        },
      });
      const grant = await prisma.memberPortalGrant.create({
        data: {
          workspaceId: gym.workspace.id,
          userId: account.id,
          memberId: child.id,
          guardianId: guardian.id,
          verifiedByWorkspaceUserId: gym.staff.id,
          verificationNote:
            "Verified fictional guardian for browser acceptance",
          canBook: true,
          canSign: true,
          canPay: true,
        },
      });
      const source = await prisma.formVersion.findUniqueOrThrow({
        where: { id: "demo-form-version-waiver-v1" },
      });
      const document = await prisma.formDocument.create({
        data: {
          workspaceId: gym.workspace.id,
          name: "Guardian training consent",
          formType: "WAIVER",
        },
      });
      const version = await prisma.formVersion.create({
        data: {
          workspaceId: gym.workspace.id,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: source.fileName,
          mimeType: source.mimeType,
          fileSizeBytes: source.fileSizeBytes,
          fileSha256: source.fileSha256,
          fileData: source.fileData,
          uploadedByWorkspaceUserId: gym.staff.id,
        },
      });
      await prisma.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      await prisma.requiredFormAssignment.create({
        data: {
          workspaceId: gym.workspace.id,
          formDocumentId: document.id,
          requirementTarget: "GUARDIAN",
        },
      });
      // Issuance is fixture setup; the maintained browser flow proves current
      // document consent, live guardian authority and immutable signer identity.
      const request = await prisma.signatureRequest.create({
        data: {
          workspaceId: gym.workspace.id,
          formVersionId: version.id,
          memberId: child.id,
          guardianId: guardian.id,
          signerKind: "GUARDIAN",
          accessMethod: "PORTAL",
          createdByWorkspaceUserId: gym.staff.id,
        },
      });
      await loginToWorkspace({
        page,
        origin: memberBaseURL,
        email: account.email,
        password: "DemoPass123!",
        expectedRedirect: "/app;push",
        destination: { path: "/app/schedule", heading: "Classes" },
        diagnostics: browserDiagnostics,
      });
      const childSelection = await selectFamilyMember(
        page,
        child,
        gym.workspace.id,
      );
      const requestUrl = `${memberBaseURL}/app/forms/${request.id}`;
      await page.goto(requestUrl);
      const documentUrl = `${requestUrl}/document`;
      const directPdf = await page.evaluate(async (url) => {
        const response = await fetch(url, { credentials: "include" });
        return {
          status: response.status,
          type: response.headers.get("content-type"),
          bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
        };
      }, documentUrl);
      expect(directPdf.status).toBe(200);
      expect(directPdf.type).toMatch(/^application\/pdf(?:;|$)/i);
      const pdfBytes = Buffer.from(directPdf.bytes);
      expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdfBytes.length).toBe(version.fileSizeBytes);
      expect(createHash("sha256").update(pdfBytes).digest("hex")).toBe(
        version.fileSha256,
      );
      verifiedPdfUrl = documentUrl;
      await expect(
        page.getByRole("heading", { name: document.name, exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByLabel("Full legal name", { exact: true }),
      ).toHaveValue(parent.fullName);
      const uncheckedResponse = await act(
        page,
        page.getByRole("button", { name: "Sign form", exact: true }),
      );
      await expect(
        page.getByText("You must confirm consent before signing.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await prisma.signedDocument.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.signatureRequest.findUniqueOrThrow({
            where: { id: request.id },
          })
        ).status,
      ).toBe("OPEN");
      browserDiagnostics.acknowledgeAction(
        childSelection,
        "The exact child is selected on settled Classes with its scoped cookie; the child's authenticated PDF and guardian-prefilled request render, and unchecked consent leaves that exact request OPEN with no signature.",
      );
      browserDiagnostics.acknowledgeAction(
        uncheckedResponse,
        "Unchecked consent error rendered; request remains open with no signature.",
      );

      await page.getByRole("checkbox").check();
      await prisma.memberPortalGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date() },
      });
      const deniedSignature = await act(
        page,
        page.getByRole("button", { name: "Sign form", exact: true }),
      );
      expect(deniedSignature.url()).toBe(requestUrl);
      await expectActionRedirect(
        page,
        deniedSignature,
        `${memberBaseURL}/unauthorized`,
      );
      await expect(page).toHaveURL(/\/unauthorized$/);
      await expect(
        page.getByRole("heading", {
          name: "Member portal access isn’t available right now",
          exact: true,
          level: 1,
        }),
      ).toBeVisible();
      expect(
        await prisma.signedDocument.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.signatureRequest.findUniqueOrThrow({
            where: { id: request.id },
          })
        ).status,
      ).toBe("OPEN");
      if (deniedSignature.status() === 200) {
        browserDiagnostics.acknowledgeAction(
          deniedSignature,
          "The exact revoked-grant signature action renders the access-restricted page; the intended request remains OPEN and no signature is created.",
        );
      }

      await prisma.memberPortalGrant.update({
        where: { id: grant.id },
        data: { revokedAt: null },
      });
      await page.goto(requestUrl);
      await page
        .getByLabel("Full legal name", { exact: true })
        .fill(parent.fullName);
      await page.getByRole("checkbox").check();
      // A different tab changes the shared selected-member cookie after this
      // child form is loaded. Submission must retain its explicit child ID.
      const otherTab = await context.newPage();
      await otherTab.goto(`${memberBaseURL}/app/forms`);
      const parentSelection = await selectFamilyMember(
        otherTab,
        parent,
        gym.workspace.id,
      );
      const signedResponse = await act(
        page,
        page.getByRole("button", { name: "Sign form", exact: true }),
      );
      const signed = await prisma.signedDocument.findFirstOrThrow({
        where: { workspaceId: gym.workspace.id },
      });
      expect(signed).toMatchObject({
        formVersionId: version.id,
        memberId: child.id,
        guardianId: guardian.id,
        signerKind: "GUARDIAN",
        signedFromRequestId: request.id,
        signerNameSnapshot: parent.fullName,
        signerEmailSnapshot: account.email,
      });
      await expect(
        page.getByRole("heading", { name: "Already signed", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`Review version 1 for ${child.fullName}.`, {
          exact: true,
        }),
      ).toBeVisible();
      browserDiagnostics.acknowledgeAction(
        parentSelection,
        "The other tab visibly selects the parent on settled Forms with its exact scoped cookie; the original tab still signs the intended child's exact PDF/request with the immutable guardian and signer snapshots.",
      );
      browserDiagnostics.acknowledgeAction(
        signedResponse,
        "Signature confirmation rendered; immutable child, guardian, version and signer snapshots verified.",
      );
      expect(
        (
          await prisma.signatureRequest.findUniqueOrThrow({
            where: { id: request.id },
          })
        ).status,
      ).toBe("COMPLETED");
      expect(
        await prisma.signedDocument.count({ where: { memberId: parent.id } }),
      ).toBe(0);
      const childReselection = await selectFamilyMember(
        otherTab,
        child,
        gym.workspace.id,
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Already signed", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Sign form", exact: true }),
      ).toHaveCount(0);
      expect(
        await prisma.signedDocument.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(1);
      browserDiagnostics.acknowledgeAction(
        childReselection,
        "The other tab visibly reselects the exact child on settled Forms with its scoped cookie; reloaded original request remains Already signed, has no submit button and retains exactly one signature.",
      );
      await otherTab.close();
      await info.attach("CF11 persisted guardian signature", {
        body: JSON.stringify({
          request: request.id,
          signedDocument: signed.id,
          child: child.id,
          guardian: guardian.id,
          formVersion: version.id,
          verifiedGrant: grant.id,
        }),
        contentType: "application/json",
      });
    } finally {
      if (verifiedPdfUrl) {
        // Stop authenticated PDF viewers before removing the records they read.
        // A still-loading viewer must not retry against a deleted fixture.
        await Promise.all(context.pages().map((openPage) => openPage.close()));
        // Reuse the existing certification rule: Chromium's built-in PDF viewer
        // aborts its iframe document handoff. Only this authenticated, hashed
        // PDF URL is allowed; failed application routes and other requests fail.
        const pdfAborts = browserDiagnostics.diagnostics.filter(
          (diagnostic) =>
            diagnostic.kind === "requestfailed" &&
            diagnostic.url === verifiedPdfUrl,
        );
        // Initial request, restored-authority request and completed-request
        // reload: at most three viewer handoffs per visit, as in certification.
        expect(pdfAborts.length).toBeLessThanOrEqual(3 * 3);
        for (const diagnostic of pdfAborts) {
          expect(diagnostic).toEqual({
            isNavigationRequest: true,
            kind: "requestfailed",
            message: `net::ERR_ABORTED: GET ${verifiedPdfUrl}`,
            method: "GET",
            resourceType: "document",
            url: verifiedPdfUrl,
          });
          browserDiagnostics.allow(diagnostic);
        }
      }
      await removeGym(gym);
    }
  });
  test("AT06 owner closes only unresolved eligible bookings and attendance history survives reload", async ({
    page,
    browserDiagnostics,
  }, info) => {
    const gym = await createGym(),
      date = day(-1);
    let closeObservation: {
      checkedInReturned: (response: Response) => void;
      prepareClose: () => Promise<void>;
      returned: (response: Response) => void;
      feedbackVisible: () => void;
      finish: () => Promise<void>;
    } | undefined;
    try {
      const item = await fixtureClass(gym, date, "Completed class", 3);
      const present = await member(gym, "Already checked in"),
        unresolved = await member(gym, "Unresolved participant"),
        waiting = await member(gym, "Waitlisted participant");
      const firstMembership = await fixtureMembership(gym, present.id),
        secondMembership = await fixtureMembership(gym, unresolved.id);
      const firstBooking = await prisma.classBooking.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: present.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
          status: "BOOKED",
          fundingMembershipId: firstMembership.id,
          acceptedPolicy:
            firstMembership.acceptedTerms as Prisma.InputJsonValue,
        },
      });
      const secondBooking = await prisma.classBooking.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: unresolved.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
          status: "BOOKED",
          fundingMembershipId: secondMembership.id,
          acceptedPolicy:
            secondMembership.acceptedTerms as Prisma.InputJsonValue,
        },
      });
      const queue = await prisma.waitlistEntry.create({
        data: {
          workspaceId: gym.workspace.id,
          memberId: waiting.id,
          classTemplateId: item.id,
          scheduledForDate: asDate(date),
        },
      });
      await login(page, gym, browserDiagnostics);
      await roster(page, item.id, date);
      // Passive exact roster-route evidence starts before the first attendance
      // action. Never await a body, replay a command or acknowledge a pending UI.
      const rosterObservedAt = Date.now();
      const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
      let requestKey: string | null = null;
      let actionPhase: "CHECK_IN" | "CLOSE" = "CHECK_IN", closeIntentAtMs: number | null = null;
      const rosterUrl = new URL(`/dashboard/schedule/${item.id}/roster`, adminBaseURL);
      const requestIds = new Map<Request, number>(), terminalRequests = new Set<number>();
      const lifecycle: Array<Record<string, unknown>> = [];
      let checkedInReturnedRequestId: number | null = null, returnedRequestId: number | null = null, feedbackVisibleAtMs: number | null = null;
      const record = (event: string, fields: Record<string, unknown> = {}) => {
        lifecycle.push({ event, order: lifecycle.length + 1, atMs: Date.now() - rosterObservedAt, ...fields });
      };
      const requested = (request: Request) => {
        try {
          const target = new URL(request.url()), headers = request.headers(), action = headers["next-action"];
          const serverAction = request.method() === "POST" && !!action;
          const rosterGet = request.method() === "GET" && (request.isNavigationRequest() || headers["rsc"] === "1");
          if (target.origin !== rosterUrl.origin || target.pathname !== rosterUrl.pathname || (!serverAction && !rosterGet)) return;
          const id = requestIds.size + 1, payload = request.postDataBuffer();
          requestIds.set(request, id);
          record("request", { requestId: id, actionPhase, requestKind: serverAction ? "SERVER_ACTION" : "ROSTER_GET", fixtureDateMatches: target.searchParams.get("date") === date, method: request.method(), resourceType: request.resourceType(), navigation: request.isNavigationRequest(), urlSha256: hash(request.url()), actionSha256: action ? hash(action) : null, rsc: headers["rsc"] === "1", prefetch: !!headers["next-router-prefetch"] || !!headers["next-router-segment-prefetch"] || headers["purpose"] === "prefetch" || !!headers["sec-purpose"]?.includes("prefetch"), postDataBytes: payload?.length ?? 0, postDataSha256: payload ? hash(payload) : null, containsLoadedCloseRequestKey: requestKey !== null && payload !== null && payload.includes(Buffer.from(requestKey)) });
        } catch { record("request-observer-unavailable"); }
      };
      const responded = (response: Response) => {
        const id = requestIds.get(response.request()); if (!id) return;
        try {
          const headers = response.headers(), redirect = headers["x-action-redirect"];
          record("response", { requestId: id, status: response.status(), contentType: headers["content-type"] ?? null, actionRedirectPresent: !!redirect, actionRedirectSha256: redirect ? hash(redirect) : null });
        } catch { record("response-observer-unavailable", { requestId: id }); }
      };
      const finished = (request: Request) => {
        const id = requestIds.get(request); if (!id) return;
        terminalRequests.add(id); record("requestfinished", { requestId: id });
      };
      const failed = (request: Request) => {
        const id = requestIds.get(request); if (!id) return;
        terminalRequests.add(id);
        const failure = request.failure()?.errorText;
        record("requestfailed", { requestId: id, failureSha256: failure ? hash(failure) : null, isAborted: !!failure?.includes("ERR_ABORTED") });
      };
      page.on("request", requested); page.on("response", responded);
      page.on("requestfinished", finished); page.on("requestfailed", failed);
      closeObservation = {
        checkedInReturned(response) { checkedInReturnedRequestId = requestIds.get(response.request()) ?? null; record("act-returned", { actionPhase: "CHECK_IN", requestId: checkedInReturnedRequestId, status: response.status() }); },
        async prepareClose() {
          actionPhase = "CLOSE"; closeIntentAtMs = Date.now() - rosterObservedAt;
          record("close-intent");
          requestKey = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[type="submit"]'))
              .filter((button) => button.textContent?.trim() === "Close roster");
            return buttons.length === 1
              ? buttons[0]!.form?.querySelector<HTMLInputElement>('input[name="requestKey"]')?.value || null
              : null;
          }).catch(() => null);
          record("close-form-key-read", { present: requestKey !== null });
        },
        returned(response) { returnedRequestId = requestIds.get(response.request()) ?? null; record("act-returned", { actionPhase: "CLOSE", requestId: returnedRequestId, status: response.status() }); },
        feedbackVisible() { feedbackVisibleAtMs = Date.now() - rosterObservedAt; record("original-feedback-assertion-passed"); },
        async finish() {
          let databaseSnapshot: Record<string, unknown> = { status: "UNAVAILABLE" };
          try {
            databaseSnapshot = await prisma.$transaction(async (tx) => {
              const capturedAt = (await tx.$queryRaw<Array<{ at: Date }>>`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS at`)[0]!.at;
              const [second, first, operation, exactCloseCount, allCloseCount, operationCount, attendanceCount, eventCount, waitingAttendanceCount, currentQueue] = await Promise.all([
                tx.classBooking.findUnique({ where: { id: secondBooking.id, workspaceId: gym.workspace.id }, select: { status: true } }),
                tx.classBooking.findUnique({ where: { id: firstBooking.id, workspaceId: gym.workspace.id }, select: { status: true } }),
                requestKey ? tx.attendanceOperation.findUnique({ where: { workspaceId_requestKey: { workspaceId: gym.workspace.id, requestKey } }, select: { id: true, requestKey: true, action: true, payloadHash: true, result: true, createdAt: true } }) : Promise.resolve(null),
                requestKey ? tx.attendanceOperation.count({ where: { workspaceId: gym.workspace.id, requestKey, action: "CLOSE" } }) : Promise.resolve(null),
                tx.attendanceOperation.count({ where: { workspaceId: gym.workspace.id, action: "CLOSE" } }),
                tx.attendanceOperation.count({ where: { workspaceId: gym.workspace.id } }),
                tx.attendanceRecord.count({ where: { workspaceId: gym.workspace.id, classTemplateId: item.id, scheduledForDate: asDate(date) } }),
                tx.attendanceEvent.count({ where: { workspaceId: gym.workspace.id, classTemplateId: item.id, scheduledForDate: asDate(date) } }),
                tx.attendanceRecord.count({ where: { workspaceId: gym.workspace.id, memberId: waiting.id } }),
                tx.waitlistEntry.findUnique({ where: { id: queue.id, workspaceId: gym.workspace.id } }),
              ]);
              const result = operation?.result;
              const object = result && typeof result === "object" && !Array.isArray(result) ? result : null;
              const resultStatus = object?.status, closedCount = object?.closedCount, skipped = object?.skipped;
              return { status: "CAPTURED", capturedAt: capturedAt.toISOString(), secondBookingStatus: second?.status ?? null, firstBookingStatus: first?.status ?? null, preservedBookingStatus: first?.status ?? null, exactCloseOperationCount: exactCloseCount, allCloseOperationCount: allCloseCount, attendanceOperationCount: operationCount, attendanceRecordCount: attendanceCount, attendanceEventCount: eventCount, waitingAttendanceRecordCount: waitingAttendanceCount,
                exactOperation: operation ? { idSha256: hash(operation.id), action: operation.action === "CLOSE" ? "CLOSE" : "OTHER", requestKeyMatchesLoadedForm: operation.requestKey === requestKey, payloadHash: operation.payloadHash, resultSha256: hash(JSON.stringify(operation.result)), resultStatus: resultStatus === "closed" ? "closed" : resultStatus === "error" ? "error" : "OTHER", closedCount: typeof closedCount === "number" ? closedCount : null, skippedCount: Array.isArray(skipped) ? skipped.length : null, createdAt: operation.createdAt.toISOString() } : null,
                waitlist: { status: currentQueue?.status ?? null, unchanged: isDeepStrictEqual(currentQueue, queue), beforeSha256: hash(JSON.stringify(queue)), afterSha256: currentQueue ? hash(JSON.stringify(currentQueue)) : null } };
            }, { isolationLevel: "RepeatableRead" });
          } catch { databaseSnapshot = { status: "READ_FAILED", detail: "Passive fixture snapshot unavailable; original test result and cleanup retained." }; }
          finally {
            page.off("request", requested); page.off("response", responded);
            page.off("requestfinished", finished); page.off("requestfailed", failed);
          }
          try {
            await info.attach("AT06 passive closure pre-cleanup", { body: JSON.stringify({ scope: "Fictional AT06 fixture only; passive roster-action/pre-cleanup snapshot, no processor or HTTP scheduler claim", observedFrom: new Date(rosterObservedAt).toISOString(), stoppedAtMs: Date.now() - rosterObservedAt, loadedRequestKeySha256: requestKey ? hash(requestKey) : null, closeIntentAtMs, checkedInReturnedRequestId, returnedRequestId, feedbackVisibleAtMs, observedRequestCount: requestIds.size, openRequestIds: [...requestIds.values()].filter((id) => !terminalRequests.has(id)), lifecycle, databaseSnapshot }), contentType: "application/json" });
          } catch { info.annotations.push({ type: "at06-passive-diagnostic", description: "Passive closure attachment unavailable; original test result and cleanup retained." }); }
        },
      };
      let row = attendee(page, present.fullName);
      await row
        .getByRole("combobox", { name: "Attendance", exact: true })
        .selectOption("PRESENT");
      const checkedIn = await act(
        page,
        row.getByRole("button", { name: "Save attendance", exact: true }),
      );
      closeObservation.checkedInReturned(checkedIn);
      await expect
        .poll(
          async () =>
            (
              await prisma.classBooking.findUniqueOrThrow({
                where: { id: firstBooking.id },
              })
            ).status,
        )
        .toBe("ATTENDED");
      await expect(
        row.getByLabel("Correction reason", { exact: true }),
      ).toBeVisible();
      browserDiagnostics.acknowledgeAction(
        checkedIn,
        "Recorded-attendance UI rendered; original booking is attended.",
      );
      await page
        .getByRole("checkbox", {
          name: "Mark only unresolved eligible bookings as no-shows.",
          exact: true,
        })
        .check();
      await closeObservation.prepareClose();
      const closed = await act(
        page,
        page.getByRole("button", { name: "Close roster", exact: true }),
      );
      closeObservation.returned(closed);
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "1 unresolved booking was marked as no-show." }),
      ).toBeVisible();
      closeObservation.feedbackVisible();
      expect(
        (
          await prisma.classBooking.findUniqueOrThrow({
            where: { id: firstBooking.id },
          })
        ).status,
      ).toBe("ATTENDED");
      expect(
        (
          await prisma.classBooking.findUniqueOrThrow({
            where: { id: secondBooking.id },
          })
        ).status,
      ).toBe("NO_SHOW");
      expect(
        (
          await prisma.waitlistEntry.findUniqueOrThrow({
            where: { id: queue.id },
          })
        ).status,
      ).toBe("ACTIVE");
      expect(
        await prisma.attendanceRecord.count({
          where: { workspaceId: gym.workspace.id, memberId: waiting.id },
        }),
      ).toBe(0);
      expect(
        await prisma.attendanceEvent.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(2);
      expect(
        await prisma.attendanceOperation.count({
          where: { workspaceId: gym.workspace.id },
        }),
      ).toBe(2);
      browserDiagnostics.acknowledgeAction(
        closed,
        "Closure confirmation rendered; only unresolved booking became no-show, recorded attendee and waitlist preserved, two attributable events persisted.",
      );
      await page.reload();
      row = attendee(page, unresolved.fullName);
      await expect(
        row.getByRole("combobox", { name: "Attendance", exact: true }),
      ).toHaveValue("NO_SHOW");
      await row.getByText("Recent attendance history", { exact: true }).click();
      await expect(
        row.getByText("Roster closed after the scheduled class ended.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Close roster", exact: true }),
      ).toBeDisabled();
      await info.attach("AT06 persisted closure", {
        body: JSON.stringify({
          classId: item.id,
          preservedAttendanceBooking: firstBooking.id,
          closedBooking: secondBooking.id,
          preservedQueue: queue.id,
          auditEvents: 2,
        }),
        contentType: "application/json",
      });
    } finally {
      try { await closeObservation?.finish(); }
      catch { info.annotations.push({ type: "at06-passive-diagnostic", description: "Passive closure observation unavailable; original test result and cleanup retained." }); }
      await removeGym(gym);
    }
  });
});
