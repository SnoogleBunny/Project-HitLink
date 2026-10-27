import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  confirmClassSchedulingPolicy,
  previewClassSchedulingPolicy,
  createAccessBackedBooking,
  joinWaitlist,
  promoteNextWaitlistEntry,
  snapshotMembershipTerms,
  type ClassSchedulingPolicy,
} from "@flowstate/db";
import { fixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "class booking rules at the shared PostgreSQL boundary",
  () => {
    const db = new PrismaClient({ datasources: { db: { url } } });
    const workspaces: string[] = [],
      users: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z"),
      date = "2030-01-07";
    let workspaceId: string,
      ownerId: string,
      coachId: string,
      templateId: string;
    let people: Array<{ memberId: string; userId: string }>;
    const actor = () => ({ workspaceId, userId: ownerId });
    const policy = (lead = 0): ClassSchedulingPolicy => ({
      ...fixtureClassSchedulingPolicy,
      classes: {
        ...fixtureClassSchedulingPolicy.classes,
        minimumLeadMinutes: lead,
      },
    });
    async function configure(next = policy(), expectedVersion = 0) {
      const input = {
        policy: next,
        reason: "Reviewed fictional class booking rules",
        expectedVersion,
      };
      const preview = await previewClassSchedulingPolicy({
        actor: actor(),
        input,
        db,
        now,
      });
      return confirmClassSchedulingPolicy({
        actor: actor(),
        input,
        previewHash: preview.previewHash,
        confirmed: true,
        db,
        now,
      });
    }
    const claim = (
      index = 0,
      source: "ADMIN" | "MEMBER_PORTAL" | "PUBLIC_TRIAL" = "ADMIN",
      at = now,
      client: unknown = db,
    ) =>
      createAccessBackedBooking({
        workspaceId,
        memberId: people[index]!.memberId,
        classTemplateId: templateId,
        scheduledForDate: date,
        timezone: "UTC",
        source,
        db: client as never,
        now: at,
      });
    beforeEach(async () => {
      const workspace = await db.workspace.create({
        data: {
          name: `scheduling-${randomUUID()}`,
          location: { create: { name: "Fictional gym", timezone: "UTC" } },
        },
        include: { location: true },
      });
      workspaceId = workspace.id;
      workspaces.push(workspaceId);
      const owner = await db.user.create({
        data: {
          email: `${randomUUID()}@scheduling.test`,
          workspaceUsers: { create: { workspaceId, role: "OWNER" } },
        },
      });
      ownerId = owner.id;
      users.push(owner.id);
      const coach = await db.user.create({
        data: {
          email: `${randomUUID()}@scheduling.test`,
          workspaceUsers: { create: { workspaceId, role: "COACH" } },
        },
      });
      coachId = coach.id;
      users.push(coach.id);
      const room = await db.room.create({
        data: { locationId: workspace.location!.id, name: "Mat", capacity: 1 },
      });
      const program = await db.program.create({
        data: { workspaceId, name: "Class program" },
      });
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            programId: program.id,
            roomId: room.id,
            title: "Monday class",
            weekday: "MONDAY",
            startTimeMinutes: 1080,
            endTimeMinutes: 1140,
            bookingCutoffMinutes: 60,
            cancellationCutoffMinutes: 120,
          },
        })
      ).id;
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Weekly two",
          monthlyPriceCents: 10000,
          weeklyClassLimit: 2,
        },
      });
      people = [];
      for (let i = 0; i < 3; i++) {
        const user = await db.user.create({
          data: {
            email: `${randomUUID()}@scheduling.test`,
            workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } },
          },
        });
        users.push(user.id);
        const member = await db.member.create({
          data: {
            workspaceId,
            userId: user.id,
            fullName: `Fictional participant ${i}`,
            email: user.email,
            status: "ACTIVE",
          },
        });
        await db.memberMembership.create({
          data: {
            workspaceId,
            memberId: member.id,
            membershipPlanId: plan.id,
            status: "ACTIVE",
            startedAt: new Date("2029-12-01"),
            allowanceAnchorDate: new Date("2030-01-01"),
            allowanceTimezone: "UTC",
            acceptedTerms: JSON.parse(
              JSON.stringify(snapshotMembershipTerms(plan)),
            ),
          },
        });
        people.push({ memberId: member.id, userId: user.id });
      }
    });
    afterAll(async () => {
      for (const id of workspaces) {
        await db.membershipAllowanceAllocation.deleteMany({
          where: { workspaceId: id },
        });
        await db.waitlistEntry.deleteMany({ where: { workspaceId: id } });
        await db.classBooking.deleteMany({ where: { workspaceId: id } });
        await db.classTemplate.deleteMany({ where: { workspaceId: id } });
        await db.workspace.delete({ where: { id } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    it.each(["ADMIN", "MEMBER_PORTAL", "PUBLIC_TRIAL"] as const)(
      "fails closed for %s without owner-confirmed rules, before seat or allowance writes",
      async (source) => {
        expect(await claim(0, source)).toMatchObject({
          status: "error",
          message: expect.stringContaining("owner must confirm"),
        });
        expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
        expect(
          await db.membershipAllowanceAllocation.count({
            where: { workspaceId },
          }),
        ).toBe(0);
      },
    );
    it("requires the current owner, preview and explicit acknowledgment; rejects stale versions", async () => {
      const input = { policy: policy(), reason: "Review", expectedVersion: 0 };
      await expect(
        previewClassSchedulingPolicy({
          actor: { workspaceId, userId: coachId },
          input,
          db,
          now,
        }),
      ).rejects.toThrow("Only the owner");
      const preview = await previewClassSchedulingPolicy({
        actor: actor(),
        input,
        db,
        now,
      });
      await expect(
        confirmClassSchedulingPolicy({
          actor: actor(),
          input,
          previewHash: preview.previewHash,
          confirmed: false,
          db,
          now,
        }),
      ).rejects.toThrow("Acknowledge");
      await configure();
      await expect(
        confirmClassSchedulingPolicy({
          actor: actor(),
          input,
          previewHash: preview.previewHash,
          confirmed: true,
          db,
          now,
        }),
      ).rejects.toThrow("Booking rules changed");
      expect(
        await db.workspaceSchedulingPolicyRevision.count({
          where: { workspaceId },
        }),
      ).toBe(1);
    });
    it.each(["ADMIN", "MEMBER_PORTAL", "PUBLIC_TRIAL"] as const)(
      "enforces minimum notice on %s with no allowance debit",
      async (source) => {
        await configure(policy(120));
        expect(
          await claim(0, source, new Date("2030-01-07T16:00:00Z")),
        ).toMatchObject({
          status: "error",
          message: expect.stringContaining("deadline"),
        });
        expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
        expect(
          await db.membershipAllowanceAllocation.count({
            where: { workspaceId },
          }),
        ).toBe(0);
      },
    );
    it("denies an owner claim outside opening hours rather than silently overriding", async () => {
      const next = policy();
      next.classes.weeklyHours = next.classes.weeklyHours.map((day) => ({
        ...day,
        intervals: [{ startMinute: 540, endMinute: 1020 }],
      }));
      await configure(next);
      expect(await claim()).toMatchObject({
        status: "error",
        message: expect.stringContaining("opening hours"),
      });
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
    });
    it("stores separate commercial and scheduling snapshots plus an immutable exactly-once applied receipt", async () => {
      const revision = await configure();
      const result = await claim();
      if (result.status === "error") throw Error(result.message);
      const booking = await db.classBooking.findUniqueOrThrow({
        where: { id: result.bookingId },
      });
      expect(booking.schedulingPolicySnapshot).toMatchObject({
        mode: "LIVE",
        policyRevisionId: revision.id,
        policyHash: revision.policyHash,
        startsAt: "2030-01-07T18:00:00.000Z",
        closesAt: "2030-01-07T17:00:00.000Z",
      });
      expect(booking.acceptedPolicy).toHaveProperty("version", 1);
      expect(await claim()).toMatchObject({
        status: "error",
        code: "DUPLICATE",
      });
      const receipt = await db.workspaceDataEvent.findFirstOrThrow({
        where: { workspaceId, kind: "SCHEDULING_POLICY_APPLIED" },
      });
      expect(receipt.metadata).toMatchObject({
        bookingId: booking.id,
        fundingRevision: 1,
        policyHash: revision.policyHash,
      });
      await expect(
        db.workspaceDataEvent.update({
          where: { id: receipt.id },
          data: { metadata: {} },
        }),
      ).rejects.toThrow("immutable");
      await expect(
        db.workspaceSchedulingPolicyRevision.delete({
          where: { id: revision.id },
        }),
      ).rejects.toThrow("immutable");
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "SCHEDULING_POLICY_APPLIED" },
        }),
      ).toBe(1);
    });
    it("rejects a preview made before a new booking and retains existing seats, funding and snapshots after confirmation", async () => {
      await configure();
      const next = policy();
      next.classes.weeklyHours = next.classes.weeklyHours.map((day) => ({
        ...day,
        intervals: [],
      }));
      const input = {
        policy: next,
        reason: "Close new claims while retaining commitments",
        expectedVersion: 1,
      };
      const stale = await previewClassSchedulingPolicy({
        actor: actor(),
        input,
        db,
        now,
      });
      const result = await claim();
      if (result.status === "error") throw Error(result.message);
      const before = await db.classBooking.findUniqueOrThrow({
        where: { id: result.bookingId },
      });
      await expect(
        confirmClassSchedulingPolicy({
          actor: actor(),
          input,
          previewHash: stale.previewHash,
          confirmed: true,
          db,
          now,
        }),
      ).rejects.toThrow("schedule or booking rules changed");
      const fresh = await previewClassSchedulingPolicy({
        actor: actor(),
        input,
        db,
        now,
      });
      expect(fresh.retainedBookings).toHaveLength(1);
      await confirmClassSchedulingPolicy({
        actor: actor(),
        input,
        previewHash: fresh.previewHash,
        confirmed: true,
        db,
        now,
      });
      const after = await db.classBooking.findUniqueOrThrow({
        where: { id: result.bookingId },
      });
      expect(after.status).toBe("BOOKED");
      expect(after.schedulingPolicySnapshot).toEqual(
        before.schedulingPolicySnapshot,
      );
      expect(after.acceptedPolicy).toEqual(before.acceptedPolicy);
      expect(await claim(1)).toMatchObject({
        status: "error",
        message: expect.stringContaining("opening hours"),
      });
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(1);
    });
    it("rolls back the booking and allowance when the immutable receipt cannot be written", async () => {
      await configure();
      const failing = db.$extends({
        query: {
          workspaceDataEvent: {
            async create({ args, query }) {
              if (args.data.kind === "SCHEDULING_POLICY_APPLIED")
                throw new Error("Injected scheduling receipt failure");
              return query(args);
            },
          },
        },
      });
      await expect(claim(0, "ADMIN", now, failing)).rejects.toThrow(
        "Injected scheduling receipt",
      );
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
    });
    it("keeps a queue place but requires renewed consent when its actual class time changes", async () => {
    await configure(); const occupied = await claim(); if (occupied.status === "error") throw Error(occupied.message);
    const person = people[1]!;
    await joinWaitlist({ workspaceId, memberId: person.memberId, classTemplateId: templateId, scheduledForDate: date, timezone: "UTC", source: "MEMBER_PORTAL", autoPromotionOptIn: true, consentUserId: person.userId, db: db as never, now });
    await db.classTemplate.update({ where: { id: templateId }, data: { startTimeMinutes: 1140, endTimeMinutes: 1200 } });
    await db.classBooking.update({ where: { id: occupied.bookingId }, data: { status: "CANCELLED" } });
    expect(await promoteNextWaitlistEntry({ workspaceId, classTemplateId: templateId, scheduledForDate: date, timezone: "UTC", source: "ADMIN", db: db as never, now })).toMatchObject({ status: "error" });
    expect(await db.waitlistEntry.findFirstOrThrow({ where: { workspaceId, memberId: person.memberId } })).toMatchObject({ status: "ACTIVE", lastSkipReason: expect.stringContaining("class time changed") });
    expect(await db.classBooking.count({ where: { workspaceId, memberId: person.memberId } })).toBe(0);
  });
  it("never extends the deadline recorded with waitlist consent when rules loosen", async () => {
      await configure(policy(120));
      const occupied = await claim();
      if (occupied.status === "error") throw Error(occupied.message);
      const person = people[1]!;
      expect(
        await joinWaitlist({
          workspaceId,
          memberId: person.memberId,
          classTemplateId: templateId,
          scheduledForDate: date,
          timezone: "UTC",
          source: "MEMBER_PORTAL",
          autoPromotionOptIn: true,
          consentUserId: person.userId,
          db: db as never,
          now,
        }),
      ).toMatchObject({ status: "joined" });
      const entry = await db.waitlistEntry.findFirstOrThrow({
        where: { workspaceId, memberId: person.memberId },
      });
      expect(entry.schedulingPolicySnapshot).toMatchObject({
        autoPromotionClosesAt: "2030-01-07T16:00:00.000Z",
      });
      await configure(policy(0), 1);
      await db.classTemplate.update({
        where: { id: templateId },
        data: { bookingCutoffMinutes: 0, cancellationCutoffMinutes: 0 },
      });
      await db.classBooking.update({
        where: { id: occupied.bookingId },
        data: { status: "CANCELLED" },
      });
      expect(
        await promoteNextWaitlistEntry({
          workspaceId,
          classTemplateId: templateId,
          scheduledForDate: date,
          timezone: "UTC",
          source: "ADMIN",
          db: db as never,
          now: new Date("2030-01-07T17:00:00Z"),
        }),
      ).toMatchObject({ status: "error" });
      expect(
        await db.waitlistEntry.findUnique({ where: { id: entry.id } }),
      ).toMatchObject({
        status: "ACTIVE",
        lastSkipReason: expect.stringContaining("agreed when joining"),
      });
      expect(
        await db.classBooking.count({
          where: { workspaceId, memberId: person.memberId },
        }),
      ).toBe(0);
    });
  },
);
