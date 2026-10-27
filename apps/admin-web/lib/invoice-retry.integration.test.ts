import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PrismaClient,
  reconcileMembershipInvoice,
  type InvoiceEvidence,
} from "@flowstate/db";
import {
  retryMembershipInvoice,
  InvoiceRetryDeclined,
  type InvoiceRetryGateway,
} from "@flowstate/payments";

const testUrl = process.env.TEST_DATABASE_URL;
(testUrl ? describe : describe.skip)(
  "durable invoice retries in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const gyms: string[] = [],
      users: string[] = [];
    let gym: string,
      memberId: string,
      membershipId: string,
      ownerId: string,
      userId: string,
      stateId: string;
    let now: Date, evidence: InvoiceEvidence, gateway: InvoiceRetryGateway;
    let submitted: Set<string>;
    const open = (id = "in_retry"): InvoiceEvidence => ({
      id,
      accountId: "acct_retry",
      subscriptionId: "sub_retry",
      customerId: "cus_retry",
      status: "OPEN",
      number: "INV-1",
      currency: "cad",
      subtotalCents: 12900,
      taxCents: 0,
      totalCents: 12900,
      amountPaidCents: 0,
      amountDueCents: 12900,
      issuedAt: now,
      dueAt: now,
      paidAt: null,
      voidedAt: null,
      firstFailedAt: now,
      failureCode: "card_declined",
      failureMessage: "Card declined",
      payments: [],
    });
    const paid = (id = "in_retry"): InvoiceEvidence => ({
      ...open(id),
      status: "PAID",
      amountPaidCents: 12900,
      amountDueCents: 0,
      paidAt: now,
      firstFailedAt: undefined,
      failureCode: null,
      failureMessage: null,
      payments: [
        {
          allocationId: `inpay_${id}`,
          paymentIntentId: `pi_${id}`,
          amountCents: 12900,
          paidAt: now,
        },
      ],
    });
    const retry = (actorUserId = userId) =>
      retryMembershipInvoice({
        workspaceId: gym,
        actorUserId,
        membershipBillingStateId: stateId,
        db,
        gateway,
        now,
      });
    beforeEach(async () => {
      now = new Date();
      submitted = new Set();
      const user = await db.user.create({
          data: { email: `${randomUUID()}@example.test` },
        }),
        owner = await db.user.create({
          data: { email: `${randomUUID()}@example.test` },
        });
      userId = user.id;
      ownerId = owner.id;
      users.push(userId, ownerId);
      gym = (
        await db.workspace.create({
          data: {
            name: "Invoice retry test",
            workspaceUsers: {
              create: [
                { userId, role: "CUSTOMER" },
                { userId: ownerId, role: "OWNER" },
              ],
            },
            stripeSettings: {
              create: {
                stripeAccountId: "acct_retry",
                connectionStatus: "ACTIVE",
                chargesEnabled: true,
                failedPaymentGracePeriodDays: 7,
              },
            },
          },
        })
      ).id;
      gyms.push(gym);
      memberId = (
        await db.member.create({
          data: { workspaceId: gym, userId, fullName: "Payer" },
        })
      ).id;
      const account = await db.financialAccount.create({
        data: {
          workspaceId: gym,
          memberId,
          userId,
          stripeAccountId: "acct_retry",
          stripeCustomerId: "cus_retry",
        },
      });
      const plan = await db.membershipPlan.create({
        data: { workspaceId: gym, name: "Monthly", monthlyPriceCents: 12900 },
      });
      membershipId = (
        await db.memberMembership.create({
          data: {
            workspaceId: gym,
            memberId,
            membershipPlanId: plan.id,
            payerAccountId: account.id,
            stripeSubscriptionId: "sub_retry",
            stripeCustomerId: "cus_retry",
            status: "ACTIVE",
          },
        })
      ).id;
      evidence = open();
      await reconcileMembershipInvoice({
        workspaceId: gym,
        evidence,
        eventId: randomUUID(),
        db,
        now,
      });
      stateId = (
        await db.membershipBillingState.findUniqueOrThrow({
          where: { memberMembershipId: membershipId },
        })
      ).id;
      gateway = {
        retrieve: vi.fn(async () => structuredClone(evidence)),
        pay: vi.fn(async (_account, _invoice, key) => {
          submitted.add(key);
          evidence = paid();
        }),
      };
    });
    afterAll(async () => {
      for (const workspaceId of gyms) {
        await db.$transaction(async tx => {
          await tx.$queryRawUnsafe("SELECT set_config('hitlink.reviewed_retention_workspace', $1, true)", workspaceId);
          await tx.paymentConfirmation.deleteMany({ where: { workspaceId } });
        });
        await db.financialReviewCase.deleteMany({ where: { workspaceId } });
        await db.financialOperationEvent.deleteMany({ where: { workspaceId } });
        await db.financialOperation.deleteMany({ where: { workspaceId } });
        await db.payment.deleteMany({ where: { workspaceId } });
        await db.invoice.deleteMany({ where: { workspaceId } });
        await db.memberMembership.deleteMany({ where: { workspaceId } });
        await db.financialAccount.deleteMany({ where: { workspaceId } });
        await db.workspace.delete({ where: { id: workspaceId } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    it("shares one operation and provider key across concurrent owner and payer taps", async () => {
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      gateway.pay = vi.fn(async (_account, _invoice, key) => {
        submitted.add(key);
        if (vi.mocked(gateway.pay).mock.calls.length === 2) release();
        await barrier;
        evidence = paid();
      });
      const result = await Promise.all([retry(ownerId), retry(userId)]);
      expect(result).toEqual([{ status: "retried" }, { status: "retried" }]);
      expect(submitted.size).toBe(1);
      expect(
        await db.financialOperation.count({
          where: { workspaceId: gym, kind: "RETRY_INVOICE" },
        }),
      ).toBe(1);
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(1);
      expect(
        (
          await db.financialOperation.findFirstOrThrow({
            where: { workspaceId: gym },
          })
        ).status,
      ).toBe("SUCCEEDED");
    });
    it("recovers a lost pay and retrieval response using the same invoice and operation key", async () => {
      let failRetrieve = false;
      gateway.retrieve = vi.fn(async () => {
        if (failRetrieve) throw new Error("Network response lost");
        return structuredClone(evidence);
      });
      gateway.pay = vi.fn(async (_account, _invoice, key) => {
        submitted.add(key);
        failRetrieve = true;
        throw new Error("Pay response lost");
      });
      expect((await retry()).status).toBe("error");
      expect(
        (
          await db.financialOperation.findFirstOrThrow({
            where: { workspaceId: gym },
          })
        ).status,
      ).toBe("SUBMITTED");
      failRetrieve = false;
      gateway.pay = vi.fn(async (_account, _invoice, key) => {
        submitted.add(key);
        evidence = paid();
      });
      expect(await retry(ownerId)).toEqual({ status: "retried" });
      expect(submitted.size).toBe(1);
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(1);
    });
    it("does not revive a frozen membership or clear another invoice when one retry settles", async () => {
      await db.memberMembership.update({
        where: { id: membershipId },
        data: {
          status: "FROZEN",
          frozenFrom: now,
          frozenUntil: new Date(now.getTime() + 30 * 86400000),
        },
      });
      await reconcileMembershipInvoice({
        workspaceId: gym,
        evidence: open("in_other"),
        eventId: randomUUID(),
        db,
        now,
      });
      await db.membershipBillingState.update({
        where: { id: stateId },
        data: { latestInvoiceId: "in_retry" },
      });
      expect(await retry()).toEqual({ status: "retried" });
      expect(
        (
          await db.memberMembership.findUniqueOrThrow({
            where: { id: membershipId },
          })
        ).status,
      ).toBe("FROZEN");
      expect(
        (
          await db.membershipBillingState.findUniqueOrThrow({
            where: { id: stateId },
          })
        ).status,
      ).toBe("FROZEN");
      expect(
        (
          await db.invoice.findUniqueOrThrow({
            where: {
              workspaceId_stripeInvoiceId: {
                workspaceId: gym,
                stripeInvoiceId: "in_other",
              },
            },
          })
        ).amountDueCents,
      ).toBe(12900);
      expect(
        await db.membershipAllowanceEntry.count({
          where: { workspaceId: gym },
        }),
      ).toBe(0);
    });
    it("quarantines conflicting post-payment evidence rather than claiming success", async () => {
      gateway.pay = vi.fn(async () => {
        evidence = { ...paid(), customerId: "cus_wrong" };
      });
      expect(await retry()).toMatchObject({
        status: "error",
        message: expect.stringMatching(/review/),
      });
      expect(
        (
          await db.financialOperation.findFirstOrThrow({
            where: { workspaceId: gym },
          })
        ).status,
      ).toBe("REVIEW_REQUIRED");
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(0);
      evidence = open();
      expect((await retry()).status).toBe("error");
      expect(gateway.pay).toHaveBeenCalledOnce();
    });
    it("starts a new attempt only after a confirmed decline and preserves unknown outcomes", async () => {
      gateway.pay = vi.fn(async (_account, _invoice, key) => {
        submitted.add(key);
        throw new InvoiceRetryDeclined("Declined");
      });
      expect((await retry()).status).toBe("error");
      expect(
        (
          await db.financialOperation.findFirstOrThrow({
            where: { workspaceId: gym },
          })
        ).status,
      ).toBe("FAILED");
      gateway.pay = vi.fn(async (_account, _invoice, key) => {
        submitted.add(key);
        evidence = paid();
      });
      expect(await retry()).toEqual({ status: "retried" });
      expect(submitted.size).toBe(2);
    });
    it("rejects a replacement Connect account before asking the processor to retry", async () => {
      await db.workspaceStripeSettings.update({
        where: { workspaceId: gym },
        data: { stripeAccountId: "acct_replacement" },
      });
      expect(await retry()).toMatchObject({
        status: "error",
        message: expect.stringMatching(/earlier payment account/),
      });
      expect(gateway.retrieve).not.toHaveBeenCalled();
      expect(gateway.pay).not.toHaveBeenCalled();
    });
  },
);
