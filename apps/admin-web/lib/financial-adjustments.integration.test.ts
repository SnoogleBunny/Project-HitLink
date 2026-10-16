import { randomUUID } from "node:crypto";
import { reconcileAdjustmentWebhook } from "@flowstate/payments";
import { getPayerBillingData } from "../../member-web/lib/payer-billing";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PrismaClient,
  previewOwnerRefund,
  previewConfirmedRefundAccess,
  resolveConfirmedRefundAccess,
  reserveOwnerRefund,
  saveOwnerRefundEvidence,
  resumeOwnerAdjustment,
  previewOwnerCredit,
  issueOwnerCredit,
  previewOwnerCreditApplication,
  reserveOwnerCreditApplication,
  saveOwnerCreditEvidence,
  type AdjustmentGateway,
  type RefundEvidence,
  type CreditEvidence,
} from "@flowstate/db";

const testUrl = process.env.TEST_DATABASE_URL;
(testUrl ? describe : describe.skip)(
  "owner financial adjustments in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const gyms: string[] = [],
      users: string[] = [];
    let gym: string,
      owner: string,
      customer: string,
      member: string,
      account: string,
      payment: string,
      card: string,
      booking: string;
    let gateway: AdjustmentGateway;
    let refunds: Map<string, RefundEvidence>,
      credits: Map<string, CreditEvidence>;
    beforeEach(async () => {
      refunds = new Map();
      credits = new Map();
      owner = (
        await db.user.create({
          data: { email: `${randomUUID()}@example.test` },
        })
      ).id;
      customer = (
        await db.user.create({
          data: { email: `${randomUUID()}@example.test` },
        })
      ).id;
      users.push(owner, customer);
      gym = (
        await db.workspace.create({
          data: {
            name: "Adjustment test",
            workspaceUsers: {
              create: [
                { userId: owner, role: "OWNER" },
                { userId: customer, role: "CUSTOMER" },
              ],
            },
          },
        })
      ).id;
      gyms.push(gym);
      member = (
        await db.member.create({
          data: {
            workspaceId: gym,
            userId: customer,
            fullName: "Account payer",
          },
        })
      ).id;
      account = (
        await db.financialAccount.create({
          data: {
            workspaceId: gym,
            userId: customer,
            memberId: member,
            stripeAccountId: "acct_test",
            stripeCustomerId: "cus_test",
          },
        })
      ).id;
      payment = (
        await db.payment.create({
          data: {
            workspaceId: gym,
            memberId: member,
            payerAccountId: account,
            status: "SUCCEEDED",
            amountCents: 10000,
            currency: "cad",
            stripePaymentIntentId: `pi_${randomUUID()}`,
          },
        })
      ).id;
      const checkout = await db.financialOperation.create({
        data: {
          workspaceId: gym,
          operationKey: "original-checkout",
          requestHash: "original",
          kind: "CHECKOUT",
          status: "SUCCEEDED",
          payerAccountId: account,
          paymentId: payment,
          providerAccountId: "acct_test",
          providerReference: `cs_${randomUUID()}`,
          providerIdempotencyKey: randomUUID(),
          payload: {},
        },
      });
      const product = await db.punchCardProduct.create({
        data: {
          workspaceId: gym,
          name: "Five classes",
          punchesIncluded: 5,
          priceCents: 10000,
          currency: "cad",
        },
      });
      card = (
        await db.memberPunchCard.create({
          data: {
            workspaceId: gym,
            memberId: member,
            punchCardProductId: product.id,
            originalPunches: 5,
            remainingPunches: 4,
            purchasePriceCents: 10000,
            purchaseCurrency: "cad",
            stripeCheckoutSessionId: checkout.providerReference,
          },
        })
      ).id;
      const location = await db.location.create({
        data: { workspaceId: gym, name: "Gym", timezone: "UTC" },
      });
      const room = await db.room.create({
        data: { locationId: location.id, name: "Mat", capacity: 10 },
      });
      const program = await db.program.create({
        data: { workspaceId: gym, name: "Muay Thai" },
      });
      const template = await db.classTemplate.create({
        data: {
          workspaceId: gym,
          roomId: room.id,
          programId: program.id,
          weekday: "MONDAY",
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 120,
        },
      });
      booking = (
        await db.classBooking.create({
          data: {
            workspaceId: gym,
            memberId: member,
            classTemplateId: template.id,
            scheduledForDate: new Date("2099-01-05T00:00:00Z"),
            bookingType: "PUNCH_CARD",
            memberPunchCardId: card,
            consumedPunchCount: 1,
            status: "BOOKED",
          },
        })
      ).id;
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId: gym,
          name: "Monthly",
          monthlyPriceCents: 10000,
          currency: "cad",
        },
      });
      await db.memberMembership.create({
        data: {
          workspaceId: gym,
          memberId: member,
          membershipPlanId: plan.id,
          payerAccountId: account,
          stripeCustomerId: "cus_test",
        },
      });
      gateway = {
        createRefund: vi.fn(async (request, key) => {
          if (!refunds.has(key))
            refunds.set(key, {
              id: `re_${randomUUID()}`,
              amountCents: request.amountCents,
              currency: "cad",
              paymentIntentId: request.paymentIntentId,
              operationId: request.operationId,
              status: "succeeded",
            });
          return { id: refunds.get(key)!.id };
        }),
        retrieveRefund: vi.fn(async (_account, id) => {
          const item = [...refunds.values()].find((item) => item.id === id);
          if (!item) throw new Error("Unknown refund");
          return item;
        }),
        createCredit: vi.fn(async (request, key) => {
          if (!credits.has(key))
            credits.set(key, {
              id: `cbtxn_${randomUUID()}`,
              amountCents: request.amountCents,
              currency: request.currency,
              customerId: request.customerId,
              operationId: request.operationId,
            });
          return { id: credits.get(key)!.id };
        }),
        retrieveCredit: vi.fn(async (_account, _customer, id) => {
          const item = [...credits.values()].find((item) => item.id === id);
          if (!item) throw new Error("Unknown transfer");
          return item;
        }),
      };
    });
    afterAll(async () => {
      for (const workspaceId of gyms) {
        await db.financialEntitlementHold.deleteMany({
          where: { workspaceId },
        });
        await db.financialOperationEvent.deleteMany({ where: { workspaceId } });
        await db.financialReviewCase.deleteMany({ where: { workspaceId } });
        await db.financialOperation.deleteMany({ where: { workspaceId } });
        await db.refund.deleteMany({ where: { workspaceId } });
        await db.payment.deleteMany({ where: { workspaceId } });
        await db.accountCredit.deleteMany({ where: { workspaceId } });
        await db.punchCardEntry.deleteMany({ where: { workspaceId } });
        await db.classBooking.deleteMany({ where: { workspaceId } });
        await db.memberPunchCard.deleteMany({ where: { workspaceId } });
        await db.memberMembership.deleteMany({ where: { workspaceId } });
        await db.financialAccount.deleteMany({ where: { workspaceId } });
        await db.classTemplate.deleteMany({ where: { workspaceId } });
        await db.workspace.delete({ where: { id: workspaceId } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    const args = () => ({ workspaceId: gym, actorUserId: owner, db });
    async function command(
      disposition:
        | "RETAIN_ACCESS"
        | "REVOKE_UNUSED_ACCESS" = "REVOKE_UNUSED_ACCESS",
      amountCents = 6000,
    ) {
      const review = await previewOwnerRefund({
        ...args(),
        paymentId: payment,
      });
      return {
        ...args(),
        paymentId: payment,
        amountCents,
        disposition,
        reason: "Agreed service refund",
        requestId: randomUUID(),
        reviewHash: review.reviewHash,
      };
    }
    async function issueCredit(amountCents = 5000, currency = "cad") {
      const request = {
        ...args(),
        payerAccountId: account,
        amountCents,
        currency,
        reason: "Service adjustment",
      };
      const review = await previewOwnerCredit(request);
      return issueOwnerCredit({
        ...request,
        requestId: randomUUID(),
        reviewHash: review.reviewHash,
      });
    }
    it("reserves once on duplicate submission and rejects concurrent stale reviews without overrefund", async () => {
      const request = await command();
      const [first, duplicate] = await Promise.all([
        reserveOwnerRefund(request),
        reserveOwnerRefund(request),
      ]);
      expect(first.id).toBe(duplicate.id);
      await expect(
        reserveOwnerRefund({ ...request, requestId: randomUUID() }),
      ).rejects.toThrow(/changed/);
      const fresh = await command("RETAIN_ACCESS", 5000);
      await expect(reserveOwnerRefund(fresh)).rejects.toThrow(/exceeds/);
      expect(await db.refund.count({ where: { workspaceId: gym } })).toBe(1);
    });
    it("recovers an unknown provider response with one immutable request and retires only unused access", async () => {
      const operation = await reserveOwnerRefund(await command());
      const original = gateway.createRefund;
      gateway.createRefund = vi.fn(async (request, key) => {
        await original(request, key);
        throw new Error("Disconnected after acceptance");
      });
      expect(
        (
          await resumeOwnerAdjustment({
            ...args(),
            operationId: operation.id,
            gateway,
          })
        ).status,
      ).toBe("REVIEW_REQUIRED");
      expect(
        await db.financialEntitlementHold.count({
          where: { operationId: operation.id, activeSlot: "ACTIVE" },
        }),
      ).toBe(2);
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("BOOKED");
      gateway.createRefund = original;
      expect(
        (
          await resumeOwnerAdjustment({
            ...args(),
            operationId: operation.id,
            gateway,
          })
        ).status,
      ).toBe("SUCCEEDED");
      await resumeOwnerAdjustment({
        ...args(),
        operationId: operation.id,
        gateway,
      });
      expect(refunds.size).toBe(1);
      expect(
        (await db.payment.findUniqueOrThrow({ where: { id: payment } }))
          .refundedAmountCents,
      ).toBe(6000);
      expect(
        (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card } }))
          .remainingPunches,
      ).toBe(0);
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("CANCELLED");
      expect(
        await db.punchCardEntry.aggregate({
          where: { memberPunchCardId: card },
          _sum: { delta: true },
        }),
      ).toMatchObject({ _sum: { delta: 0 } });
      expect(
        await db.financialEntitlementHold.count({
          where: { operationId: operation.id, activeSlot: "ACTIVE" },
        }),
      ).toBe(0);
    });
    it("keeps access when explicitly retained and releases holds on canonical refund failure", async () => {
      const operation = await reserveOwnerRefund(
        await command("RETAIN_ACCESS", 2000),
      );
      expect(
        (
          await resumeOwnerAdjustment({
            ...args(),
            operationId: operation.id,
            gateway,
          })
        ).status,
      ).toBe("SUCCEEDED");
      expect(
        (await db.memberPunchCard.findUniqueOrThrow({ where: { id: card } }))
          .remainingPunches,
      ).toBe(4);
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("BOOKED");
      const second = await reserveOwnerRefund(await command());
      const pi = (
        await db.payment.findUniqueOrThrow({ where: { id: payment } })
      ).stripePaymentIntentId;
      await saveOwnerRefundEvidence({
        operationId: second.id,
        accountId: "acct_test",
        evidence: {
          id: "re_failed",
          operationId: second.id,
          paymentIntentId: pi,
          amountCents: 6000,
          currency: "cad",
          status: "failed",
        },
        db,
      });
      expect(
        (
          await db.financialOperation.findUniqueOrThrow({
            where: { id: second.id },
          })
        ).status,
      ).toBe("FAILED");
      expect(
        await db.financialEntitlementHold.count({
          where: { operationId: second.id, activeSlot: "ACTIVE" },
        }),
      ).toBe(0);
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("BOOKED");
    });
    it("rejects unauthorized owners and mismatched processor evidence", async () => {
      await expect(
        previewOwnerRefund({
          ...args(),
          actorUserId: customer,
          paymentId: payment,
        }),
      ).rejects.toThrow(/owner/);
      const operation = await reserveOwnerRefund(await command());
      const pi = (
        await db.payment.findUniqueOrThrow({ where: { id: payment } })
      ).stripePaymentIntentId;
      const evidence: RefundEvidence = {
        id: "re_bad",
        operationId: operation.id,
        paymentIntentId: pi,
        amountCents: 6000,
        currency: "cad",
        status: "succeeded",
      };
      await expect(
        saveOwnerRefundEvidence({
          operationId: operation.id,
          accountId: "acct_wrong",
          evidence,
          db,
        }),
      ).rejects.toThrow(/match/);
      await expect(
        saveOwnerRefundEvidence({
          operationId: operation.id,
          accountId: "acct_test",
          evidence: { ...evidence, amountCents: 1 },
          db,
        }),
      ).rejects.toThrow(/match/);
      expect(
        (await db.payment.findUniqueOrThrow({ where: { id: payment } }))
          .refundedAmountCents,
      ).toBe(0);
    });
    it("preserves confirmed money if delivery changed and blocks expired unknown retries", async () => {
      const operation = await reserveOwnerRefund(await command());
      await db.classBooking.update({
        where: { id: booking },
        data: { status: "ATTENDED" },
      });
      expect(
        (
          await resumeOwnerAdjustment({
            ...args(),
            operationId: operation.id,
            gateway,
          })
        ).status,
      ).toBe("REVIEW_REQUIRED");
      expect(
        (await db.payment.findUniqueOrThrow({ where: { id: payment } }))
          .refundedAmountCents,
      ).toBe(6000);
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("ATTENDED");
      const second = await reserveOwnerRefund(
        await command("RETAIN_ACCESS", 1000),
      );
      await db.financialOperation.update({
        where: { id: second.id },
        data: { createdAt: new Date(Date.now() - 24 * 60 * 60_000) },
      });
      const calls = vi.mocked(gateway.createRefund).mock.calls.length;
      expect(
        (
          await resumeOwnerAdjustment({
            ...args(),
            operationId: second.id,
            gateway,
          })
        ).status,
      ).toBe("REVIEW_REQUIRED");
      expect(vi.mocked(gateway.createRefund).mock.calls.length).toBe(calls);
      const access = await previewConfirmedRefundAccess({ ...args(), operationId: operation.id });
      const resolution = { ...args(), operationId: operation.id, disposition: "RETAIN_ACCESS" as const, reason: "Keep remaining visits after attended class review", requestId: randomUUID(), reviewHash: access.reviewHash };
      expect((await resolveConfirmedRefundAccess(resolution)).status).toBe("SUCCEEDED");
      expect((await resolveConfirmedRefundAccess(resolution)).id).toBe(operation.id);
      expect(vi.mocked(gateway.createRefund).mock.calls.length).toBe(calls);
      expect((await db.payment.findUniqueOrThrow({ where: { id: payment } })).refundedAmountCents).toBe(6000);
      expect((await db.classBooking.findUniqueOrThrow({ where: { id: booking } })).status).toBe("ATTENDED");
      expect(await db.financialEntitlementHold.count({ where: { operationId: operation.id, activeSlot: "ACTIVE" } })).toBe(0);
    });
    it("issues non-expiring same-payer credit and applies it once without creating cash or marking invoices paid", async () => {
      const issued = await issueCredit();
      const creditId = issued.targetId!;
      expect(
        await db.accountCredit.findUniqueOrThrow({ where: { id: creditId } }),
      ).toMatchObject({
        payerAccountId: account,
        remainingAmountCents: 5000,
        currency: "cad",
        expiresAt: null,
      });
      const review = await previewOwnerCreditApplication({
        ...args(),
        creditId,
      });
      const request = {
        ...args(),
        creditId,
        amountCents: 4000,
        reviewHash: review.reviewHash,
        requestId: randomUUID(),
      };
      const operation = await reserveOwnerCreditApplication(request);
      expect((await reserveOwnerCreditApplication(request)).id).toBe(
        operation.id,
      );
      await expect(
        reserveOwnerCreditApplication({ ...request, requestId: randomUUID() }),
      ).rejects.toThrow(/changed/);
      const fresh = await previewOwnerCreditApplication({
        ...args(),
        creditId,
      });
      expect(fresh.availableCents).toBe(1000);
      await expect(
        reserveOwnerCreditApplication({
          ...request,
          requestId: randomUUID(),
          reviewHash: fresh.reviewHash,
          amountCents: 2000,
        }),
      ).rejects.toThrow(/exceeds/);
      expect(
        (
          await resumeOwnerAdjustment({
            ...args(),
            operationId: operation.id,
            gateway,
          })
        ).status,
      ).toBe("SUCCEEDED");
      const evidence = [...credits.values()][0]!;
      await saveOwnerCreditEvidence({
        operationId: operation.id,
        accountId: "acct_test",
        evidence,
        db,
      });
      expect(
        (await db.accountCredit.findUniqueOrThrow({ where: { id: creditId } }))
          .remainingAmountCents,
      ).toBe(1000);
      expect(evidence.amountCents).toBe(-4000);
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(1);
      expect(await db.invoice.count({ where: { workspaceId: gym } })).toBe(0);
    });
    it("uses canonical refund evidence and records external refunds once", async () => {
      const operation = await reserveOwnerRefund(await command("RETAIN_ACCESS", 2000));
      const original = await db.payment.findUniqueOrThrow({ where: { id: payment } });
      const evidence: RefundEvidence = { id: `re_${randomUUID()}`, amountCents: 2000, currency: "cad", operationId: operation.id, paymentIntentId: original.stripePaymentIntentId, status: "succeeded" };
      refunds.set("canonical", evidence);
      await reconcileAdjustmentWebhook({ type: "refund.updated", account: "acct_test", data: { object: { id: evidence.id, status: "failed", metadata: { operationId: "wrong-event-metadata" } } } } as never, { db, gateway });
      expect(gateway.retrieveRefund).toHaveBeenCalledWith("acct_test", evidence.id);
      expect((await db.financialOperation.findUniqueOrThrow({ where: { id: operation.id } })).status).toBe("SUCCEEDED");
      const external = { ...evidence, id: `re_${randomUUID()}`, operationId: null, amountCents: 1000 };
      refunds.set("external", external);
      const event = { type: "refund.created", account: "acct_test", data: { object: { id: external.id } } } as never;
      await reconcileAdjustmentWebhook(event, { db, gateway }); await reconcileAdjustmentWebhook(event, { db, gateway });
      expect((await db.payment.findUniqueOrThrow({ where: { id: payment } })).refundedAmountCents).toBe(3000);
      expect(await db.refund.count({ where: { workspaceId: gym } })).toBe(2);
      expect(await db.financialReviewCase.count({ where: { workspaceId: gym, sourceKey: `external-refund:${external.id}` } })).toBe(1);
      expect((await db.classBooking.findUniqueOrThrow({ where: { id: booking } })).status).toBe("BOOKED");
    });
    it("payer billing scopes identity and subtracts reserved credit transfers", async () => {
      const issued = await issueCredit();
      const review = await previewOwnerCreditApplication({ ...args(), creditId: issued.targetId! });
      await reserveOwnerCreditApplication({ ...args(), creditId: issued.targetId!, amountCents: 4000, requestId: randomUUID(), reviewHash: review.reviewHash });
      const data = await getPayerBillingData({ workspaceId: gym, userId: customer, payerMemberId: member, db });
      expect(data.credits[0]).toMatchObject({ remainingAmountCents: 5000, reservedCents: 4000, availableCents: 1000 });
      expect(data.payments).toHaveLength(1); expect(data.creditHistory).toHaveLength(1);
      expect(JSON.stringify(data)).not.toContain("pi_");
      expect(await getPayerBillingData({ workspaceId: gym, userId: owner, payerMemberId: member, db })).toEqual({ operations: [], invoices: [], payments: [], credits: [], creditHistory: [] });
    });
    it("rejects cross-currency credit application and an unverified processor customer", async () => {
      const issued = await issueCredit(5000, "usd");
      const review = await previewOwnerCreditApplication({
        ...args(),
        creditId: issued.targetId!,
      });
      expect(review.canApply).toBe(false);
      await expect(
        reserveOwnerCreditApplication({
          ...args(),
          creditId: issued.targetId!,
          amountCents: 1000,
          requestId: randomUUID(),
          reviewHash: review.reviewHash,
        }),
      ).rejects.toThrow(/matching membership/);
      const cad = await issueCredit();
      await db.financialAccount.update({
        where: { id: account },
        data: { stripeCustomerId: null },
      });
      expect(
        (
          await previewOwnerCreditApplication({
            ...args(),
            creditId: cad.targetId!,
          })
        ).canApply,
      ).toBe(false);
    });
  },
);
