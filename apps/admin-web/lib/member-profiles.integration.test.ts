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
(url ? describe : describe.skip)(
  "audited member profiles and independent emergency contacts in PostgreSQL",
  () => {
    let db: PrismaClient, api: typeof import("@flowstate/db");
    let workspaceId: string,
      ownerId: string,
      adultId: string,
      guardianId: string,
      coachId: string,
      otherId: string,
      adultMemberId: string,
      childId: string,
      siblingId: string,
      grantId: string,
      templateId: string;
    let users: string[];
    const now = new Date("2026-11-02T12:00:00Z"),
      date = "2026-11-02";
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      api = await import("@flowstate/db");
      db = api.prisma;
    });
    beforeEach(async () => {
      const key = `profiles-${randomUUID()}`;
      ownerId = `${key}-owner`;
      adultId = `${key}-adult`;
      guardianId = `${key}-guardian`;
      coachId = `${key}-coach`;
      otherId = `${key}-other`;
      users = [ownerId, adultId, guardianId, coachId, otherId];
      await db.user.createMany({
        data: users.map((id) => ({
          id,
          fullName: id,
          email: `${id}@example.test`,
          passwordHash: "unchanged-global-password",
        })),
      });
      const gym = await db.workspace.create({
        data: {
          name: "Fictional profile gym",
          status: "ACTIVE",
          location: {
            create: {
              name: "Gym",
              timezone: "UTC",
              rooms: { create: { name: "Room", capacity: 10 } },
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
          programs: true,
          location: { include: { rooms: true } },
        },
      });
      workspaceId = gym.id;
      adultMemberId = (
        await db.member.create({
          data: {
            workspaceId,
            userId: adultId,
            fullName: "Adult participant",
            email: "old-contact@example.test",
            dateOfBirth: new Date("1990-01-01Z"),
            notes: "LEGACY_OWNER_ONLY",
            tags: ["Youth legacy"],
            status: "FROZEN",
          },
        })
      ).id;
      await db.member.create({
        data: {
          workspaceId,
          userId: guardianId,
          fullName: "Guardian account",
          dateOfBirth: new Date("1985-01-01Z"),
        },
      });
      childId = (
        await db.member.create({
          data: {
            workspaceId,
            fullName: "Child participant",
            dateOfBirth: new Date("2015-01-01Z"),
          },
        })
      ).id;
      siblingId = (
        await db.member.create({
          data: {
            workspaceId,
            fullName: "Other child",
            dateOfBirth: new Date("2016-01-01Z"),
          },
        })
      ).id;
      const guardian = await db.guardian.create({
        data: {
          workspaceId,
          fullName: "Verified guardian",
          email: `${guardianId}@example.test`,
          familyLinks: { create: { workspaceId, childMemberId: childId } },
        },
      });
      grantId = (
        await db.memberPortalGrant.create({
          data: {
            workspaceId,
            memberId: childId,
            guardianId: guardian.id,
            userId: guardianId,
            verifiedByWorkspaceUserId: gym.workspaceUsers.find(
              (staff) => staff.userId === ownerId,
            )!.id,
            verificationNote: "Fictional verified identity",
            canBook: true,
            canSign: true,
            canPay: true,
            canManageEmergencyContacts: false,
          },
        })
      ).id;
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            programId: gym.programs[0]!.id,
            roomId: gym.location!.rooms[0]!.id,
            coachWorkspaceUserId: gym.workspaceUsers.find(
              (staff) => staff.userId === coachId,
            )!.id,
            title: "Monday class",
            weekday: "MONDAY",
            startTimeMinutes: 1080,
            endTimeMinutes: 1140,
            bookingCutoffMinutes: 0,
            cancellationCutoffMinutes: 0,
          },
        })
      ).id;
      await db.classBooking.create({
        data: {
          workspaceId,
          memberId: childId,
          classTemplateId: templateId,
          scheduledForDate: new Date(`${date}T00:00:00Z`),
          status: "BOOKED",
        },
      });
    });
    afterEach(async () => {
      await db.workspace.delete({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    });
    afterAll(async () => {
      await db?.$disconnect();
    });
    const actor = (userId = ownerId) => ({ workspaceId, userId });
    const options = () => ({ db, now });
    const add = (memberId = adultMemberId) => ({
      memberId,
      operation: "ADD" as const,
      fullName: "Emergency-only contact",
      relationshipLabel: "Neighbor",
      phone: "555-0199",
      email: "contact-only@example.test",
      expectedVersion: 0,
      operationId: randomUUID(),
    });

    it("creates one profile and attributable event, and exact replay cannot duplicate it", async () => {
      const input = {
        fullName: "New contact",
        email: "new-contact@example.test",
        operationId: randomUUID(),
      };
      const first = await api.createMemberProfile(actor(), input, options());
      expect(await api.createMemberProfile(actor(), input, options())).toEqual(
        first,
      );
      expect(
        await db.member.count({
          where: { workspaceId, fullName: input.fullName },
        }),
      ).toBe(1);
      expect(
        await db.memberProfileEvent.findMany({
          where: { workspaceId, memberId: first.memberId },
        }),
      ).toMatchObject([
        { kind: "MEMBER_CREATED", actorUserId: ownerId, profileVersion: 1 },
      ]);
      await expect(
        api.createMemberProfile(
          actor(),
          { ...input, fullName: "Different payload" },
          options(),
        ),
      ).rejects.toThrow(/already used/);
    });
    it("audits current profile edits without changing global identity, legacy text, tags or service status", async () => {
      const user = await db.user.findUniqueOrThrow({ where: { id: adultId } });
      await api.updateMemberProfile(
        actor(),
        {
          memberId: adultMemberId,
          fullName: "Corrected member",
          email: "contact-only-new@example.test",
          dateOfBirth: "1990-01-01",
          expectedVersion: 0,
          reason: "Verified contact correction",
          operationId: randomUUID(),
        },
        options(),
      );
      expect(
        await db.user.findUniqueOrThrow({ where: { id: adultId } }),
      ).toEqual(user);
      expect(
        await db.member.findUniqueOrThrow({ where: { id: adultMemberId } }),
      ).toMatchObject({
        fullName: "Corrected member",
        email: "contact-only-new@example.test",
        status: "FROZEN",
        notes: "LEGACY_OWNER_ONLY",
        tags: ["Youth legacy"],
        profileVersion: 1,
      });
      const event = await db.memberProfileEvent.findFirstOrThrow({
        where: { workspaceId },
      });
      expect(event.before).toMatchObject({ fullName: "Adult participant" });
      expect(Object.keys(event.after as object).sort()).toEqual([
        "dateOfBirth",
        "email",
        "fullName",
        "phone",
      ]);
    });
    it.each(["owner deactivation", "business disabled"] as const)(
      "denies a profile edit after %s commits while it waits for the shared schedule lock",
      async (boundary) => {
        const before = await db.member.findUniqueOrThrow({
          where: { id: adultMemberId },
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
            await api.lockClassSchedule(tx, workspaceId);
            acquired();
            await mayCommit;
            if (boundary === "owner deactivation")
              await tx.workspaceUser.updateMany({
                where: { workspaceId, userId: ownerId },
                data: { isActive: false },
              });
            else
              await tx.workspace.update({
                where: { id: workspaceId },
                data: { status: "DISABLED" },
              });
          },
          { timeout: 15000 },
        );
        await hasLock;
        const attempted = api
          .updateMemberProfile(
            actor(),
            {
              memberId: adultMemberId,
              fullName: "Revoked actor must not save this",
              email: "denied-contact@example.test",
              expectedVersion: 0,
              reason: "This stale authority must not change member contacts",
              operationId: randomUUID(),
            },
            options(),
          )
          .then(
            (result) => ({ ok: true as const, result }),
            (error: unknown) => ({ ok: false as const, error }),
          );
        try {
          await expect
            .poll(
              async () => {
                const rows = await db.$queryRaw<
                  { waiting: boolean }[]
                >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1 AND objid::bigint = (hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)) AS waiting`;
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
            "A revoked profile actor unexpectedly saved contact data",
          );
        expect(outcome.error).toBeInstanceOf(api.MemberProfileError);
        expect(
          await db.member.findUniqueOrThrow({ where: { id: adultMemberId } }),
        ).toEqual(before);
        expect(
          await db.memberProfileEvent.count({ where: { workspaceId } }),
        ).toBe(0);
        expect(
          await db.memberEmergencyContact.count({ where: { workspaceId } }),
        ).toBe(0);
      },
      20000,
    );
    it.each([
      "emergency bit removed",
      "grant revoked",
      "family link removed",
    ] as const)(
      "denies a guardian emergency edit after %s commits while it waits for the shared locks",
      async (boundary) => {
        const grant = await db.memberPortalGrant.update({
          where: { id: grantId },
          data: { canManageEmergencyContacts: true },
        });
        const before = await db.member.findUniqueOrThrow({
          where: { id: childId },
        });
        const globalAccount = await db.user.findUniqueOrThrow({
          where: { id: guardianId },
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
            await api.lockClassSchedule(tx, workspaceId);
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))::text`;
            acquired();
            await mayCommit;
            if (boundary === "emergency bit removed")
              await tx.memberPortalGrant.update({
                where: { id: grantId },
                data: { canManageEmergencyContacts: false },
              });
            else if (boundary === "grant revoked")
              await tx.memberPortalGrant.update({
                where: { id: grantId },
                data: { revokedAt: now },
              });
            else
              await tx.familyLink.deleteMany({
                where: {
                  workspaceId,
                  childMemberId: childId,
                  guardianId: grant.guardianId!,
                },
              });
          },
          { timeout: 15000 },
        );
        await hasLock;
        const attempted = api
          .changeMemberEmergencyContact(
            actor(guardianId),
            add(childId),
            options(),
          )
          .then(
            (result) => ({ ok: true as const, result }),
            (error: unknown) => ({ ok: false as const, error }),
          );
        try {
          await expect
            .poll(
              async () => {
                const rows = await db.$queryRaw<
                  { waiting: boolean }[]
                >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1 AND objid::bigint = (hashtext(${`class-schedule:${workspaceId}`})::bigint & 4294967295)) AS waiting`;
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
            "A revoked guardian unexpectedly saved an emergency contact",
          );
        expect(outcome.error).toBeInstanceOf(api.MemberProfileError);
        expect(
          await db.member.findUniqueOrThrow({ where: { id: childId } }),
        ).toEqual(before);
        expect(
          await db.memberEmergencyContact.count({ where: { workspaceId } }),
        ).toBe(0);
        expect(
          await db.memberProfileEvent.count({ where: { workspaceId } }),
        ).toBe(0);
        expect(
          await db.user.findUniqueOrThrow({ where: { id: guardianId } }),
        ).toEqual(globalAccount);
      },
      20000,
    );
    it("rejects a stale editor and keeps first committed contact plus prior history", async () => {
      await api.changeMemberEmergencyContact(actor(), add(), options());
      await expect(
        api.updateMemberProfile(
          actor(),
          {
            memberId: adultMemberId,
            fullName: "Stale overwrite",
            expectedVersion: 0,
            reason: "Outdated profile correction",
            operationId: randomUUID(),
          },
          options(),
        ),
      ).rejects.toThrow(/member changed/);
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: adultMemberId } }))
          .fullName,
      ).toBe("Adult participant");
      expect(
        await db.memberEmergencyContact.count({ where: { workspaceId } }),
      ).toBe(1);
      expect(
        await db.memberProfileEvent.count({ where: { workspaceId } }),
      ).toBe(1);
    });
    it("serializes two concurrent editors so only one expected version commits", async () => {
      const results = await Promise.allSettled([
        api.changeMemberEmergencyContact(actor(), add(), options()),
        api.changeMemberEmergencyContact(actor(), add(), options()),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        await db.memberEmergencyContact.count({ where: { workspaceId } }),
      ).toBe(1);
      expect(
        await db.memberProfileEvent.count({ where: { workspaceId } }),
      ).toBe(1);
    });
    it("adult self manages emergency contacts without gaining profile-edit authority", async () => {
      await api.changeMemberEmergencyContact(actor(adultId), add(), options());
      expect(
        (
          await api.getMemberEmergencyProfile(
            actor(adultId),
            adultMemberId,
            options(),
          )
        ).contacts,
      ).toHaveLength(1);
      await expect(
        api.updateMemberProfile(
          actor(adultId),
          {
            memberId: adultMemberId,
            fullName: "Unauthorized profile",
            expectedVersion: 1,
            reason: "Not an owner profile editor",
            operationId: randomUUID(),
          },
          options(),
        ),
      ).rejects.toThrow(/active owner/);
    });
    it("booking, signing, payer and emergency-contact identity confer no emergency-management grant", async () => {
      await expect(
        api.changeMemberEmergencyContact(
          actor(guardianId),
          add(childId),
          options(),
        ),
      ).rejects.toThrow(/unavailable/);
      expect(
        await db.memberEmergencyContact.count({ where: { workspaceId } }),
      ).toBe(0);
      await api.changeMemberEmergencyContact(actor(), add(childId), options());
      expect(await db.guardian.count({ where: { workspaceId } })).toBe(1);
      expect(await db.memberPortalGrant.count({ where: { workspaceId } })).toBe(
        1,
      );
      expect(
        (
          await db.memberPortalGrant.findUniqueOrThrow({
            where: { id: grantId },
          })
        ).canManageEmergencyContacts,
      ).toBe(false);
    });
    it("exact explicit guardian grant works for one minor and revocation blocks even replay", async () => {
      await db.memberPortalGrant.update({
        where: { id: grantId },
        data: { canManageEmergencyContacts: true },
      });
      const input = add(childId);
      await api.changeMemberEmergencyContact(
        actor(guardianId),
        input,
        options(),
      );
      await expect(
        api.getMemberEmergencyProfile(actor(guardianId), siblingId, options()),
      ).rejects.toThrow(/unavailable/);
      await db.memberPortalGrant.update({
        where: { id: grantId },
        data: { canManageEmergencyContacts: false },
      });
      await expect(
        api.changeMemberEmergencyContact(actor(guardianId), input, options()),
      ).rejects.toThrow(/unavailable/);
      expect(
        await db.memberProfileEvent.count({ where: { workspaceId } }),
      ).toBe(1);
    });
    it("removed family relationship, adult transition and inactive account each deny a stale guardian", async () => {
      await db.memberPortalGrant.update({
        where: { id: grantId },
        data: { canManageEmergencyContacts: true },
      });
      await db.member.update({
        where: { id: childId },
        data: { dateOfBirth: new Date("2000-01-01Z") },
      });
      await expect(
        api.getMemberEmergencyProfile(actor(guardianId), childId, options()),
      ).rejects.toThrow(/unavailable/);
      await db.member.update({
        where: { id: childId },
        data: { dateOfBirth: new Date("2015-01-01Z") },
      });
      await db.familyLink.deleteMany({
        where: { workspaceId, childMemberId: childId },
      });
      await expect(
        api.getMemberEmergencyProfile(actor(guardianId), childId, options()),
      ).rejects.toThrow(/unavailable/);
      await db.workspaceUser.updateMany({
        where: { workspaceId, userId: adultId },
        data: { isActive: false },
      });
      await expect(
        api.changeMemberEmergencyContact(actor(adultId), add(), options()),
      ).rejects.toThrow(/unavailable/);
    });
    it("dated assigned coach can read but cannot edit; reassignment removes the read", async () => {
      await api.changeMemberEmergencyContact(actor(), add(childId), options());
      const coach = {
        ...actor(coachId),
        occurrence: { classTemplateId: templateId, date },
      };
      expect(
        (await api.getMemberEmergencyProfile(coach, childId, options()))
          .canEdit,
      ).toBe(false);
      await expect(
        api.changeMemberEmergencyContact(
          coach,
          { ...add(childId), expectedVersion: 1 },
          options(),
        ),
      ).rejects.toThrow(/unavailable/);
      expect(
        await api.getRosterEmergencyContacts(coach, options()),
      ).toMatchObject([
        { memberId: childId, fullName: "Emergency-only contact" },
      ]);
      await db.classTemplate.update({
        where: { id: templateId },
        data: { coachWorkspaceUserId: null },
      });
      await expect(
        api.getMemberEmergencyProfile(coach, childId, options()),
      ).rejects.toThrow(/unavailable/);
    });
    it("contact retirement preserves append-only prior values and actor snapshots", async () => {
      const created = await api.changeMemberEmergencyContact(
        actor(),
        add(),
        options(),
      );
      await api.changeMemberEmergencyContact(
        actor(),
        {
          ...add(),
          operation: "UPDATE",
          contactId: created.contactId!,
          expectedVersion: 1,
          expectedContactVersion: 1,
          phone: "555-0200",
          reason: "Contact confirmed a new number",
        },
        options(),
      );
      await api.changeMemberEmergencyContact(
        actor(),
        {
          memberId: adultMemberId,
          operation: "RETIRE",
          contactId: created.contactId!,
          expectedVersion: 2,
          expectedContactVersion: 2,
          reason: "Member replaced this contact",
          operationId: randomUUID(),
        },
        options(),
      );
      expect(
        (await api.getMemberEmergencyProfile(actor(), adultMemberId, options()))
          .contacts,
      ).toHaveLength(0);
      const events = await db.memberProfileEvent.findMany({
        where: { workspaceId },
        orderBy: { profileVersion: "asc" },
      });
      expect(events.map((event) => event.kind)).toEqual([
        "EMERGENCY_CONTACT_ADDED",
        "EMERGENCY_CONTACT_UPDATED",
        "EMERGENCY_CONTACT_RETIRED",
      ]);
      expect(events[1]!.before).toMatchObject({
        phone: "555-0199",
        version: 1,
      });
      expect(events[1]!.after).toMatchObject({ phone: "555-0200", version: 2 });
      await expect(
        db.memberProfileEvent.update({
          where: { id: events[0]!.id },
          data: { reason: "tampered" },
        }),
      ).rejects.toThrow(/immutable/);
      await expect(
        db.memberProfileEvent.delete({ where: { id: events[0]!.id } }),
      ).rejects.toThrow(/immutable/);
    });
    it("cross-member contact ID, foreign workspace and deactivated owner reject with no history", async () => {
      const created = await api.changeMemberEmergencyContact(
        actor(),
        add(),
        options(),
      );
      await expect(
        api.changeMemberEmergencyContact(
          actor(),
          {
            ...add(childId),
            operation: "UPDATE",
            contactId: created.contactId!,
            expectedContactVersion: 1,
            reason: "Wrong beneficiary attempted",
          },
          options(),
        ),
      ).rejects.toThrow(/contact changed/);
      await expect(
        api.getMemberEmergencyProfile(
          { workspaceId: "foreign-workspace", userId: ownerId },
          adultMemberId,
          options(),
        ),
      ).rejects.toThrow(/unavailable/);
      await db.workspaceUser.updateMany({
        where: { workspaceId, userId: ownerId },
        data: { isActive: false },
      });
      await expect(
        api.changeMemberEmergencyContact(
          actor(),
          { ...add(), expectedVersion: 1 },
          options(),
        ),
      ).rejects.toThrow(/unavailable/);
      expect(
        await db.memberProfileEvent.count({ where: { workspaceId } }),
      ).toBe(1);
    });
    it("database-enforced event failure rolls back contact and member version atomically", async () => {
      const extended = db.$extends({
        query: {
          memberProfileEvent: {
            create() {
              throw new Error("Fictional audit storage unavailable");
            },
          },
        },
      }) as unknown as PrismaClient;
      await expect(
        api.changeMemberEmergencyContact(actor(), add(), { db: extended, now }),
      ).rejects.toThrow(/audit storage/);
      expect(
        await db.memberEmergencyContact.count({ where: { workspaceId } }),
      ).toBe(0);
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: adultMemberId } }))
          .profileVersion,
      ).toBe(0);
    });
    it("DOB edits cannot silently change existing guardian/adult authority or invalidate a booked class", async () => {
      await expect(
        api.updateMemberProfile(
          actor(),
          {
            memberId: childId,
            fullName: "Child participant",
            dateOfBirth: "2000-01-01",
            expectedVersion: 0,
            reason: "Attempted age correction",
            operationId: randomUUID(),
          },
          options(),
        ),
      ).rejects.toThrow(/adult or guardian authority/);
      await db.classTemplate.update({
        where: { id: templateId },
        data: {
          prerequisites: {
            version: 1,
            minimumAge: 8,
            maximumAge: 12,
            cohortTag: null,
            minimumRankKey: null,
            minimumStripeCount: 0,
          },
        },
      });
      await expect(
        api.updateMemberProfile(
          actor(),
          {
            memberId: childId,
            fullName: "Child participant",
            dateOfBirth: "2020-01-01",
            expectedVersion: 0,
            reason: "Age outside booked cohort",
            operationId: randomUUID(),
          },
          options(),
        ),
      ).rejects.toThrow(/affects the booked class/);
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: childId } }))
          .dateOfBirth,
      ).toEqual(new Date("2015-01-01Z"));
      expect(
        await db.memberProfileEvent.count({ where: { workspaceId } }),
      ).toBe(0);
    });
    it("reviews an upcoming old-zone occurrence even when the current business clock calls its date yesterday", async () => {
      await db.workspaceTimezoneRevision.create({
        data: {
          workspaceId,
          version: 1,
          previousTimezone: "UTC",
          timezone: "Pacific/Kiritimati",
          effectiveFromDate: new Date("2026-11-03T00:00:00Z"),
          effectiveAt: new Date("2026-11-02T10:00:00Z"),
          actorUserId: ownerId,
          previewHash: "a".repeat(64),
        },
      });
      await db.classTemplate.update({
        where: { id: templateId },
        data: {
          startTimeMinutes: 1380,
          endTimeMinutes: 1439,
          prerequisites: {
            version: 1,
            minimumAge: 18,
            maximumAge: null,
            cohortTag: null,
            minimumRankKey: null,
            minimumStripeCount: 0,
          },
        },
      });
      await db.classBooking.create({
        data: {
          workspaceId,
          memberId: adultMemberId,
          classTemplateId: templateId,
          scheduledForDate: new Date("2026-11-02T00:00:00Z"),
          status: "BOOKED",
        },
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
        scheduledForDate: "2026-11-02",
      });
      expect(occurrence?.timezone).toBe("UTC");
      expect(
        api
          .getOccurrenceStartsAt({
            scheduledForDate: "2026-11-02",
            startTimeMinutes: occurrence!.startTimeMinutes,
            timezone: occurrence!.timezone!,
          })
          .getTime(),
      ).toBeGreaterThan(now.getTime());
      await expect(
        api.updateMemberProfile(
          actor(),
          {
            memberId: adultMemberId,
            fullName: "Adult participant",
            dateOfBirth: "2009-01-01",
            expectedVersion: 0,
            reason: "This correction changes the future class age",
            operationId: randomUUID(),
          },
          options(),
        ),
      ).rejects.toThrow(/affects the booked class/);
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: adultMemberId } }))
          .dateOfBirth,
      ).toEqual(new Date("1990-01-01Z"));
      expect(
        await db.memberProfileEvent.count({ where: { workspaceId } }),
      ).toBe(0);
    });
  },
);
