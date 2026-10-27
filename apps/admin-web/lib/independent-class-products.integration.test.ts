import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  createAccessBackedBooking,
  moveAccessBackedBooking,
  resolveBookingAccessForProgram,
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
  lockClassSchedule,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory.js";
const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!/test|e2e/i.test(new URL(url).pathname) ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
)
  throw new Error(
    "Independent product tests need a dedicated loopback test database.",
  );
(url ? describe : describe.skip)(
  "exact-asset membership holds and independent class products",
  () => {
    const db = new PrismaClient({ datasourceUrl: url }),
      workspaces: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z");
    async function fixture() {
      const workspace = await db.workspace.create({
        data: {
          name: `Fictional product isolation ${randomUUID()}`,
          status: "ACTIVE",
          location: {
            create: {
              name: "Gym",
              timezone: "UTC",
              rooms: { create: { name: "Mat", capacity: 10 } },
            },
          },
        },
        include: { location: { include: { rooms: true } } },
      });
      const workspaceId = workspace.id;
      workspaces.push(workspaceId);
      await createFixtureClassSchedulingPolicy(db, workspaceId);
      const member = await db.member.create({
        data: {
          workspaceId,
          fullName: "Fictional independent products",
          status: "ACTIVE",
        },
      });
      const program = await db.program.create({
        data: { workspaceId, name: "Training" },
      });
      const otherProgram = await db.program.create({
        data: { workspaceId, name: "Other training" },
      });
      const template = await db.classTemplate.create({
        data: {
          workspaceId,
          programId: program.id,
          roomId: workspace.location!.rooms[0]!.id,
          weekday: "MONDAY",
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 120,
        },
      });
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Held membership",
          monthlyPriceCents: 10000,
          weeklyClassLimit: 2,
          monthlyClassLimit: 8,
        },
      });
      const membership = await db.memberMembership.create({
        data: {
          workspaceId,
          memberId: member.id,
          membershipPlanId: plan.id,
          startedAt: new Date("2029-12-01Z"),
          allowanceTimezone: "UTC",
          allowanceAnchorDate: new Date("2030-01-01Z"),
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotMembershipTerms(plan, now)),
          ),
        },
      });
      const product = await db.punchCardProduct.create({
        data: {
          workspaceId,
          name: "Separately purchased pack",
          punchesIncluded: 3,
          priceCents: 3000,
        },
      });
      const pack = await db.memberPunchCard.create({
        data: {
          workspaceId,
          memberId: member.id,
          punchCardProductId: product.id,
          originalPunches: 3,
          remainingPunches: 3,
          purchasePriceCents: 3000,
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotPunchCardTerms(product, now)),
          ),
        },
      });
      const hold = async (
        targetKind = "MEMBERSHIP",
        targetId = membership.id,
      ) => {
        const operation = await db.financialOperation.create({
          data: {
            workspaceId,
            operationKey: randomUUID(),
            requestHash: "fictional-exact-asset-review",
            kind: "REFUND",
            providerIdempotencyKey: randomUUID(),
            payload: {},
          },
        });
        return db.financialEntitlementHold.create({
          data: {
            workspaceId,
            operationId: operation.id,
            targetKind,
            targetId,
          },
        });
      };
      const book = (date = "2030-01-07", allowDropIn = false) =>
        createAccessBackedBooking({
          workspaceId,
          memberId: member.id,
          classTemplateId: template.id,
          scheduledForDate: date,
          timezone: "UTC",
          source: "ADMIN",
          allowDropIn,
          now,
          db: db as never,
        });
      const access = (allowDropIn = false) =>
        resolveBookingAccessForProgram({
          workspaceId,
          memberId: member.id,
          programId: program.id,
          scheduledForDate: "2030-01-07",
          occurrenceStartsAt: new Date("2030-01-07T18:00:00Z"),
          allowDropIn,
          now,
          db: db as never,
        });
      return {
        workspaceId,
        member,
        membership,
        pack,
        product,
        program,
        otherProgram,
        template,
        hold,
        book,
        access,
      };
    }
    afterAll(async () => {
      for (const workspaceId of workspaces)
        await db.$transaction(
          async (tx) => {
            await lockClassSchedule(tx, workspaceId);
            const inventory = await inspectRetentionInventory(tx, workspaceId);
            await deleteReviewedWorkspaceRecords(
              tx,
              workspaceId,
              inventory.fingerprint,
            );
          },
          { timeout: 120000 },
        );
      await db.$disconnect();
    }, 120000);
    it("offers and consumes only a separately valid pack for a new booking while preserving the membership hold and allowance", async () => {
      const f = await fixture(),
        hold = await f.hold();
      expect(await f.access()).toMatchObject({
        type: "punch_card",
        memberPunchCardId: f.pack.id,
      });
      const result = await f.book();
      expect(result.status).toBe("created");
      const booking = await db.classBooking.findFirstOrThrow({
        where: { workspaceId: f.workspaceId },
      });
      expect(booking).toMatchObject({
        bookingType: "PUNCH_CARD",
        memberPunchCardId: f.pack.id,
        fundingMembershipId: null,
      });
      expect(
        (
          await db.financialEntitlementHold.findUniqueOrThrow({
            where: { id: hold.id },
          })
        ).activeSlot,
      ).toBe("ACTIVE");
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: f.pack.id },
          })
        ).remainingPunches,
      ).toBe(2);
      await f.book();
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: f.pack.id },
          })
        ).remainingPunches,
      ).toBe(2);
    });
    it("skips an older eligible held pack and consumes the oldest remaining valid unheld pack", async () => {
      const f = await fixture(),
        membershipHold = await f.hold();
      await db.memberPunchCard.update({
        where: { id: f.pack.id },
        data: { purchasedAt: new Date("2029-11-01T12:00:00Z") },
      });
      const olderPackHold = await f.hold("PUNCH_CARD", f.pack.id);
      const cards = [];
      for (const purchasedAt of [
        "2029-11-02T12:00:00Z",
        "2029-11-03T12:00:00Z",
      ]) {
        cards.push(
          await db.memberPunchCard.create({
            data: {
              workspaceId: f.workspaceId,
              memberId: f.member.id,
              punchCardProductId: f.product.id,
              originalPunches: 3,
              remainingPunches: 3,
              purchasePriceCents: 3000,
              purchasedAt: new Date(purchasedAt),
              acceptedTerms: JSON.parse(
                JSON.stringify(snapshotPunchCardTerms(f.product, now)),
              ),
            },
          }),
        );
      }
      const [oldestUnheld, newerUnheld] = cards;
      expect(await f.access()).toMatchObject({
        type: "punch_card",
        memberPunchCardId: oldestUnheld!.id,
      });
      expect((await f.book()).status).toBe("created");
      expect(
        await db.classBooking.findFirstOrThrow({
          where: { workspaceId: f.workspaceId },
        }),
      ).toMatchObject({
        bookingType: "PUNCH_CARD",
        memberPunchCardId: oldestUnheld!.id,
        fundingMembershipId: null,
      });
      const balances = await db.memberPunchCard.findMany({
        where: { workspaceId: f.workspaceId },
        select: { id: true, remainingPunches: true },
      });
      expect(
        Object.fromEntries(
          balances.map((card) => [card.id, card.remainingPunches]),
        ),
      ).toEqual({
        [f.pack.id]: 3,
        [oldestUnheld!.id]: 2,
        [newerUnheld!.id]: 3,
      });
      expect(
        await db.financialEntitlementHold.count({
          where: {
            workspaceId: f.workspaceId,
            id: { in: [membershipHold.id, olderPackHold.id] },
            activeSlot: "ACTIVE",
          },
        }),
      ).toBe(2);
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
    });
    it("offers a separately payable drop-in without treating it as paid access or clearing an unrelated membership hold", async () => {
      const f = await fixture(),
        membershipHold = await f.hold(),
        packHold = await f.hold("PUNCH_CARD", f.pack.id);
      const product = await db.dropInProduct.create({
        data: {
          workspaceId: f.workspaceId,
          name: "Separately payable class",
          priceCents: 2500,
          currency: "CAD",
          isEnabled: true,
        },
      });
      expect(await f.access(false)).toMatchObject({
        type: "none",
        reason: "membership_blocked",
        message: expect.stringContaining("refund"),
      });
      expect(await f.access(true)).toMatchObject({
        type: "drop_in",
        dropInProductId: product.id,
        priceCents: 2500,
        currency: "CAD",
      });
      const result = await f.book("2030-01-07", true);
      expect(result).toMatchObject({
        status: "payment_required",
        dropInProductId: product.id,
        priceCents: 2500,
        currency: "CAD",
      });
      expect(
        await db.classBooking.findFirstOrThrow({
          where: { workspaceId: f.workspaceId },
        }),
      ).toMatchObject({
        bookingType: "DROP_IN",
        status: "PENDING_PAYMENT",
        dropInProductId: product.id,
        fundingMembershipId: null,
        memberPunchCardId: null,
        dropInPaidAt: null,
      });
      expect(
        await db.financialEntitlementHold.count({
          where: {
            workspaceId: f.workspaceId,
            id: { in: [membershipHold.id, packHold.id] },
            activeSlot: "ACTIVE",
          },
        }),
      ).toBe(2);
      expect(
        await db.memberPunchCard.findUniqueOrThrow({
          where: { id: f.pack.id },
        }),
      ).toMatchObject({ remainingPunches: 3 });
      expect(
        await db.memberMembership.findUniqueOrThrow({
          where: { id: f.membership.id },
        }),
      ).toMatchObject({ status: "ACTIVE", frozenFrom: null, endedAt: null });
      expect(
        await db.membershipAllowanceAllocation.count({
          where: { workspaceId: f.workspaceId },
        }),
      ).toBe(0);
      expect(
        await db.payment.count({ where: { workspaceId: f.workspaceId } }),
      ).toBe(0);
      expect(
        await db.financialOperation.count({
          where: { workspaceId: f.workspaceId, kind: "CHECKOUT" },
        }),
      ).toBe(0);
    });
    for (const blocker of ["held", "expired", "restricted"] as const)
      it(`keeps the membership denial when the independent pack is ${blocker}`, async () => {
        const f = await fixture();
        await f.hold();
        if (blocker === "held") await f.hold("PUNCH_CARD", f.pack.id);
        if (blocker === "expired")
          await db.memberPunchCard.update({
            where: { id: f.pack.id },
            data: { expiresOn: new Date("2030-01-07Z") },
          });
        if (blocker === "restricted")
          await db.memberPunchCard.update({
            where: { id: f.pack.id },
            data: {
              acceptedTerms: JSON.parse(
                JSON.stringify(
                  snapshotPunchCardTerms(
                    {
                      ...f.product,
                      restrictionMode: "PROGRAM_RESTRICTED",
                      programRestrictions: [{ programId: f.otherProgram.id }],
                    },
                    now,
                  ),
                ),
              ),
            },
          });
        expect(await f.access()).toMatchObject({
          type: "none",
          reason: "membership_blocked",
          message: expect.stringContaining("refund"),
        });
        expect((await f.book()).status).toBe("error");
        expect(
          await db.classBooking.count({
            where: { workspaceId: f.workspaceId },
          }),
        ).toBe(0);
        expect(
          (
            await db.memberPunchCard.findUniqueOrThrow({
              where: { id: f.pack.id },
            })
          ).remainingPunches,
        ).toBe(3);
        expect(
          await db.membershipAllowanceAllocation.count({
            where: { workspaceId: f.workspaceId },
          }),
        ).toBe(0);
      });
    it("does not re-fund an existing membership reservation or move with a separate pack", async () => {
      const f = await fixture();
      expect((await f.book()).status).toBe("created");
      const original = await db.classBooking.findFirstOrThrow({
        where: { workspaceId: f.workspaceId },
      });
      expect(original.bookingType).toBe("MEMBERSHIP");
      const before = await db.membershipAllowanceAllocation.findMany({
        where: { workspaceId: f.workspaceId },
      });
      await f.hold();
      const moved = await moveAccessBackedBooking({
        workspaceId: f.workspaceId,
        memberId: f.member.id,
        bookingId: original.id,
        targetClassTemplateId: f.template.id,
        targetDate: "2030-01-14",
        timezone: "UTC",
        now,
        db: db as never,
      });
      expect(moved).toMatchObject({
        status: "error",
        message: expect.stringContaining("refund"),
      });
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: original.id } }),
      ).toEqual(original);
      expect(
        await db.membershipAllowanceAllocation.findMany({
          where: { workspaceId: f.workspaceId },
        }),
      ).toEqual(before);
      expect(
        (
          await db.memberPunchCard.findUniqueOrThrow({
            where: { id: f.pack.id },
          })
        ).remainingPunches,
      ).toBe(3);
    });
  },
);
