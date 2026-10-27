import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@flowstate/db";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "atomic account recovery and session revocation",
  () => {
    let db: PrismaClient;
    let auth: typeof import("./index.js");
    const prefix = `account-security-${randomUUID()}`;
    const origin = "https://members.example.test";
    const oldPassword = "Original fixture password 123!";
    const newPassword = "Changed fixture password 456!";
    let oldHash = "",
      sequence = 0;
    const users: string[] = [];
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      const api = await import("@flowstate/db");
      db = api.prisma;
      auth = await import("./index.js");
      oldHash = await auth.hashPassword(oldPassword);
    });
    afterAll(async () => {
      if (db) {
        await db.user.deleteMany({ where: { id: { in: users } } });
        await db.$disconnect();
      }
    });
    async function user() {
      const id = `${prefix}-${++sequence}`,
        email = `${id}@example.test`;
      users.push(id);
      await db.user.create({ data: { id, email, passwordHash: oldHash } });
      return { id, email };
    }
    async function request(
      account: { id: string; email: string },
      now = new Date(),
    ) {
      await auth.requestPasswordReset({
        email: account.email,
        portal: "member",
        resetOrigin: origin,
        db,
        now,
      });
      const challenge = await db.passwordResetChallenge.findFirstOrThrow({
        where: { userId: account.id },
        orderBy: { createdAt: "desc" },
        include: { delivery: true },
      });
      const link = challenge.delivery!.body.match(/https:\/\/\S+/)?.[0];
      const token = new URLSearchParams(new URL(link!).hash.slice(1)).get(
        "token",
      )!;
      return { challenge, token };
    }
    async function session(userId: string) {
      const token = randomBytes(32).toString("hex");
      await db.authSession.create({
        data: {
          userId,
          tokenHash: auth.hashSessionToken(token),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return token;
    }
    it("uses the same public response for known and unknown accounts, queues durable delivery and stores a token hash", async () => {
      const account = await user();
      const known = await auth.requestPasswordReset({
        email: account.email,
        portal: "admin",
        resetOrigin: origin,
        db,
      });
      const unknown = await auth.requestPasswordReset({
        email: `${prefix}-unknown@example.test`,
        portal: "admin",
        resetOrigin: origin,
        db,
      });
      expect(known).toEqual(unknown);
      const challenge = await db.passwordResetChallenge.findFirstOrThrow({
        where: { userId: account.id },
        include: { delivery: true },
      });
      expect(challenge.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(challenge.emailHash).not.toContain(account.email);
      expect(challenge.delivery).toMatchObject({
        status: "PENDING",
        providerMessageId: null,
      });
      expect(
        await db.passwordResetChallenge.count({
          where: { userId: account.id },
        }),
      ).toBe(1);
    });
    it("keeps a queued bearer link out of default Prisma error logs when recovery storage rejects a write", async () => {
      const account = await user();
      const probe = `recovery_log_${randomUUID().replaceAll("-", "")}`;
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${probe}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional recovery storage failure'; END; $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER "${probe}" BEFORE INSERT ON "password_reset_challenges" FOR EACH ROW WHEN (NEW."userId" = '${account.id}') EXECUTE FUNCTION "${probe}"()`,
      );
      const log = vi.spyOn(console, "log").mockImplementation(() => {}),
        error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await expect(
          auth.requestPasswordReset({
            email: account.email,
            portal: "member",
            resetOrigin: origin,
          }),
        ).rejects.toThrow("Fictional recovery storage failure");
        expect(
          JSON.stringify([log.mock.calls, error.mock.calls]),
        ).not.toContain("reset-password#token=");
        expect(
          await db.passwordResetChallenge.count({
            where: { userId: account.id },
          }),
        ).toBe(0);
      } finally {
        log.mockRestore();
        error.mockRestore();
        await db.$executeRawUnsafe(
          `DROP TRIGGER "${probe}" ON "password_reset_challenges"`,
        );
        await db.$executeRawUnsafe(`DROP FUNCTION "${probe}"()`);
      }
    });
    it("serializes request cooldown and applies a three-per-fifteen-minute mailbox limit", async () => {
      const account = await user(),
        now = new Date();
      await Promise.all([request(account, now), request(account, now)]);
      expect(
        await db.passwordResetChallenge.count({
          where: { userId: account.id },
        }),
      ).toBe(1);
      await request(account, new Date(now.getTime() + 120000));
      await request(account, new Date(now.getTime() + 240000));
      await request(account, new Date(now.getTime() + 360000));
      expect(
        await db.passwordResetChallenge.count({
          where: { userId: account.id },
        }),
      ).toBe(3);
      expect(
        await db.passwordResetChallenge.count({
          where: { userId: account.id, invalidatedAt: null },
        }),
      ).toBe(1);
    });
    it("rejects an expired link and a token submitted for a different account without changing either password", async () => {
      const account = await user(),
        other = await user(),
        now = new Date();
      const { token } = await request(account, now);
      expect(
        await auth.resetPassword({
          email: other.email,
          token,
          password: newPassword,
          db,
          now,
        }),
      ).toMatchObject({ status: "invalid" });
      expect(
        await auth.resetPassword({
          email: account.email,
          token,
          password: newPassword,
          db,
          now: new Date(now.getTime() + 31 * 60000),
        }),
      ).toMatchObject({ status: "invalid" });
      for (const id of [account.id, other.id])
        expect(
          (await db.user.findUniqueOrThrow({ where: { id } })).passwordHash,
        ).toBe(oldHash);
    });
    it("accepts one racing reset, rejects reuse, revokes every existing session and preserves other accounts", async () => {
      const account = await user(),
        other = await user();
      const firstToken = await session(account.id),
        secondToken = await session(account.id),
        otherToken = await session(other.id);
      const { token } = await request(account);
      const results = await Promise.all(
        [1, 2].map(() =>
          auth.resetPassword({
            email: account.email,
            token,
            password: newPassword,
            db,
          }),
        ),
      );
      expect(results.map((result) => result.status).sort()).toEqual([
        "invalid",
        "reset",
      ]);
      expect(await auth.getSessionFromToken({ token: firstToken })).toBeNull();
      expect(await auth.getSessionFromToken({ token: secondToken })).toBeNull();
      expect(
        await auth.getSessionFromToken({ token: otherToken }),
      ).toMatchObject({ userId: other.id });
      expect(
        await auth.resetPassword({
          email: account.email,
          token,
          password: newPassword,
          db,
        }),
      ).toMatchObject({ status: "invalid" });
      expect(
        await db.accountSecurityEvent.count({
          where: { userId: account.id, kind: "PASSWORD_RESET_COMPLETED" },
        }),
      ).toBe(1);
      expect(
        await auth.verifyPassword(
          newPassword,
          (await db.user.findUniqueOrThrow({ where: { id: account.id } }))
            .passwordHash,
        ),
      ).toBe(true);
      await expect(
        auth.prismaSessionRepository.create({
          userId: account.id,
          tokenHash: auth.hashSessionToken("checked-before-reset"),
          expiresAt: new Date(Date.now() + 3600000),
          expectedPasswordHash: oldHash,
        }),
      ).rejects.toThrow(/account changed/);
    });
    it("signs out all devices atomically for the authenticated account and records append-only evidence", async () => {
      const account = await user(),
        other = await user();
      const token = await session(account.id);
      await session(account.id);
      const otherToken = await session(other.id);
      expect(
        await auth.revokeAllAccountSessions({
          userId: account.id,
          portal: "member",
          db,
        }),
      ).toEqual({ revokedSessionCount: 2 });
      expect(await auth.getSessionFromToken({ token })).toBeNull();
      expect(
        await auth.getSessionFromToken({ token: otherToken }),
      ).toMatchObject({ userId: other.id });
      const event = await db.accountSecurityEvent.findFirstOrThrow({
        where: { userId: account.id, kind: "ALL_SESSIONS_REVOKED" },
      });
      await expect(
        db.accountSecurityEvent.update({
          where: { id: event.id },
          data: { kind: "TAMPERED" },
        }),
      ).rejects.toThrow(/append-only/);
      await expect(
        db.accountSecurityEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow(/append-only/);
      expect(
        (
          await db.accountSecurityEvent.findUniqueOrThrow({
            where: { id: event.id },
          })
        ).revokedSessionCount,
      ).toBe(2);
    });
    it("rolls back password, token consumption and session removal when security evidence cannot be committed", async () => {
      const account = await user();
      await session(account.id);
      const { token, challenge } = await request(account);
      const failingDb = {
        $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
          db.$transaction(async (tx) =>
            work(
              new Proxy(tx, {
                get(target, key) {
                  if (key !== "accountSecurityEvent")
                    return Reflect.get(target, key);
                  return new Proxy(target.accountSecurityEvent, {
                    get(delegate, field) {
                      if (field === "create")
                        return async () => {
                          throw new Error("Fixture audit unavailable");
                        };
                      return Reflect.get(delegate, field);
                    },
                  });
                },
              }),
            ),
          ),
      } as unknown as PrismaClient;
      await expect(
        auth.resetPassword({
          email: account.email,
          token,
          password: newPassword,
          db: failingDb,
        }),
      ).rejects.toThrow("Fixture audit unavailable");
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: account.id } }))
          .passwordHash,
      ).toBe(oldHash);
      expect(
        await db.authSession.count({ where: { userId: account.id } }),
      ).toBe(1);
      expect(
        (
          await db.passwordResetChallenge.findUniqueOrThrow({
            where: { id: challenge.id },
          })
        ).consumedAt,
      ).toBeNull();
    });
    it("retries an email failure with the same durable job and accepts one fenced provider receipt", async () => {
      await db.passwordResetChallenge.updateMany({
        where: { userId: { in: users } },
        data: { invalidatedAt: new Date() },
      });
      const account = await user(),
        now = new Date();
      const { challenge } = await request(account, now);
      const send = vi
        .fn()
        .mockRejectedValueOnce(new Error("Provider unavailable"))
        .mockResolvedValue({
          status: "sent",
          providerMessageId: "fixture-provider-receipt",
        });
      await auth.processPasswordRecoveryOutbox({
        db,
        now,
        adapter: { send },
        limit: 50,
      });
      const failed = await db.authRecoveryDelivery.findUniqueOrThrow({
        where: { challengeId: challenge.id },
      });
      expect(failed).toMatchObject({
        status: "PENDING",
        attempts: 1,
        failureCode: "DELIVERY_RETRY",
      });
      await auth.processPasswordRecoveryOutbox({
        db,
        now: new Date(now.getTime() + 31000),
        adapter: { send },
        limit: 50,
      });
      expect(
        await db.authRecoveryDelivery.findUniqueOrThrow({
          where: { id: failed.id },
        }),
      ).toMatchObject({
        status: "SENT",
        attempts: 2,
        providerMessageId: "fixture-provider-receipt",
      });
      expect(
        send.mock.calls.filter(([job]) => job.id === failed.id),
      ).toHaveLength(2);
    });
    it("erases reset URLs after a terminal send failure or an exhausted abandoned lease", async () => {
      await db.passwordResetChallenge.updateMany({
        where: { userId: { in: users } },
        data: { invalidatedAt: new Date() },
      });
      const account = await user(),
        abandoned = await user(),
        now = new Date();
      const finalAttempt = await request(account, now);
      const finalLease = await request(abandoned, now);
      await db.authRecoveryDelivery.update({
        where: { challengeId: finalAttempt.challenge.id },
        data: { attempts: 4 },
      });
      await db.authRecoveryDelivery.update({
        where: { challengeId: finalLease.challenge.id },
        data: {
          status: "SENDING",
          attempts: 5,
          leaseExpiresAt: new Date(now.getTime() - 1),
        },
      });
      const send = vi.fn().mockRejectedValue(new Error("Provider unavailable"));
      await auth.processPasswordRecoveryOutbox({
        db,
        now,
        adapter: { send },
        limit: 50,
      });
      for (const challenge of [finalAttempt.challenge, finalLease.challenge])
        expect(
          await db.authRecoveryDelivery.findUniqueOrThrow({
            where: { challengeId: challenge.id },
          }),
        ).toMatchObject({
          status: "FAILED",
          attempts: 5,
          body: "",
          failureCode: "ATTEMPTS_EXHAUSTED",
          leaseExpiresAt: null,
        });
      expect(send).toHaveBeenCalledOnce();
    });
    it("suppresses superseded, consumed, expired and changed-email links before delivery", async () => {
      await db.passwordResetChallenge.updateMany({
        where: { userId: { in: users } },
        data: { invalidatedAt: new Date() },
      });
      const account = await user(),
        now = new Date();
      await request(account, now);
      const current = await request(account, new Date(now.getTime() + 61000));
      await auth.resetPassword({
        email: account.email,
        token: current.token,
        password: newPassword,
        db,
        now: new Date(now.getTime() + 62000),
      });
      const changed = await user();
      await request(changed, now);
      await db.user.update({
        where: { id: changed.id },
        data: { email: `${changed.id}-changed@example.test` },
      });
      const send = vi.fn().mockResolvedValue({
        status: "sent",
        providerMessageId: "fixture-receipt",
      });
      await auth.processPasswordRecoveryOutbox({
        db,
        adapter: { send },
        now: new Date(now.getTime() + 62000),
        limit: 50,
      });
      expect(send).not.toHaveBeenCalled();
      expect(
        await db.authRecoveryDelivery.count({
          where: {
            challenge: { userId: { in: [account.id, changed.id] } },
            status: "CANCELLED",
          },
        }),
      ).toBe(3);
      const expired = await user();
      await request(expired, now);
      await auth.processPasswordRecoveryOutbox({
        db,
        adapter: { send },
        now: new Date(now.getTime() + 31 * 60000),
        limit: 50,
      });
      expect(send).not.toHaveBeenCalled();
      expect(
        (
          await db.authRecoveryDelivery.findFirstOrThrow({
            where: { challenge: { userId: expired.id } },
          })
        ).failureCode,
      ).toBe("EXPIRED");
    });
    it("fences a late email receipt after an abandoned delivery lease is reclaimed", async () => {
      await db.passwordResetChallenge.updateMany({
        where: { userId: { in: users } },
        data: { invalidatedAt: new Date() },
      });
      const account = await user(),
        now = new Date(),
        { challenge } = await request(account, now);
      let release: (receipt: {
        status: "sent";
        providerMessageId: string;
      }) => void = () => {};
      let entered: () => void = () => {};
      const firstEntered = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const firstReceipt = new Promise<{
        status: "sent";
        providerMessageId: string;
      }>((resolve) => {
        release = resolve;
      });
      const send = vi
        .fn()
        .mockImplementationOnce(() => {
          entered();
          return firstReceipt;
        })
        .mockResolvedValue({
          status: "sent",
          providerMessageId: "current-worker-receipt",
        });
      const abandoned = auth.processPasswordRecoveryOutbox({
        db,
        now,
        adapter: { send },
        limit: 50,
      });
      await firstEntered;
      await auth.processPasswordRecoveryOutbox({
        db,
        now: new Date(now.getTime() + 61000),
        adapter: { send },
        limit: 50,
      });
      release({ status: "sent", providerMessageId: "late-worker-receipt" });
      await abandoned;
      expect(
        await db.authRecoveryDelivery.findUniqueOrThrow({
          where: { challengeId: challenge.id },
        }),
      ).toMatchObject({
        status: "SENT",
        attempts: 2,
        providerMessageId: "current-worker-receipt",
      });
    });
  },
);
