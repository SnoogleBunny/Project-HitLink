import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  createAccessBackedBooking,
  emptyClassPrerequisites,
  evaluateClassPrerequisites,
  getMemberProgramProgress,
  grantClassEligibilityException,
  joinWaitlist,
  promoteNextWaitlistEntry,
  recordProgramPromotion,
  reviewProgramRankPolicy,
  saveProgramRankPolicy,
  setProgressCapabilities,
  type ProgramRankPolicy,
} from "@flowstate/db";
import { recordAttendance } from "./rosters";
const databaseUrl = process.env.TEST_DATABASE_URL;
const policy: ProgramRankPolicy = {
  version: 1,
  mode: "PREREQUISITES",
  ranks: [
    { key: "white", name: "White", maxStripes: 4 },
    { key: "blue", name: "Blue", maxStripes: 4 },
  ],
};
describe("program eligibility calendar rules", () => {
  it("uses class date for age and keeps ranks optional", () => {
    const base = {
      policy,
      rules: {
        ...emptyClassPrerequisites,
        minimumRankKey: "blue",
        allowUnranked: false,
        minimumAge: 18,
      },
      date: "2030-01-07",
      dateOfBirth: new Date("2012-01-08"),
      tags: [],
      rank: { rankKey: "blue", rankName: "Blue", stripeCount: 0 },
    };
    expect(evaluateClassPrerequisites(base)).toMatchObject({
      eligible: false,
      reason: expect.stringContaining("ages"),
    });
    expect(
      evaluateClassPrerequisites({ ...base, date: "2030-01-08" }),
    ).toMatchObject({ eligible: true });
    expect(
      evaluateClassPrerequisites({
        ...base,
        date: "2030-01-08",
        rank: null,
        policy: { ...policy, mode: "OFF" },
      }),
    ).toMatchObject({ eligible: true });
  });
});
(databaseUrl ? describe : describe.skip)(
  "program progress and class prerequisites",
  () => {
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } }),
      workspaces: string[] = [],
      users: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z");
    let workspaceId: string,
      ownerUserId: string,
      ownerStaffId: string,
      coachId: string,
      coachUserId: string,
      programId: string,
      memberId: string,
      memberUserId: string,
      templateId: string;
    beforeEach(async () => {
      workspaceId = (
        await db.workspace.create({
          data: {
            name: `rank-test-${randomUUID()}`,
            location: { create: { name: "Gym", timezone: "UTC" } },
          },
        })
      ).id;
      workspaces.push(workspaceId);
    await createFixtureClassSchedulingPolicy(db, workspaceId);
      for (const role of ["OWNER", "COACH", "CUSTOMER"] as const) {
        const user = await db.user.create({
          data: {
            email: `${randomUUID()}@rank.test`,
            workspaceUsers: { create: { workspaceId, role } },
          },
          include: { workspaceUsers: true },
        });
        users.push(user.id);
        if (role === "OWNER") {
          ownerUserId = user.id;
          ownerStaffId = user.workspaceUsers[0]!.id;
        } else if (role === "COACH") {
          coachUserId = user.id;
          coachId = user.workspaceUsers[0]!.id;
        } else memberUserId = user.id;
      }
      programId = (
        await db.program.create({
          data: {
            workspaceId,
            name: "Jiu jitsu",
            rankPolicy: JSON.parse(JSON.stringify(policy)),
          },
        })
      ).id;
      const location = await db.location.findUniqueOrThrow({
        where: { workspaceId },
      });
      const room = await db.room.create({
        data: { locationId: location.id, name: "Mat", capacity: 2 },
      });
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            programId,
            roomId: room.id,
            coachWorkspaceUserId: ownerStaffId,
            weekday: "MONDAY",
            startTimeMinutes: 1080,
            endTimeMinutes: 1140,
            bookingCutoffMinutes: 0,
            cancellationCutoffMinutes: 0,
            prerequisites: {
              ...emptyClassPrerequisites,
              minimumRankKey: "blue",
              allowUnranked: false,
            },
          },
        })
      ).id;
      memberId = (
        await db.member.create({
          data: {
            workspaceId,
            userId: memberUserId,
            fullName: "Member",
            dateOfBirth: new Date("2000-01-01"),
          },
        })
      ).id;
    });
    afterAll(async () => {
      for (const id of workspaces) {
        await db.programPromotion.deleteMany({ where: { workspaceId: id } });
        await db.programRankChange.deleteMany({ where: { workspaceId: id } });
        await db.classPrerequisiteException.deleteMany({
          where: { workspaceId: id },
        });
        await db.attendanceRecord.deleteMany({ where: { workspaceId: id } });
        await db.waitlistEntry.deleteMany({ where: { workspaceId: id } });
        await db.classBooking.deleteMany({ where: { workspaceId: id } });
        await db.classTemplate.deleteMany({ where: { workspaceId: id } });
        await db.workspace.delete({ where: { id } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    const actor = () => ({ workspaceId, userId: ownerUserId });
    const promotion = (overrides: Record<string, unknown> = {}) =>
      recordProgramPromotion(actor(), {
        programId,
        memberId,
        rankKey: "blue",
        stripeCount: 0,
        effectiveOn: "2030-01-01",
        awardedByWorkspaceUserId: coachId,
        internalNote: "Private staff note",
        publicNote: "Congratulations",
        operationKey: randomUUID(),
        db,
        now,
        ...overrides,
      });
    const book = () =>
      createAccessBackedBooking({
        workspaceId,
        memberId,
        classTemplateId: templateId,
        scheduledForDate: "2030-01-07",
        timezone: "UTC",
        source: "ADMIN",
        trial: true,
        allowDropIn: false,
        db: db as never,
        now,
      });
    it("rejects ineligible trial/staff bookings and accepts a recorded eligible promotion", async () => {
      expect(await book()).toMatchObject({
        status: "error",
        message: expect.stringContaining("rank"),
      });
      expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
      await promotion();
      expect(await book()).toMatchObject({ status: "created" });
    });
    it("protects promotion authority and keeps internal notes out of member history", async () => {
      await expect(
        recordProgramPromotion(
          { workspaceId, userId: coachUserId },
          {
            programId,
            memberId,
            rankKey: "blue",
            stripeCount: 0,
            effectiveOn: "2030-01-01",
            awardedByWorkspaceUserId: coachId,
            operationKey: randomUUID(),
            db,
            now,
          },
        ),
      ).rejects.toThrow("permission");
      await setProgressCapabilities(actor(), {
        workspaceUserId: coachId,
        canManageProgress: true,
        canOverridePrerequisites: false,
        db,
      });
      await promotion();
      const member = await getMemberProgramProgress(
        { workspaceId, userId: memberUserId },
        memberId,
        db,
      );
      expect(member[0]!.history[0]).not.toHaveProperty("internalNote");
      expect(
        (await getMemberProgramProgress(actor(), memberId, db))[0]!.history[0],
      ).toHaveProperty("internalNote", "Private staff note");
      await expect(
        getMemberProgramProgress(
          { workspaceId, userId: coachUserId },
          "foreign-member",
          db,
        ),
      ).rejects.toThrow("access");
    });
    it("requires an explicit capability and reason for a dated exception, and attendance rechecks eligibility", async () => {
      await expect(
        grantClassEligibilityException(
          { workspaceId, userId: coachUserId },
          {
            memberId,
            classTemplateId: templateId,
            date: "2030-01-07",
            reason: "Coach knows this member",
            db,
          },
        ),
      ).rejects.toThrow("permission");
      await grantClassEligibilityException(actor(), {
        memberId,
        classTemplateId: templateId,
        date: "2030-01-07",
        reason: "Coach assessed current skills",
        db,
      });
      expect(await book()).toMatchObject({ status: "created" });
      await db.classTemplate.update({
        where: { id: templateId },
        data: {
          prerequisites: {
            ...emptyClassPrerequisites,
            minimumRankKey: "blue",
            minimumStripes: 2,
            allowUnranked: false,
          },
        },
      });
      expect(
        await recordAttendance({
          access: {
            workspaceId,
            workspaceUserId: ownerStaffId,
            role: "OWNER",
            timezone: "UTC",
          },
          memberId,
          classTemplateId: templateId,
          scheduledForDate: "2030-01-07",
          state: "PRESENT",
          db: db as never,
          now: new Date("2030-01-07T18:05:00Z"),
        }),
      ).toMatchObject({
        status: "error",
        message: expect.stringContaining("rank"),
      });
      expect(await db.attendanceRecord.count({ where: { workspaceId } })).toBe(
        0,
      );
    });
    it("reviews existing reservations and prevents stale policy application", async () => {
      await promotion();
      expect(await book()).toMatchObject({ status: "created" });
      const changed = { ...policy, ranks: [...policy.ranks].reverse() };
      const review = await reviewProgramRankPolicy(actor(), {
        programId,
        policy: changed,
        db,
        now,
      });
      await db.program.update({
        where: { id: programId },
        data: { rankPolicy: { ...policy, version: 2 } },
      });
      await expect(
        saveProgramRankPolicy(actor(), {
          programId,
          policy: changed,
          reviewToken: review.token,
          operationKey: randomUUID(),
          reason: "Change rank order",
          db,
          now,
        }),
      ).rejects.toThrow("changed");
    });
    it("rechecks waitlist promotion after a recorded rank changes", async () => {
      await promotion();
      const plan = await db.membershipPlan.create({
        data: { workspaceId, name: "Unlimited", monthlyPriceCents: 0 },
      });
      await db.memberMembership.create({
        data: {
          workspaceId,
          memberId,
          membershipPlanId: plan.id,
          status: "ACTIVE",
          startedAt: now,
        },
      });
      await db.classTemplate.update({
        where: { id: templateId },
        data: { capacityOverride: 1 },
      });
      const other = await db.member.create({
        data: { workspaceId, fullName: "Seat holder" },
      });
      await db.classBooking.create({
        data: {
          workspaceId,
          memberId: other.id,
          classTemplateId: templateId,
          scheduledForDate: new Date("2030-01-07"),
          status: "BOOKED",
        },
      });
      expect(
        await joinWaitlist({
          workspaceId,
          memberId,
          classTemplateId: templateId,
          scheduledForDate: "2030-01-07",
          timezone: "UTC",
          source: "MEMBER_PORTAL",
          autoPromotionOptIn: true,
          consentUserId: memberUserId,
          db: db as never,
          now,
        }),
      ).toMatchObject({ status: "joined" });
      await promotion({
        rankKey: "white",
        internalNote: "Correction",
        operationKey: randomUUID(),
      });
      await db.classBooking.updateMany({
        where: { workspaceId, memberId: other.id },
        data: { status: "CANCELLED" },
      });
      const result = await promoteNextWaitlistEntry({
        workspaceId,
        classTemplateId: templateId,
        scheduledForDate: "2030-01-07",
        timezone: "UTC",
        source: "ADMIN",
        db: db as never,
        now,
      });
      expect(result.status).not.toBe("promoted");
      expect(
        await db.classBooking.count({
          where: { workspaceId, memberId, status: "BOOKED" },
        }),
      ).toBe(0);
    });
  },
);
