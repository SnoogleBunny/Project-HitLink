import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PrismaClient,
  createEmailNotificationAdapter,
  createDevelopmentNotificationAdapter,
  enqueueNotificationJob,
  processNotificationOutbox,
  NotificationDeliveryError,
  type NotificationDeliveryAdapter,
} from "@flowstate/db";
const testUrl = process.env.TEST_DATABASE_URL;
(testUrl ? describe : describe.skip)("notification delivery recovery", () => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const gyms: string[] = [],
    users: string[] = [];
  let gym: string, now: Date;
  beforeEach(async () => {
    now = new Date();
    const user = await db.user.create({
      data: { email: `outbox-${randomUUID()}@example.test` },
    });
    users.push(user.id);
    gym = (
      await db.workspace.create({
        data: {
          name: "Outbox test",
          status: "ACTIVE",
          migration: {
            create: {
              stage: "COMPLETE",
              nextOwnerAction: "Ready",
              flowstateResponsibility: "Ready",
              ownerReviewAcknowledgedAt: now,
              ownerReviewAcknowledgedByUserId: user.id,
              operationallyReadyAt: now,
              operationallyReadyByUserId: user.id,
            },
          },
        },
      })
    ).id;
    gyms.push(gym);
  });
  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: gyms } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  const queue = (dedupeKey: string = randomUUID(), expiresAt?: Date) =>
    enqueueNotificationJob({
      db,
      now,
      input: {
        workspaceId: gym,
        templateKind: "ANNOUNCEMENT",
        recipientEmail: "recipient@example.test",
        subject: "Account update",
        body: "Open the member portal.",
        dedupeKey,
        expiresAt,
      },
    });
  it("retains one job under duplicate enqueue and one claim under concurrent workers", async () => {
    const jobs = await Promise.all([queue("same-event"), queue("same-event")]);
    expect(jobs[0]!.notificationJobId).toBe(jobs[1]!.notificationJobId);
    const adapter = {
      send: vi.fn(async () => ({
        status: "sent" as const,
        providerMessageId: "mail_one",
      })),
    };
    await Promise.all([
      processNotificationOutbox({ db, workspaceId: gym, adapter, now }),
      processNotificationOutbox({ db, workspaceId: gym, adapter, now }),
    ]);
    expect(adapter.send).toHaveBeenCalledTimes(1);
    expect(
      (
        await db.notificationJob.findUniqueOrThrow({
          where: { id: jobs[0]!.notificationJobId },
        })
      ).status,
    ).toBe("SENT");
  });
  it("retries transient failures with the same job and keeps permanent failures visible", async () => {
    const { notificationJobId } = await queue();
    const adapter = {
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error("Network uncertain"))
        .mockResolvedValue({
          status: "sent",
          providerMessageId: "mail_recovered",
        }),
    };
    expect(
      (await processNotificationOutbox({ db, workspaceId: gym, adapter, now }))
        .failedCount,
    ).toBe(1);
    await processNotificationOutbox({
      db,
      workspaceId: gym,
      adapter,
      now: new Date(now.getTime() + 2 * 60_000),
    });
    expect(adapter.send.mock.calls[0]![0].id).toBe(
      adapter.send.mock.calls[1]![0].id,
    );
    expect(
      (
        await db.notificationJob.findUniqueOrThrow({
          where: { id: notificationJobId },
        })
      ).attempts,
    ).toBe(2);
    const terminal = await queue();
    await processNotificationOutbox({
      db,
      workspaceId: gym,
      adapter: {
        send: async () => {
          throw new NotificationDeliveryError("Invalid recipient", false);
        },
      },
      now,
    });
    expect(
      await db.notificationJob.findUniqueOrThrow({
        where: { id: terminal.notificationJobId },
      }),
    ).toMatchObject({
      status: "FAILED",
      nextAttemptAt: null,
      lastError: "Email delivery needs review.",
    });
  });
  it("recovers an abandoned lease and prevents its late receipt from overwriting the new attempt", async () => {
    const { notificationJobId } = await queue();
    let release!: (value: {
      status: "sent";
      providerMessageId: string;
    }) => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = processNotificationOutbox({
      db,
      workspaceId: gym,
      now,
      adapter: {
        send: async () => {
          entered();
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      },
    });
    await gate;
    await processNotificationOutbox({
      db,
      workspaceId: gym,
      now: new Date(now.getTime() + 6 * 60_000),
      adapter: {
        send: async () => ({
          status: "sent",
          providerMessageId: "current_receipt",
        }),
      },
    });
    release({ status: "sent", providerMessageId: "stale_receipt" });
    expect((await first).sentCount).toBe(0);
    expect(
      await db.notificationJob.findUniqueOrThrow({
        where: { id: notificationJobId },
      }),
    ).toMatchObject({
      providerMessageId: "current_receipt",
      attempts: 2,
      status: "SENT",
    });
  });
  it("suppresses expired and superseded messages, blocks staging and rejects simulated delivery", async () => {
    const expired = await queue("expired", new Date(now.getTime() - 1));
    const obsolete = await queue("obsolete");
    const adapter: NotificationDeliveryAdapter = {
      send: vi.fn(async () => ({
        status: "sent" as const,
        providerMessageId: "never",
      })),
    };
    await processNotificationOutbox({
      db,
      workspaceId: gym,
      adapter,
      now,
      shouldSend: async () => false,
    });
    expect(adapter.send).not.toHaveBeenCalled();
    expect(
      await db.notificationJob.count({
        where: {
          id: { in: [expired.notificationJobId, obsolete.notificationJobId] },
          status: "CANCELLED",
        },
      }),
    ).toBe(2);
    await queue();
    await db.workspace.update({
      where: { id: gym },
      data: { status: "SETUP_INCOMPLETE" },
    });
    await processNotificationOutbox({ db, workspaceId: gym, adapter, now });
    expect(adapter.send).not.toHaveBeenCalled();
    await expect(
      processNotificationOutbox({
        db,
        workspaceId: gym,
        adapter: createDevelopmentNotificationAdapter(),
        now,
      }),
    ).rejects.toThrow("Simulated");
  });
  it("makes an interrupted final attempt visible for manual review", async () => {
    const { notificationJobId } = await queue();
    await db.notificationJob.update({
      where: { id: notificationJobId },
      data: {
        status: "SENDING",
        attempts: 6,
        nextAttemptAt: new Date(now.getTime() - 1),
      },
    });
    const adapter: NotificationDeliveryAdapter = {
      send: vi.fn(async () => ({
        status: "sent" as const,
        providerMessageId: "never",
      })),
    };
    await processNotificationOutbox({ db, workspaceId: gym, adapter, now });
    expect(adapter.send).not.toHaveBeenCalled();
    expect(
      await db.notificationJob.findUniqueOrThrow({
        where: { id: notificationJobId },
      }),
    ).toMatchObject({ status: "FAILED", attempts: 6, nextAttemptAt: null });
  });
  it("uses a stable provider idempotency key and requires a real provider receipt", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "mail_1" }))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({}));
    const adapter = createEmailNotificationAdapter({
      apiKey: "test-key",
      from: "Gym <gym@example.test>",
      fetcher,
    });
    const job = {
      id: "same-job",
      workspaceId: gym,
      recipientEmail: "recipient@example.test",
      recipientName: null,
      subject: "Notice",
      body: "Open your portal",
      attempts: 1,
    };
    await adapter.send(job);
    await expect(adapter.send(job)).rejects.toThrow("provider");
    await expect(adapter.send(job)).rejects.toThrow("receipt");
    expect(fetcher.mock.calls[0]![1].headers["Idempotency-Key"]).toBe(
      fetcher.mock.calls[1]![1].headers["Idempotency-Key"],
    );
  });
});
