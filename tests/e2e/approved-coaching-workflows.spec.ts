import { expectActionRedirect, captureAction } from "./support/action-redirect";
import { loginToWorkspace } from "./support/workspace-login";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@flowstate/auth";
import {
  prisma,
  runCoachingCommand,
  getWorkspaceDateString,
  addDays,
  type CoachingActor,
  type CoachingCommand,
} from "@flowstate/db";
import { expect, test, type BrowserDiagnosticsCollector, type Page } from "./support/browser-diagnostics";
import { createFixtureCoachingBookingPolicy, deleteFixtureCoachingWorkspace } from "../../packages/db/tests/coaching-booking-policy-fixture.js";

const adminBase =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const memberBase =
  process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const prefix = `coaching-browser-${randomUUID()}`;
const workspaceId = `${prefix}-gym`;
const password = "ExplicitFixturePassword123!";
const owner = { workspaceId, userId: `${prefix}-owner` };
const coach = { workspaceId, userId: `${prefix}-coach` };
const client = { workspaceId, userId: `${prefix}-client` };
const appointmentClient = { workspaceId, userId: `${prefix}-appointments` };
const coachStaffId = `${prefix}-coach-role`;
const clientMemberId = `${prefix}-client-member`;
let notesEnrollment = "",
  appointmentEnrollment = "",
  availabilityId = "",
  today = "";
const noteBody = `Published client note ${prefix}`;
const privateBody = `Author-private working note ${prefix}`;

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

async function enroll(
  actor: CoachingActor,
  memberId: string,
  appointmentUnits: number,
) {
  const program = await command(owner, "createProgram", {
    name: appointmentUnits
      ? "Fixture appointment program"
      : "Fixture notes-only program",
    durationDays: 28,
    deliveryWeekdays: "0,1,2,3,4,5,6",
    responseHours: 48,
    goals: "An accepted fictional goal",
    milestones: "First fictional milestone",
    appointmentUnits,
    appointmentMinutes: 60,
    cancellationHours: 24,
    noShowGraceMinutes: 15,
    priceCents: 0,
    currency: "cad",
    terms: "Explicit free test program. No processor payment is simulated.",
    retrievalDays: 30,
  });
  const programVersion = await prisma.coachingProgramVersion.findFirstOrThrow({
    where: { programId: program.id },
  });
  const enrollment = await command(owner, "enroll", {
    memberId,
    programVersionId: programVersion.id,
    coachId: coachStaffId,
    startsOn: today,
  });
  await command(actor, "sendVerification", {}, enrollment.id);
  const notice = await prisma.notificationJob.findFirstOrThrow({
    where: {
      workspaceId,
      recipientEmail: `${actor.userId}@example.test`,
      subject: "Verify your coaching contact",
    },
    orderBy: { createdAt: "desc" },
  });
  const code = notice.body.match(/page: ([a-f0-9]{48})/)?.[1];
  if (!code)
    throw new Error(
      "The fixture verification notice did not contain its own one-use code.",
    );
  await command(actor, "verifyContact", { code }, enrollment.id);
  await command(
    actor,
    "acceptCoach",
    { historyFromDate: today },
    enrollment.id,
  );
  await command(
    actor,
    "submitIntake",
    { body: "Fictional intake shared with the accepted coach." },
    enrollment.id,
  );
  await command(actor, "acceptPlan", { acceptTerms: true }, enrollment.id);
  // The real domain rule activates explicitly free programs on acceptance.
  // No test writes a paid state or fabricates provider settlement.
  return enrollment.id;
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
    expectedRedirect:
      portal === "admin"
        ? actor.userId === coach.userId
          ? "/dashboard/coach/today;push"
          : "/dashboard;push"
        : "/app;push",
    destination: landing,
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}

test.describe("approved focused coaching workflows", () => {
  test.setTimeout(120_000);
  test.beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (
      !databaseUrl ||
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
        new URL(databaseUrl).hostname,
      )
    )
      throw new Error(
        "Coaching browser fixtures require an explicitly configured local disposable database.",
      );
    const passwordHash = await hashPassword(password);
    for (const actor of [owner, coach, client, appointmentClient])
      await prisma.user.create({
        data: {
          id: actor.userId,
          email: `${actor.userId}@example.test`,
          fullName:
            actor === coach
              ? "Fixture Coach"
              : actor === owner
                ? "Fixture Owner"
                : "Fixture Adult Client",
          passwordHash,
        },
      });
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Coaching browser fixture",
        status: "ACTIVE",
        location: { create: { name: "Fixture location", timezone: "UTC" } },
        migration: {
          create: {
            stage: "COMPLETE",
            nextOwnerAction: "Fixture ready",
            flowstateResponsibility: "Isolated browser fixture",
            ownerReviewAcknowledgedAt: new Date(),
            ownerReviewAcknowledgedByUserId: owner.userId,
            operationallyReadyAt: new Date(),
            operationallyReadyByUserId: owner.userId,
          },
        },
      },
    });
    for (const [actor, role] of [
      [owner, "OWNER"],
      [coach, "COACH"],
      [client, "CUSTOMER"],
      [appointmentClient, "CUSTOMER"],
    ] as const)
      await prisma.workspaceUser.create({
        data: {
          id: actor === coach ? coachStaffId : `${actor.userId}-role`,
          workspaceId,
          userId: actor.userId,
          role,
        },
      });
    await createFixtureCoachingBookingPolicy(prisma, workspaceId, owner.userId);
    await prisma.member.create({
      data: {
        id: clientMemberId,
        workspaceId,
        userId: client.userId,
        fullName: "Fixture Notes Client",
        email: `${client.userId}@example.test`,
        dateOfBirth: new Date("1990-01-01"),
        status: "ACTIVE",
      },
    });
    const appointmentMemberId = `${prefix}-appointment-member`;
    await prisma.member.create({
      data: {
        id: appointmentMemberId,
        workspaceId,
        userId: appointmentClient.userId,
        fullName: "Fixture Appointment Client",
        email: `${appointmentClient.userId}@example.test`,
        dateOfBirth: new Date("1990-01-01"),
        status: "ACTIVE",
      },
    });
    today = getWorkspaceDateString(new Date(), "UTC");
    notesEnrollment = await enroll(client, clientMemberId, 0);
    appointmentEnrollment = await enroll(
      appointmentClient,
      appointmentMemberId,
      1,
    );
    const startsAt = new Date(`${addDays(today, 3)}T15:00:00Z`);
    availabilityId = (
      await command(coach, "createAvailability", {
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 3600000).toISOString(),
        bufferMinutes: 0,
        virtualUrl: "https://example.test/fictional-meeting",
      })
    ).id;
  });

  test.afterAll(async () => {
    test.setTimeout(600000);
    await deleteFixtureCoachingWorkspace(prisma, workspaceId);
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [owner, coach, client, appointmentClient].map(
            (actor) => actor.userId,
          ),
        },
      },
    });
    await prisma.$disconnect();
  });

  test("coach saves a draft, publishes to the named client, and private content stays out of client and owner views", async ({
    page,
    context,
    browserDiagnostics,
  }) => {
    await login(page, coach, "admin", browserDiagnostics, { path: "/dashboard/coach/today", heading: "Today's classes" });
    await page.goto(
      `${adminBase}/dashboard/coaching/${notesEnrollment}?view=plan`,
    );
    await expect(
      page.getByRole("heading", { name: "Intake and milestones" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Client notes", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Client sections" })
      .getByRole("link", { name: "Notes", exact: true })
      .click();
    await page.getByText("Add a private note", { exact: true }).click();
    const privateForm = page.locator(
      'form:has(input[name="kind"][value="savePrivateNote"])',
    );
    await privateForm
      .getByLabel("Private working note", { exact: true })
      .fill(privateBody);
    const privateSaved = await captureAction(page, () => privateForm
      .getByRole("button", { name: "Save private note", exact: true })
      .click());
    await expect
      .poll(() =>
        prisma.coachingPrivateNote.count({
          where: { enrollmentId: notesEnrollment, body: privateBody },
        }),
      )
      .toBe(1);
    await expect(
      page.locator("p").filter({ hasText: privateBody }),
    ).toHaveCount(1);
    await expect(page).toHaveURL(
      new RegExp(
        `/dashboard/coaching/${notesEnrollment}\\?view=notes&saved=1$`,
      ),
    );
    await expectActionRedirect(page, privateSaved, `${adminBase}/dashboard/coaching/${notesEnrollment}?view=notes&saved=1`);
    if (privateSaved.status() === 200) browserDiagnostics.acknowledgeAction(
      privateSaved, "The exact private note persists once and is rendered in the coach's private notes view.",
    );
    await page.getByText("Write a client note", { exact: true }).click();
    const draftForm = page.locator(
      'form:has(input[name="kind"][value="saveDailyNote"])',
    );
    await draftForm
      .getByLabel("Note for Fixture Notes Client", { exact: true })
      .fill(noteBody);
    const draftSaved = await captureAction(page, () => draftForm
      .getByRole("button", { name: "Save draft", exact: true })
      .click());
    // The return URL is unchanged after another successful note action. Wait
    // for this draft and its rendered publish form rather than the old URL.
    await expect
      .poll(() =>
        prisma.coachingDailyNote.count({
          where: { enrollmentId: notesEnrollment, draftBody: noteBody },
        }),
      )
      .toBe(1);
    await expect(
      page.getByRole("button", { name: "Publish to client", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(
        `/dashboard/coaching/${notesEnrollment}\\?view=notes&saved=1$`,
      ),
    );
    const draft = await prisma.coachingDailyNote.findFirstOrThrow({
      where: { enrollmentId: notesEnrollment },
    });
    expect(draft.draftBody).toBe(noteBody);
    expect(draft.publishedAt).toBeNull();
    await expectActionRedirect(page, draftSaved, `${adminBase}/dashboard/coaching/${notesEnrollment}?view=notes&saved=1`);
    if (draftSaved.status() === 200) browserDiagnostics.acknowledgeAction(
      draftSaved, "The exact draft persists unpublished and its rendered publish form is visible.",
    );

    const clientPage = await context.newPage();
    await login(clientPage, client, "member", browserDiagnostics, { path: `/app/coaching/${encodeURIComponent(notesEnrollment)}?view=notes`, heading: "My day" });
    await expect(clientPage).toHaveURL(new RegExp(`/app/coaching/${notesEnrollment}\\?view=notes$`));
    await expect(
      clientPage.getByRole("heading", { name: "My day", exact: true }).first(),
    ).toBeVisible();
    expect(await clientPage.content()).not.toContain(noteBody);
    expect(await clientPage.content()).not.toContain(privateBody);

    const publishForm = page.locator(
      'form:has(input[name="kind"][value="publishDailyNote"])',
    );
    await publishForm.locator('input[name="confirmPublish"]').check();
    const published = await captureAction(page, () => publishForm
      .getByRole("button", { name: "Publish to client", exact: true })
      .click());
    await expect(page).toHaveURL(
      new RegExp(
        `/dashboard/coaching/${notesEnrollment}\\?view=notes&saved=1$`,
      ),
    );
    await expect
      .poll(() =>
        prisma.coachingDailyNoteRevision.count({ where: { noteId: draft.id } }),
      )
      .toBe(1);
    await expect(
      page.getByRole("button", { name: "Publish amendment", exact: true }),
    ).toBeVisible();
    await expectActionRedirect(page, published, `${adminBase}/dashboard/coaching/${notesEnrollment}?view=notes&saved=1`);
    if (published.status() === 200) browserDiagnostics.acknowledgeAction(
      published, "One exact published note revision persists and the coach's amendment form is rendered.",
    );
    await clientPage.reload();
    await expect(
      clientPage.getByText(noteBody, { exact: true }).first(),
    ).toBeVisible();
    expect(await clientPage.content()).not.toContain(privateBody);
    await clientPage
      .getByRole("navigation", { name: "Coaching sections" })
      .getByRole("link", { name: "My program", exact: true })
      .click();
    await expect(
      clientPage.getByRole("heading", {
        name: "My program records",
        exact: true,
      }),
    ).toBeVisible();
    // Previously authorized RSC payloads can remain in document scripts after
    // client navigation. The focused program view must omit note content.
    await expect(clientPage.getByText(noteBody, { exact: true })).toHaveCount(
      0,
    );
    await clientPage.waitForLoadState("networkidle");

    await page.context().clearCookies({ name: "flowstate_admin_session" });
    await login(page, owner, "admin", browserDiagnostics, { path: "/dashboard", heading: "Today" });
    await page.goto(
      `${adminBase}/dashboard/coaching/${notesEnrollment}?view=notes`,
    );
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/coaching/${notesEnrollment}\\?view=plan$`),
    );
    expect(await page.content()).not.toContain(privateBody);
    expect(await page.content()).not.toContain(noteBody);
    const notices = await prisma.notificationJob.findMany({
      where: { workspaceId, subject: "A coaching note is ready" },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]!.body).not.toContain(noteBody);
    expect(notices[0]!.body).not.toContain(privateBody);
    browserDiagnostics.assertNoExternalRequests();
  });

  test("appointment-enabled client books and cancels from the focused appointment view with one unit outcome", async ({
    page,
    browserDiagnostics,
  }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    await login(page, appointmentClient, "member", browserDiagnostics, { path: `/app/coaching/${encodeURIComponent(appointmentEnrollment)}?view=notes`, heading: "My day" });
    await page.goto(
      `${memberBase}/app/coaching/${appointmentEnrollment}?view=appointments`,
    );
    await expect(
      page.getByRole("heading", { name: "My appointment", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Published notes", exact: true }),
    ).toHaveCount(0);
    const bookingForm = page.locator(
      'form:has(input[name="kind"][value="bookAppointment"])',
    );
    await bookingForm
      .getByRole("combobox", { name: "Available time", exact: true })
      .selectOption(availabilityId);
    const booked = await captureAction(page, () => bookingForm
      .getByRole("button", { name: "Book appointment", exact: true })
      .click());
    await expect
      .poll(() =>
        prisma.coachingAppointment.count({
          where: { enrollmentId: appointmentEnrollment, status: "BOOKED" },
        }),
      )
      .toBe(1);
    await expect(
      page.getByText("Cancel appointment", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(
        `/app/coaching/${appointmentEnrollment}\\?view=appointments&saved=1$`,
      ),
    );
    const appointment = await prisma.coachingAppointment.findFirstOrThrow({
      where: { enrollmentId: appointmentEnrollment, status: "BOOKED" },
    });
    expect(appointment.unitState).toBe("HELD");
    await expectActionRedirect(page, booked, `${memberBase}/app/coaching/${appointmentEnrollment}?view=appointments&saved=1`);
    if (booked.status() === 200) browserDiagnostics.acknowledgeAction(
      booked, "One appointment is booked with a held unit and its cancel control is rendered.",
    );
    await page.getByText("Cancel appointment", { exact: true }).click();
    const cancelForm = page.locator(
      'form:has(input[name="kind"][value="cancelAppointment"])',
    );
    await cancelForm
      .getByLabel("Reason", { exact: true })
      .fill("Fictional timely cancellation");
    const cancelled = await captureAction(page, () => cancelForm
      .getByRole("button", { name: "Confirm cancellation", exact: true })
      .click());
    await expect(page).toHaveURL(
      new RegExp(
        `/app/coaching/${appointmentEnrollment}\\?view=appointments&saved=1$`,
      ),
    );
    await expect
      .poll(
        async () =>
          (
            await prisma.coachingAppointment.findUniqueOrThrow({
              where: { id: appointment.id },
            })
          ).unitState,
      )
      .toBe("RELEASED");
    await expect(
      page.getByText("Cancel appointment", { exact: true }),
    ).toHaveCount(0);
    expect(
      await prisma.coachingAppointment.count({
        where: { enrollmentId: appointmentEnrollment, status: "BOOKED" },
      }),
    ).toBe(0);
    await expectActionRedirect(page, cancelled, `${memberBase}/app/coaching/${appointmentEnrollment}?view=appointments&saved=1`);
    if (cancelled.status() === 200) browserDiagnostics.acknowledgeAction(
      cancelled, "The appointment unit is released, no booked appointments remain, and its cancel control is absent.",
    );
    browserDiagnostics.assertNoExternalRequests();
  });

  test("notes-only client has direct day and program navigation and old appointment links resolve to the program", async ({
    page,
    browserDiagnostics,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, client, "member", browserDiagnostics, { path: `/app/coaching/${encodeURIComponent(notesEnrollment)}?view=notes`, heading: "My day" });
    await page.goto(
      `${memberBase}/app/coaching/${notesEnrollment}?view=appointments`,
    );
    await expect(page).toHaveURL(
      new RegExp(`/app/coaching/${notesEnrollment}\\?view=program$`),
    );
    await expect(
      page
        .getByRole("navigation", { name: "Coaching sections" })
        .getByRole("link", { name: "My appointment", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Coaching sections" })
      .getByRole("link", { name: "My day", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "My day", exact: true }).first(),
    ).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    await expect(
      page.getByRole("heading", { name: "My program records", exact: true }),
    ).toHaveCount(0);
    browserDiagnostics.assertNoExternalRequests();
  });
});
