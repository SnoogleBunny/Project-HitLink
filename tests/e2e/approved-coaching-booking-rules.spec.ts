import { expectActionRedirect } from "./support/action-redirect";
import { loginToWorkspace } from "./support/workspace-login";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@flowstate/auth";
import {
  addDays,
  coachingBookingWeekdays,
  coachingStatus,
  confirmCoachingBookingPolicy,
  getWorkspaceDateString,
  parseCoachingBookingPolicy,
  previewCoachingBookingPolicy,
  prisma,
  runCoachingCommand,
  type CoachingActor,
  type CoachingBookingPolicy,
  type CoachingCommand,
} from "@flowstate/db";
import { deleteFixtureCoachingWorkspace } from "../../packages/db/tests/coaching-booking-policy-fixture.js";
import {
  expect,
  test,
  type BrowserDiagnosticsCollector,
  type Locator,
  type Page,
} from "./support/browser-diagnostics";

const databaseUrl = process.env.DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    new URL(databaseUrl).hostname,
  ) ||
  !/^[A-Za-z0-9_]+_test$/.test(
    decodeURIComponent(new URL(databaseUrl).pathname.slice(1)),
  ) ||
  (process.env.TEST_DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== databaseUrl)
)
  throw new Error(
    "Coaching-rule browser acceptance requires one explicit loopback *_test database; DATABASE_URL and TEST_DATABASE_URL must agree.",
  );

const adminBase =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const memberBase =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const password = "ExplicitCoachingRulesFixture123!";
const confirmation =
  "I reviewed these effects and confirm the rules for new program appointment requests.";
const bookingHelp = (hours: number) =>
  `Booking Rules Owner handles booking, extension or refund reviews and replies within ${hours} hours.`;

type Fixture = {
  workspaceId: string;
  owner: CoachingActor;
  coach: CoachingActor;
  client: CoachingActor;
  coachStaffId: string;
  memberId: string;
  today: string;
};
const fixtures: Fixture[] = [];

async function createFixture(): Promise<Fixture> {
  const key = `coaching-rules-${randomUUID()}`;
  const fixture: Fixture = {
    workspaceId: `${key}-gym`,
    owner: { workspaceId: `${key}-gym`, userId: `${key}-owner` },
    coach: { workspaceId: `${key}-gym`, userId: `${key}-coach` },
    client: { workspaceId: `${key}-gym`, userId: `${key}-client` },
    coachStaffId: `${key}-coach-role`,
    memberId: `${key}-member`,
    today: getWorkspaceDateString(new Date(), "UTC"),
  };
  const passwordHash = await hashPassword(password);
  for (const [actor, fullName] of [
    [fixture.owner, "Booking Rules Owner"],
    [fixture.coach, "Booking Rules Coach"],
    [fixture.client, "Booking Rules Adult Client"],
  ] as const)
    await prisma.user.create({
      data: {
        id: actor.userId,
        email: `${actor.userId}@example.test`,
        fullName,
        passwordHash,
      },
    });
  const now = new Date();
  await prisma.workspace.create({
    data: {
      id: fixture.workspaceId,
      name: key,
      status: "ACTIVE",
      location: {
        create: { name: "Fictional coaching office", timezone: "UTC" },
      },
      settings: { create: { locale: "en-CA", currency: "cad" } },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional handoff complete",
          flowstateResponsibility:
            "Isolated appointment-rule browser acceptance",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: fixture.owner.userId,
          operationallyReadyAt: now,
          operationallyReadyByUserId: fixture.owner.userId,
        },
      },
    },
  });
  // Register the owned workspace before further fixture work so a failed setup
  // still uses the canonical inventory/immutable-history purge in afterEach.
  fixtures.push(fixture);
  for (const [actor, role] of [
    [fixture.owner, "OWNER"],
    [fixture.coach, "COACH"],
    [fixture.client, "CUSTOMER"],
  ] as const)
    await prisma.workspaceUser.create({
      data: {
        id:
          actor === fixture.coach
            ? fixture.coachStaffId
            : `${actor.userId}-role`,
        workspaceId: fixture.workspaceId,
        userId: actor.userId,
        role,
      },
    });
  await prisma.member.create({
    data: {
      id: fixture.memberId,
      workspaceId: fixture.workspaceId,
      userId: fixture.client.userId,
      fullName: "Booking Rules Adult Client",
      email: `${fixture.client.userId}@example.test`,
      dateOfBirth: new Date("1990-01-01T00:00:00Z"),
      status: "ACTIVE",
    },
  });
  return fixture;
}

function policy(
  overrides: Partial<CoachingBookingPolicy["appointments"]> = {},
) {
  return parseCoachingBookingPolicy({
    schemaVersion: 1,
    appointments: {
      weeklyHours: coachingBookingWeekdays.map((weekday) => ({
        weekday,
        intervals: [{ startMinute: 9 * 60, endMinute: 18 * 60 }],
      })),
      maxAdvanceMinutes: 14 * 1440,
      minimumLeadMinutes: 60,
      minimumBufferMinutes: 10,
      resolutionResponseHours: 6,
      ...overrides,
    },
  });
}

async function confirmFixturePolicy(
  fixture: Fixture,
  value: CoachingBookingPolicy,
  expectedVersion = 0,
) {
  const input = {
    policy: value,
    reason:
      "Explicit fictional appointment service policy for this browser case",
    expectedVersion,
    operationId: randomUUID(),
  };
  const review = await previewCoachingBookingPolicy({
    actor: fixture.owner,
    input,
    db: prisma,
  });
  return confirmCoachingBookingPolicy({
    actor: fixture.owner,
    input,
    db: prisma,
    previewHash: review.previewHash,
    confirmed: true,
  });
}

async function command(
  actor: CoachingActor,
  kind: CoachingCommand["kind"],
  input: Record<string, unknown>,
  enrollmentId?: string,
) {
  const enrollment = enrollmentId
    ? await prisma.coachingEnrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
      })
    : null;
  return runCoachingCommand(actor, {
    kind,
    input,
    enrollmentId,
    operationId: randomUUID(),
    expectedVersion: enrollment?.version,
  });
}

async function preparePlan(fixture: Fixture, priceCents: number) {
  const program = await command(fixture.owner, "createProgram", {
    name: `Appointment disclosure ${fixture.workspaceId}`,
    durationDays: 28,
    deliveryWeekdays: "0,1,2,3,4,5,6",
    responseHours: 48,
    goals: "Review the fictional plan and its separate appointment promises.",
    milestones: "First fictional milestone",
    appointmentUnits: 2,
    appointmentMinutes: 60,
    cancellationHours: 24,
    noShowGraceMinutes: 15,
    priceCents,
    currency: "cad",
    terms:
      "Fictional browser agreement. No processor checkout or settlement is simulated.",
    retrievalDays: 30,
  });
  const version = await prisma.coachingProgramVersion.findFirstOrThrow({
    where: { programId: program.id },
  });
  const enrollment = await command(fixture.owner, "enroll", {
    memberId: fixture.memberId,
    programVersionId: version.id,
    coachId: fixture.coachStaffId,
    startsOn: fixture.today,
  });
  await command(fixture.client, "sendVerification", {}, enrollment.id);
  const notice = await prisma.notificationJob.findFirstOrThrow({
    where: {
      workspaceId: fixture.workspaceId,
      recipientEmail: `${fixture.client.userId}@example.test`,
      subject: "Verify your coaching contact",
    },
    orderBy: { createdAt: "desc" },
  });
  const code = notice.body.match(/page: ([a-f0-9]{48})/)?.[1];
  if (!code)
    throw new Error("Missing the fixture's own one-use verification code.");
  await command(fixture.client, "verifyContact", { code }, enrollment.id);
  await command(
    fixture.client,
    "acceptCoach",
    { historyFromDate: fixture.today },
    enrollment.id,
  );
  await command(
    fixture.client,
    "submitIntake",
    { body: "Fictional intake shared only with this accepted coach." },
    enrollment.id,
  );
  // Acceptance is deliberately left for the authenticated client UI.
  return enrollment.id;
}

async function publishSlot(fixture: Fixture, daysFromToday: number) {
  const startsAt = new Date(
    `${addDays(fixture.today, daysFromToday)}T15:00:00Z`,
  );
  const result = await command(fixture.coach, "createAvailability", {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 3600000).toISOString(),
    bufferMinutes: 10,
    virtualUrl: "https://example.test/private-coaching-meeting",
  });
  return prisma.coachingAvailability.findUniqueOrThrow({
    where: { id: result.id },
  });
}

async function action(page: Page, button: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        !!response.request().headers()["next-action"],
    ),
    button.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  await page.waitForLoadState("networkidle");
  return response;
}

async function login(
  page: Page,
  actor: CoachingActor,
  portal: "admin" | "member",
  diagnostics: BrowserDiagnosticsCollector,
  landing: { path: string; heading: string },
) {
  const base = portal === "admin" ? adminBase : memberBase;
  await loginToWorkspace({
    page,
    origin: base,
    email: `${actor.userId}@example.test`,
    password,
    expectedRedirect: portal === "admin" ? "/dashboard;push" : "/app;push",
    destination: landing,
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}

async function openRules(
  page: Page,
  fixture: Fixture,
  diagnostics: BrowserDiagnosticsCollector,
) {
  await login(page, fixture.owner, "admin", diagnostics, {
    path: "/dashboard",
    heading: "Today",
  });
  await page.goto(`${adminBase}/dashboard/settings`);
  await page
    .getByRole("link", {
      name: "Program appointment booking rules",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Program appointment booking rules",
      exact: true,
    }),
  ).toBeVisible();
}

async function setNumericRules(
  page: Page,
  values = { horizon: 20160, lead: 60, buffer: 10, response: 6 },
) {
  await page
    .getByLabel("Maximum advance booking (minutes)", { exact: true })
    .fill(String(values.horizon));
  await page
    .getByLabel("Minimum booking notice (minutes)", { exact: true })
    .fill(String(values.lead));
  await page
    .getByLabel("Minimum preparation and recovery buffer (minutes)", {
      exact: true,
    })
    .fill(String(values.buffer));
  await page
    .getByLabel("Booking-help review response (hours)", { exact: true })
    .fill(String(values.response));
}

async function previewRules(
  page: Page,
  diagnostics: BrowserDiagnosticsCollector,
  retained: number,
  affected: number,
) {
  const response = await action(
    page,
    page.getByRole("button", {
      name: "Preview appointment rules",
      exact: true,
    }),
  );
  const review = page.getByRole("region", {
    name: "Appointment rules review",
    exact: true,
  });
  await expect(review).toContainText(
    `${affected} published availability times fall outside the proposed rules.`,
  );
  await expect(review).toContainText(
    `${retained} existing accepted appointments keep their recorded terms and units.`,
  );
  await expect(
    review.getByRole("checkbox", { name: confirmation, exact: true }),
  ).not.toBeChecked();
  await expect(
    review.getByRole("button", {
      name: "Confirm appointment rules",
      exact: true,
    }),
  ).toBeDisabled();
  diagnostics.acknowledgeAction(
    response,
    `The exact appointment-rule preview visibly retains ${retained} commitments and reports ${affected} affected availability times.`,
  );
  return review;
}

async function confirmRules(
  page: Page,
  diagnostics: BrowserDiagnosticsCollector,
  version: number,
) {
  const review = page.getByRole("region", {
    name: "Appointment rules review",
    exact: true,
  });
  await review
    .getByRole("checkbox", { name: confirmation, exact: true })
    .check();
  const response = await action(
    page,
    review.getByRole("button", {
      name: "Confirm appointment rules",
      exact: true,
    }),
  );
  await expect(page.getByRole("status")).toContainText(
    `Appointment booking rules version ${version} confirmed.`,
  );
  diagnostics.acknowledgeAction(
    response,
    `The authenticated owner sees the actual committed appointment booking rules version ${version} without a reload.`,
  );
}

async function acceptThroughUi(page: Page, enrollmentId: string) {
  await page.goto(`${memberBase}/app/coaching/${enrollmentId}?view=program`);
  const form = page.locator('form:has(input[name="kind"][value="acceptPlan"])');
  await expect(form.getByRole("checkbox")).not.toBeChecked();
  await form.getByRole("checkbox").check();
  const response = await action(
    page,
    form.getByRole("button", { name: "Accept program", exact: true }),
  );
  await expect(page).toHaveURL(
    new RegExp(`/app/coaching/${enrollmentId}\\?view=program&saved=1$`),
  );
  await expect(
    page.getByRole("button", { name: "Accept program", exact: true }),
  ).toHaveCount(0);
  return response;
}

test.describe("approved program appointment booking rules and presale disclosure", () => {
  test.setTimeout(120_000);

  test.afterEach(async () => {
    while (fixtures.length) {
      const fixture = fixtures[0]!;
      await deleteFixtureCoachingWorkspace(prisma, fixture.workspaceId);
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [
              fixture.owner.userId,
              fixture.coach.userId,
              fixture.client.userId,
            ],
          },
        },
      });
      fixtures.shift();
    }
  });
  test.afterAll(() => prisma.$disconnect());

  test("WS06/LC08 owner explicitly configures missing appointment rules, reviews a changed draft and retains committed feedback/history", async ({
    page,
    browserDiagnostics,
  }, info) => {
    const fixture = await createFixture();
    await openRules(page, fixture, browserDiagnostics);
    await expect(
      page.getByText("Not configured.", { exact: false }),
    ).toContainText("Choose each setting explicitly.");
    await expect(
      page.getByText(
        "No program appointment booking rules have been confirmed.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel("Maximum advance booking (minutes)", { exact: true }),
    ).toHaveValue("");
    expect(
      await prisma.coachingBookingPolicy.count({
        where: { workspaceId: fixture.workspaceId },
      }),
    ).toBe(0);

    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]) {
      await page
        .getByRole("button", { name: `Add ${day} interval`, exact: true })
        .click();
      await page
        .getByLabel(`${day} start time 1`, { exact: true })
        .fill("09:00");
      await page.getByLabel(`${day} end time 1`, { exact: true }).fill("18:00");
    }
    await setNumericRules(page);
    await page
      .getByLabel("Reason for these appointment rules", { exact: true })
      .fill(
        "Explicit weekday and weekend service hours with reviewed lead, buffer and booking help.",
      );
    const review = await previewRules(page, browserDiagnostics, 0, 0);
    expect(
      await prisma.coachingBookingPolicy.count({
        where: { workspaceId: fixture.workspaceId },
      }),
    ).toBe(0);
    expect(
      await prisma.workspaceDataEvent.count({
        where: {
          workspaceId: fixture.workspaceId,
          kind: "COACHING_BOOKING_POLICY_CONFIRMED",
        },
      }),
    ).toBe(0);

    await review
      .getByRole("checkbox", { name: confirmation, exact: true })
      .check();
    await page
      .getByLabel("Booking-help review response (hours)", { exact: true })
      .fill("4");
    await expect(review.getByRole("alert")).toHaveText(
      "This draft changed after review. Preview it again before confirming.",
    );
    await expect(
      review.getByRole("checkbox", { name: confirmation, exact: true }),
    ).not.toBeChecked();
    await expect(
      review.getByRole("button", {
        name: "Confirm appointment rules",
        exact: true,
      }),
    ).toBeDisabled();
    await previewRules(page, browserDiagnostics, 0, 0);
    await confirmRules(page, browserDiagnostics, 1);
    const saved = await prisma.coachingBookingPolicy.findUniqueOrThrow({
      where: { workspaceId: fixture.workspaceId },
    });
    expect(saved.version).toBe(1);
    expect(parseCoachingBookingPolicy(saved.policy)).toEqual(
      policy({ resolutionResponseHours: 4 }),
    );
    expect(
      await prisma.workspaceDataEvent.count({
        where: {
          workspaceId: fixture.workspaceId,
          kind: "COACHING_BOOKING_POLICY_CONFIRMED",
        },
      }),
    ).toBe(1);

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Version 1", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Booking-help review response (hours)", { exact: true }),
    ).toHaveValue("4");
    await expect(
      page.getByLabel("Monday start time 1", { exact: true }),
    ).toHaveValue("09:00");
    await expect(
      page.getByLabel("Monday end time 1", { exact: true }),
    ).toHaveValue("18:00");
    await expect(
      page.getByText(
        "Explicit weekday and weekend service hours with reviewed lead, buffer and booking help.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("coaching-rules-confirmed-phone.png"),
      fullPage: true,
    });
    browserDiagnostics.assertNoExternalRequests();
  });

  test("LC08 client reviews unheld presale times and separate booking help before UI acceptance; paid service and appointment units remain unfunded", async ({
    page,
    browserDiagnostics,
  }, info) => {
    const fixture = await createFixture();
    await confirmFixturePolicy(fixture, policy());
    const enrollmentId = await preparePlan(fixture, 12000);
    const available = await publishSlot(fixture, 3);
    await publishSlot(fixture, 10);
    // These are real, previously publishable times. A canonical policy revision
    // narrows the horizon; no impossible future slot is inserted directly.
    await confirmFixturePolicy(
      fixture,
      policy({ maxAdvanceMinutes: 7 * 1440 }),
      1,
    );
    await login(page, fixture.client, "member", browserDiagnostics, {
      path: `/app/coaching/${encodeURIComponent(enrollmentId)}?view=program`,
      heading: "My program",
    });
    await page.goto(`${memberBase}/app/coaching/${enrollmentId}?view=program`);
    const presale = page
      .locator("section")
      .filter({
        has: page.getByRole("heading", {
          name: "Appointment availability before purchase",
          exact: true,
        }),
      });
    await expect(presale).toContainText(
      "Your program includes 2 appointments of 60 minutes.",
    );
    await expect(presale).toContainText(
      "Displayed times are not held and can change before you book.",
    );
    await expect(presale.locator("li")).toHaveCount(1);
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    });
    await expect(presale.locator("li")).toContainText(
      dateFormatter.format(available.startsAt),
    );
    await expect(presale.locator("li")).toContainText(
      dateFormatter.format(available.endsAt),
    );
    await expect(presale).toContainText(
      "1 matching time is not open for booking yet.",
    );
    await expect(presale).toContainText(bookingHelp(6));
    await expect(presale).toContainText(
      "your coach’s general reply promise remains separate.",
    );
    await expect(page.getByText(/Replies within 48 hours\./)).toBeVisible();
    expect(await page.content()).not.toContain(
      "https://example.test/private-coaching-meeting",
    );
    const before = await prisma.coachingEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    expect(before.acceptedAt).toBeNull();
    expect(
      await prisma.coachingAppointment.count({ where: { enrollmentId } }),
    ).toBe(0);

    const acceptedResponse = await acceptThroughUi(page, enrollmentId);
    await expect(
      page.getByRole("heading", { name: "Program payment", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Payment: Pending. Service starts after payment and current consent are confirmed and your start date arrives.",
        { exact: true },
      ),
    ).toBeVisible();
    const accepted = await prisma.coachingEnrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
    });
    expect(accepted.acceptedAt).not.toBeNull();
    expect(accepted.paymentState).toBe("PENDING");
    expect(coachingStatus(accepted)).toBe("PAYMENT_PENDING");
    expect(accepted.status).not.toBe("ACTIVE");
    expect(accepted.paymentId).toBeNull();
    expect(accepted.checkoutSessionId).toBeNull();
    expect(accepted.checkoutUrl).toBeNull();
    expect(
      await prisma.coachingAppointment.count({ where: { enrollmentId } }),
    ).toBe(0);
    expect(
      await prisma.coachingAppointment.count({
        where: {
          enrollmentId,
          unitState: { in: ["HELD", "CONSUMED", "DISPUTED"] },
        },
      }),
    ).toBe(0);
    expect(
      await prisma.financialOperation.count({
        where: { workspaceId: fixture.workspaceId },
      }),
    ).toBe(0);
    const agreement = await prisma.coachingAcceptedPlan.findFirstOrThrow({
      where: { enrollmentId },
    });
    expect(agreement.snapshot).toMatchObject({
      appointmentBookingDisclosure: {
        availableCount: 1,
        notOpenCount: 1,
        resolutionOwnerNameSnapshot: "Booking Rules Owner",
        resolutionResponseHours: 6,
        notHeld: true,
      },
    });
    await expectActionRedirect(
      page,
      acceptedResponse,
      `${memberBase}/app/coaching/${enrollmentId}?view=program&saved=1`,
    );
    if (acceptedResponse.status() === 200)
      browserDiagnostics.acknowledgeAction(
        acceptedResponse,
        "Pending program payment is visible; the exact accepted plan disclosure persists without funded service, appointments or financial operations.",
      );
    await page
      .getByRole("navigation", { name: "Coaching sections", exact: true })
      .getByRole("link", { name: "My appointment", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "My appointments", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("2 of 2 appointments available.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Book appointment", exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto(`${memberBase}/app/coaching/${enrollmentId}?view=program`);
    await expect(presale).toContainText(bookingHelp(6));
    await page.screenshot({
      path: info.outputPath("coaching-presale-unpaid-ipad-width.png"),
      fullPage: true,
    });
    browserDiagnostics.assertNoExternalRequests();
  });

  test("LC08 restrictive owner revision retains a free program's booked appointment and accepted faster help while denying a stale new booking through the member UI", async ({
    page,
    context,
    browserDiagnostics,
  }, info) => {
    const fixture = await createFixture();
    await confirmFixturePolicy(fixture, policy());
    const enrollmentId = await preparePlan(fixture, 0);
    const retainedSlot = await publishSlot(fixture, 3);
    const laterSlot = await publishSlot(fixture, 4);
    const clientPage = await context.newPage();
    await login(clientPage, fixture.client, "member", browserDiagnostics, {
      path: `/app/coaching/${encodeURIComponent(enrollmentId)}?view=program`,
      heading: "My program",
    });
    const acceptedResponse = await acceptThroughUi(clientPage, enrollmentId);
    const acceptedBefore = await prisma.coachingAcceptedPlan.findFirstOrThrow({
      where: { enrollmentId },
    });
    expect(acceptedBefore.snapshot).toMatchObject({
      appointmentBookingDisclosure: {
        resolutionResponseHours: 6,
        notHeld: true,
      },
    });
    await expectActionRedirect(
      clientPage,
      acceptedResponse,
      `${memberBase}/app/coaching/${enrollmentId}?view=program&saved=1`,
    );
    if (acceptedResponse.status() === 200)
      browserDiagnostics.acknowledgeAction(
        acceptedResponse,
        "The accept control is absent and the exact accepted plan retains its six-hour booking-help disclosure.",
      );
    await clientPage.goto(
      `${memberBase}/app/coaching/${enrollmentId}?view=appointments`,
    );
    const booking = clientPage.locator(
      'form:has(input[name="kind"][value="bookAppointment"])',
    );
    await booking
      .getByRole("combobox", { name: "Available time", exact: true })
      .selectOption(retainedSlot.id);
    const bookedResponse = await action(
      clientPage,
      booking.getByRole("button", { name: "Book appointment", exact: true }),
    );
    await expect(
      clientPage.getByText("1 of 2 appointments available.", { exact: false }),
    ).toBeVisible();
    const before = await prisma.coachingAppointment.findFirstOrThrow({
      where: { enrollmentId, availabilityId: retainedSlot.id },
    });
    expect(before).toMatchObject({
      status: "BOOKED",
      unitState: "HELD",
      bufferMinutes: 10,
    });
    await expectActionRedirect(
      clientPage,
      bookedResponse,
      `${memberBase}/app/coaching/${enrollmentId}?view=appointments&saved=1`,
    );
    if (bookedResponse.status() === 200)
      browserDiagnostics.acknowledgeAction(
        bookedResponse,
        "One of two appointments remains visible and the exact selected appointment persists booked with a held unit and10-minute buffer.",
      );
    const availabilityBefore = await prisma.coachingAvailability.findMany({
      where: { workspaceId: fixture.workspaceId },
      orderBy: { id: "asc" },
    });

    // Leave a real old member form open with its still-current enrollment
    // version and an unbooked 15:00 slot. Only the independent policy changes.
    const stalePage = await context.newPage();
    await stalePage.goto(
      `${memberBase}/app/coaching/${enrollmentId}?view=appointments`,
    );
    const staleBooking = stalePage.locator(
      'form:has(input[name="kind"][value="bookAppointment"])',
    );
    await staleBooking
      .getByRole("combobox", { name: "Available time", exact: true })
      .selectOption(laterSlot.id);

    await openRules(page, fixture, browserDiagnostics);
    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ])
      await page.getByLabel(`${day} end time 1`, { exact: true }).fill("12:00");
    await setNumericRules(page, {
      horizon: 20160,
      lead: 60,
      buffer: 10,
      response: 24,
    });
    await page
      .getByLabel("Reason for these appointment rules", { exact: true })
      .fill(
        "New requests use morning service hours; retain the booked afternoon appointment and earlier faster help promise.",
      );
    await previewRules(page, browserDiagnostics, 1, 2);
    await confirmRules(page, browserDiagnostics, 2);
    const current = await prisma.coachingBookingPolicy.findUniqueOrThrow({
      where: { workspaceId: fixture.workspaceId },
    });
    expect(current.version).toBe(2);
    expect(
      parseCoachingBookingPolicy(current.policy).appointments
        .resolutionResponseHours,
    ).toBe(24);
    expect(
      await prisma.coachingAppointment.findUniqueOrThrow({
        where: { id: before.id },
      }),
    ).toEqual(before);
    expect(
      await prisma.coachingAcceptedPlan.findUniqueOrThrow({
        where: { id: acceptedBefore.id },
      }),
    ).toEqual(acceptedBefore);
    expect(
      await prisma.coachingAvailability.findMany({
        where: { workspaceId: fixture.workspaceId },
        orderBy: { id: "asc" },
      }),
    ).toEqual(availabilityBefore);

    const rejectedResponse = await action(
      stalePage,
      staleBooking.getByRole("button", {
        name: "Book appointment",
        exact: true,
      }),
    );
    await expect(
      stalePage.getByText(
        "Choose an appointment inside the confirmed appointment service hours.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(new URL(stalePage.url()).searchParams.get("error")).toBe(
      "Choose an appointment inside the confirmed appointment service hours.",
    );
    expect(
      await prisma.coachingAppointment.count({ where: { enrollmentId } }),
    ).toBe(1);
    expect(
      await prisma.coachingAppointment.count({
        where: { enrollmentId, availabilityId: laterSlot.id },
      }),
    ).toBe(0);
    expect(
      await prisma.coachingAppointment.findUniqueOrThrow({
        where: { id: before.id },
      }),
    ).toEqual(before);
    await expectActionRedirect(
      stalePage,
      rejectedResponse,
      `${memberBase}/app/coaching/${enrollmentId}?view=appointments&${new URLSearchParams({ error: "Choose an appointment inside the confirmed appointment service hours." })}`,
    );
    if (rejectedResponse.status() === 200)
      browserDiagnostics.acknowledgeAction(
        rejectedResponse,
        "The exact outside-service-hours error is visible; no later-slot appointment exists and the original booked appointment remains unchanged.",
      );
    await clientPage.reload();
    await expect(
      clientPage.getByText("1 of 2 appointments available.", { exact: false }),
    ).toBeVisible();
    await expect(
      clientPage.getByText("Cancel appointment", { exact: true }),
    ).toBeVisible();
    const freshBooking = clientPage.locator(
      'form:has(input[name="kind"][value="bookAppointment"])',
    );
    await expect(
      freshBooking
        .getByRole("combobox", { name: "Available time", exact: true })
        .locator("option"),
    ).toHaveCount(1);
    await expect(
      freshBooking.locator(`option[value="${laterSlot.id}"]`),
    ).toHaveCount(0);
    await clientPage
      .getByRole("navigation", { name: "Coaching sections", exact: true })
      .getByRole("link", { name: "My program", exact: true })
      .click();
    const presale = clientPage
      .locator("section")
      .filter({
        has: clientPage.getByRole("heading", {
          name: "Appointment availability before purchase",
          exact: true,
        }),
      });
    await expect(presale).toContainText(
      "No matching appointment time is currently available for these program dates.",
    );
    await expect(presale).toContainText("A review is not a confirmed refund.");
    await expect(presale).toContainText(bookingHelp(6));
    await expect(presale).not.toContainText("replies within 24 hours");
    await expect(
      clientPage.getByText(/Replies within 48 hours\./),
    ).toBeVisible();
    expect(
      await prisma.coachingAcceptedPlan.findUniqueOrThrow({
        where: { id: acceptedBefore.id },
      }),
    ).toEqual(acceptedBefore);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Version 2", exact: true }),
    ).toBeVisible();
    await clientPage.screenshot({
      path: info.outputPath("coaching-retained-help-after-policy-revision.png"),
      fullPage: true,
    });
    browserDiagnostics.assertNoExternalRequests();
  });
});
