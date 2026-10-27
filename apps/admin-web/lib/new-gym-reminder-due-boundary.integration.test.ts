import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  processClassBookingReminders,
  shouldDeliverNotification,
  updateClassReminderSettings,
} from "@flowstate/db";
import { noticeFixtures } from "../tests/class-booking-notification-fixture";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const target = new URL(testUrl);
  if (
    process.env.DATABASE_URL !== testUrl ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    !/^\/[A-Za-z0-9_]+_test$/.test(target.pathname) ||
    target.searchParams.has("host") ||
    target.searchParams.has("hostaddr")
  )
    throw new Error("Reminder boundary tests require identical loopback *_test database URLs.");
}

(testUrl ? describe : describe.skip)("fresh onboarding's 24-hour version0 reminder boundary", () => {
  let fixtures: ReturnType<typeof noticeFixtures> | undefined;
  beforeAll(() => { fixtures = noticeFixtures(); });
  afterEach(async () => { await fixtures?.cleanup(); });
  afterAll(async () => { await fixtures?.disconnect(); });

  it.each([false, true])("queues one due reminder for trial=%s using the persisted new-gym default", async (trial) => {
    const { db, fixture } = fixtures!;
    const f = await fixture({ freshOnboarding: true });
    const workspaceId = f.workspace.id;
    const originalSettings = await db.workspaceSetting.findUniqueOrThrow({
      where: { workspaceId },
      select: { classReminderLeadMinutes: true, classReminderVersion: true },
    });
    expect(originalSettings).toEqual({ classReminderLeadMinutes: 1440, classReminderVersion: 0 });
    expect(await db.workspaceDataEvent.count({ where: { workspaceId, kind: "CLASS_REMINDER_SETTINGS_CHANGED" } })).toBe(0);
    expect(await db.workspaceUser.findUniqueOrThrow({ where: { userId: f.account.id } }))
      .toMatchObject({ workspaceId, role: "CUSTOMER", isActive: true });
    expect(f.member.userId).toBe(f.account.id);
    if (trial) await db.member.update({ where: { id: f.member.id }, data: { status: "TRIAL" } });
    const booked = await f.book({ trial });
    expect(booked.status).toBe("created");
    if (booked.status !== "created") throw new Error("Expected a canonical fresh booking.");
    const booking = await db.classBooking.findUniqueOrThrow({ where: { id: booked.bookingId } });
    expect(booking).toMatchObject({
      workspaceId, status: "BOOKED", fundingRevision: 1,
      bookingType: trial ? "TRIAL" : "MEMBERSHIP",
      fundingMembershipId: trial ? null : f.membership.id,
    });
    const reminders = () => db.notificationJob.findMany({
      where: { workspaceId, templateKind: "CLASS_REMINDER" }, orderBy: { id: "asc" },
    });
    const sweep = (at: Date) => processClassBookingReminders({ workspaceId, db, now: at, limit: 2 });
    // The fixture's actual dated occurrence is Monday 2030-01-07, 18:00 UTC.
    const startsAt = new Date("2030-01-07T18:00:00Z");
    const due = new Date(+startsAt - 24 * 60 * 60_000);
    for (const at of [new Date(+startsAt - 25 * 60 * 60_000), new Date(+due - 1)]) {
      expect(await sweep(at)).toMatchObject({ configured: true, queued: 0, nextCursor: null });
      expect(await reminders()).toEqual([]);
    }
    expect(await sweep(due)).toMatchObject({ configured: true, queued: 1, nextCursor: null });
    const jobs = await reminders();
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    expect(job).toMatchObject({
      status: "PENDING", attempts: 0, providerMessageId: null, sentAt: null,
      classNoticeDeliveryStartedAt: null, recipientEmail: f.account.email,
      subject: trial ? "Your trial class reminder" : "Your class reminder",
      expiresAt: startsAt,
      context: {
        kind: "CLASS_SERVICE_NOTICE", notice: "REMINDER", bookingId: booking.id,
        fundingRevision: 1, settingsVersion: 0,
      },
    });
    const context = job.context as Record<string, unknown>;
    expect(context.detailsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(job.dedupeKey).toBe(`class-reminder:${booking.id}:1:0:${context.detailsHash}:${f.account.email.toLowerCase()}`);
    expect(await shouldDeliverNotification(job, db, due)).toBe(true);
    expect(await sweep(due)).toMatchObject({ configured: true, queued: 0, nextCursor: null });
    expect(await reminders()).toEqual(jobs);
    expect(await db.workspaceSetting.findUniqueOrThrow({ where: { workspaceId }, select: { classReminderLeadMinutes: true, classReminderVersion: true } })).toEqual(originalSettings);

    await expect(updateClassReminderSettings({
      actor: { workspaceId, userId: f.owner.id }, expectedVersion: 0,
      leadMinutes: "OFF", reason: "Fictional owner explicitly disables the initial default", db,
    })).resolves.toEqual({ version: 1, leadMinutes: null });
    expect(await sweep(due)).toEqual({ configured: false, scanned: 0, queued: 0, nextCursor: null });
    expect(await shouldDeliverNotification(job, db, due)).toBe(false);
    const cancelled = await reminders();
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toMatchObject({
      id: job.id, dedupeKey: job.dedupeKey, body: job.body, context: job.context,
      status: "CANCELLED", nextAttemptAt: null, classNoticeDeliveryStartedAt: null,
    });
    expect(await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } })).toEqual(booking);
  });
});
