import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { PrismaClient } from "@flowstate/db";

const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)("safe member archival in PostgreSQL", () => {
  let db: PrismaClient;
  let api: typeof import("./member-archive");
  let workspaceId: string,
    ownerId: string,
    coachId: string,
    memberId: string,
    programId: string,
    templateId: string;
  const now = new Date("2026-11-02T12:00:00Z");
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    db = (await import("@flowstate/db")).prisma;
    api = await import("./member-archive");
  });
  beforeEach(async () => {
    const prefix = `archive-${randomUUID()}`;
    ownerId = `${prefix}-owner`;
    coachId = `${prefix}-coach`;
    await db.user.createMany({
      data: [ownerId, coachId].map((id) => ({
        id,
        email: `${id}@example.test`,
      })),
    });
    const workspace = await db.workspace.create({
      data: {
        name: "Fictional archival gym",
        location: {
          create: {
            name: "Gym",
            timezone: "UTC",
            rooms: { create: { name: "Room", capacity: 5 } },
          },
        },
        workspaceUsers: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: coachId, role: "COACH" },
          ],
        },
        members: { create: { fullName: "Retained member", status: "ACTIVE" } },
        programs: { create: { name: "Training" } },
      },
      include: {
        members: true,
        programs: true,
        location: { include: { rooms: true } },
      },
    });
    workspaceId = workspace.id;
    memberId = workspace.members[0]!.id;
    programId = workspace.programs[0]!.id;
    templateId = (
      await db.classTemplate.create({
        data: {
          workspaceId,
          programId,
          roomId: workspace.location!.rooms[0]!.id,
          weekday: "TUESDAY",
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 0,
        },
      })
    ).id;
  });
  afterEach(async () => {
    await db.classBooking.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, coachId] } } });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  const actor = () => ({ workspaceId, userId: ownerId });
  const change = async (archived = true, expectedVersion = 0) => {
    const preview = await api.getMemberArchive(actor(), memberId, now);
    return api.changeMemberArchive(
      actor(),
      {
        memberId,
        archived,
        expectedVersion,
        reason: "Reviewed departure with no services",
        expectedImpactHash: preview!.impact.hash,
        retainBalancesAndUnits: true,
      },
      now,
    );
  };

  async function failFirstArchiveAudit(sqlState: "40001" | "23514") {
    const key = `archive_retry_${randomUUID().replaceAll("-", "")}`;
    const sequence = `${key}_seq`,
      fn = `${key}_fn`,
      trigger = `${key}_tr`;
    await db.$executeRawUnsafe(`CREATE SEQUENCE "${sequence}"`);
    await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."workspaceId" = TG_ARGV[0] AND NEW.kind = 'MEMBER_ARCHIVED'
          AND nextval('"${sequence}"') = 1 THEN
          RAISE EXCEPTION 'Fictional archive audit failure' USING ERRCODE = '${sqlState}';
        END IF;
        RETURN NEW;
      END;
      $$`);
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${trigger}" AFTER INSERT ON workspace_data_events FOR EACH ROW EXECUTE FUNCTION "${fn}"('${workspaceId}')`,
    );
    return {
      attempts: async () =>
        Number(
          (
            await db.$queryRawUnsafe<Array<{ last_value: bigint }>>(
              `SELECT last_value FROM "${sequence}"`,
            )
          )[0]!.last_value,
        ),
      cleanup: async () => {
        await db.$executeRawUnsafe(
          `DROP TRIGGER "${trigger}" ON workspace_data_events`,
        );
        await db.$executeRawUnsafe(`DROP FUNCTION "${fn}"()`);
        await db.$executeRawUnsafe(`DROP SEQUENCE "${sequence}"`);
      },
    };
  }

  it("retries a real serialization failure of the whole archive transaction and commits one event", async () => {
    const fault = await failFirstArchiveAudit("40001");
    try {
      await expect(change()).resolves.toEqual({ version: 1 });
      expect(await fault.attempts()).toBe(2);
      expect(
        await db.member.findUniqueOrThrow({ where: { id: memberId } }),
      ).toMatchObject({ archivedAt: now, archiveVersion: 1 });
      const events = await db.workspaceDataEvent.findMany({
        where: { workspaceId, kind: "MEMBER_ARCHIVED" },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorUserId: ownerId,
        metadata: {
          before: { archivedAt: null },
          after: { archivedAt: now.toISOString() },
          version: 1,
        },
      });
    } finally {
      await fault.cleanup();
    }
  });

  it("does not retry other database failures and rolls back the archive and audit", async () => {
    const fault = await failFirstArchiveAudit("23514");
    try {
      await expect(change()).rejects.toThrow(/Fictional archive audit failure/);
      expect(await fault.attempts()).toBe(1);
      expect(
        await db.member.findUniqueOrThrow({ where: { id: memberId } }),
      ).toMatchObject({ archivedAt: null, archiveVersion: 0 });
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "MEMBER_ARCHIVED" },
        }),
      ).toBe(0);
    } finally {
      await fault.cleanup();
    }
  });

  it("rejects coaches and foreign-member IDs without writes", async () => {
    await expect(
      api.changeMemberArchive(
        { workspaceId, userId: coachId },
        {
          memberId,
          archived: true,
          expectedVersion: 0,
          reason: "Forged owner change",
        },
        now,
      ),
    ).rejects.toThrow("Only an active owner");
    await expect(
      api.changeMemberArchive(
        actor(),
        {
          memberId: "foreign",
          archived: true,
          expectedVersion: 0,
          reason: "Forged member change",
        },
        now,
      ),
    ).rejects.toThrow("Member not found");
    expect(await db.workspaceDataEvent.count({ where: { workspaceId } })).toBe(
      0,
    );
  });
  it("archives and reactivates the directory record without erasing debt, history or creating entitlement", async () => {
    const invoice = await db.invoice.create({
      data: {
        workspaceId,
        memberId,
        subtotalCents: 5000,
        totalCents: 5000,
        amountDueCents: 5000,
        currency: "cad",
        status: "OPEN",
      },
    });
    await change();
    expect(
      await db.member.findUniqueOrThrow({ where: { id: memberId } }),
    ).toMatchObject({ archivedAt: now, archiveVersion: 1, status: "ACTIVE" });
    expect(
      await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }),
    ).toMatchObject({ amountDueCents: 5000, status: "OPEN" });
    await expect(change()).rejects.toThrow("status changed");
    await change(true, 1);
    expect(
      await db.workspaceDataEvent.count({
        where: { workspaceId, kind: "MEMBER_ARCHIVED" },
      }),
    ).toBe(1);
    await change(false, 1);
    expect(
      await db.member.findUniqueOrThrow({ where: { id: memberId } }),
    ).toMatchObject({ archivedAt: null, archiveVersion: 2 });
    expect(await db.memberMembership.count({ where: { workspaceId } })).toBe(0);
    expect(
      await db.workspaceDataEvent.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      }),
    ).toEqual([
      expect.objectContaining({
        actorUserId: ownerId,
        kind: "MEMBER_ARCHIVED",
        metadata: expect.objectContaining({
          memberId,
          reason: "Reviewed departure with no services",
          before: { archivedAt: null },
          after: { archivedAt: now.toISOString() },
        }),
      }),
      expect.objectContaining({
        actorUserId: ownerId,
        kind: "MEMBER_REACTIVATED",
      }),
    ]);
  });
  it("requires accepted membership services to end through their separate lifecycle", async () => {
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId,
        name: "Existing membership",
        monthlyPriceCents: 5000,
        currency: "cad",
      },
    });
    const membership = await db.memberMembership.create({
      data: {
        workspaceId,
        memberId,
        membershipPlanId: plan.id,
        status: "ACTIVE",
      },
    });
    await expect(change()).rejects.toThrow("active memberships");
    expect(
      (
        await db.memberMembership.findUniqueOrThrow({
          where: { id: membership.id },
        })
      ).status,
    ).toBe("ACTIVE");
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: memberId } }))
        .archivedAt,
    ).toBeNull();
  });
  it("requires an explicit disposition for future seats and waitlist entries", async () => {
    const date = new Date("2026-11-03T00:00:00Z");
    const booking = await db.classBooking.create({
      data: {
        workspaceId,
        memberId,
        classTemplateId: templateId,
        scheduledForDate: date,
        bookingType: "TRIAL",
        source: "ADMIN",
        status: "BOOKED",
      },
    });
    await expect(change()).rejects.toThrow("future bookings");
    await db.classBooking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED" },
    });
    const waitlist = await db.waitlistEntry.create({
      data: {
        workspaceId,
        memberId,
        classTemplateId: templateId,
        scheduledForDate: date,
      },
    });
    await expect(change()).rejects.toThrow("waitlists");
    await db.waitlistEntry.update({
      where: { id: waitlist.id },
      data: { status: "CANCELLED" },
    });
    await change();
  });
  it("blocks archived records at shared class eligibility even when rank prerequisites are off", async () => {
    await change();
    const { checkMemberClassEligibility } = await import("@flowstate/db");
    expect(
      await checkMemberClassEligibility({
        workspaceId,
        memberId,
        scheduledForDate: "2026-11-03",
        occurrence: { classTemplateId: templateId, programId },
        db,
      }),
    ).toMatchObject({
      eligible: false,
      reason: "Reactivate this member before booking a class.",
    });
  });
  it("requires a fresh balance preview and explicit retention of debt and unused units", async () => {
    const preview = await api.getMemberArchive(actor(), memberId, now);
    await expect(
      api.changeMemberArchive(
        actor(),
        {
          memberId,
          archived: true,
          expectedVersion: 0,
          expectedImpactHash: preview!.impact.hash,
          reason: "Reviewed departure",
        },
        now,
      ),
    ).rejects.toThrow("Confirm");
    await db.invoice.create({
      data: {
        workspaceId,
        memberId,
        subtotalCents: 5000,
        totalCents: 5000,
        amountDueCents: 5000,
        currency: "cad",
      },
    });
    await expect(
      api.changeMemberArchive(
        actor(),
        {
          memberId,
          archived: true,
          expectedVersion: 0,
          expectedImpactHash: preview!.impact.hash,
          retainBalancesAndUnits: true,
          reason: "Reviewed departure",
        },
        now,
      ),
    ).rejects.toThrow("preview changed");
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: memberId } }))
        .archivedAt,
    ).toBeNull();
    await change();
    const event = await db.workspaceDataEvent.findFirstOrThrow({
      where: { workspaceId, kind: "MEMBER_ARCHIVED" },
    });
    expect(event.metadata).toMatchObject({
      disposition: {
        debt: [{ currency: "cad", amountMinor: 5000 }],
        disposition: "RETAIN_BALANCES_AND_UNITS",
      },
    });
  });
  it("serializes competing stale archive requests into one attributed change", async () => {
    const outcomes = await Promise.allSettled([change(), change()]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await db.workspaceDataEvent.count({
        where: { workspaceId, kind: "MEMBER_ARCHIVED" },
      }),
    ).toBe(1);
  });
});
