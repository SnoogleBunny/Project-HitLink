import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  approveWorkspaceRetentionCase,
  holdWorkspaceRetentionCase,
  issueOwnerCredit,
  lockClassSchedule,
  previewOwnerCredit,
  recordProgramPromotion,
  saveWorkspaceRetentionCase,
  type Prisma,
} from "@flowstate/db";
import {
  deleteReviewedWorkspaceRecords,
  inspectRetentionInventory,
} from "../../../packages/db/src/retention-inventory";
import {
  getSourceBillingRenewalReview,
  recordSourceBillingRenewal,
} from "./source-billing-renewals";
import {
  getSourceRefundReview,
  recordSourceRefundReceipt,
} from "./source-refund-receipts";

const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "authority committed while an owner command waits in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasourceUrl: databaseUrl });
    const workspaceIds: string[] = [],
      userIds: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z");
    let workspaceId: string,
      ownerId: string,
      secondId: string,
      custodianId: string,
      ownerRoleId: string,
      memberId: string,
      accountId: string,
      programId: string,
      membershipId: string;
    const actor = () => ({
      workspaceId,
      userId: ownerId,
      workspaceUserId: ownerRoleId,
    });

    beforeEach(async () => {
      const workspace = await db.workspace.create({
        data: {
          name: `waited-authority-${randomUUID()}`,
          status: "ACTIVE",
          location: { create: { name: "Fictional gym", timezone: "UTC" } },
        },
      });
      workspaceId = workspace.id;
      workspaceIds.push(workspaceId);
      const ids: string[] = [];
      for (const name of ["owner", "second owner", "custodian", "payer"]) {
        const user = await db.user.create({
          data: { email: `${randomUUID()}@authority.test`, fullName: name },
        });
        ids.push(user.id);
        userIds.push(user.id);
      }
      [ownerId, secondId, custodianId] = ids as [
        string,
        string,
        string,
        string,
      ];
      ownerRoleId = (
        await db.workspaceUser.create({
          data: { workspaceId, userId: ownerId, role: "OWNER" },
        })
      ).id;
      await db.workspaceUser.create({
        data: { workspaceId, userId: secondId, role: "OWNER" },
      });
      memberId = (
        await db.member.create({
          data: { workspaceId, userId: ids[3]!, fullName: "Fictional payer" },
        })
      ).id;
      accountId = (
        await db.financialAccount.create({
          data: { workspaceId, userId: ids[3]!, memberId },
        })
      ).id;
      programId = (
        await db.program.create({
          data: {
            workspaceId,
            name: "Fictional rank program",
            rankPolicy: {
              version: 1,
              mode: "PREREQUISITES",
              ranks: [{ key: "white", name: "White", maxStripes: 4 }],
            },
          },
        })
      ).id;
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId,
          name: "Fictional source membership",
          monthlyPriceCents: 10000,
        },
      });
      membershipId = (
        await db.memberMembership.create({
          data: {
            workspaceId,
            memberId,
            membershipPlanId: plan.id,
            sourceBillingManaged: true,
            status: "ACTIVE",
            currentMembershipSlot: "CURRENT",
            startedAt: new Date("2029-12-01"),
            allowanceAnchorDate: new Date("2030-01-01"),
            allowanceTimezone: "UTC",
            nextBillingDate: new Date("2030-02-01"),
          },
        })
      ).id;
      await db.sourceBillingEvidence.create({
        data: {
          workspaceId,
          memberMembershipId: membershipId,
          sourceSystem: "fictional",
          sourceAccountReference: "fictional-source-account",
          sourceContractReference: "fictional-contract",
          paidFrom: new Date("2030-01-01"),
          paidThrough: new Date("2030-02-01"),
          nextRenewalOn: new Date("2030-02-01"),
          sourceEvidence: "Original fictional paid period",
          acceptanceEvidence: "Original fictional contract",
          payerAuthorityEvidence: "Fictional payer approval",
          sourceFileHash: "a".repeat(64),
          sourceRowHash: "b".repeat(64),
          actorId: ownerRoleId,
          operationKey: randomUUID(),
        },
      });
    });
    afterAll(async () => {
      for (const id of workspaceIds) {
        await db.$transaction(
          async (tx) => {
            const inventory = await inspectRetentionInventory(tx, id);
            await deleteReviewedWorkspaceRecords(tx, id, inventory.fingerprint);
          },
          { timeout: 120000 },
        );
        await db.workspaceRetentionEvent.deleteMany({
          where: { case: { workspaceId: id } },
        });
        await db.workspaceRetentionCase.deleteMany({
          where: { workspaceId: id },
        });
      }
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.$disconnect();
    });

    /** Observe an actual server-side advisory waiter before committing changed authority. */
    async function whileWaiting<T>(
      command: () => Promise<T>,
      change: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) {
      let locked!: () => void, release!: () => void;
      const hasLock = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const canCommit = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = db.$transaction(
        async (tx) => {
          await lockClassSchedule(tx, workspaceId);
          locked();
          await canCommit;
          await change(tx);
        },
        { timeout: 20000 },
      );
      await hasLock;
      const attempt = command().then(
        (result) => ({ ok: true as const, result }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      try {
        await expect
          .poll(
            async () => {
              const rows = await db.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM pg_locks
              WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
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
      await blocker;
      return attempt;
    }
    function expectDenied(outcome: Awaited<ReturnType<typeof whileWaiting>>) {
      expect(outcome.ok).toBe(false);
      if (outcome.ok)
        throw new Error("A command committed after its authority changed");
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).message).toMatch(
        /owner|permission|access|business|disabled|operational|staff/i,
      );
    }
    const disable = (tx: Prisma.TransactionClient) =>
      tx.workspace.update({
        where: { id: workspaceId },
        data: { status: "DISABLED" },
      });
    const revoke = (tx: Prisma.TransactionClient) =>
      tx.workspaceUser.update({
        where: { id: ownerRoleId },
        data: { isActive: false },
      });

    async function retentionPlan(frozen = false) {
      const exportJob = await db.workspaceDataExport.create({
        data: {
          workspaceId,
          requestedByUserId: ownerId,
          purpose: "Fictional records exit",
          state: "READY",
          sha256: "c".repeat(64),
          expiresAt: new Date("2030-02-01"),
          receiptConfirmedAt: now,
          receiptConfirmedByUserId: ownerId,
        },
      });
      const plan = await db.workspaceOffboarding.create({
        data: {
          workspaceId,
          requestedByUserId: ownerId,
          exportJobId: exportJob.id,
          accessEndsAt: now,
          retentionUntil: new Date("2030-02-01"),
          retentionReason: "Fictional retention basis",
          recordsContact: "Fictional records custodian",
          ...(frozen ? { accessRevokedAt: now } : {}),
        },
      });
      if (frozen) {
        await db.workspaceDataEvent.create({
          data: {
            workspaceId,
            actorUserId: ownerId,
            kind: "WORKSPACE_ACCESS_REVOKED",
            metadata: {
              planId: plan.id,
              version: plan.version,
              approvedOwnerUserIds: [ownerId, secondId],
            },
          },
        });
        await db.workspaceUser.updateMany({
          where: { workspaceId },
          data: { isActive: false },
        });
        await db.workspace.update({
          where: { id: workspaceId },
          data: { status: "DISABLED" },
        });
      }
      return {
        workspaceId,
        expectedVersion: 0,
        custodianUserId: custodianId,
        backupCustodianUserId: secondId,
        retentionAt: "2030-02-01",
        backupDeletionAfter: "2030-02-03",
        retentionBasis: "Fictional retention basis",
      };
    }
    it("Serializable live-plan retention must reject an owner revoked while its schedule lock waits", async () => {
      const input = await retentionPlan();
      const outcome = await whileWaiting(
        () => saveWorkspaceRetentionCase(ownerId, input, { db, now }),
        revoke,
      );
      expect(
        await db.workspaceRetentionCase.count({ where: { workspaceId } }),
      ).toBe(0);
      expect(
        await db.workspaceRetentionEvent.count({
          where: { case: { workspaceId } },
        }),
      ).toBe(0);
      expectDenied(outcome);
    }, 30000);
    it("preserves frozen owner approvals and named custodians after deliberate offboarding revocation", async () => {
      const input = await retentionPlan(true);
      const record = await saveWorkspaceRetentionCase(ownerId, input, {
        db,
        now,
      });
      await approveWorkspaceRetentionCase(ownerId, record.id, record.version, {
        db,
        now,
      });
      await approveWorkspaceRetentionCase(secondId, record.id, record.version, {
        db,
        now,
      });
      await holdWorkspaceRetentionCase(
        custodianId,
        record.id,
        record.version,
        "Fictional records hold",
        { db, now },
      );
      expect(
        await db.workspaceRetentionCase.findUnique({
          where: { id: record.id },
        }),
      ).toMatchObject({
        authorizationFrozenAt: now,
        state: "HELD",
        holdReason: "Fictional records hold",
      });
    });
    async function creditCommand() {
      const command = {
        workspaceId,
        actorUserId: ownerId,
        payerAccountId: accountId,
        amountCents: 1000,
        currency: "cad",
        reason: "Fictional account adjustment",
        db,
      };
      const review = await previewOwnerCredit(command);
      return () =>
        issueOwnerCredit({
          ...command,
          requestId: randomUUID(),
          reviewHash: review.reviewHash,
        });
    }
    it("ReadCommitted financial owner command already sees a waited role revocation", async () => {
      const command = await creditCommand();
      expectDenied(await whileWaiting(command, revoke));
      expect(await db.accountCredit.count({ where: { workspaceId } })).toBe(0);
      expect(
        await db.financialOperation.count({ where: { workspaceId } }),
      ).toBe(0);
    }, 30000);
    it("ReadCommitted financial owner command must reject a business disabled while waiting", async () => {
      const command = await creditCommand();
      const outcome = await whileWaiting(command, disable);
      expect(await db.accountCredit.count({ where: { workspaceId } })).toBe(0);
      expect(
        await db.financialOperation.count({ where: { workspaceId } }),
      ).toBe(0);
      expectDenied(outcome);
    }, 30000);
    it("ReadCommitted progress promotion must reject a business disabled while waiting", async () => {
      const outcome = await whileWaiting(
        () =>
          recordProgramPromotion(actor(), {
            memberId,
            programId,
            rankKey: "white",
            stripeCount: 0,
            effectiveOn: "2030-01-01",
            awardedByWorkspaceUserId: ownerRoleId,
            operationKey: randomUUID(),
            db,
            now,
          }),
        disable,
      );
      expect(await db.programPromotion.count({ where: { workspaceId } })).toBe(
        0,
      );
      expectDenied(outcome);
    }, 30000);
    it("ReadCommitted source renewal must reject a business disabled while waiting", async () => {
      const review = await getSourceBillingRenewalReview(
        actor(),
        membershipId,
        db,
      );
      expect(review).not.toBeNull();
      const original = await db.memberMembership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      const outcome = await whileWaiting(
        () =>
          recordSourceBillingRenewal(
            actor(),
            {
              membershipId,
              reviewToken: review!.reviewToken,
              operationKey: randomUUID(),
              paidFrom: "2030-02-01",
              paidThrough: "2030-03-01",
              nextRenewalOn: "2030-03-01",
              sourceReference: "Fictional paid renewal receipt",
              sourceAccountReference: "fictional-source-account",
              receiptData: Buffer.from(
                "%PDF-1.4\nFictional source paid renewal\n%%EOF",
              ),
            },
            db,
          ),
        disable,
      );
      expect(
        await db.sourceBillingEvidence.count({ where: { workspaceId } }),
      ).toBe(1);
      expect(
        await db.memberMembership.findUniqueOrThrow({
          where: { id: membershipId },
        }),
      ).toEqual(original);
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "SOURCE_PAID_PERIOD_RECORDED" },
        }),
      ).toBe(0);
      expectDenied(outcome);
    }, 30000);
    it("ReadCommitted source refund must reject a business disabled while waiting without changing recorded money", async () => {
      const location = await db.location.findUniqueOrThrow({
        where: { workspaceId },
      });
      const room = await db.room.create({
        data: { locationId: location.id, name: "Fictional mat", capacity: 2 },
      });
      const template = await db.classTemplate.create({
        data: {
          workspaceId,
          roomId: room.id,
          programId,
          title: "Fictional cancelled source class",
          weekday: "MONDAY",
          startTimeMinutes: 600,
          endTimeMinutes: 660,
          bookingCutoffMinutes: 60,
          cancellationCutoffMinutes: 120,
        },
      });
      const product = await db.dropInProduct.create({
        data: {
          workspaceId,
          name: "Fictional source single class",
          priceCents: 1000,
          currency: "cad",
        },
      });
      const booking = await db.classBooking.create({
        data: {
          workspaceId,
          memberId,
          classTemplateId: template.id,
          scheduledForDate: new Date("2030-01-07"),
          bookingType: "DROP_IN",
          status: "CANCELLED",
          source: "ADMIN",
          dropInProductId: product.id,
        },
      });
      const payment = await db.payment.create({
        data: {
          workspaceId,
          memberId,
          payerAccountId: accountId,
          source: "IMPORTED",
          status: "IMPORTED",
          amountCents: 1000,
          currency: "cad",
          paidAt: new Date("2025-12-01"),
        },
      });
      const job = await db.importJob.create({
        data: {
          workspaceId,
          name: "Fictional reviewed source payment",
          status: "COMPLETED",
        },
      });
      const staged = await db.stagingRecord.create({
        data: {
          workspaceId,
          importJobId: job.id,
          recordKind: "BILLING_HISTORY",
          rawData: {},
          isReadyForImport: true,
          importedAt: now,
          importedModel: "Payment",
          importedRecordId: payment.id,
        },
      });
      const evidence = await db.importedFinancialEvidence.create({
        data: {
          workspaceId,
          sourceSystem: "fictional",
          sourceAccountReference: "fictional-source-account",
          sourceRecordKind: "PAYMENT",
          sourceExternalId: randomUUID(),
          sourceStatus: "SUCCEEDED",
          billingOwner: "SOURCE",
          refundOwner: "SOURCE",
          payerMemberId: memberId,
          beneficiaryMemberId: memberId,
          payerAuthorityEvidence: "Fictional original payer",
          sourceEvidence: "Fictional paid class receipt",
          sourceFileHash: "d".repeat(64),
          sourceRowHash: "e".repeat(64),
          sourceSnapshot: {},
          amountCents: 1000,
          paidCents: 1000,
          currency: "cad",
          occurredAt: payment.paidAt!,
          importJobId: job.id,
          stagingRecordId: staged.id,
          actorId: ownerRoleId,
          paymentId: payment.id,
        },
      });
      await db.importedBookingFunding.create({
        data: {
          workspaceId,
          bookingId: booking.id,
          evidenceId: evidence.id,
          amountCents: 1000,
          currency: "cad",
          sourceAllocationReference: randomUUID(),
          sourceRowHash: "f".repeat(64),
          actorId: ownerRoleId,
        },
      });
      const reviewCase = await db.financialReviewCase.create({
        data: {
          workspaceId,
          sourceKey: `fictional-cancel:${booking.id}`,
          reason: "Fictional gym cancelled class",
          memberId,
          payerAccountId: accountId,
          bookingId: booking.id,
          paymentId: payment.id,
          amountCents: 1000,
          currency: "cad",
        },
      });
      const review = await getSourceRefundReview(actor(), reviewCase.id, db);
      expect(review).toMatchObject({ canRecord: true, remainingCents: 1000 });
      const outcome = await whileWaiting(
        () =>
          recordSourceRefundReceipt(
            actor(),
            {
              caseId: reviewCase.id,
              reviewToken: review!.reviewToken,
              sourceReference: `fictional-refund-${randomUUID()}`,
              amountCents: 1000,
              refundedAt: "2026-01-02T12:00:00Z",
              receiptData: Buffer.from(
                "%PDF-1.4\nFictional completed source refund\n%%EOF",
              ),
              reason: "Fictional original source refunded its cancelled class",
            },
            db,
          ),
        disable,
      );
      expect(await db.refund.count({ where: { workspaceId } })).toBe(0);
      expect(
        (await db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
          .refundedAmountCents,
      ).toBe(0);
      expect(
        await db.importedFinancialEvidence.count({
          where: { workspaceId, parentEvidenceId: evidence.id },
        }),
      ).toBe(0);
      expect(
        (
          await db.financialReviewCase.findUniqueOrThrow({
            where: { id: reviewCase.id },
          })
        ).resolvedAt,
      ).toBeNull();
      expect(
        await db.workspaceDataEvent.count({
          where: { workspaceId, kind: "SOURCE_REFUND_RECEIPT" },
        }),
      ).toBe(0);
      expectDenied(outcome);
    }, 30000);
  },
);
