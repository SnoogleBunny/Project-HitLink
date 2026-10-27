import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import {
  FinancialError,
  StaleDisputeEvidence,
  prisma,
  savePaymentDisputeEvidence,
  lockClassSchedule,
  lockFinancialAccount,
  type PaymentDisputeEvidence,
  type PaymentDisputeGateway,
  type PrismaClient,
} from "@flowstate/db";

export const stripeDisputeEventTypes = new Set([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
]);
function id(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}
function configuredMode() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (/^(sk|rk)_live_/.test(key)) return true;
  if (/^(sk|rk)_test_/.test(key)) return false;
  throw new FinancialError(
    "Online payment verification is not configured. The dispute remains pending.",
  );
}
export function createStripeDisputeGateway(
  stripe?: Stripe,
  expectedLivemode = configuredMode(),
): PaymentDisputeGateway {
  const provider = stripe ?? new Stripe(process.env.STRIPE_SECRET_KEY!);
  return {
    async retrieve(accountId, disputeId) {
      const options = { stripeAccount: accountId };
      const dispute = await provider.disputes.retrieve(disputeId, {}, options);
      const chargeId = id(dispute.charge);
      if (
        dispute.id !== disputeId ||
        !chargeId ||
        dispute.livemode !== expectedLivemode
      )
        throw new FinancialError(
          "The processor dispute account or mode does not match this request.",
        );
      const charge = await provider.charges.retrieve(chargeId, {}, options);
      if (
        charge.id !== chargeId ||
        charge.livemode !== expectedLivemode ||
        !charge.paid ||
        charge.currency !== dispute.currency
      )
        throw new FinancialError(
          "The disputed charge has not been verified in the expected account and mode.",
        );
      const intentId = id(dispute.payment_intent) ?? id(charge.payment_intent);
      if (
        id(dispute.payment_intent) &&
        id(dispute.payment_intent) !== id(charge.payment_intent)
      )
        throw new FinancialError(
          "The disputed charge and payment intent do not match.",
        );
      const refunds: PaymentDisputeEvidence["refunds"] = [];
      for await (const refund of provider.refunds.list(
        { charge: chargeId, limit: 100 },
        options,
      )) {
        if (
          id(refund.charge) !== chargeId ||
          refund.currency !== charge.currency
        )
          throw new FinancialError(
            "A refund does not match the disputed charge.",
          );
        refunds.push({
          id: refund.id,
          amountCents: refund.amount,
          currency: refund.currency,
          status: refund.status ?? "pending",
        });
      }
      const allocations: PaymentDisputeEvidence["allocations"] = [];
      if (intentId) {
        for await (const allocation of provider.invoicePayments.list(
          {
            payment: { type: "payment_intent", payment_intent: intentId },
            status: "paid",
            limit: 100,
          },
          options,
        )) {
          if (
            id(allocation.payment.payment_intent) !== intentId ||
            allocation.amount_paid === null
          )
            throw new FinancialError(
              "The invoice payment allocation is not verified.",
            );
          const invoiceId = id(allocation.invoice)!;
          const invoice = await provider.invoices.retrieve(
            invoiceId,
            {},
            options,
          );
          if (
            invoice.livemode !== expectedLivemode ||
            id(invoice.customer) !== id(charge.customer) ||
            invoice.currency !== charge.currency
          )
            throw new FinancialError(
              "The invoice does not match the disputed payment's payer and mode.",
            );
          allocations.push({
            id: allocation.id,
            invoiceId,
            amountCents: allocation.amount_paid,
            customerId: id(invoice.customer),
          });
        }
      }
      const balanceTransactions: PaymentDisputeEvidence["balanceTransactions"] =
        [];
      for (const item of dispute.balance_transactions) {
        const balance =
          typeof item === "string"
            ? await provider.balanceTransactions.retrieve(item, {}, options)
            : item;
        balanceTransactions.push({
          id: balance.id,
          amount: balance.amount,
          fee: balance.fee,
          net: balance.net,
          currency: balance.currency,
          type: balance.type,
        });
      }
      return {
        id: dispute.id,
        accountId,
        livemode: dispute.livemode,
        chargeId,
        paymentIntentId: intentId,
        customerId: id(charge.customer),
        status: dispute.status,
        reason: dispute.reason,
        amountCents: dispute.amount,
        currency: dispute.currency,
        chargeAmountCents: charge.amount,
        chargeRefundedCents: charge.amount_refunded,
        isChargeRefundable: dispute.is_charge_refundable,
        evidenceDueAt: dispute.evidence_details.due_by
          ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
          : null,
        refunds: refunds.sort((a, b) => a.id.localeCompare(b.id)),
        allocations: allocations.sort((a, b) => a.id.localeCompare(b.id)),
        balanceTransactions: balanceTransactions.sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      };
    },
    async list(accountId, cursor) {
      const page = await provider.disputes.list(
        { limit: 10, ...(cursor ? { starting_after: cursor } : {}) },
        { stripeAccount: accountId },
      );
      if (page.data.some((item) => item.livemode !== expectedLivemode))
        throw new FinancialError(
          "Dispute reconciliation returned a different processor mode.",
        );
      return { ids: page.data.map((item) => item.id), hasMore: page.has_more };
    },
  };
}

async function reconcile(args: {
  workspaceId: string;
  accountId: string;
  livemode: boolean;
  disputeId: string;
  eventId: string;
  db: PrismaClient;
  gateway: PaymentDisputeGateway;
}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const prior = await args.db.paymentDispute.findUnique({
      where: {
        providerAccountId_livemode_providerDisputeId: {
          providerAccountId: args.accountId,
          livemode: args.livemode,
          providerDisputeId: args.disputeId,
        },
      },
      select: { version: true },
    });
    const evidence = await args.gateway.retrieve(
      args.accountId,
      args.disputeId,
    );
    try {
      return await savePaymentDisputeEvidence({
        workspaceId: args.workspaceId,
        accountId: args.accountId,
        livemode: args.livemode,
        evidence,
        expectedVersion: prior?.version ?? 0,
        eventId: args.eventId,
        db: args.db,
      });
    } catch (error) {
      if (!(error instanceof StaleDisputeEvidence) || attempt === 2)
        throw error;
    }
  }
  throw new FinancialError(
    "The dispute changed during verification. Check it again.",
  );
}

/** The HTTP route must verify the signature before dispatch. A stale event never supplies outcome evidence. */
export async function reconcileDisputeWebhook(
  event: Stripe.Event,
  options: {
    db?: PrismaClient;
    gateway?: PaymentDisputeGateway;
    expectedLivemode?: boolean;
  } = {},
) {
  if (!stripeDisputeEventTypes.has(event.type)) return;
  const mode = options.expectedLivemode ?? configuredMode();
  if (!event.account || event.livemode !== mode)
    throw new FinancialError(
      "The dispute event does not match the configured processor account and mode.",
    );
  const object = event.data.object as { id?: string; object?: string };
  if (object.object !== "dispute" || !object.id?.startsWith("du_"))
    throw new FinancialError(
      "The dispute event has no valid processor reference.",
    );
  const db = options.db ?? prisma;
  const settings = await db.workspaceStripeSettings.findMany({
    where: { stripeAccountId: event.account },
    select: { workspaceId: true },
    take: 2,
  });
  if (settings.length !== 1)
    throw new FinancialError(
      "The dispute's processor account is not linked to exactly one gym.",
    );
  // The minimal reference enables recovery if this request crashes after receipt but before settlement.
  await db.stripeWebhookEvent.updateMany({
    where: { stripeEventId: event.id, stripeAccountId: event.account },
    data: { objectId: object.id },
  });
  return reconcile({
    workspaceId: settings[0]!.workspaceId,
    accountId: event.account,
    livemode: mode,
    disputeId: object.id,
    eventId: event.id,
    db,
    gateway: options.gateway ?? createStripeDisputeGateway(),
  });
}

export async function refreshOwnerPaymentDispute(args: {
  workspaceId: string;
  actorUserId: string;
  disputeId: string;
  db?: PrismaClient;
  gateway?: PaymentDisputeGateway;
  expectedLivemode?: boolean;
}) {
  const db = args.db ?? prisma;
  const dispute = await db.$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    if (
      !(await tx.workspaceUser.findFirst({
        where: {
          workspaceId: args.workspaceId,
          userId: args.actorUserId,
          role: "OWNER",
          isActive: true,
        },
        select: { id: true },
      }))
    )
      throw new FinancialError(
        "Only an active gym owner can check this dispute.",
      );
    await lockFinancialAccount(tx, args.workspaceId);
    return tx.paymentDispute.findFirstOrThrow({
      where: { workspaceId: args.workspaceId, id: args.disputeId },
    });
  });
  if (dispute.livemode !== (args.expectedLivemode ?? configuredMode()))
    throw new FinancialError(
      "The dispute belongs to a different processor mode.",
    );
  return reconcile({
    workspaceId: args.workspaceId,
    accountId: dispute.providerAccountId,
    livemode: dispute.livemode,
    disputeId: dispute.providerDisputeId,
    eventId: `owner-check:${randomUUID()}`,
    db,
    gateway: args.gateway ?? createStripeDisputeGateway(),
  });
}

/** One bounded account page per invocation also discovers dispute events ignored by older app revisions. */
export async function reconcileWorkspacePaymentDisputes(args: {
  workspaceId: string;
  db?: PrismaClient;
  gateway?: PaymentDisputeGateway;
  expectedLivemode?: boolean;
}) {
  const db = args.db ?? prisma;
  const settings = await db.workspaceStripeSettings.findUnique({
    where: { workspaceId: args.workspaceId },
  });
  if (!settings?.stripeAccountId) return { checked: 0 };
  const mode = args.expectedLivemode ?? configuredMode(),
    gateway = args.gateway ?? createStripeDisputeGateway();
  const page = await gateway.list(
    settings.stripeAccountId,
    settings.disputeSyncMode === mode
      ? (settings.disputeSyncCursor ?? undefined)
      : undefined,
  );
  for (const disputeId of page.ids)
    await reconcile({
      workspaceId: args.workspaceId,
      accountId: settings.stripeAccountId,
      livemode: mode,
      disputeId,
      eventId: `reconcile:${randomUUID()}`,
      db,
      gateway,
    });
  // A failed page never advances its cursor. Completing a sweep starts a new sweep next time.
  await db.workspaceStripeSettings.updateMany({
    where: {
      workspaceId: args.workspaceId,
      stripeAccountId: settings.stripeAccountId,
      disputeSyncCursor: settings.disputeSyncCursor,
      disputeSyncMode: settings.disputeSyncMode,
    },
    data: {
      disputeSyncCursor: page.hasMore
        ? (page.ids.at(-1) ?? settings.disputeSyncCursor)
        : null,
      disputeSyncMode: mode,
    },
  });
  await db.stripeWebhookEvent.updateMany({
    where: {
      workspaceId: args.workspaceId,
      eventType: { in: [...stripeDisputeEventTypes] },
      objectId: { in: page.ids },
      status: { in: ["ERROR", "PROCESSING"] },
    },
    data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
  });
  return { checked: page.ids.length };
}
