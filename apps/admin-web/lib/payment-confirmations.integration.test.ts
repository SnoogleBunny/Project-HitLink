import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  PrismaClient,
  issuePaymentConfirmationTx,
  getPaymentConfirmation,
  queuePaymentConfirmationCopy,
  retryFailedNotification,
  processNotificationOutbox,
  shouldDeliverNotification,
} from "@flowstate/db";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "verified payment confirmation and attributable delivery recovery",
  () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const gyms: string[] = [],
      users: string[] = [];
    afterAll(async () => {
      for (const workspaceId of gyms)
        await db.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(
            "SELECT set_config('hitlink.reviewed_retention_workspace', $1, true)",
            workspaceId,
          );
          await tx.paymentConfirmation.deleteMany({ where: { workspaceId } });
          await tx.financialReviewCase.deleteMany({ where: { workspaceId } });
          await tx.payment.deleteMany({ where: { workspaceId } });
          await tx.financialAccount.deleteMany({ where: { workspaceId } });
          await tx.workspace.deleteMany({ where: { id: workspaceId } });
        });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    async function fixture() {
      const actors = await Promise.all(
        ["owner", "coach", "payer", "other"].map(async (role) => {
          const user = await db.user.create({
            data: {
              email: `${role}-${randomUUID()}@confirmation.example.test`,
              fullName: `Fictional ${role}`,
            },
          });
          users.push(user.id);
          return user;
        }),
      );
      const [owner, coach, payer, other] = actors as [
        (typeof actors)[number],
        (typeof actors)[number],
        (typeof actors)[number],
        (typeof actors)[number],
      ];
      const now = new Date();
      const gym = await db.workspace.create({
        data: {
          name: "Fictional Receipt Gym",
          status: "ACTIVE",
          location: { create: { name: "Gym", timezone: "UTC" } },
          workspaceUsers: {
            create: actors.map((user) => ({
              userId: user.id,
              role:
                user.id === owner.id
                  ? "OWNER"
                  : user.id === coach.id
                    ? "COACH"
                    : "CUSTOMER",
            })),
          },
          migration: {
            create: {
              stage: "COMPLETE",
              nextOwnerAction: "Fictional test ready",
              flowstateResponsibility: "Fictional test",
              ownerReviewAcknowledgedAt: now,
              ownerReviewAcknowledgedByUserId: owner.id,
              operationallyReadyAt: now,
              operationallyReadyByUserId: owner.id,
            },
          },
        },
      });
      gyms.push(gym.id);
      const member = await db.member.create({
        data: {
          workspaceId: gym.id,
          userId: payer.id,
          fullName: "Fictional payer",
          status: "ACTIVE",
        },
      });
      const child = await db.member.create({
        data: {
          workspaceId: gym.id,
          fullName: "Fictional child",
          status: "ACTIVE",
        },
      });
      const account = await db.financialAccount.create({
        data: { workspaceId: gym.id, userId: payer.id, memberId: member.id },
      });
      const payment = await db.payment.create({
        data: {
          workspaceId: gym.id,
          payerAccountId: account.id,
          memberId: child.id,
          status: "SUCCEEDED",
          amountCents: 12345,
          currency: "cad",
          paidAt: now,
          stripePaymentIntentId: `pi_${randomUUID()}`,
        },
      });
      return {
        workspaceId: gym.id,
        owner,
        coach,
        payer,
        other,
        member,
        child,
        account,
        payment,
        now,
      };
    }
    async function issue(f: Awaited<ReturnType<typeof fixture>>) {
      return (await db.$transaction((tx) =>
        issuePaymentConfirmationTx(tx, {
          paymentId: f.payment.id,
          description: "Accepted class pack",
          now: f.now,
        }),
      ))!;
    }
    async function original(workspaceId: string) {
      return db.notificationJob.findFirstOrThrow({
        where: {
          workspaceId,
          context: { path: ["kind"], equals: "PAYMENT_CONFIRMATION" },
        },
      });
    }
    const ownerActor = (f: Awaited<ReturnType<typeof fixture>>) => ({
      kind: "OWNER" as const,
      workspaceId: f.workspaceId,
      userId: f.owner.id,
    });
    it("atomically deduplicates concurrent confirmation and mail, preserves frozen values after catalog/business changes", async () => {
      const f = await fixture();
      const result = await Promise.all([issue(f), issue(f)]);
      expect(result[0].id).toBe(result[1].id);
      expect(
        await db.paymentConfirmation.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(1);
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(1);
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId: f.workspaceId,
            kind: "PAYMENT_CONFIRMATION_CREATED",
          },
        }),
      ).toBe(1);
      await db.workspace.update({
        where: { id: f.workspaceId },
        data: { name: "Renamed gym" },
      });
      expect((await issue(f)).snapshot).toEqual(result[0].snapshot);
      const mail = await original(f.workspaceId);
      expect(mail.recipientEmail).toBe(f.payer.email);
      expect(mail.body).toContain("Fictional child");
      expect(mail.body).toContain("Accepted class pack");
      expect(mail.providerMessageId).toBeNull();
      expect(await shouldDeliverNotification(mail, db)).toBe(true);
    });
    it("rolls back confirmation, job and evidence with the settlement transaction", async () => {
      const f = await fixture();
      await expect(
        db.$transaction(async (tx) => {
          await issuePaymentConfirmationTx(tx, {
            paymentId: f.payment.id,
            description: "Pack",
          });
          throw new Error("forced rollback");
        }),
      ).rejects.toThrow("forced rollback");
      expect(
        await db.paymentConfirmation.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
      expect(
        await db.notificationJob.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
    });
    it("does not fabricate online confirmations for imported, zero-money, pending or unbound-payer evidence", async () => {
      const f = await fixture();
      for (const change of [
        { source: "IMPORTED" as const },
        { amountCents: 0 },
        { status: "PENDING" as const },
        { stripePaymentIntentId: null },
        { payerAccountId: null },
      ]) {
        const payment = await db.payment.create({
          data: {
            workspaceId: f.workspaceId,
            payerAccountId: f.account.id,
            memberId: f.child.id,
            status: "SUCCEEDED",
            amountCents: 1000,
            currency: "cad",
            paidAt: f.now,
            stripePaymentIntentId: `pi_${randomUUID()}`,
            ...change,
          },
        });
        expect(
          await db.$transaction((tx) =>
            issuePaymentConfirmationTx(tx, {
              paymentId: payment.id,
              description: "Payment",
            }),
          ),
        ).toBeNull();
      }
      expect(
        await db.paymentConfirmation.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
      expect(
        await db.financialReviewCase.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(1);
    });
    it("enforces current exact payer/tenant and owner authority rather than child or coach access", async () => {
      const f = await fixture(),
        foreign = await fixture(),
        receipt = await issue(f);
      expect(
        (
          await getPaymentConfirmation({
            db,
            actor: {
              kind: "PAYER",
              workspaceId: f.workspaceId,
              userId: f.payer.id,
            },
            confirmationId: receipt.id,
          })
        ).id,
      ).toBe(receipt.id);
      for (const actor of [
        {
          kind: "PAYER" as const,
          workspaceId: f.workspaceId,
          userId: f.other.id,
        },
        {
          kind: "OWNER" as const,
          workspaceId: f.workspaceId,
          userId: f.coach.id,
        },
        ownerActor(foreign),
      ])
        await expect(
          getPaymentConfirmation({ db, actor, confirmationId: receipt.id }),
        ).rejects.toThrow();
      await db.workspaceUser.updateMany({
        where: { workspaceId: f.workspaceId, userId: f.owner.id },
        data: { isActive: false },
      });
      await expect(
        queuePaymentConfirmationCopy({
          db,
          actor: ownerActor(f),
          confirmationId: receipt.id,
          operationId: randomUUID(),
        }),
      ).rejects.toThrow();
    });
    it("creates one intentional copy per authorized operation, preserves original delivery, and suppresses stale recipient email", async () => {
      const f = await fixture(),
        receipt = await issue(f),
        initial = await original(f.workspaceId),
        operationId = randomUUID();
      const copies = await Promise.all(
        [0, 1].map(() =>
          queuePaymentConfirmationCopy({
            db,
            actor: ownerActor(f),
            confirmationId: receipt.id,
            operationId,
          }),
        ),
      );
      expect(copies[0]!.notificationJobId).toBe(copies[1]!.notificationJobId);
      expect(copies[0]!.notificationJobId).not.toBe(initial.id);
      expect(
        await db.notificationJob.findUniqueOrThrow({
          where: { id: initial.id },
        }),
      ).toEqual(initial);
      await db.user.update({
        where: { id: f.payer.id },
        data: { email: `changed-${randomUUID()}@example.test` },
      });
      expect(await shouldDeliverNotification(initial, db)).toBe(false);
      await expect(
        queuePaymentConfirmationCopy({
          db,
          actor: ownerActor(f),
          confirmationId: receipt.id,
          operationId,
        }),
      ).rejects.toThrow("request changed");
      const fresh = await queuePaymentConfirmationCopy({
        db,
        actor: ownerActor(f),
        confirmationId: receipt.id,
        operationId: randomUUID(),
      });
      expect(
        (
          await db.notificationJob.findUniqueOrThrow({
            where: { id: fresh.notificationJobId },
          })
        ).recipientEmail,
      ).not.toBe(initial.recipientEmail);
    });
    it("retains a monotonic attempt fence across exhausted-delivery manual retry and never repeats money or access effects", async () => {
      const f = await fixture();
      await issue(f);
      const job = await original(f.workspaceId);
      await db.notificationJob.update({
        where: { id: job.id },
        data: { attempts: 5, nextAttemptAt: f.now },
      });
      let release!: (value: {
          status: "sent";
          providerMessageId: string;
        }) => void,
        entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const old = processNotificationOutbox({
        db,
        workspaceId: f.workspaceId,
        now: f.now,
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
      const later = new Date(f.now.getTime() + 6 * 60000);
      await processNotificationOutbox({
        db,
        workspaceId: f.workspaceId,
        now: later,
        adapter: {
          send: async () => {
            throw new Error("exhausted job must not send");
          },
        },
      });
      const failed = await db.notificationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(failed).toMatchObject({
        status: "FAILED",
        attempts: 6,
        nextAttemptAt: null,
      });
      const args = {
        db,
        workspaceId: f.workspaceId,
        actorUserId: f.owner.id,
        notificationJobId: job.id,
        expectedUpdatedAt: failed.updatedAt,
        operationId: randomUUID(),
        reason: "Reviewed uncertain provider response",
        now: later,
      };
      await Promise.all([
        retryFailedNotification(args),
        retryFailedNotification(args),
      ]);
      const afterRetry = await db.notificationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(afterRetry).toMatchObject({
        attempts: 6,
        attemptLimit: 12,
        body: job.body,
        recipientEmail: job.recipientEmail,
      });
      const adapter = {
        send: vi.fn(async () => ({
          status: "sent" as const,
          providerMessageId: "mail_new_attempt",
        })),
      };
      await processNotificationOutbox({
        db,
        workspaceId: f.workspaceId,
        now: later,
        adapter,
      });
      release({ status: "sent", providerMessageId: "mail_stale_attempt" });
      await old;
      expect(
        await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).toMatchObject({
        status: "SENT",
        attempts: 7,
        providerMessageId: "mail_new_attempt",
      });
      expect(adapter.send).toHaveBeenCalledTimes(1);
      expect(
        await db.payment.count({ where: { workspaceId: f.workspaceId } }),
      ).toBe(1);
      expect(
        await db.classBooking.count({ where: { workspaceId: f.workspaceId } }),
      ).toBe(0);
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId: f.workspaceId,
            kind: "NOTIFICATION_RETRY_REQUESTED",
          },
        }),
      ).toBe(1);
    });
    it("rejects stale, superseded, in-flight and foreign retry requests without reopening a delivery", async () => {
      const f = await fixture(),
        foreign = await fixture();
      await issue(f);
      const job = await original(f.workspaceId);
      const failed = await db.notificationJob.update({
        where: { id: job.id },
        data: { status: "FAILED", nextAttemptAt: null, attempts: 6 },
      });
      const args = {
        db,
        workspaceId: f.workspaceId,
        actorUserId: f.owner.id,
        notificationJobId: job.id,
        expectedUpdatedAt: failed.updatedAt,
        operationId: randomUUID(),
        reason: "Reviewed",
      };
      await expect(
        retryFailedNotification({ ...args, actorUserId: f.coach.id }),
      ).rejects.toThrow();
      await expect(
        retryFailedNotification({
          ...args,
          workspaceId: foreign.workspaceId,
          actorUserId: foreign.owner.id,
        }),
      ).rejects.toThrow();
      await expect(
        retryFailedNotification({ ...args, expectedUpdatedAt: new Date(0) }),
      ).rejects.toThrow("changed");
      await db.user.update({
        where: { id: f.payer.id },
        data: { email: `new-${randomUUID()}@example.test` },
      });
      await expect(retryFailedNotification(args)).rejects.toThrow("changed");
      await db.notificationJob.update({
        where: { id: job.id },
        data: { status: "SENDING" },
      });
      await expect(
        retryFailedNotification({
          ...args,
          expectedUpdatedAt: (
            await db.notificationJob.findUniqueOrThrow({
              where: { id: job.id },
            })
          ).updatedAt,
        }),
      ).rejects.toThrow();
      expect(
        (await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } }))
          .attemptLimit,
      ).toBe(6);
    });
    it("does not report success without a real adapter receipt and protects immutable confirmation/audit records", async () => {
      const f = await fixture(),
        receipt = await issue(f);
      await processNotificationOutbox({
        db,
        workspaceId: f.workspaceId,
        now: f.now,
        adapter: { send: async () => ({ status: "sent" }) },
      });
      expect((await original(f.workspaceId)).status).toBe("FAILED");
      await expect(
        db.paymentConfirmation.update({
          where: { id: receipt.id },
          data: { amountMinor: 1 },
        }),
      ).rejects.toThrow();
      await expect(
        db.paymentConfirmation.delete({ where: { id: receipt.id } }),
      ).rejects.toThrow();
      const event = await db.workspaceDataEvent.findFirstOrThrow({
        where: {
          workspaceId: f.workspaceId,
          kind: "PAYMENT_CONFIRMATION_CREATED",
        },
      });
      await expect(
        db.workspaceDataEvent.update({
          where: { id: event.id },
          data: { kind: "rewritten" },
        }),
      ).rejects.toThrow();
    });
  },
);
