import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PrismaClient,
  resumeCheckoutOperation,
  saveCheckoutEvidence,
  startDurableCheckout,
  type CheckoutEvidence,
  type CheckoutGateway,
  type CheckoutRequest,
} from "@flowstate/db";

const testUrl = process.env.TEST_DATABASE_URL;
(testUrl ? describe : describe.skip)(
  "durable checkout and payer ownership in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const gyms: string[] = [],
      users: string[] = [];
    let gym: string,
      user: string,
      payer: string,
      child: string,
      product: string,
      booking: string;
    let gateway: CheckoutGateway;
    let now: Date;
    let sessions: Map<string, CheckoutEvidence>;
    let requests: Map<string, CheckoutRequest>;
    beforeEach(async () => {
      now = new Date();
      sessions = new Map();
      requests = new Map();
      user = (
        await db.user.create({
          data: { email: `${randomUUID()}@example.test` },
        })
      ).id;
      users.push(user);
      gym = (
        await db.workspace.create({
          data: {
            name: "Checkout test",
            workspaceUsers: { create: { userId: user, role: "CUSTOMER" } },
            stripeSettings: {
              create: {
                stripeAccountId: "acct_test",
                connectionStatus: "ACTIVE",
                chargesEnabled: true,
              },
            },
          },
        })
      ).id;
      gyms.push(gym);
      payer = (
        await db.member.create({
          data: { workspaceId: gym, userId: user, fullName: "Parent" },
        })
      ).id;
      child = (
        await db.member.create({
          data: { workspaceId: gym, fullName: "Child" },
        })
      ).id;
      const owner = await db.workspaceUser.create({
        data: {
          workspaceId: gym,
          userId: (
            await db.user.create({
              data: { email: `${randomUUID()}@example.test` },
            })
          ).id,
          role: "OWNER",
        },
      });
      users.push(owner.userId);
      const guardian = await db.guardian.create({
        data: {
          workspaceId: gym,
          fullName: "Parent",
          familyLinks: {
            create: {
              workspaceId: gym,
              childMemberId: child,
              relationshipLabel: "Parent",
            },
          },
        },
      });
      await db.memberPortalGrant.create({
        data: {
          workspaceId: gym,
          userId: user,
          memberId: child,
          guardianId: guardian.id,
          verifiedByWorkspaceUserId: owner.id,
          verificationNote: "Identity checked",
          canPay: true,
        },
      });
      product = (
        await db.punchCardProduct.create({
          data: {
            workspaceId: gym,
            name: "Five classes",
            punchesIncluded: 5,
            priceCents: 12500,
            currency: "cad",
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
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() + 7);
      date.setUTCHours(0, 0, 0, 0);
      const weekday = [
        "SUNDAY",
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
      ][date.getUTCDay()] as "MONDAY";
      const template = await db.classTemplate.create({
        data: {
          workspaceId: gym,
          roomId: room.id,
          programId: program.id,
          weekday,
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 120,
        },
      });
      const dropIn = await db.dropInProduct.create({
        data: {
          workspaceId: gym,
          name: "One class",
          priceCents: 3500,
          currency: "cad",
        },
      });
      booking = (
        await db.classBooking.create({
          data: {
            workspaceId: gym,
            memberId: child,
            classTemplateId: template.id,
            bookingType: "DROP_IN",
            status: "PENDING_PAYMENT",
            scheduledForDate: date,
            dropInProductId: dropIn.id,
            dropInPriceCents: 3500,
            dropInCurrency: "cad",
            pendingPaymentExpiresAt: new Date(now.getTime() + 30 * 60_000),
          },
        })
      ).id;
      gateway = {
        create: vi.fn(async (request, key) => {
          if (!sessions.has(key)) {
            sessions.set(key, {
              id: `cs_${randomUUID()}`,
              state: "open",
              paid: false,
              url: "https://checkout.stripe.com/test",
              amountCents: request.amountCents,
              currency: request.currency,
              paymentIntentId: null,
              customerId: "cus_parent",
              operationId: request.operationId,
              payerAccountId: request.payerAccountId,
              expiresAt: new Date(request.expiresAt * 1000),
            });
            requests.set(key, request);
          }
          return sessions.get(key)!;
        }),
        retrieve: vi.fn(async (_account, id) => {
          const result = [...sessions.values()].find((item) => item.id === id);
          if (!result) throw new Error("Unknown checkout");
          return result;
        }),
        expire: vi.fn(async (_account, id) => {
          const result = [...sessions.values()].find((item) => item.id === id)!;
          result.state = "expired";
          result.url = null;
        }),
      };
    });
    afterAll(async () => {
      for (const workspaceId of gyms) {
        await db.financialOperationEvent.deleteMany({ where: { workspaceId } });
        await db.financialReviewCase.deleteMany({ where: { workspaceId } });
        await db.financialOperation.deleteMany({ where: { workspaceId } });
        await db.payment.deleteMany({ where: { workspaceId } });
        await db.punchCardEntry.deleteMany({ where: { workspaceId } });
        await db.classBooking.deleteMany({ where: { workspaceId } });
        await db.memberPunchCard.deleteMany({ where: { workspaceId } });
        await db.financialAccount.deleteMany({ where: { workspaceId } });
        await db.classTemplate.deleteMany({ where: { workspaceId } });
        await db.workspace.delete({ where: { id: workspaceId } });
      }
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    const args = () => ({
      workspaceId: gym,
      actorUserId: user,
      payerMemberId: payer,
      memberId: child,
      successUrl: "https://member.example/app/checkout/complete",
      cancelUrl: "https://member.example/app/membership",
      requestId: "reviewed-purchase",
      punchCardProductId: product,
      db,
      gateway,
      now,
    });
    async function paidEvidence() {
      const operation = await db.financialOperation.findFirstOrThrow({
        where: { workspaceId: gym },
      });
      const evidence = sessions.get(operation.providerIdempotencyKey)!;
      Object.assign(evidence, {
        state: "complete",
        paid: true,
        paymentIntentId: `pi_${operation.id}`,
        url: null,
      });
      return { operation, evidence };
    }
    it("reuses the same request under concurrent taps and issues one pack on replay", async () => {
      expect(
        (
          await Promise.all([
            startDurableCheckout(args()),
            startDurableCheckout(args()),
          ])
        ).every((item) => item.status === "ok"),
      ).toBe(true);
      expect(sessions.size).toBe(1);
      expect(
        await db.financialOperation.count({ where: { workspaceId: gym } }),
      ).toBe(1);
      const { operation, evidence } = await paidEvidence();
      await Promise.all([
        saveCheckoutEvidence({
          operationId: operation.id,
          accountId: "acct_test",
          evidence,
          db,
          now,
        }),
        saveCheckoutEvidence({
          operationId: operation.id,
          accountId: "acct_test",
          evidence,
          db,
          now,
        }),
      ]);
      expect(
        await db.memberPunchCard.count({ where: { workspaceId: gym } }),
      ).toBe(1);
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(1);
      const payment = await db.payment.findFirstOrThrow({
        where: { workspaceId: gym },
        include: { payerAccount: true },
      });
      expect(payment.memberId).toBe(child);
      expect(payment.payerAccount?.memberId).toBe(payer);
    });
    it("recovers an unknown response without changing the request or cancelling a held place", async () => {
      const original = gateway.create;
      gateway.create = vi.fn(async (request, key) => {
        await original(request, key);
        throw new Error("Connection lost after provider accepted");
      });
      const purchase = {
        ...args(),
        punchCardProductId: undefined,
        bookingId: booking,
      };
      expect((await startDurableCheckout(purchase)).status).toBe("error");
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("PENDING_PAYMENT");
      gateway.create = original;
      expect((await startDurableCheckout(purchase)).status).toBe("ok");
      expect(sessions.size).toBe(1);
      const { operation, evidence } = await paidEvidence();
      await saveCheckoutEvidence({
        operationId: operation.id,
        accountId: "acct_test",
        evidence,
        db,
        now,
      });
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("BOOKED");
    });
    it("does not activate on checkout completion without settled payment", async () => {
      await startDurableCheckout(args());
      const operation = await db.financialOperation.findFirstOrThrow({
        where: { workspaceId: gym },
      });
      const evidence = sessions.get(operation.providerIdempotencyKey)!;
      evidence.state = "complete";
      await saveCheckoutEvidence({
        operationId: operation.id,
        accountId: "acct_test",
        evidence,
        db,
        now,
      });
      expect(
        await db.memberPunchCard.count({ where: { workspaceId: gym } }),
      ).toBe(0);
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(0);
    });
    it("records late settlement for review without resurrecting a cancelled booking", async () => {
      await startDurableCheckout({
        ...args(),
        punchCardProductId: undefined,
        bookingId: booking,
      });
      await db.classBooking.update({
        where: { id: booking },
        data: { status: "CANCELLED" },
      });
      const { operation, evidence } = await paidEvidence();
      await saveCheckoutEvidence({
        operationId: operation.id,
        accountId: "acct_test",
        evidence,
        db,
        now,
      });
      await saveCheckoutEvidence({
        operationId: operation.id,
        accountId: "acct_test",
        evidence,
        db,
        now,
      });
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("CANCELLED");
      expect(
        await db.financialReviewCase.count({ where: { workspaceId: gym } }),
      ).toBe(1);
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(1);
    });
    it("expires the provider checkout when its thirty-minute class hold ends first", async () => {
      await startDurableCheckout({
        ...args(),
        punchCardProductId: undefined,
        bookingId: booking,
      });
      const operation = await db.financialOperation.findFirstOrThrow({
        where: { workspaceId: gym },
      });
      const result = await resumeCheckoutOperation({
        operationId: operation.id,
        workspaceId: gym,
        actorUserId: user,
        db,
        gateway,
        now: new Date(now.getTime() + 30.5 * 60_000),
      });
      expect(result.status).toBe("error");
      expect(gateway.expire).toHaveBeenCalledOnce();
      expect(
        (
          await db.financialOperation.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).status,
      ).toBe("FAILED");
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("CANCELLED");
      expect(sessions.size).toBe(1);
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(0);
    });
    it("never recreates an unknown checkout after its class reservation expires", async () => {
      const create = gateway.create;
      gateway.create = vi.fn(async (request, key) => {
        await create(request, key);
        throw new Error("Lost create response");
      });
      await startDurableCheckout({
        ...args(),
        punchCardProductId: undefined,
        bookingId: booking,
      });
      const operation = await db.financialOperation.findFirstOrThrow({
        where: { workspaceId: gym },
      });
      expect(operation.providerReference).toBeNull();
      const count = vi.mocked(gateway.create).mock.calls.length;
      expect(
        (
          await resumeCheckoutOperation({
            operationId: operation.id,
            workspaceId: gym,
            actorUserId: user,
            db,
            gateway,
            now: new Date(now.getTime() + 30.5 * 60_000),
          })
        ).status,
      ).toBe("error");
      expect(vi.mocked(gateway.create).mock.calls).toHaveLength(count);
      expect(
        (
          await db.financialOperation.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).status,
      ).toBe("REVIEW_REQUIRED");
    });
    it("records payment racing with expiration and keeps review sticky on later replay", async () => {
      await startDurableCheckout({
        ...args(),
        punchCardProductId: undefined,
        bookingId: booking,
      });
      const operation = await db.financialOperation.findFirstOrThrow({
        where: { workspaceId: gym },
      });
      gateway.expire = vi.fn(async () => {
        await paidEvidence();
        throw new Error("Payment won the race");
      });
      const result = await resumeCheckoutOperation({
        operationId: operation.id,
        workspaceId: gym,
        actorUserId: user,
        db,
        gateway,
        now: new Date(now.getTime() + 30.5 * 60_000),
      });
      expect(result).toMatchObject({
        status: "error",
        message: expect.stringMatching(/Payment received/),
      });
      expect(
        (
          await db.financialOperation.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).status,
      ).toBe("REVIEW_REQUIRED");
      const { evidence } = await paidEvidence();
      await db.classBooking.update({
        where: { id: booking },
        data: {
          pendingPaymentExpiresAt: new Date(now.getTime() + 60 * 60_000),
        },
      });
      await saveCheckoutEvidence({
        operationId: operation.id,
        accountId: "acct_test",
        evidence,
        db,
        now,
      });
      expect(
        (
          await db.financialOperation.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).status,
      ).toBe("REVIEW_REQUIRED");
      expect(
        (await db.classBooking.findUniqueOrThrow({ where: { id: booking } }))
          .status,
      ).toBe("PENDING_PAYMENT");
      expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(1);
    });
    it("refuses an open checkout for a cancelled reservation", async () => {
      await startDurableCheckout({
        ...args(),
        punchCardProductId: undefined,
        bookingId: booking,
      });
      const operation = await db.financialOperation.findFirstOrThrow({
        where: { workspaceId: gym },
      });
      await db.classBooking.update({
        where: { id: booking },
        data: { status: "CANCELLED" },
      });
      expect(
        (
          await resumeCheckoutOperation({
            operationId: operation.id,
            workspaceId: gym,
            actorUserId: user,
            db,
            gateway,
            now,
          })
        ).status,
      ).toBe("error");
      expect(gateway.expire).toHaveBeenCalledOnce();
      expect(sessions.size).toBe(1);
    });
    it("rejects revoked pay permission and another payer before calling the provider", async () => {
      await db.memberPortalGrant.updateMany({
        where: { workspaceId: gym },
        data: { revokedAt: now },
      });
      expect((await startDurableCheckout(args())).status).toBe("error");
      expect(gateway.create).not.toHaveBeenCalled();
      expect(
        (await startDurableCheckout({ ...args(), payerMemberId: child }))
          .status,
      ).toBe("error");
    });
    it("rejects mismatched account/amount and quarantines unknown outcomes past the retry window", async () => {
      await startDurableCheckout(args());
      const { operation, evidence } = await paidEvidence();
      await expect(
        saveCheckoutEvidence({
          operationId: operation.id,
          accountId: "acct_wrong",
          evidence,
          db,
        }),
      ).rejects.toThrow(/match/);
      await expect(
        saveCheckoutEvidence({
          operationId: operation.id,
          accountId: "acct_test",
          evidence: { ...evidence, amountCents: 1 },
          db,
        }),
      ).rejects.toThrow(/match/);
      await db.financialOperation.update({
        where: { id: operation.id },
        data: {
          providerReference: null,
          createdAt: new Date(now.getTime() - 24 * 60 * 60_000),
        },
      });
      const calls = vi.mocked(gateway.create).mock.calls.length;
      expect(
        (
          await resumeCheckoutOperation({
            operationId: operation.id,
            workspaceId: gym,
            actorUserId: user,
            db,
            gateway,
            now,
          })
        ).status,
      ).toBe("error");
      expect(vi.mocked(gateway.create).mock.calls.length).toBe(calls);
      expect(
        (
          await db.financialOperation.findUniqueOrThrow({
            where: { id: operation.id },
          })
        ).status,
      ).toBe("REVIEW_REQUIRED");
    });
  },
);
