import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PrismaClient,
  reconcileMembershipInvoice,
  shouldDeliverNotification,
  type InvoiceEvidence,
} from "@flowstate/db";
const testUrl = process.env.TEST_DATABASE_URL;
(testUrl ? describe : describe.skip)(
  "invoice debt and payment reconciliation",
  () => {
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const gyms: string[] = [], users: string[] = [];
    let gym: string, memberId: string, membershipId: string;
    const now = new Date("2030-01-10T12:00:00Z");
    beforeEach(async () => {
      gym = (
        await db.workspace.create({
          data: {
            name: `invoice-${randomUUID()}`,
            stripeSettings: {
              create: {
                stripeAccountId: "acct_invoices",
                failedPaymentGracePeriodDays: 7,
              },
            },
          },
        })
      ).id;
      gyms.push(gym);
      memberId = (
        await db.member.create({
          data: {
            workspaceId: gym,
            fullName: "Member",
            email: "invoice@example.test",
          },
        })
      ).id;
      const payerUser = await db.user.create({ data: { email: `invoice-payer-${randomUUID()}@example.test` } });
      users.push(payerUser.id);
      await db.member.update({ where: { id: memberId }, data: { userId: payerUser.id } });
      await db.workspaceUser.create({ data: { workspaceId: gym, userId: payerUser.id, role: "CUSTOMER" } });
      const payerAccount = await db.financialAccount.create({ data: { workspaceId: gym, userId: payerUser.id, memberId, stripeAccountId: "acct_invoices", stripeCustomerId: "cus_test" } });
      const plan = await db.membershipPlan.create({
        data: { workspaceId: gym, name: "Monthly", monthlyPriceCents: 12900 },
      });
      membershipId = (
        await db.memberMembership.create({
          data: {
            workspaceId: gym,
            memberId,
            payerAccountId: payerAccount.id,
            membershipPlanId: plan.id,
            stripeSubscriptionId: "sub_test",
            stripeCustomerId: "cus_test",
            status: "ACTIVE",
          },
        })
      ).id;
    });
    afterAll(async () => {
      for (const workspaceId of gyms) {
        await db.$transaction(async tx => {
          await tx.$queryRawUnsafe("SELECT set_config('hitlink.reviewed_retention_workspace', $1, true)", workspaceId);
          await tx.paymentConfirmation.deleteMany({ where: { workspaceId } });
          await tx.financialReviewCase.deleteMany({ where: { workspaceId } });
          await tx.payment.deleteMany({ where: { workspaceId } });
          await tx.invoice.deleteMany({ where: { workspaceId } });
          await tx.memberMembership.deleteMany({ where: { workspaceId } });
          await tx.financialAccount.deleteMany({ where: { workspaceId } });
          await tx.workspace.delete({ where: { id: workspaceId } });
        });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    function invoice(
      overrides: Partial<InvoiceEvidence> = {},
    ): InvoiceEvidence {
      return {
        id: "in_first",
        accountId: "acct_invoices",
        subscriptionId: "sub_test",
        customerId: "cus_test",
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
        ...overrides,
      };
    }
    function paid(id = "in_first"): InvoiceEvidence {
      return invoice({
        id,
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
    }
    const reconcile = (
      evidence: InvoiceEvidence,
      eventId: string = randomUUID(),
    ) =>
      reconcileMembershipInvoice({
        workspaceId: gym,
        evidence,
        eventId,
        db,
        now,
      });
    it("preserves first failure and grace on repeated delivery and sends one notice", async () => {
      await reconcile(invoice(), "evt_first");
      const first = await db.invoice.findFirstOrThrow({
        where: { workspaceId: gym },
      });
      await reconcile(
        invoice({ firstFailedAt: new Date("2030-01-15T12:00:00Z") }),
        "evt_retry",
      );
      const second = await db.invoice.findFirstOrThrow({
        where: { workspaceId: gym },
      });
      expect(second.firstFailedAt).toEqual(first.firstFailedAt);
      expect(second.gracePeriodEndsAt).toEqual(
        new Date("2030-01-17T12:00:00Z"),
      );
      expect(
        await db.notificationJob.count({ where: { workspaceId: gym } }),
      ).toBe(1);
      expect(
        await db.failedPaymentCase.count({ where: { workspaceId: gym } }),
      ).toBe(1);
      const notice = await db.notificationJob.findFirstOrThrow({ where: { workspaceId: gym, templateKind: "FAILED_PAYMENT" } });
      expect(await shouldDeliverNotification(notice, db, now)).toBe(true);
      await reconcile(paid());
      expect(await shouldDeliverNotification(notice, db, now)).toBe(false);
    });
    it("does not clear another unpaid invoice when one debt is paid", async () => {
      await reconcile(invoice());
      await reconcile(invoice({ id: "in_second" }));
      await reconcile(paid());
      const state = await db.membershipBillingState.findUniqueOrThrow({
        where: { memberMembershipId: membershipId },
      });
      expect(state.status).toBe("PAYMENT_FAILED");
      expect(state.latestInvoiceId).toBe("in_second");
      expect(
        (
          await db.memberMembership.findUniqueOrThrow({
            where: { id: membershipId },
          })
        ).status,
      ).toBe("PAST_DUE");
      await reconcile(paid("in_second"));
      expect(
        (
          await db.membershipBillingState.findUniqueOrThrow({
            where: { memberMembershipId: membershipId },
          })
        ).status,
      ).toBe("ACTIVE");
    });
    it("keeps the accepted legacy grace deadline when the first canonical fetch has no failure marker", async () => {
      const failedAt = new Date("2030-01-01T12:00:00Z"),
        gracePeriodEndsAt = new Date("2030-01-08T12:00:00Z");
      await db.membershipBillingState.create({
        data: {
          workspaceId: gym,
          memberId,
          memberMembershipId: membershipId,
          status: "PAYMENT_FAILED",
          latestInvoiceId: "in_first",
          failedAt,
          gracePeriodEndsAt,
        },
      });
      await reconcile(invoice({ firstFailedAt: undefined }));
      const state = await db.membershipBillingState.findUniqueOrThrow({
        where: { memberMembershipId: membershipId },
      });
      expect(state).toMatchObject({
        status: "PAYMENT_FAILED",
        failedAt,
        gracePeriodEndsAt,
      });
      await reconcile(paid());
      expect(
        (
          await db.membershipBillingState.findUniqueOrThrow({
            where: { memberMembershipId: membershipId },
          })
        ).lastPaymentAt,
      ).toEqual(now);
    });
    it("does not unfreeze a membership or reset allowance after settlement", async () => {
      await db.memberMembership.update({
        where: { id: membershipId },
        data: {
          status: "FROZEN",
          frozenFrom: new Date("2030-01-01"),
          frozenUntil: new Date("2030-02-01"),
        },
      });
      await reconcile(invoice());
      await reconcile(paid());
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
            where: { memberMembershipId: membershipId },
          })
        ).status,
      ).toBe("FROZEN");
      expect(
        await db.membershipAllowanceEntry.count({
          where: { workspaceId: gym },
        }),
      ).toBe(0);
    });
    it("holds uncertain failed debt without inventing or restarting its grace period", async () => {
      await reconcile(
        invoice({
          firstFailedAt: undefined,
          failureCode: "payment_failure_time_unknown",
        }),
      );
      await reconcile(invoice({ id: "in_known", firstFailedAt: now }));
      let state = await db.membershipBillingState.findUniqueOrThrow({
        where: { memberMembershipId: membershipId },
      });
      expect(state).toMatchObject({
        status: "PAYMENT_FAILED",
        latestInvoiceId: "in_first",
        failedAt: null,
        gracePeriodEndsAt: null,
        failureCode: "payment_failure_time_unknown",
      });
      await reconcile(
        invoice({ firstFailedAt: new Date("2030-01-16T12:00:00Z") }),
      );
      state = await db.membershipBillingState.findUniqueOrThrow({
        where: { memberMembershipId: membershipId },
      });
      expect(state.gracePeriodEndsAt).toBeNull();
      expect(
        await db.financialReviewCase.count({
          where: {
            workspaceId: gym,
            sourceKey: { startsWith: "invoice-failure-time:" },
          },
        }),
      ).toBe(1);
      await reconcile(paid());
      expect(
        (
          await db.membershipBillingState.findUniqueOrThrow({
            where: { memberMembershipId: membershipId },
          })
        ).latestInvoiceId,
      ).toBe("in_known");
      await reconcile(
        invoice({
          id: "in_known",
          firstFailedAt: undefined,
          failureCode: "payment_failure_time_unknown",
        }),
      );
      expect(
        (
          await db.membershipBillingState.findUniqueOrThrow({
            where: { memberMembershipId: membershipId },
          })
        ).gracePeriodEndsAt,
      ).toEqual(new Date("2030-01-17T12:00:00Z"));
    });
    it("does not revive an ended contract when old debt settles", async () => {
      await db.memberMembership.update({
        where: { id: membershipId },
        data: {
          status: "CANCELLED",
          endedAt: new Date("2030-01-01"),
          currentMembershipSlot: null,
        },
      });
      await reconcile(paid());
      expect(
        (
          await db.memberMembership.findUniqueOrThrow({
            where: { id: membershipId },
          })
        ).status,
      ).toBe("CANCELLED");
      expect(
        (
          await db.membershipBillingState.findUniqueOrThrow({
            where: { memberMembershipId: membershipId },
          })
        ).status,
      ).toBe("CANCELLED");
    });
    it("writes cash once under concurrency and refuses a later unpaid regression", async () => {
      await Promise.all([
        reconcile(paid(), "evt_paid"),
        reconcile(paid(), "evt_paid"),
      ]);
      expect(await db.invoice.count({ where: { workspaceId: gym } })).toBe(1);
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(1);
      expect(await db.paymentConfirmation.count({ where: { workspaceId: gym } })).toBe(1);
      expect(await db.notificationJob.count({ where: { workspaceId: gym, context: { path: ["kind"], equals: "PAYMENT_CONFIRMATION" } } })).toBe(1);
      expect(
        await db.billingRecord.count({ where: { workspaceId: gym } }),
      ).toBe(1);
      expect((await reconcile(invoice())).status).toBe("review");
      expect(
        (await db.invoice.findFirstOrThrow({ where: { workspaceId: gym } }))
          .status,
      ).toBe("PAID");
      expect(
        await db.financialReviewCase.count({ where: { workspaceId: gym } }),
      ).toBe(1);
    });
    it("rejects account/customer mismatches and records unexplained cash allocations", async () => {
      await expect(
        reconcile(invoice({ accountId: "acct_foreign" })),
      ).rejects.toThrow(/account/);
      await expect(
        reconcile(invoice({ customerId: "cus_foreign" })),
      ).rejects.toThrow(/payer/);
      expect(await db.invoice.count({ where: { workspaceId: gym } })).toBe(0);
      await reconcile(paid());
      await expect(
        reconcile({
          ...paid(),
          payments: [
            {
              allocationId: "inpay_in_first",
              paymentIntentId: "pi_in_first",
              amountCents: 1,
              paidAt: now,
            },
          ],
        }),
      ).rejects.toThrow(/allocation changed/);
      expect(
        (await db.payment.findFirstOrThrow({ where: { workspaceId: gym } }))
          .amountCents,
      ).toBe(12900);
    });
    it("confirms only verified cash allocations when the rest of an invoice was covered by credit", async () => {
      const evidence = paid();
      evidence.payments[0]!.amountCents = 5000;
      await reconcile(evidence);
      expect(await db.paymentConfirmation.findFirstOrThrow({ where: { workspaceId: gym } })).toMatchObject({ amountMinor: 5000, currency: "cad" });
      expect(await db.financialReviewCase.count({ where: { workspaceId: gym } })).toBe(1);
      const creditOnly = paid("in_credit_only"); creditOnly.payments = [];
      await reconcile(creditOnly);
      expect(await db.paymentConfirmation.count({ where: { workspaceId: gym } })).toBe(1);
    });
  },
);
