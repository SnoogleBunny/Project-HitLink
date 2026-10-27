import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma as db } from "@flowstate/db";
import type Stripe from "stripe";
const provider = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { retrieve: provider.retrieve } };
  },
}));
import { handleCoachingCheckoutWebhook } from "../../../packages/payments/src/coaching";
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  "coaching settlement confirmation with real transactional storage",
  () => {
    let workspaceId = "";
    const users: string[] = [];
    afterAll(async () => {
      if (workspaceId)
        await db.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(
            "SELECT set_config('hitlink.reviewed_retention_workspace', $1, true)",
            workspaceId,
          );
          await tx.coachingEnrollment.deleteMany({ where: { workspaceId } });
          await tx.coachingProgramVersion.deleteMany({
            where: { program: { workspaceId } },
          });
          await tx.paymentConfirmation.deleteMany({ where: { workspaceId } });
          await tx.financialReviewCase.deleteMany({ where: { workspaceId } });
          await tx.financialOperation.deleteMany({ where: { workspaceId } });
          await tx.payment.deleteMany({ where: { workspaceId } });
          await tx.financialAccount.deleteMany({ where: { workspaceId } });
          await tx.workspace.delete({ where: { id: workspaceId } });
        });
      await db.user.deleteMany({ where: { id: { in: users } } });
      vi.unstubAllEnvs();
    });
    it("confirms received cash once while revoked service remains in review, without private program text", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_isolated_provider_adapter");
      const owner = await db.user.create({
        data: { email: `receipt-owner-${randomUUID()}@example.test` },
      });
      const payer = await db.user.create({
        data: { email: `receipt-payer-${randomUUID()}@example.test` },
      });
      users.push(owner.id, payer.id);
      const workspace = await db.workspace.create({
        data: {
          name: "Fictional Coaching Gym",
          location: { create: { name: "Gym", timezone: "UTC" } },
          workspaceUsers: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: payer.id, role: "CUSTOMER" },
            ],
          },
        },
      });
      workspaceId = workspace.id;
      const coach = await db.workspaceUser.findFirstOrThrow({
        where: { workspaceId, userId: owner.id },
      });
      const member = await db.member.create({
        data: { workspaceId, userId: payer.id, fullName: "Fictional client" },
      });
      const account = await db.financialAccount.create({
        data: { workspaceId, userId: payer.id, memberId: member.id },
      });
      const program = await db.coachingProgram.create({
        data: { workspaceId, name: "Renamed current catalog name" },
      });
      const version = await db.coachingProgramVersion.create({
        data: {
          programId: program.id,
          number: 1,
          durationDays: 30,
          deliveryWeekdays: [1, 2, 3],
          responseHours: 24,
          goals: "PRIVATE_GOALS_MUST_NOT_APPEAR",
          milestones: ["PRIVATE_MILESTONE"],
          priceCents: 12000,
          currency: "cad",
          terms: "Accepted terms",
        },
      });
      const sessionId = `cs_${randomUUID()}`;
      const enrollment = await db.coachingEnrollment.create({
        data: {
          workspaceId,
          memberId: member.id,
          programVersionId: version.id,
          startsOn: new Date("2030-01-01"),
          endsOn: new Date("2030-01-31"),
          timezone: "UTC",
          acceptedAt: new Date(),
          contactVerifiedAt: new Date(),
          currentCoachWorkspaceUserId: coach.id,
          caseOwnerWorkspaceUserId: coach.id,
          payerAccountId: account.id,
          checkoutSessionId: sessionId,
          checkoutAccountId: "acct_test",
          closedAt: new Date(),
        },
      });
      const metadata = {
        purpose: "coaching",
        workspaceId,
        enrollmentId: enrollment.id,
        memberId: member.id,
        programVersionId: version.id,
        payerAccountId: account.id,
      };
      await db.financialOperation.create({
        data: {
          workspaceId,
          operationKey: randomUUID(),
          requestHash: "a".repeat(64),
          kind: "CHECKOUT",
          status: "SUBMITTED",
          payerAccountId: account.id,
          beneficiaryMemberId: member.id,
          targetId: enrollment.id,
          amountCents: 12000,
          currency: "cad",
          providerAccountId: "acct_test",
          providerReference: sessionId,
          providerIdempotencyKey: randomUUID(),
          payload: {
            metadata,
            line_items: [
              {
                price_data: {
                  product_data: { name: "Accepted public program name" },
                },
              },
            ],
          },
        },
      });
      const session = {
        id: sessionId,
        mode: "payment",
        client_reference_id: enrollment.id,
        metadata,
        amount_total: 12000,
        currency: "cad",
        payment_status: "paid",
        payment_intent: {
          id: `pi_${randomUUID()}`,
          amount: 12000,
          amount_received: 12000,
          currency: "cad",
          status: "succeeded",
        },
      };
      provider.retrieve.mockResolvedValue(session);
      const event = {
        type: "checkout.session.completed",
        account: "acct_test",
        data: { object: session },
      } as unknown as Stripe.Event;
      expect(
        await Promise.all([
          handleCoachingCheckoutWebhook(event),
          handleCoachingCheckoutWebhook(event),
        ]),
      ).toEqual([true, true]);
      expect(await db.payment.count({ where: { workspaceId } })).toBe(1);
      expect(
        await db.paymentConfirmation.count({ where: { workspaceId } }),
      ).toBe(1);
      const mail = await db.notificationJob.findFirstOrThrow({
        where: {
          workspaceId,
          context: { path: ["kind"], equals: "PAYMENT_CONFIRMATION" },
        },
      });
      expect(mail).toMatchObject({
        status: "PENDING",
        recipientEmail: payer.email,
        providerMessageId: null,
      });
      expect(mail.body).toContain("Accepted public program name");
      expect(mail.body).not.toContain("PRIVATE_");
      expect(mail.body).not.toContain("Renamed current catalog name");
      expect(
        await db.coachingEnrollment.findUniqueOrThrow({
          where: { id: enrollment.id },
        }),
      ).toMatchObject({
        paymentState: "REVIEW_REQUIRED",
        closedAt: expect.any(Date),
      });
    });
  },
);
