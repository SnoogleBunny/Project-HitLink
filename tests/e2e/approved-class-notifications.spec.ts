import { loginToWorkspace } from "./support/workspace-login";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@flowstate/auth";
import {
  Prisma,
  PrismaClient,
  addDays,
  getWeekdayForDateString,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  lockClassSchedule,
  normalizeAuthoritySerializationError,
  processClassBookingReminders,
  processNotificationOutbox,
  shouldDeliverNotification,
  snapshotMembershipTerms,
  type NotificationJobRecord,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../packages/db/tests/scheduling-policy-fixture.js";
import {
  deleteReviewedWorkspaceRecords,
  inspectRetentionInventory,
} from "../../packages/db/src/retention-inventory.js";
import {
  expect,
  test,
  type BrowserDiagnosticsCollector,
  type Locator,
  type Page,
} from "./support/browser-diagnostics";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Class-notice browser proof needs an explicit disposable database.");
const target = new URL(databaseUrl);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
  [...target.searchParams.keys()].some((key) => key.toLowerCase() === "host") ||
  !/^[A-Za-z0-9_]+_test$/.test(decodeURIComponent(target.pathname.slice(1))) ||
  (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL !== databaseUrl)
)
  throw new Error("Class-notice browser proof requires one loopback *_test database; DATABASE_URL and TEST_DATABASE_URL must agree when both are set.");

const db = new PrismaClient({ datasourceUrl: databaseUrl });
const adminBase = process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
const memberBase = process.env.FLOWSTATE_MEMBER_E2E_BASE_URL ?? "http://localhost:3101";
const password = "ExplicitClassNoticeFixture123!";
const workspaces: string[] = [];
const users: string[] = [];
const privateSentinel = "CLASS_NOTICE_PRIVATE_NOTES_SENTINEL";

type Fixture = {
  workspaceId: string;
  ownerEmail: string;
  memberEmail: string;
  memberId: string;
  membershipId: string;
  classTemplateId: string;
  date: string;
  startsAt: Date;
  title: string;
};

async function fixture(): Promise<Fixture> {
  const key = `class-notice-${randomUUID()}`;
  const now = new Date();
  const date = addDays(getWorkspaceDateString(now, "UTC"), 7);
  const passwordHash = await hashPassword(password);
  const owner = await db.user.create({
    data: { email: `${key}-owner@example.test`, fullName: "Fictional Notice Owner", passwordHash },
  });
  users.push(owner.id);
  const account = await db.user.create({
    data: { email: `${key}-member@example.test`, fullName: "Fictional Notice Participant", passwordHash },
  });
  users.push(account.id);
  const workspace = await db.workspace.create({
    data: {
      name: key,
      status: "ACTIVE",
      location: {
        create: {
          name: "Fictional notice gym",
          timezone: "UTC",
          addressLine1: "42 Fictional Way",
          city: "Example City",
          countryCode: "CA",
          rooms: { create: { name: "Notice mat", capacity: 8 } },
        },
      },
      workspaceUsers: {
        create: [
          { userId: owner.id, role: "OWNER", isActive: true },
          { userId: account.id, role: "CUSTOMER", isActive: true },
        ],
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Fictional browser handoff complete",
          flowstateResponsibility: "Isolated class notice proof",
          ownerReviewAcknowledgedAt: now,
          ownerReviewAcknowledgedByUserId: owner.id,
          operationallyReadyAt: now,
          operationallyReadyByUserId: owner.id,
        },
      },
    },
    include: { location: { include: { rooms: true } } },
  });
  // Register immediately: a later setup failure still uses canonical scoped cleanup.
  workspaces.push(workspace.id);
  await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
  const member = await db.member.create({
    data: {
      workspaceId: workspace.id,
      userId: account.id,
      email: account.email,
      fullName: "Fictional Notice Participant",
      notes: privateSentinel,
      dateOfBirth: new Date("1990-01-01T00:00:00Z"),
      status: "ACTIVE",
    },
  });
  const program = await db.program.create({
    data: { workspaceId: workspace.id, name: "Fictional notice training" },
  });
  const title = `Fictional notice padwork ${key.slice(-8)}`;
  const template = await db.classTemplate.create({
    data: {
      workspaceId: workspace.id,
      programId: program.id,
      roomId: workspace.location!.rooms[0]!.id,
      title,
      weekday: getWeekdayForDateString(date),
      startTimeMinutes: 1080,
      endTimeMinutes: 1140,
      bookingCutoffMinutes: 60,
      cancellationCutoffMinutes: 120,
    },
  });
  const plan = await db.membershipPlan.create({
    data: {
      workspaceId: workspace.id,
      name: "Fictional notice membership",
      monthlyPriceCents: 10000,
      currency: "cad",
      weeklyClassLimit: 3,
    },
  });
  const membership = await db.memberMembership.create({
    data: {
      workspaceId: workspace.id,
      memberId: member.id,
      membershipPlanId: plan.id,
      status: "ACTIVE",
      startedAt: new Date(+now - 30 * 86400000),
      allowanceAnchorDate: new Date(`${getWorkspaceDateString(now, "UTC")}T00:00:00Z`),
      allowanceTimezone: "UTC",
      acceptedTerms: JSON.parse(JSON.stringify(snapshotMembershipTerms(plan, now))),
    },
  });
  return {
    workspaceId: workspace.id,
    ownerEmail: owner.email,
    memberEmail: account.email,
    memberId: member.id,
    membershipId: membership.id,
    classTemplateId: template.id,
    date,
    startsAt: getZonedDateTimeAsUtc({ dateString: date, minutes: 1080, timezone: "UTC" }),
    title,
  };
}

async function cleanup() {
  while (workspaces.length) {
    const workspaceId = workspaces[0]!;
    for (let attempt = 0; ; attempt++) {
      try {
        await db.$transaction(async (tx) => {
          await lockClassSchedule(tx, workspaceId);
          for (const prefix of ["family-access", "financial", "retention"])
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${workspaceId}`}))::text`;
          const inventory = await inspectRetentionInventory(tx, workspaceId);
          await deleteReviewedWorkspaceRecords(tx, workspaceId, inventory.fingerprint);
        }, { isolationLevel: "Serializable", timeout: 120000 });
        workspaces.shift(); // Drain only after successful canonical purge.
        break;
      } catch (caught) {
        const error = normalizeAuthoritySerializationError(caught);
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 3) throw error;
      }
    }
  }
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  users.splice(0, users.length);
}

async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => { await document.fonts.ready; });
}
async function action(page: Page, control: Locator) {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "POST" && !!candidate.request().headers()["next-action"]),
    control.click(),
  ]);
  expect(response.status()).toBeLessThan(400);
  await settled(page);
  return response;
}
async function login(page: Page, origin: string, email: string, diagnostics: BrowserDiagnosticsCollector) {
  await loginToWorkspace({
    page,
    origin,
    email,
    password,
    expectedRedirect: origin === adminBase ? "/dashboard;push" : "/app;push",
    destination: {
      path: origin === adminBase ? "/dashboard" : "/app/schedule",
      heading: origin === adminBase ? "Today" : "Classes",
    },
    diagnostics,
  });
  // A 303 remains subject to the collector's existing exact document-visit rule.
}
async function openDelivery(page: Page) {
  await page.goto(`${adminBase}/dashboard/settings`);
  await page.getByRole("link", { name: "Email delivery", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Email delivery", exact: true })).toBeVisible();
  await settled(page);
}
const editor = (page: Page) => page.locator('form:has(input[name="expectedVersion"])');
async function draft(page: Page, mode: "ON" | "OFF", minutes: number | null, reason: string) {
  const form = editor(page);
  await form.getByRole("combobox", { name: "Class and trial reminders", exact: true }).selectOption(mode);
  if (mode === "ON") await form.getByLabel("Minutes before class", { exact: true }).fill(String(minutes));
  await form.getByLabel("Reason for change", { exact: true }).fill(reason);
}
async function save(page: Page, diagnostics: BrowserDiagnosticsCollector, copy: string) {
  const response = await action(page, editor(page).getByRole("button", { name: "Save reminder settings", exact: true }));
  await expect(editor(page).getByRole("status")).toContainText(copy);
  if (response.status() === 200) diagnostics.acknowledgeAction(response, "The owner sees the actual reminder settings save result; this is not delivery evidence.");
}
const setting = (f: Fixture) => db.workspaceSetting.findUniqueOrThrow({ where: { workspaceId: f.workspaceId } });
const audits = (f: Fixture) => db.workspaceDataEvent.findMany({ where: { workspaceId: f.workspaceId, kind: "CLASS_REMINDER_SETTINGS_CHANGED" }, orderBy: { id: "asc" } });

async function businessState(f: Fixture) {
  return {
    bookings: await db.classBooking.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } }),
    memberships: await db.memberMembership.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } }),
    allocations: await db.membershipAllowanceAllocation.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } }),
    entries: await db.membershipAllowanceEntry.findMany({ where: { workspaceId: f.workspaceId }, orderBy: { id: "asc" } }),
    payments: await db.payment.count({ where: { workspaceId: f.workspaceId } }),
    invoices: await db.invoice.count({ where: { workspaceId: f.workspaceId } }),
    financialOperations: await db.financialOperation.count({ where: { workspaceId: f.workspaceId } }),
  };
}

test.describe("CM02/CM03 class notice settings and queued booking lifecycle", () => {
  test.setTimeout(120000);
  test.afterEach(cleanup);
  test.afterAll(() => db.$disconnect());

  test("owner explicitly saves off and on, sees persistent feedback and reloads the chosen setting", async ({ page, browserDiagnostics }) => {
    const f = await fixture();
    const before = await businessState(f);
    await login(page, adminBase, f.ownerEmail, browserDiagnostics);
    await openDelivery(page);
    await expect(editor(page).getByRole("combobox", { name: "Class and trial reminders", exact: true })).toHaveValue("OFF");
    await expect(editor(page).locator('input[name="expectedVersion"]')).toHaveValue("0");
    await expect(editor(page).getByLabel("Minutes before class", { exact: true })).toHaveCount(0);
    expect(await db.workspaceSetting.count({ where: { workspaceId: f.workspaceId } })).toBe(0);

    await draft(page, "OFF", null, "Explicit fictional owner decision to keep reminders off.");
    await save(page, browserDiagnostics, "Class and trial reminders are off. Booking confirmations remain enabled.");
    expect(await setting(f)).toMatchObject({ classReminderLeadMinutes: null, classReminderVersion: 1 });
    await page.reload();
    await settled(page);
    await expect(editor(page).getByRole("combobox", { name: "Class and trial reminders", exact: true })).toHaveValue("OFF");
    await expect(editor(page).locator('input[name="expectedVersion"]')).toHaveValue("1");

    await draft(page, "ON", 120, "Fictional owner explicitly chooses a two-hour interval.");
    await save(page, browserDiagnostics, "Class and trial reminders are set for 120 minutes before class.");
    expect(await setting(f)).toMatchObject({ classReminderLeadMinutes: 120, classReminderVersion: 2 });
    await page.reload();
    await settled(page);
    await expect(editor(page).getByLabel("Minutes before class", { exact: true })).toHaveValue("120");
    await expect(editor(page).locator('input[name="expectedVersion"]')).toHaveValue("2");

    await draft(page, "OFF", null, "Fictional owner explicitly turns reminders off again.");
    await save(page, browserDiagnostics, "Class and trial reminders are off.");
    await page.reload();
    await settled(page);
    await expect(editor(page).getByRole("combobox", { name: "Class and trial reminders", exact: true })).toHaveValue("OFF");
    expect(await setting(f)).toMatchObject({ classReminderLeadMinutes: null, classReminderVersion: 3 });
    expect(await audits(f)).toHaveLength(3);
    expect(await businessState(f)).toEqual(before);
  });

  test("a stale owner tab keeps its draft and receives explicit rejection without replacing another saved interval", async ({ page, context, browserDiagnostics }) => {
    const f = await fixture();
    await login(page, adminBase, f.ownerEmail, browserDiagnostics);
    await openDelivery(page);
    const stale = await context.newPage();
    try {
      await stale.goto(`${adminBase}/dashboard/settings/email`);
      await settled(stale);
      await expect(editor(stale).locator('input[name="expectedVersion"]')).toHaveValue("0");
      await draft(stale, "ON", 240, "Earlier fictional owner draft remains four hours.");
      await draft(page, "ON", 60, "Another editor explicitly saves a one-hour interval.");
      await save(page, browserDiagnostics, "Class and trial reminders are set for 60 minutes before class.");
      const beforeSetting = await setting(f), beforeAudit = await audits(f);
      const response = await action(stale, editor(stale).getByRole("button", { name: "Save reminder settings", exact: true }));
      await expect(editor(stale).getByRole("alert")).toHaveText("Reminder settings changed. Reload the current settings before saving.");
      await expect(editor(stale).getByLabel("Minutes before class", { exact: true })).toHaveValue("240");
      await expect(editor(stale).getByLabel("Reason for change", { exact: true })).toHaveValue("Earlier fictional owner draft remains four hours.");
      await expect(editor(stale).locator('input[name="expectedVersion"]')).toHaveValue("0");
      expect(await setting(f)).toEqual(beforeSetting);
      expect(await audits(f)).toEqual(beforeAudit);
      expect(beforeAudit).toHaveLength(1);
      if (response.status() === 200) browserDiagnostics.acknowledgeAction(response, "The stale reminder editor visibly rejects version0 without overwriting saved version1 or creating another audit.");
      await stale.reload();
      await settled(stale);
      await expect(editor(stale).getByLabel("Minutes before class", { exact: true })).toHaveValue("60");
      await expect(editor(stale).locator('input[name="expectedVersion"]')).toHaveValue("1");
    } finally {
      await stale.close();
    }
  });

  test("member UI booking appears in the owner log, then UI cancellation suppresses both queued notices at the actual fictional-adapter outbox boundary", async ({ page, context, browserDiagnostics }, info) => {
    const f = await fixture();
    await login(page, adminBase, f.ownerEmail, browserDiagnostics);
    await openDelivery(page);
    // Explicit fictional window makes this future booking due for the direct producer.
    // It is neither a product default nor evidence of an HTTP scheduler.
    await draft(page, "ON", 20160, "Fictional browser proof explicitly selects fourteen days so the direct worker can inspect this booking now.");
    await save(page, browserDiagnostics, "Class and trial reminders are set for 20,160 minutes before class.");
    const memberPage = await context.newPage();
    try {
      await login(memberPage, memberBase, f.memberEmail, browserDiagnostics);
      await memberPage.goto(`${memberBase}/app/schedule?date=${f.date}`);
      await settled(memberPage);
      expect(await db.classBooking.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
      expect(await db.notificationJob.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
      await memberPage.getByRole("button", { name: new RegExp(`^Book class — ${f.title},`) }).click();
      const review = memberPage.getByRole("dialog", { name: "Review booking", exact: true });
      await expect(review).toContainText("This booking uses Fictional notice membership.");
      const booked = await action(memberPage, review.getByRole("button", { name: "Book class", exact: true }));
      await expect(memberPage.getByText("Your place is booked.", { exact: true })).toBeVisible();
      if (booked.status() === 200) browserDiagnostics.acknowledgeAction(booked, "The actual member UI confirms the committed class reservation.");
      const booking = await db.classBooking.findFirstOrThrow({ where: { workspaceId: f.workspaceId, memberId: f.memberId, classTemplateId: f.classTemplateId } });
      expect(booking).toMatchObject({ status: "BOOKED", bookingType: "MEMBERSHIP", fundingMembershipId: f.membershipId, fundingRevision: 1 });
      const confirmation = await db.notificationJob.findFirstOrThrow({ where: { workspaceId: f.workspaceId, templateKind: "BOOKING_CONFIRMATION" } });
      expect(confirmation).toMatchObject({ status: "PENDING", recipientEmail: f.memberEmail.toLowerCase(), providerMessageId: null, classNoticeDeliveryStartedAt: null, expiresAt: f.startsAt, context: { kind: "CLASS_SERVICE_NOTICE", notice: "CONFIRMATION", bookingId: booking.id, fundingRevision: 1 } });
      expect(confirmation.dedupeKey).toBe(`class-confirmation:${booking.id}:1:${f.memberEmail.toLowerCase()}`);
      const dated = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(f.startsAt);
      for (const detail of ["Fictional Notice Participant", f.title, dated, "19:00 (UTC)", "Fictional notice gym, 42 Fictional Way, Example City, CA", "Room: Notice mat", "No outstanding required forms", "16:00 (UTC)", new URL(`/app/schedule?date=${f.date}`, memberBase).href]) expect(confirmation.body).toContain(detail);
      expect(JSON.stringify({ body: confirmation.body, context: confirmation.context })).not.toContain(privateSentinel);
      expect(await db.notificationJob.count({ where: { workspaceId: f.workspaceId } })).toBe(1);

      await page.reload();
      await settled(page);
      const delivery = page.getByRole("article").filter({ has: page.locator("code", { hasText: confirmation.id }) });
      await expect(delivery.getByRole("heading", { name: "Your class booking is confirmed", exact: true })).toBeVisible();
      await expect(delivery).toContainText(f.memberEmail.toLowerCase());
      await expect(delivery).toContainText("Retry scheduled or in progress");
      await expect(delivery).toContainText("0 delivery attempts");
      await expect(delivery).not.toContainText("Accepted by provider");
      await expect(page.getByRole("heading", { name: "Email delivery is not connected", exact: true })).toBeVisible();

      await test.step("Direct actual reminder producer, without scheduler HTTP or provider calls", async () => {
        expect((await processClassBookingReminders({ db, workspaceId: f.workspaceId, now: new Date() })).queued).toBe(1);
        expect((await processClassBookingReminders({ db, workspaceId: f.workspaceId, now: new Date() })).queued).toBe(0);
      });
      const reminder = await db.notificationJob.findFirstOrThrow({ where: { workspaceId: f.workspaceId, templateKind: "CLASS_REMINDER" } });
      expect(reminder).toMatchObject({ status: "PENDING", recipientEmail: f.memberEmail.toLowerCase(), classNoticeDeliveryStartedAt: null, context: { kind: "CLASS_SERVICE_NOTICE", notice: "REMINDER", bookingId: booking.id, fundingRevision: 1 } });
      expect(await shouldDeliverNotification(confirmation, db, new Date())).toBe(true);
      expect(await shouldDeliverNotification(reminder, db, new Date())).toBe(true);

      await memberPage.goto(`${memberBase}/app/schedule?date=${f.date}&booking=${booking.id}`);
      await memberPage.getByRole("dialog", { name: "Booking details", exact: true }).getByRole("button", { name: "Cancel booking", exact: true }).click();
      const cancelled = await action(memberPage, memberPage.getByRole("dialog", { name: "Cancel booking", exact: true }).getByRole("button", { name: "Confirm cancellation", exact: true }));
      await expect(
        memberPage.getByRole("status").filter({ hasText: /^Booking cancelled\.$/ }),
      ).toBeVisible();
      if (cancelled.status() === 200) browserDiagnostics.acknowledgeAction(cancelled, "The member visibly cancels the exact booking through its current session and UI.");
      expect((await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELLED");
      expect(await db.membershipAllowanceAllocation.count({ where: { workspaceId: f.workspaceId, bookingId: booking.id, state: "RESERVED" } })).toBe(0);
      const beforeWorker = await businessState(f);
      const queued = await db.notificationJob.findMany({ where: { workspaceId: f.workspaceId, id: { in: [confirmation.id, reminder.id] } } });
      expect(queued).toHaveLength(2);
      expect(queued.every((job) => job.status === "PENDING")).toBe(true);
      for (const job of queued) expect(await shouldDeliverNotification(job, db, new Date())).toBe(false);
      const adapterCalls: string[] = [];
      const result = await test.step("Direct actual outbox service with fictional adapter after UI cancellation", () => processNotificationOutbox({
        db,
        workspaceId: f.workspaceId,
        now: new Date(),
        shouldSend: (job) => shouldDeliverNotification(job, db, new Date()),
        adapter: {
          async send(job: NotificationJobRecord) {
            adapterCalls.push(job.id);
            return { status: "sent" as const, providerMessageId: `fictional-forbidden-${job.id}` };
          },
        },
      }));
      expect(result).toMatchObject({ sentCount: 0, failedCount: 0, skippedCount: 2 });
      expect(adapterCalls).toEqual([]);
      expect(await businessState(f)).toEqual(beforeWorker);
      const suppressed = await db.notificationJob.findMany({ where: { workspaceId: f.workspaceId, id: { in: [confirmation.id, reminder.id] } }, orderBy: { id: "asc" } });
      expect(suppressed).toHaveLength(2);
      for (const job of suppressed) expect(job).toMatchObject({ status: "CANCELLED", providerMessageId: null, classNoticeDeliveryStartedAt: null, nextAttemptAt: null });
      expect(suppressed.find((job) => job.id === confirmation.id)!.body).toBe(confirmation.body);
      expect(suppressed.find((job) => job.id === reminder.id)!.body).toBe(reminder.body);
      expect(await db.notificationJob.count({ where: { workspaceId: f.workspaceId } })).toBe(2);
      expect((await processClassBookingReminders({ db, workspaceId: f.workspaceId, now: new Date() })).queued).toBe(0);
      await page.reload();
      await settled(page);
      for (const job of suppressed) await expect(page.getByRole("article").filter({ has: page.locator("code", { hasText: job.id }) })).toContainText("Superseded or expired");
      await info.attach("class-notice-direct-worker-boundary.json", {
        body: Buffer.from(JSON.stringify({ scope: "UI settings/booking/cancellation; direct domain producer/outbox; fictional adapter; no HTTP scheduler or provider acceptance", bookingId: booking.id, confirmationId: confirmation.id, reminderId: reminder.id, result, adapterCalls }, null, 2)),
        contentType: "application/json",
      });
    } finally {
      await memberPage.close();
    }
  });
});
