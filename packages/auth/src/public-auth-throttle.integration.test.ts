import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@flowstate/db";
import {
  buildPublicAuthThrottlePlan,
  cleanupPublicAuthThrottleBuckets,
  clearSuccessfulPublicAuthLogin,
  consumePublicAuthAttempt,
  PUBLIC_AUTH_COOLDOWN_MESSAGE,
} from "./public-auth-throttle.js";
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "durable public authentication admission",
  () => {
    let db: PrismaClient, other: PrismaClient;
    const secret = "fictional-database-test-hmac-key-at-least-32-bytes",
      now = new Date();
    const keys = new Set<string>();
    beforeAll(() => {
      db = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
      other = new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
    });
    afterAll(async () => {
      if (!db) return;
      await db.publicAuthThrottleBucket.deleteMany({
        where: { keyHash: { in: [...keys] } },
      });
      await Promise.all([db.$disconnect(), other.$disconnect()]);
    });
    function attempt(
      email: string,
      networkIdentity: string,
      action: "login" | "signup" = "login",
      portal: "admin" | "member" = "admin",
      at = now,
    ) {
      const input = { email, networkIdentity, action, portal };
      const plan = buildPublicAuthThrottlePlan(input, { secret, now: at });
      keys.add(plan.account.keyHash);
      keys.add(plan.network.keyHash);
      return { input, plan, options: { db, secret, now: at } };
    }
    it("allows exactly ten concurrent account attempts across portal/process clients and changing networks", async () => {
      const email = `${randomUUID()}@throttle.example.test`;
      const entries = Array.from({ length: 12 }, (_, index) =>
        attempt(
          email,
          `fictional-network-${index}`,
          "login",
          index % 2 ? "admin" : "member",
        ),
      );
      const results = await Promise.allSettled(
        entries.map((entry, index) =>
          consumePublicAuthAttempt(entry.input, {
            ...entry.options,
            db: index % 2 ? db : other,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(10);
      expect(
        (
          await db.publicAuthThrottleBucket.findUniqueOrThrow({
            where: { keyHash: entries[0]!.plan.account.keyHash },
          })
        ).attempts,
      ).toBe(10);
      await expect(
        consumePublicAuthAttempt(entries[0]!.input, {
          ...entries[0]!.options,
          db: other,
        }),
      ).rejects.toThrow(PUBLIC_AUTH_COOLDOWN_MESSAGE);
    });
    it("bounds signup traffic across different accounts and rolls back denied account allocation", async () => {
      const network = `fictional-shared-network-${randomUUID()}`;
      const entries = Array.from({ length: 31 }, (_, index) =>
        attempt(
          `${randomUUID()}@new-account.example.test`,
          network,
          "signup",
          index % 2 ? "member" : "admin",
        ),
      );
      const results = await Promise.allSettled(
        entries.map((entry) =>
          consumePublicAuthAttempt(entry.input, entry.options),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(30);
      expect(
        (
          await db.publicAuthThrottleBucket.findUniqueOrThrow({
            where: { keyHash: entries[0]!.plan.network.keyHash },
          })
        ).attempts,
      ).toBe(30);
      expect(
        await db.publicAuthThrottleBucket.count({
          where: {
            keyHash: { in: entries.map((entry) => entry.plan.account.keyHash) },
          },
        }),
      ).toBe(30);
    });
    it("retains the network quota when successful authentication clears only its account quota", async () => {
      const entry = attempt(
        `${randomUUID()}@login.example.test`,
        `fictional-network-${randomUUID()}`,
      );
      let admitted!: { accountKeyHash: string };
      for (let index = 0; index < 10; index++)
        admitted = await consumePublicAuthAttempt(entry.input, entry.options);
      await clearSuccessfulPublicAuthLogin(admitted, { db });
      await consumePublicAuthAttempt(entry.input, entry.options);
      expect(
        (
          await db.publicAuthThrottleBucket.findUniqueOrThrow({
            where: { keyHash: entry.plan.account.keyHash },
          })
        ).attempts,
      ).toBe(1);
      expect(
        (
          await db.publicAuthThrottleBucket.findUniqueOrThrow({
            where: { keyHash: entry.plan.network.keyHash },
          })
        ).attempts,
      ).toBe(11);
      const saved = await db.publicAuthThrottleBucket.findUniqueOrThrow({
        where: { keyHash: entry.plan.account.keyHash },
      });
      expect(JSON.stringify(saved)).not.toContain(entry.input.email);
      expect(JSON.stringify(saved)).not.toContain(entry.input.networkIdentity);
    });
    it("opens a new signup window without resetting a still-active window early", async () => {
      const email = `${randomUUID()}@signup.example.test`,
        network = `fictional-network-${randomUUID()}`;
      const entry = attempt(email, network, "signup");
      for (let index = 0; index < 3; index++)
        await consumePublicAuthAttempt(entry.input, entry.options);
      await expect(
        consumePublicAuthAttempt(entry.input, entry.options),
      ).rejects.toThrow(PUBLIC_AUTH_COOLDOWN_MESSAGE);
      const next = attempt(
        email,
        network,
        "signup",
        "member",
        new Date(+entry.plan.account.windowEndsAt),
      );
      await consumePublicAuthAttempt(next.input, next.options);
      expect(
        (
          await db.publicAuthThrottleBucket.findUniqueOrThrow({
            where: { keyHash: next.plan.account.keyHash },
          })
        ).attempts,
      ).toBe(1);
    });
    it("cleans abandoned expired rows in bounded concurrent batches and preserves active buckets", async () => {
      const active = attempt(
        `${randomUUID()}@active.example.test`,
        `fictional-network-${randomUUID()}`,
      );
      await consumePublicAuthAttempt(active.input, active.options);
      const expiredKeys = [];
      for (let index = 0; index < 5; index++) {
        const expired = attempt(
          `${randomUUID()}@expired.example.test`,
          `fictional-network-${randomUUID()}`,
          "login",
          "admin",
          new Date(+now - 48 * 3600000),
        );
        expiredKeys.push(expired.plan.account.keyHash);
        await db.publicAuthThrottleBucket.create({
          data: {
            keyHash: expired.plan.account.keyHash,
            attempts: 1,
            windowEndsAt: expired.plan.account.windowEndsAt,
            expiresAt: expired.plan.account.expiresAt,
          },
        });
      }
      const results = await Promise.all([
        cleanupPublicAuthThrottleBuckets({ db, now, limit: 2 }),
        cleanupPublicAuthThrottleBuckets({ db: other, now, limit: 2 }),
      ]);
      expect(results.map((result) => result.deletedCount)).toEqual([2, 2]);
      expect(
        await db.publicAuthThrottleBucket.count({
          where: { keyHash: { in: expiredKeys } },
        }),
      ).toBe(1);
      expect(
        await db.publicAuthThrottleBucket.findUnique({
          where: { keyHash: active.plan.account.keyHash },
        }),
      ).not.toBeNull();
      expect(
        await cleanupPublicAuthThrottleBuckets({ db, now, limit: 2 }),
      ).toEqual({ deletedCount: 1 });
    });
  },
);
