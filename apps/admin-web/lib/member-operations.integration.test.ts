import { createHash, randomUUID } from "node:crypto";
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
if (
  url &&
  (!/test|e2e/i.test(new URL(url).pathname) ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
)
  throw new Error(
    "Member operations require an explicit isolated local test database.",
  );

(url ? describe : describe.skip)(
  "MF06 attributed operational records in PostgreSQL",
  () => {
    let api: typeof import("@flowstate/db"), db: PrismaClient;
    let workspaceId: string,
      ownerId: string,
      coachId: string,
      customerId: string;
    let coachStaffId: string,
      ownerStaffId: string,
      memberId: string,
      templateId: string;
    let users: string[];
    const now = new Date("2026-11-02T12:00:00Z");
    const date = "2026-11-02";
    const owner = () => ({ workspaceId, userId: ownerId });
    const coach = () => ({
      workspaceId,
      userId: coachId,
      occurrence: { classTemplateId: templateId, date },
    });
    const options = () => ({ db, now });
    const tagKey = (label: string, purpose = "COHORT_ELIGIBILITY") =>
      `tag:${purpose}:${createHash("sha256").update(label.trim()).digest("hex")}`;
    const note = (
      body: string,
      visibility: "OWNER_ONLY" | "ASSIGNED_OPERATIONS" = "ASSIGNED_OPERATIONS",
    ) => ({
      memberId,
      recordKey: `note:${randomUUID()}`,
      recordKind: "NOTE" as const,
      action: "ADD" as const,
      visibility,
      noteBody: body,
      expectedVersion: 0,
      operationId: randomUUID(),
    });

    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      api = await import("@flowstate/db");
      db = api.prisma;
    });
    beforeEach(async () => {
      const key = `operations-${randomUUID()}`;
      [ownerId, coachId, customerId] = [
        `${key}-owner`,
        `${key}-coach`,
        `${key}-customer`,
      ];
      users = [ownerId, coachId, customerId];
      await db.user.createMany({
        data: users.map((id) => ({
          id,
          email: `${id}@example.test`,
          fullName: id,
          passwordHash: "unchanged-global-identity",
        })),
      });
      const gym = await db.workspace.create({
        data: {
          name: key,
          status: "ACTIVE",
          location: {
            create: {
              name: "Gym",
              timezone: "UTC",
              rooms: { create: { name: "Mat", capacity: 8 } },
            },
          },
          workspaceUsers: {
            create: users.map((userId) => ({
              userId,
              role:
                userId === ownerId
                  ? "OWNER"
                  : userId === coachId
                    ? "COACH"
                    : "CUSTOMER",
            })),
          },
          programs: { create: { name: "Training" } },
        },
        include: {
          workspaceUsers: true,
          location: { include: { rooms: true } },
          programs: true,
        },
      });
      workspaceId = gym.id;
      ownerStaffId = gym.workspaceUsers.find(
        (row) => row.userId === ownerId,
      )!.id;
      coachStaffId = gym.workspaceUsers.find(
        (row) => row.userId === coachId,
      )!.id;
      memberId = (
        await db.member.create({
          data: {
            workspaceId,
            userId: customerId,
            fullName: "Fictional operations participant",
            dateOfBirth: new Date("1990-01-01Z"),
            notes: "UNREVIEWED_LEGACY_NOTE",
            tags: ["Imported label"],
          },
        })
      ).id;
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            programId: gym.programs[0]!.id,
            roomId: gym.location!.rooms[0]!.id,
            coachWorkspaceUserId: coachStaffId,
            weekday: "MONDAY",
            title: "Retained Monday class",
            startTimeMinutes: 1380,
            endTimeMinutes: 1439,
            bookingCutoffMinutes: 0,
            cancellationCutoffMinutes: 0,
          },
        })
      ).id;
      await db.classBooking.create({
        data: {
          workspaceId,
          memberId,
          classTemplateId: templateId,
          scheduledForDate: new Date(`${date}T00:00:00Z`),
          status: "BOOKED",
        },
      });
    });
    afterEach(async () => {
      await db.coachingEnrollment.deleteMany({ where: { workspaceId } });
      await db.coachingProgramVersion.deleteMany({
        where: { program: { workspaceId } },
      });
      await db.workspace.delete({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    });
    afterAll(async () => db.$disconnect());

    it("appends corrections/retraction with original author/time, rejects direct mutation and leaves global/legacy identity alone", async () => {
      const identity = await db.user.findUniqueOrThrow({
        where: { id: customerId },
      });
      const input = note("Use the entrance beside reception");
      const first = await api.changeMemberOperations(owner(), input, options());
      const second = await api.changeMemberOperations(
        owner(),
        {
          ...input,
          expectedVersion: 1,
          action: "AMEND",
          operationId: randomUUID(),
          noteBody: "Use the entrance opposite reception",
          reason: "Corrected the entrance location",
        },
        options(),
      );
      await api.changeMemberOperations(
        owner(),
        {
          memberId,
          recordKey: input.recordKey,
          recordKind: "NOTE",
          action: "RETRACT",
          expectedVersion: 2,
          operationId: randomUUID(),
          reason: "This instruction no longer applies",
        },
        options(),
      );
      const rows = await db.memberOperationalRevision.findMany({
        where: { workspaceId, recordKey: input.recordKey },
        orderBy: { version: "asc" },
      });
      expect(
        rows.map((row) => [row.version, row.action, row.noteBody]),
      ).toEqual([
        [1, "ADD", input.noteBody],
        [2, "AMEND", "Use the entrance opposite reception"],
        [3, "RETRACT", null],
      ]);
      expect(
        rows.every(
          (row) =>
            row.actorUserId === ownerId &&
            row.actorWorkspaceUserId === ownerStaffId &&
            row.actorRoleSnapshot === "OWNER" &&
            +row.createdAt === +now,
        ),
      ).toBe(true);
      expect(first.version).toBe(1);
      expect(second.version).toBe(2);
      expect(
        (await api.getMemberOperations(coach(), memberId, options())).notes,
      ).toEqual([]);
      await expect(
        db.memberOperationalRevision.update({
          where: { id: rows[0]!.id },
          data: { noteBody: "tampered" },
        }),
      ).rejects.toThrow(/immutable/i);
      await expect(
        db.memberOperationalRevision.delete({ where: { id: rows[0]!.id } }),
      ).rejects.toThrow(/immutable/i);
      expect(
        await db.user.findUniqueOrThrow({ where: { id: customerId } }),
      ).toEqual(identity);
      expect(
        await db.member.findUniqueOrThrow({ where: { id: memberId } }),
      ).toMatchObject({
        notes: "UNREVIEWED_LEGACY_NOTE",
        tags: ["Imported label"],
        profileVersion: 0,
      });
    });

    it("exactly replays one operation, rejects a changed payload and resolves concurrent stale writers without duplicate revisions", async () => {
      const input = note("Reception will check the attendance list");
      const first = await api.changeMemberOperations(owner(), input, options());
      expect(
        await api.changeMemberOperations(owner(), input, options()),
      ).toMatchObject({ eventId: first.eventId, version: 1, replayed: true });
      await expect(
        api.changeMemberOperations(
          owner(),
          { ...input, noteBody: "Different request under the same key" },
          options(),
        ),
      ).rejects.toThrow(/request|changed|reload/i);
      const attempts = await Promise.allSettled(
        ["First correction", "Second correction"].map((noteBody) =>
          api.changeMemberOperations(
            owner(),
            {
              ...input,
              action: "AMEND",
              expectedVersion: 1,
              operationId: randomUUID(),
              noteBody,
              reason: "Corrected the operational instruction",
            },
            options(),
          ),
        ),
      );
      expect(
        attempts.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        attempts.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: input.recordKey },
        }),
      ).toBe(2);
      expect(
        (
          await db.memberOperationalRevision.findMany({
            where: { workspaceId, recordKey: input.recordKey },
            orderBy: { version: "asc" },
          })
        ).map((row) => row.version),
      ).toEqual([1, 2]);
    });

    it("checks the latest visibility before projection and fresh actor/assignment before replay; customers never gain internal-note access", async () => {
      const shared = note("Shared class operations instruction");
      await api.changeMemberOperations(owner(), shared, options());
      expect(
        (await api.getMemberOperations(coach(), memberId, options())).notes,
      ).toHaveLength(1);
      await api.changeMemberOperations(
        owner(),
        {
          ...shared,
          action: "AMEND",
          expectedVersion: 1,
          visibility: "OWNER_ONLY",
          noteBody: "OWNER_ONLY_CURRENT_SENTINEL",
          reason: "Restricted to the owner after review",
          operationId: randomUUID(),
        },
        options(),
      );
      const roster = await api.getRosterMemberOperations(coach(), options());
      expect(JSON.stringify(roster)).not.toMatch(
        /OWNER_ONLY_CURRENT_SENTINEL|Shared class operations instruction|UNREVIEWED_LEGACY_NOTE|Imported label/,
      );
      await expect(
        api.getMemberOperations(
          { workspaceId, userId: customerId },
          memberId,
          options(),
        ),
      ).rejects.toThrow(/unavailable|permission|access/i);
      const own = note("Coach's operational instruction");
      await api.changeMemberOperations(coach(), own, options());
      await db.workspaceUser.update({
        where: { id: coachStaffId },
        data: { isActive: false },
      });
      await expect(
        api.changeMemberOperations(coach(), own, options()),
      ).rejects.toThrow(/unavailable|permission|access/i);
      await expect(
        api.getMemberOperations(coach(), memberId, options()),
      ).rejects.toThrow(/unavailable|permission|access/i);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: own.recordKey },
        }),
      ).toBe(1);
    });

    it("blocks tag removal from a still-future old-zone booked class, preserves seats/units/history, then respects an exact prerequisite exception", async () => {
      const label = "Blue cohort";
      const added = await api.changeMemberOperations(
        owner(),
        {
          memberId,
          recordKey: tagKey(label),
          recordKind: "TAG",
          action: "ADD",
          tagLabel: label,
          tagPurpose: "COHORT_ELIGIBILITY",
          visibility: "ASSIGNED_OPERATIONS",
          expectedVersion: 0,
          operationId: randomUUID(),
        },
        options(),
      );
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
      const rules = {
        minimumRankKey: null,
        minimumStripes: 0,
        allowUnranked: true,
        minimumAge: null,
        maximumAge: null,
        cohortTag: label,
      };
      await db.classTemplate.update({
        where: { id: templateId },
        data: { prerequisites: rules },
      });
      const currentZone = await api.resolveWorkspaceClockTimezone({
        workspaceId,
        baselineTimezone: "UTC",
        now,
        db,
      });
      expect(api.getWorkspaceDateString(now, currentZone)).toBe("2026-11-03");
      const template = await db.classTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: api.classOccurrenceInclude,
      });
      const occurrence = api.resolveClassOccurrence({
        template,
        scheduledForDate: date,
      });
      expect(occurrence!.timezone).toBe("UTC");
      expect(
        +api.getOccurrenceStartsAt({
          scheduledForDate: date,
          startTimeMinutes: occurrence!.startTimeMinutes,
          timezone: occurrence!.timezone!,
        }),
      ).toBeGreaterThan(+now);
      const input = {
        memberId,
        recordKey: tagKey(label),
        recordKind: "TAG" as const,
        action: "RETRACT" as const,
        tagLabel: label,
        tagPurpose: "COHORT_ELIGIBILITY" as const,
        expectedVersion: added.version,
        operationId: randomUUID(),
        reason: "Remove the current cohort eligibility tag",
      };
      const booking = await db.classBooking.findFirstOrThrow({
        where: { workspaceId, memberId, classTemplateId: templateId },
      });
      await expect(
        api.changeMemberOperations(owner(), input, options()),
      ).rejects.toThrow(/booked class.*2026-11-02|2026-11-02.*booked class/i);
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: memberId } })).tags,
      ).toEqual(["Imported label", label]);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: tagKey(label) },
        }),
      ).toBe(1);
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } }),
      ).toEqual(booking);
      await db.classPrerequisiteException.create({
        data: {
          workspaceId,
          memberId,
          classTemplateId: templateId,
          scheduledForDate: new Date(`${date}T00:00:00Z`),
          actorWorkspaceUserId: ownerStaffId,
          policyFingerprint: api.prerequisiteFingerprint(
            occurrence!.program.rankPolicy,
            occurrence!.prerequisites,
          ),
          reason:
            "Explicit authorized prerequisite exception for this exact class date",
        },
      });
      await api.changeMemberOperations(owner(), input, options());
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: memberId } })).tags,
      ).toEqual(["Imported label"]);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: tagKey(label) },
        }),
      ).toBe(2);
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } }),
      ).toEqual(booking);
    });

    it("a coach's operational label cannot grant cohort eligibility even with the identical spelling or a forged purpose", async () => {
      const label = "Restricted training group";
      const rules = {
        minimumRankKey: null,
        minimumStripes: 0,
        allowUnranked: true,
        minimumAge: null,
        maximumAge: null,
        cohortTag: label,
      };
      await db.classTemplate.update({
        where: { id: templateId },
        data: { prerequisites: rules },
      });
      const template = await db.classTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: api.classOccurrenceInclude,
      });
      const occurrence = api.resolveClassOccurrence({
        template,
        scheduledForDate: date,
      })!;
      const check = () =>
        api.checkMemberClassEligibility({
          workspaceId,
          memberId,
          scheduledForDate: date,
          occurrence,
          db,
        });
      expect((await check()).eligible).toBe(false);
      const input = {
        memberId,
        recordKey: tagKey(label, "OPERATIONAL"),
        recordKind: "TAG" as const,
        action: "ADD" as const,
        tagLabel: label,
        tagPurpose: "OPERATIONAL" as const,
        visibility: "ASSIGNED_OPERATIONS" as const,
        expectedVersion: 0,
        operationId: randomUUID(),
      };
      await api.changeMemberOperations(coach(), input, options());
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: memberId } })).tags,
      ).toEqual(["Imported label"]);
      expect((await check()).eligible).toBe(false);
      await expect(
        api.changeMemberOperations(
          coach(),
          {
            ...input,
            recordKey: tagKey(label),
            tagPurpose: "COHORT_ELIGIBILITY",
            operationId: randomUUID(),
          },
          options(),
        ),
      ).rejects.toThrow(/permission|unavailable|owner/i);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, memberId, recordKind: "TAG" },
        }),
      ).toBe(1);
      await api.changeMemberOperations(
        owner(),
        {
          ...input,
          recordKey: tagKey(label),
          tagPurpose: "COHORT_ELIGIBILITY",
          operationId: randomUUID(),
        },
        options(),
      );
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: memberId } })).tags,
      ).toEqual(["Imported label", label]);
      expect((await check()).eligible).toBe(true);
      expect(
        (await api.getMemberOperations(coach(), memberId, options())).tags
          .map((tag) => tag.tagPurpose)
          .sort(),
      ).toEqual(["COHORT_ELIGIBILITY", "OPERATIONAL"]);
    });
    it("limits a coach to their own latest shared record in the exact dated member roster and denies customers or another roster member", async () => {
      const input = note("Coach-authored reception instruction");
      await api.changeMemberOperations(coach(), input, options());
      await expect(
        api.getMemberOperations(
          { workspaceId, userId: coachId },
          memberId,
          options(),
        ),
      ).rejects.toThrow(/unavailable/i);
      const sibling = await db.member.create({
        data: {
          workspaceId,
          fullName: "Fictional participant outside this roster",
        },
      });
      await expect(
        api.getMemberOperations(coach(), sibling.id, options()),
      ).rejects.toThrow(/unavailable/i);
      await expect(
        api.getMemberOperations(
          { workspaceId, userId: customerId, occurrence: coach().occurrence },
          memberId,
          options(),
        ),
      ).rejects.toThrow(/unavailable/i);
      await expect(
        api.changeMemberOperations(
          coach(),
          { ...note("Forged private visibility"), visibility: "OWNER_ONLY" },
          options(),
        ),
      ).rejects.toThrow(/unavailable/i);
      await expect(
        api.getMemberOperationsHistory(coach(), { memberId }, options()),
      ).rejects.toThrow(/unavailable/i);
      await api.changeMemberOperations(
        owner(),
        {
          ...input,
          action: "AMEND",
          expectedVersion: 1,
          noteBody: "Owner reviewed this shared instruction",
          operationId: randomUUID(),
          reason: "Owner corrected the operational guidance",
        },
        options(),
      );
      await expect(
        api.changeMemberOperations(
          coach(),
          {
            ...input,
            action: "AMEND",
            expectedVersion: 2,
            noteBody: "Coach must not overwrite owner correction",
            operationId: randomUUID(),
            reason: "Attempted correction after owner intervention",
          },
          options(),
        ),
      ).rejects.toThrow(/unavailable/i);
      await db.classTemplate.update({
        where: { id: templateId },
        data: { coachWorkspaceUserId: ownerStaffId },
      });
      await expect(
        api.changeMemberOperations(coach(), input, options()),
      ).rejects.toThrow(/unavailable/i);
      expect(
        await db.memberOperationalRevision.count({ where: { workspaceId } }),
      ).toBe(2);
    });

    it("ignores an injected retract visibility and never resurfaces an older shared body", async () => {
      const input = note("Coach's now-obsolete instruction");
      await api.changeMemberOperations(coach(), input, options());
      const forged = {
        memberId,
        recordKey: input.recordKey,
        recordKind: "NOTE" as const,
        action: "RETRACT" as const,
        expectedVersion: 1,
        operationId: randomUUID(),
        reason: "This instruction has been replaced",
        visibility: "OWNER_ONLY",
      };
      await api.changeMemberOperations(coach(), forged, options());
      const last = await db.memberOperationalRevision.findFirstOrThrow({
        where: { workspaceId, recordKey: input.recordKey },
        orderBy: { version: "desc" },
      });
      expect(last).toMatchObject({
        action: "RETRACT",
        visibility: "ASSIGNED_OPERATIONS",
        actorRoleSnapshot: "COACH",
        noteBody: null,
      });
      expect(
        (await api.getMemberOperations(coach(), memberId, options())).notes,
      ).toEqual([]);
      expect(
        (
          await api.getMemberOperationsHistory(
            owner(),
            { memberId, recordKey: input.recordKey },
            options(),
          )
        ).items.map((row) => row.version),
      ).toEqual([2, 1]);
    });

    it("rolls back the canonical eligibility projection when real PostgreSQL rejects history and does not retry a non-serialization failure", async () => {
      const suffix = randomUUID().replaceAll("-", ""),
        fn = `ops_fail_${suffix}`,
        seq = `ops_attempt_${suffix}`;
      await db.$executeRawUnsafe(`CREATE SEQUENCE "${seq}"`);
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId" = '${workspaceId.replaceAll("'", "''")}' THEN PERFORM nextval('"${seq}"'); RAISE EXCEPTION 'Fictional operational history failure' USING ERRCODE = 'P0001'; END IF; RETURN NEW; END; $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER "${fn}" BEFORE INSERT ON member_operational_revisions FOR EACH ROW EXECUTE FUNCTION "${fn}"()`,
      );
      try {
        const label = "A cohort that must roll back";
        await expect(
          api.changeMemberOperations(
            owner(),
            {
              memberId,
              recordKey: tagKey(label),
              recordKind: "TAG",
              action: "ADD",
              tagPurpose: "COHORT_ELIGIBILITY",
              tagLabel: label,
              visibility: "OWNER_ONLY",
              expectedVersion: 0,
              operationId: randomUUID(),
            },
            options(),
          ),
        ).rejects.toThrow(/Fictional operational history failure/);
        expect(
          (await db.member.findUniqueOrThrow({ where: { id: memberId } })).tags,
        ).toEqual(["Imported label"]);
        expect(
          await db.memberOperationalRevision.count({ where: { workspaceId } }),
        ).toBe(0);
        expect(
          (
            await db.$queryRawUnsafe<{ last_value: bigint }[]>(
              `SELECT last_value FROM "${seq}"`,
            )
          )[0]!.last_value,
        ).toBe(1n);
      } finally {
        await db.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS "${fn}" ON member_operational_revisions`,
        );
        await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
        await db.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS "${seq}"`);
      }
    });

    it("does not copy author-private coaching notes, intake or goals into owner operations, owner history or assigned roster payloads", async () => {
      const program = await db.coachingProgram.create({
        data: { workspaceId, name: "Fictional separate coaching service" },
      });
      const version = await db.coachingProgramVersion.create({
        data: {
          programId: program.id,
          number: 1,
          durationDays: 30,
          deliveryWeekdays: [1],
          responseHours: 24,
          goals: "COACHING_GOALS_PRIVATE_SENTINEL",
          milestones: [],
          priceCents: 0,
          currency: "cad",
          terms: "Fictional terms",
        },
      });
      const enrollment = await db.coachingEnrollment.create({
        data: {
          workspaceId,
          memberId,
          programVersionId: version.id,
          startsOn: new Date(`${date}Z`),
          endsOn: new Date("2026-12-02Z"),
          timezone: "UTC",
          caseOwnerWorkspaceUserId: ownerStaffId,
        },
      });
      await db.coachingPrivateNote.create({
        data: {
          enrollmentId: enrollment.id,
          authorWorkspaceUserId: coachStaffId,
          localDate: new Date(`${date}Z`),
          body: "COACHING_AUTHOR_PRIVATE_SENTINEL",
        },
      });
      await db.coachingIntake.create({
        data: {
          enrollmentId: enrollment.id,
          content: "COACHING_INTAKE_PRIVATE_SENTINEL",
        },
      });
      await api.changeMemberOperations(
        owner(),
        note("Ordinary class logistics only"),
        options(),
      );
      const payloads = await Promise.all([
        api.getMemberOperations(owner(), memberId, options()),
        api.getMemberOperationsHistory(owner(), { memberId }, options()),
        api.getRosterMemberOperations(coach(), options()),
      ]);
      expect(JSON.stringify(payloads)).not.toMatch(
        /COACHING_(GOALS|AUTHOR|INTAKE)_PRIVATE_SENTINEL/,
      );
      expect(
        await db.coachingPrivateNote.count({
          where: { enrollmentId: enrollment.id },
        }),
      ).toBe(1);
      expect(
        await db.coachingIntake.count({
          where: { enrollmentId: enrollment.id },
        }),
      ).toBe(1);
    });

    it.each([
      "staff deactivation",
      "staff role",
      "business status",
      "dated assignment",
    ])(
      "a command waiting for the shared schedule lock denies the %s change committed before it acquires the lock",
      async (change) => {
        let acquired!: () => void, release!: () => void;
        const hasLock = new Promise<void>((resolve) => {
          acquired = resolve;
        });
        const mayCommit = new Promise<void>((resolve) => {
          release = resolve;
        });
        const roleChange = db.$transaction(
          async (tx) => {
            await api.lockClassSchedule(tx, workspaceId);
            if (change === "staff deactivation")
              await tx.workspaceUser.update({
                where: { id: coachStaffId },
                data: { isActive: false },
              });
            else if (change === "staff role")
              await tx.workspaceUser.update({
                where: { id: coachStaffId },
                data: { role: "CUSTOMER" },
              });
            else if (change === "business status")
              await tx.workspace.update({
                where: { id: workspaceId },
                data: { status: "DISABLED" },
              });
            else
              await tx.classTemplate.update({
                where: { id: templateId },
                data: { coachWorkspaceUserId: ownerStaffId },
              });
            acquired();
            await mayCommit;
          },
          { timeout: 15000 },
        );
        await hasLock;
        const input = note("A deactivated coach must not append this note");
        const attempted = api
          .changeMemberOperations(coach(), input, options())
          .then(
            (result) => ({ ok: true as const, result }),
            (error) => ({ ok: false as const, error }),
          );
        try {
          // Actual PostgreSQL lock evidence, not a delay or mocked transaction.
          await expect
            .poll(
              async () => {
                const rows = await db.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_locks
            WHERE locktype = 'advisory' AND NOT granted
              AND objid::bigint = (hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)
          ) AS waiting
        `;
                return rows[0]?.waiting;
              },
              { timeout: 5000 },
            )
            .toBe(true);
        } finally {
          release();
        }
        await roleChange;
        const result = await attempted;
        expect(result.ok).toBe(false);
        if (result.ok)
          throw new Error(
            "A stale staff actor unexpectedly wrote an operations record",
          );
        expect(result.error).toBeInstanceOf(api.MemberOperationsError);
        expect(
          await db.memberOperationalRevision.count({
            where: { workspaceId, operationId: input.operationId },
          }),
        ).toBe(0);
      },
      20000,
    );
  },
);
