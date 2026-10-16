import type Stripe from "stripe";
import {
  FinancialError,
  expireDropInBookingPayment,
  lockClassSchedule,
  lockFinancialAccount,
  prisma,
  queueFinancialReview,
  type CheckoutGateway,
  type PrismaClient,
} from "@flowstate/db";
import { createStripeCheckoutGateway } from "./index.js";
/** Older sessions lack a saved acceptance/payer operation. Retain verified money and require an explicit entitlement review. */
export async function reconcileLegacyCheckout(args: {
  workspaceId: string;
  accountId: string;
  session: Stripe.Checkout.Session;
  db?: PrismaClient;
  gateway?: Pick<CheckoutGateway, "retrieve">;
}) {
  const db = args.db ?? prisma;
  const settings = await db.workspaceStripeSettings.findUnique({
    where: { workspaceId: args.workspaceId },
  });
  if (
    settings?.stripeAccountId !== args.accountId ||
    args.session.metadata?.workspaceId !== args.workspaceId
  )
    throw new FinancialError("Legacy checkout does not belong to this gym.");
  const evidence = await (
    args.gateway ?? createStripeCheckoutGateway()
  ).retrieve(args.accountId, args.session.id);
  if (evidence.id !== args.session.id)
    throw new FinancialError("The processor returned a different checkout.");
  if (!evidence.paid) {
    if (
      evidence.state === "expired" &&
      args.session.metadata?.checkoutType === "drop_in_booking" &&
      args.session.metadata.bookingId
    )
      await expireDropInBookingPayment({
        workspaceId: args.workspaceId,
        bookingId: args.session.metadata.bookingId,
        checkoutSessionId: evidence.id,
        db: db as unknown as Parameters<
          typeof expireDropInBookingPayment
        >[0]["db"],
      });
    return;
  }
  if (
    !evidence.paymentIntentId ||
    evidence.state !== "complete" ||
    evidence.amountCents === null ||
    !Number.isSafeInteger(evidence.amountCents) ||
    evidence.amountCents <= 0 ||
    !evidence.currency ||
    !/^[a-z]{3}$/i.test(evidence.currency)
  )
    throw new FinancialError("Legacy payment evidence is incomplete.");
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    await lockFinancialAccount(tx, args.workspaceId);
    const member = await tx.member.findFirst({
      where: {
        id: args.session.metadata?.memberId ?? "",
        workspaceId: args.workspaceId,
      },
      select: { id: true },
    });
    const payer = evidence.customerId
      ? await tx.financialAccount.findFirst({
          where: {
            workspaceId: args.workspaceId,
            stripeAccountId: args.accountId,
            stripeCustomerId: evidence.customerId,
          },
          select: { id: true },
        })
      : null;
    const key = {
      workspaceId: args.workspaceId,
      importedExternalId: `checkout:${evidence.id}`,
    };
    const prior = await tx.payment.findUnique({
      where: { workspaceId_importedExternalId: key },
    });
    if (
      prior &&
      (prior.amountCents !== evidence.amountCents ||
        prior.currency !== evidence.currency ||
        prior.stripePaymentIntentId !== evidence.paymentIntentId)
    )
      throw new FinancialError(
        "Legacy checkout settlement changed. Review the existing cash record.",
      );
    const payment =
      prior ??
      (await tx.payment.create({
        data: {
          ...key,
          memberId: member?.id,
          payerAccountId: payer?.id,
          status: "SUCCEEDED",
          amountCents: evidence.amountCents!,
          currency: evidence.currency!,
          stripePaymentIntentId: evidence.paymentIntentId,
          paidAt: new Date(),
        },
      }));
    const booking = args.session.metadata?.bookingId
      ? await tx.classBooking.findFirst({
          where: {
            id: args.session.metadata.bookingId,
            workspaceId: args.workspaceId,
            memberId: member?.id ?? "",
          },
          select: { id: true },
        })
      : null;
    await queueFinancialReview(tx, {
      workspaceId: args.workspaceId,
      sourceKey: `legacy-checkout:${evidence.id}`,
      paymentId: payment.id,
      memberId: member?.id,
      payerAccountId: payer?.id,
      bookingId: booking?.id,
      amountCents: evidence.amountCents,
      currency: evidence.currency,
      reason:
        "A checkout started before durable purchase records were introduced. Money is recorded. Verify the original payer, accepted product terms and any existing class or pack before granting access or issuing a refund.",
    });
  });
}
