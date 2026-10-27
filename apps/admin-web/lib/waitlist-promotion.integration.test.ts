import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  evaluateClassSchedulingPolicy,
  createAccessBackedBooking,
  cancelAccessBackedBooking,
  joinWaitlist,
  promoteNextWaitlistEntry,
  processWorkspaceWaitlists,
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
  recordLocalFormSignature,
} from "@flowstate/db";

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "consented FIFO waitlist promotion",
  () => {
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const workspaces: string[] = [],
      users: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z"),
      date = "2030-01-07";
    let workspaceId: string, templateId: string;
    let people: Array<{
      memberId: string;
      userId: string;
      membershipId: string;
    }>;
    let occupiedId: string;
    beforeEach(async () => {
      workspaceId = (
        await db.workspace.create({
          data: { name: `waitlist-${randomUUID()}` },
        })
      ).id;
      workspaces.push(workspaceId);
      await createFixtureClassSchedulingPolicy(db, workspaceId);
      const location = await db.location.create({
        data: { workspaceId, name: "Gym", timezone: "UTC" },
      });
      const room = await db.room.create({
        data: { locationId: location.id, name: "Mat", capacity: 1 },
      });
      const program = await db.program.create({
        data: { workspaceId, name: "Muay Thai" },
      });
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            roomId: room.id,
            programId: program.id,
            weekday: "MONDAY",
            startTimeMinutes: 1080,
            endTimeMinutes: 1140,
            bookingCutoffMinutes: 60,
            cancellationCutoffMinutes: 120,
          },
        })
      ).id;
      const plan = await db.membershipPlan.create({
        data: { workspaceId, name: "Unlimited", monthlyPriceCents: 12000 },
      });
      people = [];
      for (let index = 0; index < 4; index++) {
        const user = await db.user.create({
          data: {
            email: `waitlist-${randomUUID()}@example.test`,
            fullName: `Person ${index}`,
            workspaceUsers: {
              create: { workspaceId, role: "CUSTOMER", isActive: true },
            },
          },
        });
        users.push(user.id);
        const member = await db.member.create({
          data: {
            workspaceId,
            userId: user.id,
            fullName: `Person ${index}`,
            email: user.email,
          },
        });
        const membership = await db.memberMembership.create({
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
        people.push({
          memberId: member.id,
          userId: user.id,
          membershipId: membership.id,
        });
      }
      const booked = await book(0);
      if (booked.status === "error") throw Error(booked.message);
      occupiedId = booked.bookingId;
    });
    afterAll(async () => {
      for (const id of workspaces) {
        await db.waitlistEntry.deleteMany({ where: { workspaceId: id } });
        await db.classBooking.deleteMany({ where: { workspaceId: id } });
        await db.classTemplate.deleteMany({ where: { workspaceId: id } });
        await db.workspace.delete({ where: { id } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    const book = (index: number, at = now) =>
      createAccessBackedBooking({
        workspaceId,
        memberId: people[index]!.memberId,
        classTemplateId: templateId,
        scheduledForDate: date,
        timezone: "UTC",
        source: "MEMBER_PORTAL",
        db: db as never,
        now: at,
      });
    const join = (
      index: number,
      consent = true,
      allowPunchCardFunding = false,
    ) =>
      joinWaitlist({
        workspaceId,
        memberId: people[index]!.memberId,
        classTemplateId: templateId,
        scheduledForDate: date,
        timezone: "UTC",
        source: "MEMBER_PORTAL",
        consentUserId: people[index]!.userId,
        autoPromotionOptIn: consent,
        allowPunchCardFunding,
        db: db as never,
        now: new Date(+now - 1000 + index),
      });
    const cancel = (at = now) =>
      cancelAccessBackedBooking({
        workspaceId,
        memberId: people[0]!.memberId,
        bookingId: occupiedId,
        timezone: "UTC",
        db: db as never,
        now: at,
      });
    const entry = (index: number) =>
      db.waitlistEntry.findFirstOrThrow({
        where: { workspaceId, memberId: people[index]!.memberId },
      });
    async function pack(index: number) {
      const product = await db.punchCardProduct.create({
        data: {
          workspaceId,
          name: `Pack ${index}`,
          punchesIncluded: 5,
          priceCents: 5000,
        },
      });
      return db.memberPunchCard.create({
        data: {
          workspaceId,
          memberId: people[index]!.memberId,
          punchCardProductId: product.id,
          originalPunches: 5,
          remainingPunches: 5,
          purchasePriceCents: product.priceCents,
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotPunchCardTerms(product, now)),
          ),
        },
      });
    }
    it("requires explicit consent and holds no allowance or unit merely for joining", async () => {
      expect((await join(1, false)).status).toBe("error");
      expect(await db.waitlistEntry.count({ where: { workspaceId } })).toBe(0);
      expect((await join(1)).status).toBe("joined");
      expect(await entry(1)).toMatchObject({
        autoPromotionConsentUserId: people[1]!.userId,
        autoPromotionPolicyVersion: "FIFO_AUTO_V1",
        allowPunchCardFunding: false,
      });
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
      expect(await db.punchCardEntry.count({ where: { workspaceId } })).toBe(0);
    });
    it("automatically promotes the earliest eligible person with one booking and durable notice", async () => {
      await join(1);
      await join(2);
      expect((await cancel()).status).toBe("cancelled");
      expect((await entry(1)).status).toBe("PROMOTED");
      expect((await entry(2)).status).toBe("ACTIVE");
      expect(
        await db.classBooking.count({
          where: { workspaceId, status: "BOOKED" },
        }),
      ).toBe(1);
      const notices = await db.notificationJob.findMany({
        where: { workspaceId },
      });
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        templateKind: "BOOKING_CONFIRMATION",
        status: "PENDING",
        context: {
          kind: "CLASS_BOOKING",
          bookingId: (await entry(1)).promotedBookingId,
        },
      });
      await cancel();
      expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
        1,
      );
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
    });
    it("records a newly ineligible head and promotes the next eligible person", async () => {
      await join(1);
      await join(2);
      await db.memberMembership.update({
        where: { id: people[1]!.membershipId },
        data: { status: "CANCELLED" },
      });
      await cancel();
      expect(await entry(1)).toMatchObject({
        status: "ACTIVE",
        lastSkippedAt: now,
        lastSkipReason: expect.any(String),
      });
      expect((await entry(1)).promotionHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "SKIPPED",
            reason: expect.any(String),
          }),
        ]),
      );
      expect((await entry(2)).status).toBe("PROMOTED");
    });
    it("preserves legacy entries without inventing consent", async () => {
      await db.waitlistEntry.create({
        data: {
          workspaceId,
          memberId: people[1]!.memberId,
          classTemplateId: templateId,
          scheduledForDate: new Date(date),
          joinedAt: new Date(+now - 1000),
        },
      });
      await join(2);
      await cancel();
      expect(await entry(1)).toMatchObject({
        autoPromotionOptedInAt: null,
        autoPromotionConsentUserId: null,
        status: "ACTIVE",
        lastSkipReason: expect.stringContaining("no recorded consent"),
      });
      expect((await entry(2)).status).toBe("PROMOTED");
    });
    it("retains earlier skip evidence when a departed entry rejoins with fresh consent", async () => {
      const history = [
        {
          kind: "SKIPPED",
          at: new Date(+now - 2000).toISOString(),
          reason: "Previous eligibility review",
        },
      ];
      await db.waitlistEntry.create({
        data: {
          workspaceId,
          memberId: people[1]!.memberId,
          classTemplateId: templateId,
          scheduledForDate: new Date(date),
          status: "CANCELLED",
          promotionHistory: history,
        },
      });
      expect((await join(1)).status).toBe("restored");
      const restored = await entry(1);
      expect(restored).toMatchObject({
        status: "ACTIVE",
        autoPromotionConsentUserId: people[1]!.userId,
        autoPromotionPolicyVersion: "FIFO_AUTO_V1",
      });
      expect(restored.promotionHistory).toEqual([
        history[0],
        expect.objectContaining({ kind: "OPT_IN", userId: people[1]!.userId }),
      ]);
    });
    it("stops at the earlier cutoff while allowing an explicitly chosen later direct booking", async () => {
      await join(1);
      await cancel(new Date("2030-01-07T16:00:00Z"));
      expect(await entry(1)).toMatchObject({
        status: "ACTIVE",
        lastSkipReason: expect.stringContaining("deadline"),
      });
      expect((await book(2, new Date("2030-01-07T16:30:00Z"))).status).toBe(
        "created",
      );
      expect((await entry(1)).status).toBe("ACTIVE");
    });
    it("rechecks account authority and skips a revoked account", async () => {
      await join(1);
      await join(2);
      await db.workspaceUser.updateMany({
        where: { workspaceId, userId: people[1]!.userId },
        data: { isActive: false },
      });
      await cancel();
      expect((await entry(1)).lastSkipReason).toContain("authority");
      expect((await entry(2)).status).toBe("PROMOTED");
    });
    it("gives the queued member priority over a concurrent direct booking and promotion retry", async () => {
      await join(1);
      await db.classBooking.update({
        where: { id: occupiedId },
        data: { status: "CANCELLED" },
      });
      const outcomes = await Promise.all([
        book(2),
        promoteNextWaitlistEntry({
          workspaceId,
          classTemplateId: templateId,
          scheduledForDate: date,
          timezone: "UTC",
          source: "ADMIN",
          db: db as never,
          now,
        }),
      ]);
      expect(outcomes[0]!.status).toBe("error");
      expect((await entry(1)).status).toBe("PROMOTED");
      expect(
        await db.classBooking.count({
          where: { workspaceId, status: "BOOKED" },
        }),
      ).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
        1,
      );
    });
    it("rolls back seat, funding and queue when durable notification creation fails", async () => {
      await join(1);
      await db.classBooking.update({
        where: { id: occupiedId },
        data: { status: "CANCELLED" },
      });
      const broken = {
        $transaction: (callback: (tx: unknown) => unknown) =>
          db.$transaction(async (tx) =>
            callback(
              new Proxy(tx, {
                get(target, name) {
                  if (name === "notificationJob")
                    return {
                      createMany: async () => {
                        throw Error("outbox unavailable");
                      },
                    };
                  return Reflect.get(target, name);
                },
              }),
            ),
          ),
      };
      await expect(
        promoteNextWaitlistEntry({
          workspaceId,
          classTemplateId: templateId,
          scheduledForDate: date,
          timezone: "UTC",
          source: "ADMIN",
          db: broken as never,
          now,
        }),
      ).rejects.toThrow("outbox unavailable");
      expect((await entry(1)).status).toBe("ACTIVE");
      expect(
        await db.classBooking.count({
          where: { workspaceId, status: "BOOKED" },
        }),
      ).toBe(0);
    });
    it("recovers an expired unpaid hold through the maintenance domain operation", async () => {
      await db.classBooking.update({
        where: { id: occupiedId },
        data: {
          status: "PENDING_PAYMENT",
          pendingPaymentExpiresAt: new Date(+now + 60000),
        },
      });
      await join(1);
      expect(
        await processWorkspaceWaitlists(
          workspaceId,
          new Date(+now + 120000),
          db,
        ),
      ).toEqual({ promoted: 1 });
      expect((await entry(1)).status).toBe("PROMOTED");
    });
    it("requires separate pack permission and reserves an authorized unit exactly once", async () => {
      const firstPack = await pack(1),
        secondPack = await pack(2);
      await join(1);
      await join(2, true, true);
      await db.memberMembership.deleteMany({
        where: {
          id: { in: [people[1]!.membershipId, people[2]!.membershipId] },
        },
      });
      await cancel();
      expect(await entry(1)).toMatchObject({
        status: "ACTIVE",
        lastSkipReason: expect.stringContaining("not authorized"),
      });
      expect((await entry(2)).status).toBe("PROMOTED");
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: firstPack.id },
          })
        ).remainingPunches,
      ).toBe(5);
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: secondPack.id },
          })
        ).remainingPunches,
      ).toBe(4);
      expect(
        await db.punchCardEntry.count({ where: { workspaceId, delta: -1 } }),
      ).toBe(1);
      await processWorkspaceWaitlists(workspaceId, now, db);
      expect(
        await db.punchCardEntry.count({ where: { workspaceId, delta: -1 } }),
      ).toBe(1);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
    });
    it("prefers eligible unlimited membership even when pack spending is authorized", async () => {
      const card = await pack(1);
      await join(1, true, true);
      await cancel();
      const promoted = await entry(1);
      expect(
        (
          await db.classBooking.findUniqueOrThrow({
            where: { id: promoted.promotedBookingId! },
          })
        ).bookingType,
      ).toBe("MEMBERSHIP");
      expect(
        (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card.id } }))
          .remainingPunches,
      ).toBe(5);
      expect(await db.punchCardEntry.count({ where: { workspaceId } })).toBe(0);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
    });
    it("records a newly conflicting head and gives the place to the next eligible person", async () => {
      await join(1);
      await join(2);
      const template = await db.classTemplate.findUniqueOrThrow({
        where: { id: templateId },
      });
      const other = await db.classTemplate.create({
        data: {
          workspaceId,
          roomId: template.roomId,
          programId: template.programId,
          weekday: "MONDAY",
          startTimeMinutes: 1110,
          endTimeMinutes: 1170,
          bookingCutoffMinutes: 60,
          cancellationCutoffMinutes: 120,
        },
      });
      await db.classBooking.create({
        data: {
          workspaceId,
          memberId: people[1]!.memberId,
          classTemplateId: other.id,
          scheduledForDate: new Date(date),
          bookingType: "TRIAL",
          source: "ADMIN",
        },
      });
      await cancel();
      expect(await entry(1)).toMatchObject({
        status: "ACTIVE",
        lastSkipReason: expect.stringContaining(
          "already has a booking at this time",
        ),
      });
      expect((await entry(2)).status).toBe("PROMOTED");
    });
    it("closes an existing booked-and-queued duplicate instead of leaving it active", async () => {
      await db.waitlistEntry.create({
        data: {
          workspaceId,
          memberId: people[0]!.memberId,
          classTemplateId: templateId,
          scheduledForDate: new Date(date),
          autoPromotionOptedInAt: now,
          autoPromotionConsentUserId: people[0]!.userId,
          autoPromotionPolicyVersion: "FIFO_AUTO_V1",
        },
      });
      await processWorkspaceWaitlists(workspaceId, now, db);
      expect(await entry(0)).toMatchObject({
        status: "CANCELLED",
        lastSkipReason: expect.stringContaining("duplicate queue entry"),
      });
      expect(
        await db.classBooking.count({
          where: { workspaceId, status: "BOOKED" },
        }),
      ).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
        0,
      );
    });
    it.each([false, true])(
      "uses an exhausted membership's pack only with explicit permission: %s",
      async (authorized) => {
        const card = await pack(1);
        await join(1, true, authorized);
        await join(2);
        const plan = await db.membershipPlan.create({
          data: {
            workspaceId,
            name: "One weekly class",
            monthlyPriceCents: 8000,
            weeklyClassLimit: 1,
          },
        });
        await db.memberMembership.update({
          where: { id: people[1]!.membershipId },
          data: {
            membershipPlanId: plan.id,
            acceptedTerms: JSON.parse(
              JSON.stringify(snapshotMembershipTerms(plan)),
            ),
          },
        });
        const template = await db.classTemplate.findUniqueOrThrow({
          where: { id: templateId },
        });
        const other = await db.classTemplate.create({
          data: {
            workspaceId,
            roomId: template.roomId,
            programId: template.programId,
            weekday: "MONDAY",
            startTimeMinutes: 1200,
            endTimeMinutes: 1260,
            bookingCutoffMinutes: 60,
            cancellationCutoffMinutes: 120,
          },
        });
        expect(
          (
            await createAccessBackedBooking({
              workspaceId,
              memberId: people[1]!.memberId,
              classTemplateId: other.id,
              scheduledForDate: date,
              timezone: "UTC",
              source: "MEMBER_PORTAL",
              db: db as never,
              now,
            })
          ).status,
        ).toBe("created");
        await cancel();
        expect((await entry(1)).status).toBe(
          authorized ? "PROMOTED" : "ACTIVE",
        );
        expect((await entry(2)).status).toBe(
          authorized ? "ACTIVE" : "PROMOTED",
        );
        expect(
          (
            await db.memberPunchCard.findUniqueOrThrow({
              where: { id: card.id },
            })
          ).remainingPunches,
        ).toBe(authorized ? 4 : 5);
        expect(
          await db.punchCardEntry.count({ where: { workspaceId, delta: -1 } }),
        ).toBe(authorized ? 1 : 0);
        expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(
          1,
        );
      },
    );
    it("rechecks newly required current forms before automatic booking", async () => {
      await join(1);
      await join(2);
      const staff = await db.workspaceUser.findFirstOrThrow({
        where: { workspaceId, userId: people[0]!.userId },
      });
      const document = await db.formDocument.create({
        data: { workspaceId, name: "Current trial waiver", formType: "WAIVER" },
      });
      const version = await db.formVersion.create({
        data: {
          workspaceId,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "waiver.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 8,
          fileSha256: "0".repeat(64),
          fileData: Buffer.from("%PDF-1.7"),
          uploadedByWorkspaceUserId: staff.id,
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId,
          formDocumentId: document.id,
          requirementTarget: "TRIAL",
        },
      });
      const request = await db.signatureRequest.create({
        data: {
          workspaceId,
          memberId: people[2]!.memberId,
          formVersionId: version.id,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
        },
      });
      expect(
        (
          await recordLocalFormSignature({
            workspaceId,
            memberId: people[2]!.memberId,
            actorUserId: people[2]!.userId,
            requestId: request.id,
            signerName: "Person 2",
            db,
            now,
          })
        ).status,
      ).toBe("signed");
      await cancel();
      expect(await entry(1)).toMatchObject({
        status: "ACTIVE",
        lastSkipReason: expect.stringContaining("exact forms valid for this class"),
      });
      expect((await entry(2)).status).toBe("PROMOTED");
      expect(
        await db.classBooking.count({
          where: { workspaceId, status: "BOOKED" },
        }),
      ).toBe(1);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId },
        }),
      ).toBe(0);
    });
    it("reaches queues beyond a full first maintenance page", async () => {
      const template = await db.classTemplate.findUniqueOrThrow({
        where: { id: templateId },
      });
      const prefix = randomUUID();
      const ids = Array.from(
        { length: 101 },
        (_, index) => `${prefix}-${String(index).padStart(3, "0")}`,
      );
      await db.classTemplate.createMany({
        data: ids.map((id) => ({
          id,
          workspaceId,
          roomId: template.roomId,
          programId: template.programId,
          weekday: "MONDAY",
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          bookingCutoffMinutes: 60,
          cancellationCutoffMinutes: 120,
        })),
      });
      await db.classBooking.createMany({
        data: ids
          .slice(0, 100)
          .map((classTemplateId) => ({
            workspaceId,
            memberId: people[0]!.memberId,
            classTemplateId,
            scheduledForDate: new Date(date),
            bookingType: "TRIAL",
            source: "ADMIN",
          })),
      });
      const revision =
        await db.workspaceSchedulingPolicyRevision.findFirstOrThrow({
          where: { workspaceId },
        });
      const evaluation = evaluateClassSchedulingPolicy({
        revision,
        date,
        timezone: "UTC",
        startTimeMinutes: template.startTimeMinutes,
        endTimeMinutes: template.endTimeMinutes,
        bookingCutoffMinutes: Math.max(
          template.bookingCutoffMinutes,
          template.cancellationCutoffMinutes,
        ),
        now,
      });
      if (!evaluation.allowed) throw new Error(evaluation.message);
      const schedulingPolicySnapshot = {
        ...evaluation.snapshot,
        autoPromotionClosesAt: evaluation.snapshot.closesAt!,
      };
      await db.waitlistEntry.createMany({
        data: ids.map((classTemplateId) => ({
          workspaceId,
          memberId: people[1]!.memberId,
          classTemplateId,
          scheduledForDate: new Date(date),
          autoPromotionOptedInAt: now,
          autoPromotionConsentUserId: people[1]!.userId,
          autoPromotionPolicyVersion: "FIFO_AUTO_V1",
          schedulingPolicySnapshot,
        })),
      });
      expect(await processWorkspaceWaitlists(workspaceId, now, db)).toEqual({
        promoted: 1,
      });
      expect(
        await db.waitlistEntry.findFirstOrThrow({
          where: { workspaceId, classTemplateId: ids[100] },
        }),
      ).toMatchObject({ status: "PROMOTED" });
    }, 15000);
  },
);
