import { loginToWorkspace } from "./support/workspace-login";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  savePaymentDisputeEvidence,
  type PaymentDisputeEvidence,
} from "@flowstate/db";
import { test, expect } from "./support/browser-diagnostics";
const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (
  !databaseUrl ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !/test|e2e/i.test(new URL(databaseUrl).pathname)
)
  throw new Error(
    "Dispute workflows require a disposable local test database.",
  );
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const base =
  process.env.FLOWSTATE_ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";
test.afterAll(() => db.$disconnect());
test("PB17 owner reviews a verified local dispute, retains reservations, then records final access treatment", async ({
  page,
  browserDiagnostics,
}) => {
  const key = `dispute-e2e-${randomUUID()}`;
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "demo-owner@flowstate.local" },
    select: { passwordHash: true },
  });
  const user = await db.user.create({
    data: {
      email: `${key}@example.test`,
      fullName: "Fictional Dispute Owner",
      passwordHash: seed.passwordHash,
    },
  });
  const payer = await db.user.create({
    data: {
      email: `${key}-payer@example.test`,
      fullName: "Fictional Dispute Payer",
    },
  });
  const workspace = await db.workspace.create({
    data: {
      name: key,
      status: "ACTIVE",
      location: { create: { name: "Gym", timezone: "UTC" } },
      workspaceUsers: {
        create: [
          { userId: user.id, role: "OWNER" },
          { userId: payer.id, role: "CUSTOMER" },
        ],
      },
      migration: {
        create: {
          stage: "COMPLETE",
          nextOwnerAction: "Local test ready",
          flowstateResponsibility: "Fictional fixture",
          ownerReviewAcknowledgedAt: new Date(),
          ownerReviewAcknowledgedByUserId: user.id,
          operationallyReadyAt: new Date(),
          operationallyReadyByUserId: user.id,
        },
      },
      stripeSettings: { create: { stripeAccountId: `acct_${key}` } },
    },
  });
  const where = { workspaceId: workspace.id };
  try {
    const member = await db.member.create({
      data: { ...where, userId: payer.id, fullName: "Fictional Dispute Payer" },
    });
    const account = await db.financialAccount.create({
      data: {
        ...where,
        userId: payer.id,
        memberId: member.id,
        stripeAccountId: `acct_${key}`,
        stripeCustomerId: "cus_local",
      },
    });
    const payment = await db.payment.create({
      data: {
        ...where,
        payerAccountId: account.id,
        memberId: member.id,
        stripePaymentIntentId: `pi_${key}`,
        amountCents: 10000,
        currency: "cad",
        status: "SUCCEEDED",
      },
    });
    await db.financialOperation.create({
      data: {
        ...where,
        operationKey: "fixture-checkout",
        requestHash: "fixture",
        kind: "CHECKOUT",
        status: "SUCCEEDED",
        paymentId: payment.id,
        providerAccountId: `acct_${key}`,
        providerReference: `cs_${key}`,
        providerIdempotencyKey: randomUUID(),
        payload: {},
      },
    });
    const product = await db.punchCardProduct.create({
      data: {
        ...where,
        name: "Local five visits",
        punchesIncluded: 5,
        priceCents: 10000,
        currency: "cad",
      },
    });
    const card = await db.memberPunchCard.create({
      data: {
        ...where,
        memberId: member.id,
        punchCardProductId: product.id,
        originalPunches: 5,
        remainingPunches: 4,
        purchasePriceCents: 10000,
        purchaseCurrency: "cad",
        stripeCheckoutSessionId: `cs_${key}`,
      },
    });
    const location = await db.location.findUniqueOrThrow({ where });
    const room = await db.room.create({
      data: { locationId: location.id, name: "Mat", capacity: 10 },
    });
    const program = await db.program.create({
      data: { ...where, name: "Fictional classes" },
    });
    const template = await db.classTemplate.create({
      data: {
        ...where,
        roomId: room.id,
        programId: program.id,
        weekday: "MONDAY",
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        bookingCutoffMinutes: 0,
        cancellationCutoffMinutes: 120,
      },
    });
    const reservation = await db.classBooking.create({
      data: {
        ...where,
        memberId: member.id,
        classTemplateId: template.id,
        scheduledForDate: new Date("2099-01-05Z"),
        bookingType: "PUNCH_CARD",
        memberPunchCardId: card.id,
        consumedPunchCount: 1,
      },
    });
    const evidence: PaymentDisputeEvidence = {
      id: `du_${key}`,
      accountId: `acct_${key}`,
      livemode: false,
      chargeId: `ch_${key}`,
      paymentIntentId: `pi_${key}`,
      customerId: "cus_local",
      status: "needs_response",
      reason: "general",
      amountCents: 10000,
      currency: "cad",
      chargeAmountCents: 10000,
      chargeRefundedCents: 0,
      isChargeRefundable: false,
      evidenceDueAt: null,
      refunds: [],
      allocations: [],
      balanceTransactions: [
        {
          id: "txn_local",
          amount: -10000,
          fee: 1500,
          net: -11500,
          currency: "cad",
          type: "adjustment",
        },
      ],
    };
    // Explicit local adapter evidence: no Stripe request or financial action is made by this test.
    let dispute = await savePaymentDisputeEvidence({
      ...where,
      accountId: evidence.accountId,
      livemode: false,
      evidence,
      expectedVersion: 0,
      eventId: randomUUID(),
      db,
    });
    const reviewCase = await db.financialReviewCase.findFirstOrThrow({
      where: { ...where, disputeId: dispute.id },
    });
    await loginToWorkspace({
      page,
      origin: base,
      email: user.email,
      password: "DemoPass123!",
      expectedRedirect: "/dashboard;push",
      destination: { path: "/dashboard", heading: "Today" },
      diagnostics: browserDiagnostics,
    });
    // A 303 remains subject to the collector's existing exact document-visit rule.
    await page.goto(`${base}/dashboard/billing/reviews/${reviewCase.id}`);
    await expect(
      page.getByRole("heading", { name: "Processor dispute", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Reservations included in this review",
        exact: true,
      }),
    ).toBeVisible();
    const classImpact = page
      .getByRole("listitem")
      .filter({ hasText: "Fictional classes" });
    await expect(classImpact).toContainText("2099-01-05");
    await expect(classImpact).toContainText("Fictional Dispute Payer");
    await expect(classImpact).toContainText("Mat");
    await expect(classImpact).toContainText("punch card");
    await expect(
      page.getByText(/Local five visits.*4 unreserved of 5 sold visits/),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Verified processor money movements",
        exact: true,
      }),
    ).toBeVisible();
    const moneyMovement = page
      .getByRole("listitem")
      .filter({ hasText: "adjustment · amount" });
    await expect(moneyMovement).toContainText(/CAD\s+-100\.00/);
    await expect(moneyMovement).toContainText(/fee CAD\s+15\.00/);
    await expect(moneyMovement).toContainText(/net CAD\s+-115\.00/);
    await page
      .getByLabel("Review reason", { exact: true })
      .fill("Named owner keeps reservations pending verified outcome");
    await page.getByRole("checkbox").check();
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/billing/reviews/${reviewCase.id}`),
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: "Record owner treatment" }).click();
    const response = await responsePromise;
    await expect
      .poll(() =>
        db.paymentDisputeEvent.count({
          where: {
            ...where,
            disputeId: dispute.id,
            kind: "PENDING_TREATMENT_REVIEWED",
          },
        }),
      )
      .toBe(1);
    expect(
      (
        await db.financialReviewCase.findUniqueOrThrow({
          where: { id: reviewCase.id },
        })
      ).resolvedAt,
    ).toBeNull();
    if (response.status() === 200)
      browserDiagnostics.acknowledgeAction(
        response,
        "Owner treatment persisted while financial case remains open",
      );
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).status,
    ).toBe("BOOKED");
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Reservation and access treatment" }),
    ).toHaveValue("KEEP_RESERVATIONS");
    dispute = await savePaymentDisputeEvidence({
      ...where,
      accountId: evidence.accountId,
      livemode: false,
      evidence: { ...evidence, status: "lost" },
      expectedVersion: (
        await db.paymentDispute.findUniqueOrThrow({ where: { id: dispute.id } })
      ).version,
      eventId: randomUUID(),
      db,
    });
    await page.reload();
    await page
      .getByRole("combobox", { name: "Reservation and access treatment" })
      .selectOption("RETAIN_ACCESS");
    await page
      .getByLabel("Review reason", { exact: true })
      .fill("Explicit goodwill after verified local loss; no refund or charge");
    await page.getByRole("checkbox").check();
    const finalPromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/billing/reviews/${reviewCase.id}`),
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: "Record owner treatment" }).click();
    const finalResponse = await finalPromise;
    await expect
      .poll(
        async () =>
          (
            await db.financialReviewCase.findUniqueOrThrow({
              where: { id: reviewCase.id },
            })
          ).resolvedAt !== null,
      )
      .toBe(true);
    if (finalResponse.status() === 200)
      browserDiagnostics.acknowledgeAction(
        finalResponse,
        "Verified loss plus explicit retained-access outcome persisted",
      );
    await page.reload();
    await expect(
      page.getByText("Resolved", { exact: true }).first(),
    ).toBeVisible();
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe("SUCCEEDED");
    expect(await db.refund.count({ where: { paymentId: payment.id } })).toBe(0);
    expect(
      (
        await db.classBooking.findUniqueOrThrow({
          where: { id: reservation.id },
        })
      ).status,
    ).toBe("BOOKED");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
    await test.info().attach("payment-dispute-owner-phone", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await page.goto(`${base}/dashboard/billing/summary`);
    await expect(
      page.getByRole("heading", { name: "Financial summary", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Processor disputes", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
  } finally {
    await db.classBooking.deleteMany({ where });
    await db.financialEntitlementHold.deleteMany({ where });
    await db.financialReviewCase.deleteMany({ where });
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.user.deleteMany({ where: { id: { in: [user.id, payer.id] } } });
  }
});
