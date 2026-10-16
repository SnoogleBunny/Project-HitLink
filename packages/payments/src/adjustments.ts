import Stripe from "stripe";
import {
  FinancialError,
  type AdjustmentGateway,
  type RefundEvidence,
  type CreditEvidence,
  prisma,
  type PrismaClient,
  saveOwnerRefundEvidence,
  recordExternalRefundEvidence,
} from "@flowstate/db";
function stringId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : (value?.id ?? null);
}

/** The HTTP route must verify the Stripe signature before calling this function. Event payload status is never trusted. */
export async function reconcileAdjustmentWebhook(
  event: Stripe.Event,
  options: { db?: PrismaClient; gateway?: AdjustmentGateway } = {},
) {
  if (
    !["refund.created", "refund.updated", "refund.failed"].includes(event.type)
  )
    return;
  if (!event.account)
    throw new FinancialError(
      "Refund events require their original processor account.",
    );
  const object = event.data.object as Stripe.Refund;
  const gateway = options.gateway ?? createStripeAdjustmentGateway();
  const evidence = await gateway.retrieveRefund(event.account, object.id);
  const db = options.db ?? prisma;
  const operation = evidence.operationId
    ? await db.financialOperation.findUnique({
        where: { id: evidence.operationId },
      })
    : null;
  if (operation) {
    await saveOwnerRefundEvidence({
      operationId: operation.id,
      accountId: event.account,
      evidence,
      db,
    });
  } else {
    await recordExternalRefundEvidence({
      accountId: event.account,
      evidence,
      db,
    });
  }
}
export function createStripeAdjustmentGateway(
  stripe?: Stripe,
): AdjustmentGateway {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY)
      throw new FinancialError(
        "Online payments are not configured. The request remains available for review.",
      );
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  const provider = stripe;
  return {
    async createRefund(request, key) {
      const result = await provider.refunds.create(
        {
          payment_intent: request.paymentIntentId,
          amount: request.amountCents,
          reason: "requested_by_customer",
          metadata: { operationId: request.operationId },
        },
        { stripeAccount: request.accountId, idempotencyKey: key },
      );
      return { id: result.id };
    },
    async retrieveRefund(accountId, refundId): Promise<RefundEvidence> {
      const refund = await provider.refunds.retrieve(
        refundId,
        {},
        { stripeAccount: accountId },
      );
      return {
        id: refund.id,
        status:
          refund.status === "succeeded"
            ? "succeeded"
            : refund.status === "failed"
              ? "failed"
              : refund.status === "canceled"
                ? "canceled"
                : refund.status === "requires_action"
                  ? "requires_action"
                  : "pending",
        amountCents: refund.amount,
        currency: refund.currency,
        paymentIntentId: stringId(refund.payment_intent),
        operationId: refund.metadata?.operationId ?? null,
      };
    },
    async createCredit(request, key) {
      const result = await provider.customers.createBalanceTransaction(
        request.customerId,
        {
          amount: request.amountCents,
          currency: request.currency,
          description: "HitLink credit for a future membership invoice",
          metadata: { operationId: request.operationId },
        },
        { stripeAccount: request.accountId, idempotencyKey: key },
      );
      return { id: result.id };
    },
    async retrieveCredit(
      accountId,
      customerId,
      transactionId,
    ): Promise<CreditEvidence> {
      const transaction = await provider.customers.retrieveBalanceTransaction(
        customerId,
        transactionId,
        {},
        { stripeAccount: accountId },
      );
      if (transaction.type !== "adjustment")
        throw new FinancialError(
          "This processor record is not the approved account credit transfer.",
        );
      return {
        id: transaction.id,
        amountCents: transaction.amount,
        currency: transaction.currency,
        customerId: stringId(transaction.customer)!,
        operationId: transaction.metadata?.operationId ?? null,
      };
    },
  };
}
