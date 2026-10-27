import { createHash, randomUUID } from "node:crypto";
import { runMigrationImport } from "./workspace-migration";
import { buildEntitlementStagedRow } from "./migration-entitlement-parser";
import { updateRoom } from "./rooms";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type {
  PrismaClient,
  ClassBookingStatus,
  Prisma,
  RoomCapacityInput,
} from "@flowstate/db";
const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!/test|e2e/i.test(new URL(url).pathname) ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
)
  throw new Error(
    "Room capacity proof requires an explicit disposable loopback test database.",
  );
(url ? describe : describe.skip)(
  "WS06 room default capacity review in PostgreSQL",
  () => {
    let api: typeof import("@flowstate/db"), db: PrismaClient;
    let workspaceId: string,
      ownerId: string,
      coachId: string,
      ownerStaffId: string,
      coachStaffId: string,
      roomId: string,
      otherRoomId: string,
      templateId: string,
      programId: string;
    let users: string[], members: string[];
    const date = "2026-11-02",
      now = new Date("2026-11-02T12:00:00Z");
    const actor = () => ({ workspaceId, userId: ownerId });
    const options = () => ({ db, now });
    const input = async (capacity: string): Promise<RoomCapacityInput> => ({
      roomId,
      capacity,
      expectedVersion: (
        await api.getRoomCapacitySettings(actor(), roomId, options())
      ).version,
      operationId: randomUUID(),
      reason: "Reviewed the room default and existing reservations",
    });
    const book = (
      member: number,
      values: {
        template?: string;
        date?: string;
        status?: ClassBookingStatus;
        expires?: Date | null;
      } = {},
    ) =>
      db.classBooking.create({
        data: {
          workspaceId,
          memberId: members[member]!,
          classTemplateId: values.template ?? templateId,
          scheduledForDate: new Date(`${values.date ?? date}Z`),
          status: values.status ?? "BOOKED",
          pendingPaymentExpiresAt: values.expires,
        },
      });
    const confirmed = async (change: RoomCapacityInput) => {
      const review = await api.previewRoomCapacityChange(
        actor(),
        change,
        options(),
      );
      return api.confirmRoomCapacityChange(
        actor(),
        change,
        { previewHash: review.previewHash, confirmed: true },
        options(),
      );
    };
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      api = await import("@flowstate/db");
      db = api.prisma;
    });
    beforeEach(async () => {
      [ownerId, coachId] = [randomUUID(), randomUUID()];
      users = [ownerId, coachId];
      await db.user.createMany({
        data: users.map((id) => ({
          id,
          fullName: "Fictional room reviewer",
          email: `${id}@room-capacity.example.test`,
        })),
      });
      const gym = await db.workspace.create({
        data: {
          name: `room-default-${randomUUID()}`,
          status: "ACTIVE",
          location: {
            create: {
              name: "Gym",
              timezone: "UTC",
              rooms: {
                create: [
                  { name: "Default Mat", capacity: 5 },
                  { name: "Other Mat", capacity: 8 },
                ],
              },
            },
          },
          workspaceUsers: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: coachId, role: "COACH" },
            ],
          },
          programs: { create: { name: "Training" } },
        },
        include: {
          location: { include: { rooms: true } },
          workspaceUsers: true,
          programs: true,
        },
      });
      workspaceId = gym.id;
      roomId = gym.location!.rooms.find((r) => r.name === "Default Mat")!.id;
      otherRoomId = gym.location!.rooms.find((r) => r.name === "Other Mat")!.id;
      programId = gym.programs[0]!.id;
      ownerStaffId = gym.workspaceUsers.find((u) => u.userId === ownerId)!.id;
      coachStaffId = gym.workspaceUsers.find((u) => u.userId === coachId)!.id;
      members = [];
      for (let i = 0; i < 6; i++)
        members.push(
          (
            await db.member.create({
              data: {
                workspaceId,
                fullName: `Fictional room participant ${i}`,
              },
            })
          ).id,
        );
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            programId,
            roomId,
            coachWorkspaceUserId: coachStaffId,
            title: "Retained room-default class",
            weekday: "MONDAY",
            startTimeMinutes: 1380,
            endTimeMinutes: 1439,
            bookingCutoffMinutes: 0,
            cancellationCutoffMinutes: 0,
          },
        })
      ).id;
    });
    afterEach(async () => {
      await db.classBooking.deleteMany({ where: { workspaceId } });
      await db.waitlistEntry.deleteMany({ where: { workspaceId } });
      await db.classInstance.deleteMany({ where: { workspaceId } });
      await db.classScheduleRevision.deleteMany({ where: { workspaceId } });
      await db.classTemplate.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    });
    afterAll(() => db.$disconnect());
    it("blocks a reduction below inheriting future reservations without changing the room, seats or funding", async () => {
      const seats = await Promise.all([0, 1, 2].map((i) => book(i)));
      const change = await input("2"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      expect(review.inherited).toMatchObject([
        { classTemplateId: templateId, date, reservations: 3, capacity: 2 },
      ]);
      expect(review.errors.join(" ")).toContain("3 existing reservations");
      await expect(
        api.confirmRoomCapacityChange(
          actor(),
          change,
          { previewHash: review.previewHash, confirmed: true },
          options(),
        ),
      ).rejects.toThrow(/capacity review blockers/i);
      expect(
        (await db.room.findUniqueOrThrow({ where: { id: roomId } })).capacity,
      ).toBe(5);
      expect(
        await db.classBooking.findMany({
          where: { id: { in: seats.map((s) => s.id) } },
          orderBy: { id: "asc" },
        }),
      ).toEqual([...seats].sort((a, b) => a.id.localeCompare(b.id)));
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
        }),
      ).toBe(0);
      expect(
        await db.membershipAllowanceEntry.count({ where: { workspaceId } }),
      ).toBe(0);
      expect(await db.punchCardEntry.count({ where: { workspaceId } })).toBe(0);
    });
    it("preserves a class-specific capacity higher than the room default, so its bookings do not spuriously block a room-default reduction", async () => {
      await db.classTemplate.update({
        where: { id: templateId },
        data: { capacityOverride: 7 },
      });
      const seats = await Promise.all([0, 1, 2].map((i) => book(i)));
      const change = await input("1"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      expect(review.errors).toEqual([]);
      expect(review.inherited).toEqual([]);
      expect(review.explicitOverrides).toMatchObject([
        { capacity: 7, reservations: 3, date },
      ]);
      await api.confirmRoomCapacityChange(
        actor(),
        change,
        { previewHash: review.previewHash, confirmed: true },
        options(),
      );
      const template = await db.classTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: api.classOccurrenceInclude,
      });
      expect(
        api.resolveClassOccurrence({ template, scheduledForDate: date })!
          .effectiveCapacity,
      ).toBe(7);
      expect(template.room.capacity).toBe(1);
      expect(
        await db.classBooking.count({
          where: { id: { in: seats.map((s) => s.id) }, status: "BOOKED" },
        }),
      ).toBe(3);
    });
    it("uses resolved dated room/capacity inheritance rather than the template base or a coach-only snapshot", async () => {
      await db.classTemplate.update({
        where: { id: templateId },
        data: { roomId: otherRoomId },
      });
      const template = await db.classTemplate.findUniqueOrThrow({
        where: { id: templateId },
      });
      const fields = {
        workspaceId,
        classTemplateId: templateId,
        scheduledForDate: new Date(`${date}Z`),
        programId,
        roomId,
        coachWorkspaceUserId: coachStaffId,
        title: template.title,
        startTimeMinutes: template.startTimeMinutes,
        endTimeMinutes: template.endTimeMinutes,
        capacityOverride: null,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 0,
        status: "ACTIVE" as const,
        coachAssignmentMode: "ASSIGNED" as const,
      };
      await db.classInstance.create({
        data: { ...fields, isScheduleOverride: false },
      });
      await Promise.all([0, 1, 2].map((i) => book(i)));
      const first = await api.previewRoomCapacityChange(
        actor(),
        await input("1"),
        options(),
      );
      expect(first.inherited).toEqual([]);
      expect(first.errors).toEqual([]);
      await db.classInstance.updateMany({
        where: { workspaceId, classTemplateId: templateId },
        data: { isScheduleOverride: true, capacityOverride: 4 },
      });
      const overridden = await api.previewRoomCapacityChange(
        actor(),
        await input("1"),
        options(),
      );
      expect(overridden.errors).toEqual([]);
      expect(overridden.explicitOverrides[0]).toMatchObject({
        capacity: 4,
        reservations: 3,
      });
      await db.classInstance.updateMany({
        where: { workspaceId, classTemplateId: templateId },
        data: { capacityOverride: null },
      });
      const inherited = await api.previewRoomCapacityChange(
        actor(),
        await input("1"),
        options(),
      );
      expect(inherited.inherited[0]).toMatchObject({
        capacity: 1,
        reservations: 3,
      });
      expect(inherited.errors.join(" ")).toContain("3 existing reservations");
      await db.classInstance.updateMany({
        where: { workspaceId, classTemplateId: templateId },
        data: { isScheduleOverride: false },
      });
      await db.classScheduleRevision.create({
        data: {
          workspaceId,
          classTemplateId: templateId,
          effectiveFrom: new Date(`${date}Z`),
          startDate: new Date(`${date}Z`),
          recurrence: "WEEKLY",
          weekdays: ["MONDAY"],
          programId,
          roomId,
          coachWorkspaceUserId: coachStaffId,
          title: "Dated inherited room revision",
          startTimeMinutes: 1380,
          endTimeMinutes: 1439,
          capacityOverride: null,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 0,
        },
      });
      const revision = await api.previewRoomCapacityChange(
        actor(),
        await input("1"),
        options(),
      );
      expect(revision.inherited[0]).toMatchObject({
        title: "Dated inherited room revision",
        reservations: 3,
        capacity: 1,
      });
      expect(revision.errors.join(" ")).toContain("3 existing reservations");
    });
    it("includes a still-future old-zone class after the current business clock advances to the next date", async () => {
      await Promise.all([0, 1, 2].map((i) => book(i)));
      await db.workspaceTimezoneRevision.create({
        data: {
          workspaceId,
          version: 1,
          previousTimezone: "UTC",
          timezone: "Pacific/Kiritimati",
          effectiveFromDate: new Date("2026-11-03Z"),
          effectiveAt: new Date("2026-11-02T10:00:00Z"),
          actorUserId: ownerId,
          previewHash: "a".repeat(64),
        },
      });
      expect(
        api.getWorkspaceDateString(
          now,
          await api.resolveWorkspaceClockTimezone({
            workspaceId,
            baselineTimezone: "UTC",
            now,
            db,
          }),
        ),
      ).toBe("2026-11-03");
      const review = await api.previewRoomCapacityChange(
        actor(),
        await input("2"),
        options(),
      );
      expect(review.inherited[0]).toMatchObject({
        date: "2026-11-02",
        timezone: "UTC",
        startsAt: "2026-11-02T23:00:00.000Z",
        reservations: 3,
      });
      expect(review.errors.join(" ")).toContain("3 existing reservations");
    });
    it("keeps historical bookings untouched and excludes expired pending holds without cleaning them up", async () => {
      const past = await book(0, { date: "2026-10-26" });
      const expired = await book(1, {
        status: "PENDING_PAYMENT",
        expires: now,
      });
      const live = await book(2, {
        status: "PENDING_PAYMENT",
        expires: new Date(+now + 3600000),
      });
      const change = await input("1"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      expect(review.errors).toEqual([]);
      expect(review.inherited[0]).toMatchObject({
        reservations: 1,
        pendingPayments: 1,
      });
      await api.confirmRoomCapacityChange(
        actor(),
        change,
        { previewHash: review.previewHash, confirmed: true },
        options(),
      );
      for (const row of [past, expired, live])
        expect(
          await db.classBooking.findUniqueOrThrow({ where: { id: row.id } }),
        ).toEqual(row);
    });
    it("uses the actual start instant to leave already-started same-date commitments unchanged", async () => {
      await db.classTemplate.update({
        where: { id: templateId },
        data: { startTimeMinutes: 660, endTimeMinutes: 720 },
      });
      const seats = await Promise.all([0, 1, 2].map((i) => book(i)));
      const change = await input("1"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      expect(review.inherited).toEqual([]);
      expect(review.errors).toEqual([]);
      await api.confirmRoomCapacityChange(
        actor(),
        change,
        { previewHash: review.previewHash, confirmed: true },
        options(),
      );
      for (const row of seats)
        expect(
          await db.classBooking.findUniqueOrThrow({ where: { id: row.id } }),
        ).toEqual(row);
    });
    it("treats blank as no room default limit and a later finite default as a reduction from unlimited", async () => {
      await confirmed(await input(""));
      expect(
        (await db.room.findUniqueOrThrow({ where: { id: roomId } })).capacity,
      ).toBeNull();
      await Promise.all([0, 1, 2].map((i) => book(i)));
      const review = await api.previewRoomCapacityChange(
        actor(),
        await input("2"),
        options(),
      );
      expect(review.errors.join(" ")).toContain("3 existing reservations");
      expect(
        (await api.getRoomCapacitySettings(actor(), roomId, options()))
          .history[0],
      ).toMatchObject({ previousCapacity: 5, capacity: null, revision: 1 });
    });
    it("counts active payment-pending reservations with no expiry, while waitlist places are disclosed without occupying seats", async () => {
      await book(0);
      await book(1, { status: "PENDING_PAYMENT", expires: null });
      await db.waitlistEntry.create({
        data: {
          workspaceId,
          memberId: members[2]!,
          classTemplateId: templateId,
          scheduledForDate: new Date(`${date}Z`),
          status: "ACTIVE",
        },
      });
      const review = await api.previewRoomCapacityChange(
        actor(),
        await input("1"),
        options(),
      );
      expect(review.inherited[0]).toMatchObject({
        reservations: 2,
        pendingPayments: 1,
        waitlist: 1,
      });
      expect(review.errors.join(" ")).toContain("2 existing reservations");
    });
    it("rejects a stale preview after an intervening reservation and after a room identity revision", async () => {
      await book(0);
      const change = await input("2"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      await book(1);
      await expect(
        api.confirmRoomCapacityChange(
          actor(),
          change,
          { previewHash: review.previewHash, confirmed: true },
          options(),
        ),
      ).rejects.toThrow(/reservations changed|effects again/i);
      await db.room.update({
        where: { id: roomId },
        data: { name: "Renamed while draft open" },
      });
      await expect(
        api.previewRoomCapacityChange(actor(), change, options()),
      ).rejects.toThrow(/Room settings changed/i);
      expect(
        (await db.room.findUniqueOrThrow({ where: { id: roomId } })).capacity,
      ).toBe(5);
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
        }),
      ).toBe(0);
    });
    it("records one immutable versioned receipt, exact replay does not overwrite a later room default, and changed-payload replay denies", async () => {
      const change = await input("4"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      const first = await api.confirmRoomCapacityChange(
        actor(),
        change,
        { previewHash: review.previewHash, confirmed: true },
        options(),
      );
      expect(first).toMatchObject({
        revision: 1,
        capacity: 4,
        replayed: false,
      });
      expect(
        (await api.getRoomCapacitySettings(actor(), roomId, options())).version,
      ).toBe(first.confirmedVersion);
      const second = await confirmed(await input("3"));
      expect(second.revision).toBe(2);
      expect(
        await api.confirmRoomCapacityChange(
          actor(),
          change,
          { previewHash: review.previewHash, confirmed: true },
          options(),
        ),
      ).toMatchObject({
        eventId: first.eventId,
        revision: 1,
        confirmedVersion: first.confirmedVersion,
        replayed: true,
      });
      expect(
        (await db.room.findUniqueOrThrow({ where: { id: roomId } })).capacity,
      ).toBe(3);
      await expect(
        api.confirmRoomCapacityChange(
          actor(),
          { ...change, capacity: "2" },
          { previewHash: review.previewHash, confirmed: true },
          options(),
        ),
      ).rejects.toThrow(/different room change/i);
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
        }),
      ).toBe(2);
      // A previously opened generic details form may still POST its old capacity.
      // Renaming the room must not put that unreviewed default back.
      const room = await db.room.findUniqueOrThrow({ where: { id: roomId } });
      await expect(
        updateRoom({
          roomId,
          locationId: room.locationId,
          input: {
            name: "Renamed after capacity review",
            capacity: "5",
            isActive: true,
          },
          db,
        }),
      ).resolves.toMatchObject({ status: "updated" });
      expect(
        (await db.room.findUniqueOrThrow({ where: { id: roomId } })).capacity,
      ).toBe(3);
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
        }),
      ).toBe(2);
      await expect(
        db.workspaceDataEvent.update({
          where: { id: first.eventId },
          data: { metadata: {} },
        }),
      ).rejects.toThrow(/immutable/i);
      await expect(
        db.workspaceDataEvent.delete({ where: { id: first.eventId } }),
      ).rejects.toThrow(/immutable/i);
    });
    it("rolls back the Room update when the real receipt insert fails", async () => {
      const change = await input("4"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      const fn = `room_receipt_failure_${randomUUID().replaceAll("-", "")}`;
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId" = '${workspaceId.replaceAll("'", "''")}' AND NEW.kind = 'ROOM_DEFAULT_CAPACITY_CONFIRMED' THEN RAISE EXCEPTION 'Fictional receipt write failure' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END; $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER "${fn}" BEFORE INSERT ON workspace_data_events FOR EACH ROW EXECUTE FUNCTION "${fn}"()`,
      );
      try {
        await expect(
          api.confirmRoomCapacityChange(
            actor(),
            change,
            { previewHash: review.previewHash, confirmed: true },
            options(),
          ),
        ).rejects.toThrow(/Fictional receipt write failure/);
        expect(
          (await db.room.findUniqueOrThrow({ where: { id: roomId } })).capacity,
        ).toBe(5);
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
          }),
        ).toBe(0);
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS "${fn}" ON workspace_data_events`,
        );
        await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
      }
    });
    it("requires acknowledgment and current owner scope, including replay after owner deactivation", async () => {
      const change = await input("4"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      await expect(
        api.confirmRoomCapacityChange(
          actor(),
          change,
          { previewHash: review.previewHash, confirmed: false },
          options(),
        ),
      ).rejects.toThrow(/Acknowledge/i);
      await expect(
        api.previewRoomCapacityChange(
          { workspaceId, userId: coachId },
          change,
          options(),
        ),
      ).rejects.toThrow(/current active owner/i);
      const crossScope = { ...actor(), workspaceId: "another-workspace" };
      await expect(
        api.previewRoomCapacityChange(crossScope, change, options()),
      ).rejects.toThrow(/current active owner|unavailable/i);
      await api.confirmRoomCapacityChange(
        actor(),
        change,
        { previewHash: review.previewHash, confirmed: true },
        options(),
      );
      await db.workspaceUser.update({
        where: { id: ownerStaffId },
        data: { isActive: false },
      });
      await expect(
        api.confirmRoomCapacityChange(
          actor(),
          change,
          { previewHash: review.previewHash, confirmed: true },
          options(),
        ),
      ).rejects.toThrow(/current active owner/i);
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
        }),
      ).toBe(1);
    });
    it("denies a Serializable late booking queued behind a confirmed room-default reduction without adding a seat or receipt", async () => {
      const readyAt = new Date("2026-11-01T00:00:00Z");
      await db.workspaceMigration.create({
        data: {
          workspaceId,
          stage: "COMPLETE",
          nextOwnerAction: "Fictional reviewed setup",
          flowstateResponsibility: "Fictional local verification",
          ownerReviewAcknowledgedAt: readyAt,
          ownerReviewAcknowledgedByUserId: ownerId,
          operationallyReadyAt: readyAt,
          operationallyReadyByUserId: ownerId,
        },
      });
      const policy = {
        schemaVersion: 1 as const,
        classes: {
          weeklyHours: api.schedulingWeekdays.map((weekday) => ({
            weekday,
            intervals: [{ startMinute: 0, endMinute: 1440 }],
          })),
          maxAdvanceMinutes: 60 * 1440,
          minimumLeadMinutes: 1440,
        },
      };
      const policyHash = api.schedulingPolicyHash(policy);
      await db.workspaceSchedulingPolicyRevision.create({
        data: {
          workspaceId,
          version: 1,
          policy,
          policyHash,
          previewHash: policyHash,
          actorUserId: ownerId,
          reason: "Fictional reviewed scheduling window",
          activatedAt: readyAt,
        },
      });
      await book(1);
      await book(2);
      const lateInput = {
        classTemplateId: templateId,
        memberId: members[0]!,
        scheduledForDate: date,
        bookingType: "TRIAL" as const,
        operationId: randomUUID(),
        reason: "Fictional late-place review",
      };
      const lateReview = await api.previewOwnerLateClassBooking({
        actor: actor(),
        input: lateInput,
        ...options(),
      });
      const change = await input("2"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      let held!: () => void, release!: () => void;
      const acquired = new Promise<void>((resolve) => {
          held = resolve;
        }),
        finish = new Promise<void>((resolve) => {
          release = resolve;
        });
      const holdingDb = new Proxy(db, {
        get(target, key) {
          if (key === "$transaction")
            return (
              callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
              txOptions: unknown,
            ) =>
              target.$transaction(
                async (tx) => {
                  const result = await callback(tx);
                  held();
                  await finish;
                  return result;
                },
                txOptions as { timeout: number },
              );
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const reduction = api.confirmRoomCapacityChange(
        actor(),
        change,
        { previewHash: review.previewHash, confirmed: true },
        { ...options(), db: holdingDb },
      );
      await acquired;
      const attempt = api
        .confirmOwnerLateClassBooking({
          actor: actor(),
          input: lateInput,
          previewHash: lateReview.previewHash,
          confirmed: true,
          ...options(),
        })
        .then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        );
      try {
        await expect
          .poll(
            async () =>
              (
                await db.$queryRaw<
                  { waiting: boolean }[]
                >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid::bigint=(hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)) AS waiting`
              )[0]?.waiting,
            { timeout: 5000 },
          )
          .toBe(true);
      } finally {
        release();
      }
      await reduction;
      const result = await attempt;
      const persisted = {
        bookingCommitted: result.ok,
        capacity: (await db.room.findUniqueOrThrow({ where: { id: roomId } }))
          .capacity,
        seats: await db.classBooking.count({ where: { workspaceId } }),
        lateReceipts: await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "OWNER_LATE_BOOKING_CONFIRMED" },
        }),
        roomReceipts: await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
        }),
      };
      expect(persisted).toEqual({
        bookingCommitted: false,
        capacity: 2,
        seats: 2,
        lateReceipts: 0,
        roomReceipts: 1,
      });
      if (result.ok)
        throw Error("A stale capacity snapshot added a late booking");
      expect(result.error).toBeInstanceOf(api.OwnerLateBookingError);
      expect(String(result.error)).toMatch(/full|capacity|changed|preview/i);
      expect(
        (await db.room.findUniqueOrThrow({ where: { id: roomId } })).capacity,
      ).toBe(2);
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(2);
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "OWNER_LATE_BOOKING_CONFIRMED" },
        }),
      ).toBe(0);
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
        }),
      ).toBe(1);
      expect(await db.punchCardEntry.count({ where: { workspaceId } })).toBe(0);
    }, 20000);
    it("retries an actual Serializable staging import queued behind a room reduction, then rejects the full occurrence without restoring a source seat or funding", async () => {
      await db.workspace.update({
        where: { id: workspaceId },
        data: { status: "SETUP_INCOMPLETE" },
      });
      await db.workspaceMigration.create({
        data: {
          workspaceId,
          stage: "MIGRATION_IN_PROGRESS",
          nextOwnerAction: "Fictional source review",
          flowstateResponsibility: "Private capacity verification",
        },
      });
      const importedDate = "2099-01-05";
      await book(1, { date: importedDate });
      await book(2, { date: importedDate });
      const raw = {
        external_id: "future-seat",
        member_external_id: "future-person",
        class_template_external_id: "future-class",
        scheduled_for_date: importedDate,
        funding_type: "TRIAL",
        source_evidence: "Fictional verified existing source reservation",
      };
      const parsed = buildEntitlementStagedRow("FUTURE_BOOKING", raw);
      expect(parsed.issues).toEqual([]);
      const rawContent = JSON.stringify(raw);
      const job = await db.importJob.create({
        data: {
          workspaceId,
          name: "Fictional future reservation",
          status: "VALIDATED",
        },
      });
      const source = await db.importSourceFile.create({
        data: {
          workspaceId,
          importJobId: job.id,
          fileName: "fictional-future-reservation.json",
          fileSizeBytes: Buffer.byteLength(rawContent),
          fileSha256: createHash("sha256").update(rawContent).digest("hex"),
          rawContent,
        },
      });
      const row = await db.stagingRecord.create({
        data: {
          workspaceId,
          importJobId: job.id,
          importSourceFileId: source.id,
          recordKind: "FUTURE_BOOKING",
          externalId: parsed.externalId!,
          rawData: raw,
          mappedData: parsed.mappedData as Prisma.InputJsonObject,
          isReadyForImport: true,
        },
      });
      await db.migrationImportedRecord.createMany({
        data: [
          {
            workspaceId,
            recordKind: "MEMBER",
            externalId: raw.member_external_id,
            importedModel: "Member",
            importedRecordId: members[0]!,
          },
          {
            workspaceId,
            recordKind: "SCHEDULE_TEMPLATE",
            externalId: raw.class_template_external_id,
            importedModel: "ClassTemplate",
            importedRecordId: templateId,
          },
        ],
      });
      const change = await input("2"),
        review = await api.previewRoomCapacityChange(
          actor(),
          change,
          options(),
        );
      let held!: () => void, release!: () => void;
      const acquired = new Promise<void>((resolve) => {
          held = resolve;
        }),
        finish = new Promise<void>((resolve) => {
          release = resolve;
        });
      const holdingDb = new Proxy(db, {
        get(target, key) {
          if (key === "$transaction")
            return (
              callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
              txOptions: unknown,
            ) =>
              target.$transaction(
                async (tx) => {
                  const result = await callback(tx);
                  held();
                  await finish;
                  return result;
                },
                txOptions as { timeout: number },
              );
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const reduction = api.confirmRoomCapacityChange(
        actor(),
        change,
        { previewHash: review.previewHash, confirmed: true },
        { ...options(), db: holdingDb },
      );
      await acquired;
      const room = await db.room.findUniqueOrThrow({ where: { id: roomId } });
      const attempt = runMigrationImport({
        workspaceId,
        locationId: room.locationId,
        importJobId: job.id,
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "fictional-room-import-operator",
        },
        db,
      });
      try {
        await expect
          .poll(
            async () =>
              (
                await db.$queryRaw<
                  { waiting: boolean }[]
                >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid::bigint=(hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)) AS waiting`
              )[0]?.waiting,
            { timeout: 5000 },
          )
          .toBe(true);
      } finally {
        release();
      }
      await reduction;
      const result = await attempt;
      const persisted = {
        result: result.status,
        capacity: (await db.room.findUniqueOrThrow({ where: { id: roomId } }))
          .capacity,
        seats: await db.classBooking.count({ where: { workspaceId } }),
        imported: await db.migrationImportedRecord.count({
          where: { workspaceId, recordKind: "FUTURE_BOOKING" },
        }),
        roomReceipts: await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
        }),
      };
      expect(persisted).toEqual({
        result: "error",
        capacity: 2,
        seats: 2,
        imported: 0,
        roomReceipts: 1,
      });
      expect(result.message).toMatch(/full/i);
      expect(
        await db.importJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).toMatchObject({ status: "VALIDATED", completedAt: null });
      expect(
        await db.stagingRecord.findUniqueOrThrow({ where: { id: row.id } }),
      ).toMatchObject({ importedAt: null, importedRecordId: null });
      expect(await db.punchCardEntry.count({ where: { workspaceId } })).toBe(0);
      expect(
        await db.membershipAllowanceEntry.count({ where: { workspaceId } }),
      ).toBe(0);
    }, 20000);
    it.each(["owner deactivation", "owner role", "business disabled"])(
      "denies after %s commits while the capacity confirmation waits for the shared schedule lock",
      async (mode) => {
        const change = await input("4"),
          review = await api.previewRoomCapacityChange(
            actor(),
            change,
            options(),
          );
        let held!: () => void, release!: () => void;
        const acquired = new Promise<void>((resolve) => {
            held = resolve;
          }),
          finish = new Promise<void>((resolve) => {
            release = resolve;
          });
        const blocker = db.$transaction(
          async (tx) => {
            await api.lockClassSchedule(tx, workspaceId);
            if (mode === "owner deactivation")
              await tx.workspaceUser.update({
                where: { id: ownerStaffId },
                data: { isActive: false },
              });
            else if (mode === "owner role")
              await tx.workspaceUser.update({
                where: { id: ownerStaffId },
                data: { role: "COACH" },
              });
            else
              await tx.workspace.update({
                where: { id: workspaceId },
                data: { status: "DISABLED" },
              });
            held();
            await finish;
          },
          { timeout: 15000 },
        );
        await acquired;
        const attempted = api
          .confirmRoomCapacityChange(
            actor(),
            change,
            { previewHash: review.previewHash, confirmed: true },
            options(),
          )
          .then(
            (result) => ({ ok: true as const, result }),
            (error) => ({ ok: false as const, error }),
          );
        try {
          await expect
            .poll(
              async () =>
                (
                  await db.$queryRaw<
                    { waiting: boolean }[]
                  >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid::bigint=(hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)) AS waiting`
                )[0]?.waiting,
              { timeout: 5000 },
            )
            .toBe(true);
        } finally {
          release();
        }
        await blocker;
        const result = await attempted;
        expect(result.ok).toBe(false);
        if (result.ok)
          throw Error("Revoked room-capacity actor unexpectedly committed");
        expect(result.error).toBeInstanceOf(api.RoomCapacityError);
        expect(
          (await db.room.findUniqueOrThrow({ where: { id: roomId } })).capacity,
        ).toBe(5);
        expect(
          await db.workspaceDataEvent.count({
            where: { workspaceId, kind: "ROOM_DEFAULT_CAPACITY_CONFIRMED" },
          }),
        ).toBe(0);
      },
      20000,
    );
  },
);
