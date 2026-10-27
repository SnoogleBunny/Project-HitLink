import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient, StaffAccessActor } from "@flowstate/db";
import { getSessionFromToken, hashSessionToken } from "@flowstate/auth";
import {
  deleteReviewedWorkspaceRecords,
  inspectRetentionInventory,
} from "../../../packages/db/src/retention-inventory";

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "atomic staff access and owner preservation",
  () => {
    let db: PrismaClient, api: typeof import("@flowstate/db");
    const workspaces: string[] = [],
      users: string[] = [];
    beforeAll(async () => {
      process.env.DATABASE_URL = databaseUrl;
      api = await import("@flowstate/db");
      db = api.prisma;
    });
    afterAll(async () => {
      if (!db) return;
      for (const workspaceId of workspaces)
        await db.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(
            "SELECT set_config('hitlink.reviewed_retention_workspace', $1, true)",
            workspaceId,
          );
          await tx.coachingEnrollment.deleteMany({ where: { workspaceId } });
          await tx.coachingProgramVersion.deleteMany({
            where: { program: { workspaceId } },
          });
          await tx.workspace.deleteMany({ where: { id: workspaceId } });
        });
      await db.user.deleteMany({ where: { id: { in: users } } });
    });
    async function fixture(ownerCount = 1) {
      const gym = await db.workspace.create({
        data: {
          name: `staff-access-${randomUUID()}`,
          status: "ACTIVE",
          location: { create: { name: "Gym", timezone: "UTC" } },
        },
      });
      workspaces.push(gym.id);
      const staff = [];
      for (const role of [
        ...Array.from({ length: ownerCount }, () => "OWNER" as const),
        "COACH" as const,
      ]) {
        const user = await db.user.create({
          data: {
            email: `${randomUUID()}@staff-access.example.test`,
            fullName: "Fictional staff",
          },
        });
        users.push(user.id);
        staff.push(
          await db.workspaceUser.create({
            data: {
              workspaceId: gym.id,
              userId: user.id,
              role,
              canManageProgress: true,
              canOverridePrerequisites: true,
            },
          }),
        );
      }
      const owner = staff[0]!;
      return {
        workspaceId: gym.id,
        owner,
        coach: staff.at(-1)!,
        secondOwner: staff[1]!,
        actor: {
          workspaceId: gym.id,
          userId: owner.userId,
        } satisfies StaffAccessActor,
      };
    }
    function change(
      staff: { id: string; updatedAt: Date },
      overrides: { role?: string; isActive?: boolean } = {},
    ) {
      return {
        workspaceUserId: staff.id,
        expectedUpdatedAt: staff.updatedAt.toISOString(),
        role: "COACH",
        isActive: false,
        reason: "Reviewed staff access change",
        operationId: randomUUID(),
        ...overrides,
      };
    }
    it("rejects a foreign target, coach actor and stale owner context without mutation", async () => {
      const a = await fixture(),
        b = await fixture();
      await expect(
        api.changeStaffAccess(a.actor, change(b.coach), { db }),
      ).rejects.toThrow("not found");
      await expect(
        api.changeStaffAccess(
          { workspaceId: a.workspaceId, userId: a.coach.userId },
          change(a.owner),
          { db },
        ),
      ).rejects.toThrow("access changed");
      await db.workspaceUser.update({
        where: { id: a.owner.id },
        data: { isActive: false },
      });
      await expect(
        api.changeStaffAccess(a.actor, change(a.coach), { db }),
      ).rejects.toThrow("access changed");
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId: a.workspaceId },
        }),
      ).toBe(0);
    });
    it("rejects removing the only owner, including self-demotion", async () => {
      const f = await fixture();
      for (const requested of [
        { role: "COACH", isActive: true },
        { role: "OWNER", isActive: false },
      ])
        await expect(
          api.changeStaffAccess(f.actor, change(f.owner, requested), { db }),
        ).rejects.toThrow("at least one active owner");
      expect(
        (
          await db.workspaceUser.findUniqueOrThrow({
            where: { id: f.owner.id },
          })
        ).isActive,
      ).toBe(true);
    });
    it.each(["owner deactivation", "business disabled"] as const)(
      "denies a staff mutation after %s commits while it waits for the shared schedule lock",
      async (boundary) => {
        const f = await fixture(2),
          request = change(f.coach);
        const before = await db.workspaceUser.findUniqueOrThrow({
          where: { id: f.coach.id },
        });
        let acquired!: () => void, applyChange!: () => void;
        const hasLock = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const mayCommit = new Promise<void>((resolve) => {
          applyChange = resolve;
        });
        const blocker = db.$transaction(
          async (tx) => {
            await api.lockClassSchedule(tx, f.workspaceId);
            acquired();
            await mayCommit;
            if (boundary === "owner deactivation")
              await tx.workspaceUser.update({
                where: { id: f.owner.id },
                data: { isActive: false },
              });
            else
              await tx.workspace.update({
                where: { id: f.workspaceId },
                data: { status: "DISABLED" },
              });
          },
          { timeout: 15000 },
        );
        await hasLock;
        const attempted = api.changeStaffAccess(f.actor, request, { db }).then(
          (result) => ({ ok: true as const, result }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        try {
          await expect
            .poll(
              async () => {
                const rows = await db.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (SELECT 1 FROM pg_locks
                WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
                  AND objid::bigint = (hashtext(${`class-schedule:${f.workspaceId}`})::bigint & 4294967295)) AS waiting
            `;
                return rows[0]?.waiting;
              },
              { timeout: 5000 },
            )
            .toBe(true);
        } finally {
          applyChange();
        }
        await blocker;
        const outcome = await attempted;
        expect(outcome.ok).toBe(false);
        if (outcome.ok)
          throw new Error(
            "A revoked staff actor unexpectedly changed another staff account",
          );
        expect(outcome.error).toBeInstanceOf(api.StaffAccessError);
        expect(
          await db.workspaceUser.findUniqueOrThrow({
            where: { id: f.coach.id },
          }),
        ).toEqual(before);
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId: f.workspaceId },
          }),
        ).toBe(0);
      },
      20000,
    );
    it("promotes an existing coach and permits owner demotion only after another owner exists", async () => {
      const f = await fixture();
      await api.changeStaffAccess(
        f.actor,
        change(f.coach, { role: "OWNER", isActive: true }),
        { db },
      );
      expect(
        (
          await db.workspaceUser.findUniqueOrThrow({
            where: { id: f.coach.id },
          })
        ).role,
      ).toBe("OWNER");
      await api.changeStaffAccess(
        f.actor,
        change(f.owner, { role: "COACH", isActive: true }),
        { db },
      );
      expect(
        await db.workspaceUser.count({
          where: { workspaceId: f.workspaceId, role: "OWNER", isActive: true },
        }),
      ).toBe(1);
      await expect(
        api.changeStaffAccess(
          f.actor,
          change(
            await db.workspaceUser.findUniqueOrThrow({
              where: { id: f.coach.id },
            }),
          ),
          { db },
        ),
      ).rejects.toThrow("access changed");
    });
    it("serializes two owners removing each other and preserves one active owner", async () => {
      const f = await fixture(2);
      const results = await Promise.allSettled([
        api.changeStaffAccess(
          f.actor,
          change(f.secondOwner, { role: "OWNER" }),
          {
            db,
          },
        ),
        api.changeStaffAccess(
          { workspaceId: f.workspaceId, userId: f.secondOwner.userId },
          change(f.owner, { role: "OWNER" }),
          { db },
        ),
      ]);
      expect(
        results.filter((item) => item.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        await db.workspaceUser.count({
          where: { workspaceId: f.workspaceId, role: "OWNER", isActive: true },
        }),
      ).toBe(1);
    });
    it("revokes only target sessions, rejects stale edits/reused operations and appends one immutable audit", async () => {
      const f = await fixture(),
        target = f.coach,
        request = change(target);
      const oldToken = randomUUID();
      for (const [userId, token] of [
        [target.userId, oldToken],
        [target.userId, randomUUID()],
        [f.actor.userId, randomUUID()],
      ] as const)
        await db.authSession.create({
          data: {
            userId,
            tokenHash: hashSessionToken(token),
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
      expect(await getSessionFromToken({ token: oldToken })).toMatchObject({
        userId: target.userId,
        role: "COACH",
      });
      const result = await api.changeStaffAccess(f.actor, request, { db });
      expect(result.revokedSessionCount).toBe(2);
      expect(
        await api.changeStaffAccess(f.actor, request, { db }),
      ).toMatchObject({ replayed: true });
      expect(
        await db.authSession.count({ where: { userId: f.actor.userId } }),
      ).toBe(1);
      expect(
        await db.authSession.count({ where: { userId: target.userId } }),
      ).toBe(0);
      expect(await getSessionFromToken({ token: oldToken })).toBeNull();
      const changed = await db.workspaceUser.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(changed).toMatchObject({
        isActive: false,
        canManageProgress: false,
        canOverridePrerequisites: false,
      });
      await expect(
        api.changeStaffAccess(
          f.actor,
          { ...request, operationId: randomUUID(), isActive: true },
          { db },
        ),
      ).rejects.toThrow("record changed");
      await expect(
        api.changeStaffAccess(
          f.actor,
          { ...request, reason: "Changed replay content" },
          { db },
        ),
      ).rejects.toThrow("different staff change");
      const event = await db.workspaceDataEvent.findUniqueOrThrow({
        where: { id: result.id },
      });
      expect(event.metadata).toMatchObject({
        before: { role: "COACH", isActive: true },
        after: { role: "COACH", isActive: false },
        reason: request.reason,
        revokedSessionCount: 2,
      });
      await expect(
        db.workspaceDataEvent.update({
          where: { id: event.id },
          data: { metadata: {} },
        }),
      ).rejects.toThrow("append-only");
      await expect(
        db.workspaceDataEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow("append-only");
    });
    it("ends accepted client access immediately and reactivation cannot restore the old private records", async () => {
      const f = await fixture();
      const client = await db.user.create({
        data: {
          email: `${randomUUID()}@staff-access.example.test`,
          workspaceUsers: {
            create: { workspaceId: f.workspaceId, role: "CUSTOMER" },
          },
        },
      });
      users.push(client.id);
      const member = await db.member.create({
        data: {
          workspaceId: f.workspaceId,
          userId: client.id,
          fullName: "Fictional adult client",
          dateOfBirth: new Date("1990-01-01"),
        },
      });
      const program = await db.coachingProgram.create({
        data: {
          workspaceId: f.workspaceId,
          name: "Explicit free access fixture",
          versions: {
            create: {
              number: 1,
              durationDays: 28,
              deliveryWeekdays: [0, 1, 2, 3, 4, 5, 6],
              responseHours: 48,
              goals: "Private test goal",
              milestones: [],
              appointmentUnits: 1,
              priceCents: 0,
              currency: "cad",
              terms: "Free fixture; no processor payment asserted.",
            },
          },
        },
        include: { versions: true },
      });
      const date = api.getWorkspaceDateString(new Date(), "UTC"),
        startsOn = new Date(`${date}T00:00:00Z`);
      const enrollment = await db.coachingEnrollment.create({
        data: {
          workspaceId: f.workspaceId,
          memberId: member.id,
          programVersionId: program.versions[0]!.id,
          startsOn,
          endsOn: new Date(`${api.addDays(date, 27)}T00:00:00Z`),
          timezone: "UTC",
          currentCoachWorkspaceUserId: f.coach.id,
          caseOwnerWorkspaceUserId: f.owner.id,
          acceptedAt: new Date(),
          contactVerifiedAt: new Date(),
          historyFromDate: startsOn,
          assignments: {
            create: {
              coachWorkspaceUserId: f.coach.id,
              acceptedAt: new Date(),
              historyFromDate: startsOn,
            },
          },
          privateNotes: {
            create: {
              authorWorkspaceUserId: f.coach.id,
              localDate: startsOn,
              body: "Private working fixture",
            },
          },
        },
      });
      const availability = await db.coachingAvailability.create({
        data: {
          workspaceId: f.workspaceId,
          coachWorkspaceUserId: f.coach.id,
          startsAt: new Date(Date.now() + 86400000),
          endsAt: new Date(Date.now() + 90000000),
        },
      });
      const coachActor = { workspaceId: f.workspaceId, userId: f.coach.userId };
      expect(
        (await api.getCoachingDetail(coachActor, enrollment.id)).privateNotes,
      ).toHaveLength(1);
      await api.changeStaffAccess(f.actor, change(f.coach), { db });
      const ended = await db.coachingEnrollment.findUniqueOrThrow({
        where: { id: enrollment.id },
      });
      expect(ended).toMatchObject({
        currentCoachWorkspaceUserId: null,
        proposedCoachWorkspaceUserId: null,
        status: "AWAITING_REPLACEMENT",
      });
      expect(
        (
          await db.coachingAssignment.findFirstOrThrow({
            where: { enrollmentId: enrollment.id },
          })
        ).revokedAt,
      ).not.toBeNull();
      expect(
        (
          await db.coachingAvailability.findUniqueOrThrow({
            where: { id: availability.id },
          })
        ).withdrawnAt,
      ).not.toBeNull();
      await expect(
        api.getCoachingDetail(coachActor, enrollment.id),
      ).rejects.toThrow("access");
      const inactive = await db.workspaceUser.findUniqueOrThrow({
        where: { id: f.coach.id },
      });
      await api.changeStaffAccess(
        f.actor,
        change(inactive, { isActive: true }),
        { db },
      );
      await expect(
        api.getCoachingDetail(coachActor, enrollment.id),
      ).rejects.toThrow("access");
      expect(
        await db.coachingPrivateNote.count({
          where: { enrollmentId: enrollment.id },
        }),
      ).toBe(1);
      const notice = await db.notificationJob.findFirstOrThrow({
        where: {
          workspaceId: f.workspaceId,
          subject: "Your coaching assignment needs review",
        },
      });
      expect(notice.body).not.toContain("Private working fixture");
    });
    it("rolls back role and session revocation if immutable audit cannot commit", async () => {
      const f = await fixture();
      await db.authSession.create({
        data: {
          userId: f.coach.userId,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const faulty = new Proxy(db, {
        get(target, property, receiver) {
          if (property === "$transaction")
            return (work: (tx: unknown) => unknown, options: unknown) =>
              target.$transaction(
                (tx) =>
                  work(
                    new Proxy(tx, {
                      get(inner, key, innerReceiver) {
                        if (key === "workspaceDataEvent")
                          return {
                            ...inner.workspaceDataEvent,
                            findFirst: inner.workspaceDataEvent.findFirst.bind(
                              inner.workspaceDataEvent,
                            ),
                            create: async () => {
                              throw new Error("audit storage unavailable");
                            },
                          };
                        const value = Reflect.get(inner, key, innerReceiver);
                        return typeof value === "function"
                          ? value.bind(inner)
                          : value;
                      },
                    }),
                  ) as never,
                options as never,
              );
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }) as PrismaClient;
      await expect(
        api.changeStaffAccess(f.actor, change(f.coach), { db: faulty }),
      ).rejects.toThrow("audit storage unavailable");
      expect(
        (
          await db.workspaceUser.findUniqueOrThrow({
            where: { id: f.coach.id },
          })
        ).isActive,
      ).toBe(true);
      expect(
        await db.authSession.count({ where: { userId: f.coach.userId } }),
      ).toBe(1);
    });
    it("allows only the reviewed tenant purge to delete protected evidence and restores its local scope", async () => {
      const f = await fixture();
      await api.changeStaffAccess(f.actor, change(f.coach), { db });
      await db.$transaction(async (tx) => {
        const inventory = await inspectRetentionInventory(tx, f.workspaceId);
        await deleteReviewedWorkspaceRecords(
          tx,
          f.workspaceId,
          inventory.fingerprint,
        );
        const setting = await tx.$queryRawUnsafe<
          Array<{ value: string | null }>
        >(
          "SELECT current_setting('hitlink.reviewed_retention_workspace', true) AS value",
        );
        expect(setting[0]?.value ?? "").toBe("");
      });
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
    });
  },
);
