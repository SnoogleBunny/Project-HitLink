import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  activateNewBusiness,
  getWorkspaceSetup,
  isWorkspaceMigrationReady,
  isWorkspaceOperationallyReady,
  lockClassSchedule,
  previewWorkspaceSetup,
  requestWorkspaceSetupVerification,
  shouldDeliverNotification,
  verifyWorkspaceSetupOwner,
  requirePublicWorkspace,
} from "@flowstate/db";
import { createOwnerWorkspaceOnboarding } from "./onboarding";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "verified import-free new business setup",
  () => {
    const db = new PrismaClient({ datasources: { db: { url } } });
    const workspaceIds: string[] = [],
      userIds: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z");
    let workspaceId: string, userId: string, email: string;
    beforeEach(async () => {
      email = `${randomUUID()}@business-setup.test`;
      userId = (
        await db.user.create({
          data: { email, fullName: "Fictional setup owner" },
        })
      ).id;
      userIds.push(userId);
      const result = await createOwnerWorkspaceOnboarding({
        input: {
          userId,
          workspaceName: "New virtual coaching business",
          kind: "NEW_BUSINESS",
          businessType: "Adult life coaching",
          timezone: "UTC",
          currency: "cad",
          locale: "en-CA",
          contactEmail: email,
          serviceMode: "COACHING",
        },
        db: db as never,
      });
      if (result.status !== "created")
        throw Error("Expected an isolated new setup fixture.");
      workspaceId = result.workspaceId;
      workspaceIds.push(workspaceId);
    });
    afterAll(async () => {
      for (const id of workspaceIds)
        await db.workspace.delete({ where: { id } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.$disconnect();
    });
    const actor = () => ({ workspaceId, userId });
    const options = (at = now) => ({ db, now: at });
    async function request(at = now) {
      await requestWorkspaceSetupVerification(
        actor(),
        "http://127.0.0.1:3100",
        options(at),
      );
      const job = await db.notificationJob.findFirstOrThrow({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
      });
      const link = new URL(job.body.match(/https?:\/\/[^\s]+/)![0]);
      const token = new URLSearchParams(link.hash.slice(1)).get("token")!;
      return { job, link, token };
    }
    async function verified(at = now) {
      const result = await request(at);
      await verifyWorkspaceSetupOwner(actor(), result.token, options(at));
      return result;
    }
    const preview = (at = now) => previewWorkspaceSetup(actor(), options(at));
    const activate = (review: Awaited<ReturnType<typeof preview>>, at = now) =>
      activateNewBusiness(
        actor(),
        {
          version: review.version,
          snapshotHash: review.snapshotHash,
          confirmed: true,
        },
        options(at),
      );

    it("creates an empty coaching-only business without any invented import, room, class or membership", async () => {
      const workspace = await db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: {
          location: true,
          settings: true,
          migration: true,
          setup: true,
        },
      });
      expect(workspace).toMatchObject({
        status: "SETUP_INCOMPLETE",
        migration: null,
        setup: { ownerUserId: userId, serviceMode: "COACHING" },
        location: { timezone: "UTC", addressLine1: null },
        settings: { currency: "cad", locale: "en-CA", contactEmail: email },
      });
      expect(await db.importJob.count({ where: { workspaceId } })).toBe(0);
      expect(
        await db.room.count({ where: { location: { workspaceId } } }),
      ).toBe(0);
      expect(await db.classTemplate.count({ where: { workspaceId } })).toBe(0);
      expect(await db.membershipPlan.count({ where: { workspaceId } })).toBe(0);
      expect(await db.member.count({ where: { workspaceId } })).toBe(0);
      expect(await db.coachingProgram.count({ where: { workspaceId } })).toBe(
        0,
      );
      await expect(
        db.$transaction((tx) => requirePublicWorkspace(tx, workspaceId, now)),
      ).rejects.toThrow();
      expect((await preview()).errors).toContain(
        "Verify your owner account email within 15 minutes of activation.",
      );
    });
    it("binds a fragment-only single-use link to the current owner and permits only that preactivation delivery", async () => {
      const { job, link, token } = await request();
      expect(link.origin).toBe("http://127.0.0.1:3100");
      expect(link.pathname).toBe("/dashboard/setup/verify");
      expect(link.search).toBe("");
      expect(token).toMatch(/^[\w-]{43}$/);
      const setup = await db.workspaceSetup.findUniqueOrThrow({
        where: { workspaceId },
      });
      expect(setup.verificationHash).toBe(
        createHash("sha256").update(token).digest("hex"),
      );
      expect(JSON.stringify(setup)).not.toContain(token);
      expect(job).toMatchObject({
        status: "PENDING",
        attempts: 0,
        providerMessageId: null,
        sentAt: null,
        recipientEmail: email,
      });
      expect(await shouldDeliverNotification(job, db, now)).toBe(true);
      await expect(
        verifyWorkspaceSetupOwner(actor(), "a".repeat(43), options()),
      ).rejects.toThrow("invalid or expired");
      await verifyWorkspaceSetupOwner(actor(), token, options());
      expect((await getWorkspaceSetup(actor(), options())).ownerVerified).toBe(
        true,
      );
      expect(
        (await db.workspaceSetup.findUniqueOrThrow({ where: { workspaceId } }))
          .verificationHash,
      ).toBeNull();
      expect(
        (await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } }))
          .body,
      ).toBe("");
      expect(await shouldDeliverNotification(job, db, now)).toBe(false);
      await expect(
        verifyWorkspaceSetupOwner(actor(), token, options()),
      ).rejects.toThrow("invalid or expired");
      expect(
        await db.workspaceSetupActivation.count({ where: { workspaceId } }),
      ).toBe(0);
    });
    it("requires explicit exact-snapshot acceptance and atomically creates one immutable activation receipt", async () => {
      await verified();
      const review = await preview();
      expect(review).toMatchObject({
        ok: true,
        snapshot: {
          serviceMode: "COACHING",
          configuredRooms: 0,
          configuredPrograms: 0,
          configuredCoachingTemplates: 0,
          onlinePaymentsReady: false,
        },
      });
      await expect(
        activateNewBusiness(
          actor(),
          {
            version: review.version,
            snapshotHash: review.snapshotHash,
            confirmed: false,
          },
          options(),
        ),
      ).rejects.toThrow("Confirm");
      const [first, repeated] = await Promise.all([
        activate(review),
        activate(review),
      ]);
      expect(first.id).toBe(repeated.id);
      expect(
        await db.workspaceSetupActivation.count({ where: { workspaceId } }),
      ).toBe(1);
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "NEW_BUSINESS_ACTIVATED" },
        }),
      ).toBe(1);
      const workspace = await db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        include: { migration: true, setupActivation: true },
      });
      expect(workspace.status).toBe("ACTIVE");
      expect(workspace.migration).toBeNull();
      expect(
        isWorkspaceOperationallyReady({
          workspaceStatus: workspace.status,
          setupActivation: workspace.setupActivation,
        }),
      ).toBe(true);
      expect(
        isWorkspaceMigrationReady({ workspaceStatus: workspace.status }),
      ).toBe(false);
      await expect(
        db.$transaction((tx) => requirePublicWorkspace(tx, workspaceId, now)),
      ).resolves.toMatchObject({ id: workspaceId });
      await expect(
        db.workspaceSetupActivation.update({
          where: { id: first.id },
          data: { serviceMode: "HYBRID" },
        }),
      ).rejects.toThrow("immutable");
      await expect(
        db.workspaceSetupActivation.delete({ where: { id: first.id } }),
      ).rejects.toThrow("immutable");
      await expect(
        activate({ ...review, snapshotHash: "0".repeat(64) }),
      ).rejects.toThrow("different reviewed details");
    });
    it("rejects a changed business snapshot or expired verification without partial activation", async () => {
      await verified();
      const review = await preview();
      await db.workspaceSetting.update({
        where: { workspaceId },
        data: { locale: "de-DE", identityVersion: { increment: 1 } },
      });
      await expect(activate(review)).rejects.toThrow("changed");
      expect(
        await db.workspaceSetupActivation.count({ where: { workspaceId } }),
      ).toBe(0);
      const fresh = await preview();
      expect(fresh.snapshot.locale).toBe("de-DE");
      await expect(
        activate(fresh, new Date(+now + 15 * 60_000 + 1)),
      ).rejects.toThrow("Verify your owner");
      expect(
        (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
          .status,
      ).toBe("SETUP_INCOMPLETE");
    });
    it("rechecks a settings write committed while activation waits for the shared lock", async () => {
      await verified();
      const review = await preview();
      let locked!: () => void, release!: () => void, waiting!: () => void;
      const held = new Promise<void>((resolve) => {
          locked = resolve;
        }),
        proceed = new Promise<void>((resolve) => {
          release = resolve;
        }),
        reached = new Promise<void>((resolve) => {
          waiting = resolve;
        });
      const edit = db.$transaction(async (tx) => {
        await lockClassSchedule(tx, workspaceId);
        locked();
        await proceed;
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { name: "Changed while waiting" },
        });
      });
      await held;
      const observed = {
        $transaction: (
          callback: (tx: unknown) => Promise<unknown>,
          settings: { isolationLevel: "ReadCommitted" },
        ) =>
          db.$transaction(
            (tx) =>
              callback(
                new Proxy(tx, {
                  get(target, key) {
                    if (key === "$queryRawUnsafe")
                      return (query: string, ...values: unknown[]) => {
                        const result = target.$queryRawUnsafe(query, ...values);
                        if (query.includes("pg_advisory_xact_lock")) waiting();
                        return result;
                      };
                    return Reflect.get(target, key);
                  },
                }),
              ),
            settings,
          ),
      };
      const pending = activateNewBusiness(
        actor(),
        {
          version: review.version,
          snapshotHash: review.snapshotHash,
          confirmed: true,
        },
        { db: observed as never, now },
      );
      try {
        await reached;
      } finally {
        release();
      }
      await edit;
      await expect(pending).rejects.toThrow("changed");
      expect(
        await db.workspaceSetupActivation.count({ where: { workspaceId } }),
      ).toBe(0);
    });
    it("expires, supersedes and rate limits setup links while respecting lost owner/email authority", async () => {
      const original = await request();
      await expect(request(new Date(+now + 1000))).rejects.toThrow("Wait");
      const later = await request(new Date(+now + 61_000));
      expect(
        (
          await db.notificationJob.findUniqueOrThrow({
            where: { id: original.job.id },
          })
        ).status,
      ).toBe("CANCELLED");
      await expect(
        verifyWorkspaceSetupOwner(
          actor(),
          original.token,
          options(new Date(+now + 61_000)),
        ),
      ).rejects.toThrow("invalid or expired");
      await expect(
        verifyWorkspaceSetupOwner(
          actor(),
          later.token,
          options(new Date(+now + 32 * 60_000)),
        ),
      ).rejects.toThrow("invalid or expired");
      await db.user.update({
        where: { id: userId },
        data: { email: `changed-${email}` },
      });
      expect(
        await shouldDeliverNotification(later.job, db, new Date(+now + 62_000)),
      ).toBe(false);
      await expect(
        verifyWorkspaceSetupOwner(
          actor(),
          later.token,
          options(new Date(+now + 62_000)),
        ),
      ).rejects.toThrow("invalid or expired");
      await db.workspaceUser.updateMany({
        where: { workspaceId, userId },
        data: { isActive: false },
      });
      await expect(preview()).rejects.toThrow("active setup owner");
    });
    it("never accepts another owner or a migration/import shortcut", async () => {
      const other = await db.user.create({
        data: { email: `${randomUUID()}@business-setup.test` },
      });
      userIds.push(other.id);
      await db.workspaceUser.create({
        data: { workspaceId, userId: other.id, role: "OWNER" },
      });
      await expect(
        requestWorkspaceSetupVerification(
          { workspaceId, userId: other.id },
          "http://127.0.0.1:3100",
          options(),
        ),
      ).rejects.toThrow("setup owner");
      await verified();
      await db.importJob.create({
        data: {
          workspaceId,
          name: "Unexpected legacy source",
          status: "DRAFT",
        },
      });
      const review = await preview();
      expect(review.ok).toBe(false);
      expect(review.errors).toContain(
        "Source import records require the separate reviewed migration workflow.",
      );
      await expect(activate(review)).rejects.toThrow("migration workflow");
      await db.workspaceMigration.create({
        data: {
          workspaceId,
          nextOwnerAction: "Fixture legacy handoff",
          flowstateResponsibility: "Fixture legacy review",
        },
      });
      await expect(preview()).rejects.toThrow("reviewed migration workflow");
    });
    it("bounds setup mail to three requests per fifteen minutes under the shared lock", async () => {
      await request();
      await request(new Date(+now + 61_000));
      await request(new Date(+now + 122_000));
      await expect(request(new Date(+now + 183_000))).rejects.toThrow("Wait");
      expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
        3,
      );
      expect(
        await db.notificationJob.count({
          where: { workspaceId, status: "PENDING" },
        }),
      ).toBe(1);
      await expect(
        request(new Date(+now + 16 * 60_000)),
      ).resolves.toMatchObject({ token: expect.any(String) });
    });
    it("binds scheduled timezone history and resolves the actual activation clock without rewriting its baseline", async () => {
      await verified();
      const before = await preview();
      await db.workspaceTimezoneRevision.create({
        data: {
          workspaceId,
          version: 1,
          previousTimezone: "UTC",
          timezone: "Asia/Seoul",
          effectiveFromDate: new Date("2030-01-02T00:00:00Z"),
          effectiveAt: new Date("2030-01-01T15:00:00Z"),
          actorUserId: userId,
          previewHash: "b".repeat(64),
        },
      });
      await expect(activate(before)).rejects.toThrow("changed");
      const scheduled = await preview();
      expect(scheduled.snapshot.timezone).toBe("UTC");
      expect(scheduled.snapshotHash).not.toBe(before.snapshotHash);
      const later = new Date("2030-01-01T15:01:00Z");
      await verified(later);
      const effective = await preview(later);
      expect(effective.snapshot.timezone).toBe("Asia/Seoul");
      const activation = await activate(effective, later);
      expect(activation.snapshot).toMatchObject({ timezone: "Asia/Seoul" });
      expect(
        (await db.location.findUniqueOrThrow({ where: { workspaceId } }))
          .timezone,
      ).toBe("UTC");
    });
    it("rolls back the receipt and workspace transition when required activation auditing fails", async () => {
      await verified();
      const review = await preview();
      const broken = {
        $transaction: (
          callback: (tx: unknown) => Promise<unknown>,
          settings: { isolationLevel: "ReadCommitted" },
        ) =>
          db.$transaction(
            (tx) =>
              callback(
                new Proxy(tx, {
                  get(target, key) {
                    if (key === "workspaceDataEvent")
                      return {
                        create: async () => {
                          throw Error("Forced setup audit failure");
                        },
                      };
                    return Reflect.get(target, key);
                  },
                }),
              ),
            settings,
          ),
      };
      await expect(
        activateNewBusiness(
          actor(),
          {
            version: review.version,
            snapshotHash: review.snapshotHash,
            confirmed: true,
          },
          { db: broken as never, now },
        ),
      ).rejects.toThrow("Forced setup audit");
      expect(
        await db.workspaceSetupActivation.count({ where: { workspaceId } }),
      ).toBe(0);
      expect(
        (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }))
          .status,
      ).toBe("SETUP_INCOMPLETE");
      await expect(activate(review)).resolves.toMatchObject({
        snapshotHash: review.snapshotHash,
      });
    });
  },
);
