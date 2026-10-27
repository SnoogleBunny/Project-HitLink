import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "@flowstate/auth";
import type { PrismaClient, NotificationJobRecord } from "@flowstate/db";
import {
  acceptStaffInvite,
  hashStaffInviteToken,
  INVALID_STAFF_INVITE_MESSAGE,
  inviteCoachToWorkspace,
  resendPendingCoachInvite,
  revokePendingCoachInvite,
} from "./staff-invites";
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "staff invitation identity and immutable history",
  () => {
    let db: PrismaClient,
      api: typeof import("@flowstate/db"),
      passwordHash: string;
    const workspaces: string[] = [],
      emails: string[] = [];
    const password = "Fictional-coach-password-2026!",
      now = new Date();
    beforeAll(async () => {
      process.env.DATABASE_URL = databaseUrl;
      api = await import("@flowstate/db");
      db = api.prisma;
      passwordHash = await hashPassword(password);
    });
    afterAll(async () => {
      if (!db) return;
      for (const workspaceId of workspaces)
        await db.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(
            "SELECT set_config('hitlink.reviewed_retention_workspace', $1, true)",
            workspaceId,
          );
          await tx.workspace.deleteMany({ where: { id: workspaceId } });
        });
      await db.user.deleteMany({ where: { email: { in: emails } } });
    });
    async function fixture() {
      const ownerEmail = `${randomUUID()}@invite-owner.example.test`;
      const email = `${randomUUID()}@invite-coach.example.test`;
      emails.push(ownerEmail, email);
      const owner = await db.user.create({
        data: { email: ownerEmail, fullName: "Fictional Owner", passwordHash },
      });
      const workspace = await db.workspace.create({
        data: {
          name: `Invite-${randomUUID()}`,
          status: "SETUP_INCOMPLETE",
          location: { create: { name: "Fictional Gym", timezone: "UTC" } },
          workspaceUsers: { create: { userId: owner.id, role: "OWNER" } },
        },
      });
      workspaces.push(workspace.id);
      const token = randomBytes(32).toString("base64url");
      const args = {
        workspaceId: workspace.id,
        invitedByUserId: owner.id,
        db,
        now,
      };
      return { owner, workspace, email, token, args };
    }
    async function invite(f: Awaited<ReturnType<typeof fixture>>) {
      const result = await inviteCoachToWorkspace({
        ...f.args,
        email: f.email,
        inviteOrigin: "https://admin.example.test",
        tokenGenerator: () => f.token,
      });
      if (result.status === "error") throw new Error(result.message);
      return result.inviteId;
    }
    const accept = (
      f: Awaited<ReturnType<typeof fixture>>,
      extra: Partial<Parameters<typeof acceptStaffInvite>[0]> = {},
    ) =>
      acceptStaffInvite({
        token: f.token,
        email: f.email,
        fullName: "Fictional Coach",
        password,
        db,
        now,
        ...extra,
      });
    it("atomically creates hashed invitation, durable mail and attributable immutable history", async () => {
      const f = await fixture(),
        id = await invite(f);
      const record = await db.staffInvite.findUniqueOrThrow({ where: { id } });
      expect(record.token).toBe(hashStaffInviteToken(f.token));
      const jobs = await db.notificationJob.findMany({
        where: { workspaceId: f.workspace.id },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.status).toBe("PENDING");
      expect(jobs[0]?.body).toContain(`/staff-invite#token=${f.token}`);
      const event = await db.workspaceDataEvent.findFirstOrThrow({
        where: { workspaceId: f.workspace.id },
      });
      expect(event.actorUserId).toBe(f.owner.id);
      expect(event.kind).toBe("STAFF_INVITE_CREATED");
      expect(JSON.stringify(event.metadata)).toContain(f.email);
      expect(JSON.stringify(event.metadata)).not.toContain(f.token);
      await expect(
        db.workspaceDataEvent.update({
          where: { id: event.id },
          data: { actorUserId: null },
        }),
      ).rejects.toThrow("append-only");
      await expect(
        db.workspaceDataEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow("append-only");
    });
    it("rotates link and expiry and cancels older mail without exposing bearer in evidence", async () => {
      const f = await fixture(),
        id = await invite(f),
        replacement = randomBytes(32).toString("base64url");
      await resendPendingCoachInvite({
        ...f.args,
        inviteId: id,
        inviteOrigin: "https://admin.example.test",
        tokenGenerator: () => replacement,
        now: new Date(+now + 60000),
      });
      await expect(accept(f)).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
      const old = await db.notificationJob.findFirstOrThrow({
        where: { workspaceId: f.workspace.id, status: "CANCELLED" },
      });
      expect(old.body).toBe("");
      const accepted = await accept(f, {
        token: replacement,
        now: new Date(+now + 60000),
      });
      expect(accepted.workspaceId).toBe(f.workspace.id);
      const history = await db.workspaceDataEvent.findMany({
        where: { workspaceId: f.workspace.id },
        orderBy: { createdAt: "asc" },
      });
      expect(history.map((row) => row.kind)).toEqual([
        "STAFF_INVITE_CREATED",
        "STAFF_INVITE_ROTATED",
        "STAFF_INVITE_ACCEPTED",
      ]);
      expect(JSON.stringify(history)).not.toContain(replacement);
    });
    it("accepts once into the exact workspace and never grants owner permission", async () => {
      const f = await fixture(),
        id = await invite(f);
      const results = await Promise.allSettled([accept(f), accept(f)]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const user = await db.user.findUniqueOrThrow({
        where: { email: f.email },
      });
      expect(await verifyPassword(password, user.passwordHash)).toBe(true);
      expect(
        await db.workspaceUser.findMany({ where: { userId: user.id } }),
      ).toEqual([
        expect.objectContaining({
          workspaceId: f.workspace.id,
          role: "COACH",
          isActive: true,
        }),
      ]);
      expect(
        await db.workspaceUser.count({
          where: { workspaceId: f.workspace.id, role: "OWNER", isActive: true },
        }),
      ).toBe(1);
      expect(
        (await db.staffInvite.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("ACCEPTED");
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId: f.workspace.id, kind: "STAFF_INVITE_ACCEPTED" },
        }),
      ).toBe(1);
      await expect(accept(f)).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
    });
    it("requires exact existing-account credentials and revokes old sessions atomically", async () => {
      const f = await fixture();
      const user = await db.user.create({
        data: { email: f.email, passwordHash, fullName: "Existing Account" },
      });
      await db.authSession.create({
        data: {
          userId: user.id,
          tokenHash: hashSessionToken(randomUUID()),
          expiresAt: new Date(+now + 86400000),
        },
      });
      await invite(f);
      await expect(accept(f, { password: "wrong-password" })).rejects.toThrow(
        INVALID_STAFF_INVITE_MESSAGE,
      );
      expect(await db.workspaceUser.count({ where: { userId: user.id } })).toBe(
        0,
      );
      await accept(f, { fullName: "Must not replace existing name" });
      expect(await db.authSession.count({ where: { userId: user.id } })).toBe(
        0,
      );
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: user.id } })).fullName,
      ).toBe("Existing Account");
      const event = await db.workspaceDataEvent.findFirstOrThrow({
        where: { workspaceId: f.workspace.id, kind: "STAFF_INVITE_ACCEPTED" },
      });
      expect(event.actorUserId).toBe(user.id);
      expect(event.metadata).toMatchObject({
        targetUserId: user.id,
        invitedByUserId: f.owner.id,
        revokedSessionCount: 1,
      });
    });
    it("rejects credentials validated before a password reset wins the account lock", async () => {
      const f = await fixture();
      const user = await db.user.create({
        data: { email: f.email, passwordHash },
      });
      await invite(f);
      let release!: () => void, locked!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const acquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const reset = db.$transaction(
        async (tx) => {
          await tx.$queryRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtext($1))::text",
            `account-security:${user.id}`,
          );
          locked();
          await gate;
          await tx.user.update({
            where: { id: user.id },
            data: { passwordHash: "changed-password-after-validation" },
          });
        },
        { timeout: 20000 },
      );
      await acquired;
      const accepting = accept(f).then(
        (value) => ({ status: "accepted" as const, value }),
        (error) => ({ status: "rejected" as const, error }),
      );
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const rows = await db.$queryRawUnsafe<Array<{ waiting: boolean }>>(
            "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())) AS waiting",
          );
          if (rows[0]?.waiting) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(waiting).toBe(true);
      } finally {
        release();
        await reset;
      }
      const result = await accepting;
      expect(result.status).toBe("rejected");
      if (result.status === "rejected")
        expect(result.error).toHaveProperty(
          "message",
          INVALID_STAFF_INVITE_MESSAGE,
        );
      expect(await db.workspaceUser.count({ where: { userId: user.id } })).toBe(
        0,
      );
    });
    for (const change of ["inviter", "business", "invitation"] as const)
      it(`denies invitation acceptance after waited ${change} revocation`, async () => {
        const f = await fixture(),
          id = await invite(f);
        let release!: () => void, acquired!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const locked = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const holder = db.$transaction(
          async (tx) => {
            await api.lockClassSchedule(tx, f.workspace.id);
            acquired();
            await gate;
            if (change === "inviter")
              await tx.workspaceUser.updateMany({
                where: { workspaceId: f.workspace.id, userId: f.owner.id },
                data: { role: "COACH" },
              });
            else if (change === "business")
              await tx.workspace.update({
                where: { id: f.workspace.id },
                data: { status: "DISABLED" },
              });
            else
              await tx.staffInvite.update({
                where: { id },
                data: { status: "REVOKED", revokedAt: new Date() },
              });
          },
          { timeout: 15000 },
        );
        await locked;
        const attempted = accept(f).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error: error as Error }),
        );
        try {
          await expect
            .poll(
              async () => {
                const rows = await db.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objsubid=1
              AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
              AND objid::bigint=(hashtext(${`class-schedule:${f.workspace.id}`})::bigint & 4294967295)) AS waiting`;
                return rows[0]?.waiting;
              },
              { timeout: 5000 },
            )
            .toBe(true);
        } finally {
          release();
          await holder;
        }
        const result = await attempted;
        expect(result.ok).toBe(false);
        if (!result.ok)
          expect(result.error.message).toBe(INVALID_STAFF_INVITE_MESSAGE);
        expect(await db.user.count({ where: { email: f.email } })).toBe(0);
        expect(
          await db.workspaceUser.count({
            where: {
              workspaceId: f.workspace.id,
              role: "COACH",
              user: { email: f.email },
            },
          }),
        ).toBe(0);
        expect(
          await db.workspaceDataEvent.count({
            where: {
              workspaceId: f.workspace.id,
              kind: "STAFF_INVITE_ACCEPTED",
            },
          }),
        ).toBe(0);
      }, 20000);

    it("does not consume a token for the wrong email or admit after revocation or expiry", async () => {
      const f = await fixture(),
        id = await invite(f);
      await expect(
        accept(f, { email: "someone-else@example.test" }),
      ).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
      await revokePendingCoachInvite({ ...f.args, inviteId: id });
      await expect(accept(f)).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
      expect(
        (
          await db.notificationJob.findFirstOrThrow({
            where: { workspaceId: f.workspace.id },
          })
        ).body,
      ).toBe("");
      const expired = await fixture();
      await invite(expired);
      await expect(
        accept(expired, { now: new Date(+now + 8 * 86400000) }),
      ).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
      expect(
        await db.user.count({
          where: { email: { in: [f.email, expired.email] } },
        }),
      ).toBe(0);
    });
    it("denies cross-gym revoke, coach mutations and a stale inviter without activating access", async () => {
      const f = await fixture(),
        foreign = await fixture(),
        id = await invite(f);
      expect(
        await revokePendingCoachInvite({ ...foreign.args, inviteId: id }),
      ).toMatchObject({ status: "error" });
      await db.workspaceUser.updateMany({
        where: { workspaceId: f.workspace.id, userId: f.owner.id },
        data: { role: "COACH" },
      });
      await expect(
        inviteCoachToWorkspace({
          ...f.args,
          email: f.email,
          inviteOrigin: "https://admin.example.test",
        }),
      ).rejects.toThrow("access changed");
      await expect(accept(f)).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
      const queued = await db.notificationJob.findFirstOrThrow({
        where: { workspaceId: f.workspace.id },
      });
      expect(await api.shouldDeliverNotification(queued, db, now)).toBe(false);
      expect(await db.user.count({ where: { email: f.email } })).toBe(0);
    });
    it("cannot turn another tenant account or deactivated staff into active coach access", async () => {
      const f = await fixture(),
        other = await fixture();
      await db.user.create({
        data: {
          email: f.email,
          passwordHash,
          workspaceUsers: {
            create: { workspaceId: other.workspace.id, role: "COACH" },
          },
        },
      });
      await invite(f);
      await expect(accept(f)).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
      const inactive = await fixture();
      const user = await db.user.create({
        data: { email: inactive.email, passwordHash },
      });
      await invite(inactive);
      await db.workspaceUser.create({
        data: {
          userId: user.id,
          workspaceId: inactive.workspace.id,
          role: "COACH",
          isActive: false,
        },
      });
      await expect(accept(inactive)).rejects.toThrow(
        INVALID_STAFF_INVITE_MESSAGE,
      );
      expect(
        (
          await db.workspaceUser.findFirstOrThrow({
            where: { userId: user.id },
          })
        ).isActive,
      ).toBe(false);
    });
    it("throttles repeated credential failures for an invitation without accepting or consuming it", async () => {
      const f = await fixture();
      await db.user.create({ data: { email: f.email, passwordHash } });
      await invite(f);
      for (let attempt = 0; attempt < 6; attempt++)
        await expect(accept(f, { password: "wrong" })).rejects.toThrow(
          INVALID_STAFF_INVITE_MESSAGE,
        );
      await expect(accept(f)).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
      expect(
        await db.workspaceDataEvent.count({
          where: {
            workspaceId: f.workspace.id,
            kind: "STAFF_INVITE_ACCEPT_REJECTED",
          },
        }),
      ).toBe(5);
      await accept(f, { now: new Date(+now + 16 * 60000) });
    });
    it("rolls back invite and queued mail when immutable evidence cannot be recorded", async () => {
      const f = await fixture();
      const fn = `invite_fail_${randomUUID().replaceAll("-", "")}`;
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId" = '${f.workspace.id}' THEN RAISE EXCEPTION 'Fictional invite evidence failure'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER "${fn}" BEFORE INSERT ON workspace_data_events FOR EACH ROW EXECUTE FUNCTION "${fn}"()`,
      );
      try {
        await expect(invite(f)).rejects.toThrow(
          "Fictional invite evidence failure",
        );
        expect(
          await db.staffInvite.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(0);
        expect(
          await db.notificationJob.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(0);
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER "${fn}" ON workspace_data_events`,
        );
        await db.$executeRawUnsafe(`DROP FUNCTION "${fn}"()`);
      }
    });
    it("keeps rejected delivery bearer URLs out of application Prisma logs", async () => {
      const f = await fixture(),
        fn = `invite_storage_fail_${randomUUID().replaceAll("-", "")}`;
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId" = '${f.workspace.id}' THEN RAISE EXCEPTION 'Fictional staff invitation storage failure'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER "${fn}" BEFORE INSERT ON notification_jobs FOR EACH ROW EXECUTE FUNCTION "${fn}"()`,
      );
      const log = vi.spyOn(console, "log").mockImplementation(() => {}),
        error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await expect(
          inviteCoachToWorkspace({
            workspaceId: f.workspace.id,
            invitedByUserId: f.owner.id,
            email: f.email,
            inviteOrigin: "https://admin.example.test",
            tokenGenerator: () => f.token,
            now,
          }),
        ).rejects.toThrow("Fictional staff invitation storage failure");
        expect(
          JSON.stringify([...log.mock.calls, ...error.mock.calls]),
        ).not.toContain(`/staff-invite#token=${f.token}`);
        expect(
          await db.staffInvite.count({
            where: { workspaceId: f.workspace.id },
          }),
        ).toBe(0);
      } finally {
        log.mockRestore();
        error.mockRestore();
        await db.$executeRawUnsafe(`DROP TRIGGER "${fn}" ON notification_jobs`);
        await db.$executeRawUnsafe(`DROP FUNCTION "${fn}"()`);
      }
    });
    it("delivers only current setup invitations before activation, requires provider receipt and clears terminal bearer bodies", async () => {
      const f = await fixture();
      await invite(f);
      const ordinary = await db.notificationJob.create({
        data: {
          workspaceId: f.workspace.id,
          templateKind: "ANNOUNCEMENT",
          recipientEmail: f.email,
          subject: "Operational message",
          body: "Must not send from staging",
          nextAttemptAt: now,
        },
      });
      const send = vi.fn(async (job: NotificationJobRecord) => ({
        status: "sent" as const,
        providerMessageId: `fictional-test-receipt:${job.id}`,
      }));
      expect(
        await api.processNotificationOutbox({
          db,
          workspaceId: f.workspace.id,
          adapter: { send },
          now,
        }),
      ).toMatchObject({ sentCount: 0 });
      expect(send).not.toHaveBeenCalled();
      const results = await api.processAccountSetupNotificationOutbox({
        db,
        adapter: { send },
        now,
        limit: 20,
      });
      expect(
        results.reduce((sum, result) => sum + result.sentCount, 0),
      ).toBeGreaterThanOrEqual(1);
      expect(
        send.mock.calls.some(
          (call) =>
            (call[0] as { subject: string } | undefined)?.subject ===
            "Operational message",
        ),
      ).toBe(false);
      expect(
        (
          await db.notificationJob.findUniqueOrThrow({
            where: { id: ordinary.id },
          })
        ).status,
      ).toBe("PENDING");
      expect(
        (
          await db.notificationJob.findFirstOrThrow({
            where: { workspaceId: f.workspace.id, status: "SENT" },
          })
        ).body,
      ).toBe("");
      const noReceipt = await fixture();
      await invite(noReceipt);
      await api.processAccountSetupNotificationOutbox({
        db,
        adapter: { send: async () => ({ status: "sent" }) },
        now,
        limit: 20,
      });
      expect(
        await db.notificationJob.count({
          where: { workspaceId: noReceipt.workspace.id, status: "SENT" },
        }),
      ).toBe(0);
      expect(
        (
          await db.notificationJob.findFirstOrThrow({
            where: { workspaceId: noReceipt.workspace.id },
          })
        ).status,
      ).toBe("FAILED");
    });
  },
);
