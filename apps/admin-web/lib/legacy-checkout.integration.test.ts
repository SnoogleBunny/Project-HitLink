import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, type CheckoutEvidence } from "@flowstate/db";
import { reconcileLegacyCheckout } from "@flowstate/payments";
const testUrl = process.env.TEST_DATABASE_URL;
(testUrl ? describe : describe.skip)("legacy checkout money retention", () => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const gyms: string[] = [];
  let gym: string, memberId: string;
  beforeEach(async () => {
    gym = (
      await db.workspace.create({
        data: {
          name: `legacy-checkout-${randomUUID()}`,
          stripeSettings: {
            create: { stripeAccountId: `acct_${randomUUID()}` },
          },
        },
      })
    ).id;
    gyms.push(gym);
    memberId = (
      await db.member.create({
        data: { workspaceId: gym, fullName: "Legacy buyer" },
      })
    ).id;
  });
  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: gyms } } });
    await db.$disconnect();
  });
  function evidence(changes: Partial<CheckoutEvidence> = {}): CheckoutEvidence {
    return {
      id: "cs_old",
      state: "complete",
      paid: true,
      url: null,
      amountCents: 8000,
      currency: "cad",
      paymentIntentId: "pi_old",
      customerId: "cus_unknown",
      operationId: null,
      payerAccountId: null,
      expiresAt: null,
      ...changes,
    };
  }
  async function apply(
    value = evidence(),
    metadata: Record<string, string> = {},
  ) {
    const settings = await db.workspaceStripeSettings.findUniqueOrThrow({
      where: { workspaceId: gym },
    });
    const session = {
      id: "cs_old",
      metadata: {
        workspaceId: gym,
        memberId,
        checkoutType: "punch_card_purchase",
        ...metadata,
      },
    } as unknown as Stripe.Checkout.Session;
    return reconcileLegacyCheckout({
      workspaceId: gym,
      accountId: settings.stripeAccountId!,
      session,
      db,
      gateway: { retrieve: async () => value },
    });
  }
  it("records confirmed money once and requires review without granting unverified access", async () => {
    await Promise.all([apply(), apply()]);
    expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(1);
    expect(
      await db.financialReviewCase.count({ where: { workspaceId: gym } }),
    ).toBe(1);
    expect(
      await db.memberPunchCard.count({ where: { workspaceId: gym } }),
    ).toBe(0);
    expect(
      await db.payment.findFirstOrThrow({ where: { workspaceId: gym } }),
    ).toMatchObject({ amountCents: 8000, payerAccountId: null, memberId });
  });
  it("retains unlinked money without attaching a foreign member and rejects changed settlements", async () => {
    await apply(evidence(), { memberId: "foreign-member" });
    expect(
      (await db.payment.findFirstOrThrow({ where: { workspaceId: gym } }))
        .memberId,
    ).toBeNull();
    await expect(apply(evidence({ amountCents: 9000 }))).rejects.toThrow(
      "settlement changed",
    );
    expect(
      (await db.payment.findFirstOrThrow({ where: { workspaceId: gym } }))
        .amountCents,
    ).toBe(8000);
  });
  it("refuses cross-gym metadata, wrong canonical sessions and incomplete payment evidence", async () => {
    await expect(
      apply(evidence(), { workspaceId: "another-gym" }),
    ).rejects.toThrow("belong");
    await expect(apply(evidence({ id: "cs_wrong" }))).rejects.toThrow(
      "different checkout",
    );
    await expect(apply(evidence({ paymentIntentId: null }))).rejects.toThrow(
      "incomplete",
    );
    await apply(evidence({ paid: false, state: "open" }));
    expect(await db.payment.count({ where: { workspaceId: gym } })).toBe(0);
  });
});
