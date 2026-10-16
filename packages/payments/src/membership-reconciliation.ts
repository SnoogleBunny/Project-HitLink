import Stripe from "stripe";
import {
  FinancialError,
  lockClassSchedule,
  lockFinancialAccount,
  prisma,
  queueFinancialReview,
  reconcileMembershipInvoice,
  recomputeMembershipBilling,
  type InvoiceEvidence,
} from "@flowstate/db";
import { paymentProvider } from "./index.js";
import { reconcileDueMembershipLifecycle } from "./membership-lifecycle.js";

function id(value: unknown): string | null {
  return typeof value === "string"
    ? value
    : value &&
        typeof value === "object" &&
        "id" in value &&
        typeof value.id === "string"
      ? value.id
      : null;
}
function date(timestamp: number | null | undefined) {
  return timestamp ? new Date(timestamp * 1000) : null;
}
export function invoiceSubscription(invoice: Stripe.Invoice) {
  return (
    id(invoice.parent?.subscription_details?.subscription) ??
    id((invoice as unknown as { subscription?: unknown }).subscription)
  );
}

export async function retrieveInvoiceEvidence(
  accountId: string,
  invoiceId: string,
  event: { type: string; created: number },
  stripe = paymentProvider(),
): Promise<InvoiceEvidence> {
  const invoice = await stripe.invoices.retrieve(
    invoiceId,
    {},
    { stripeAccount: accountId },
  );
  const payments: InvoiceEvidence["payments"] = [];
  for await (const allocation of stripe.invoicePayments.list(
    { invoice: invoiceId, limit: 100 },
    { stripeAccount: accountId },
  )) {
    if (allocation.status !== "paid" || allocation.amount_paid === null)
      continue;
    const paymentIntentId = id(allocation.payment.payment_intent);
    if (paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        {},
        { stripeAccount: accountId },
      );
      if (
        intent.status !== "succeeded" ||
        intent.currency !== invoice.currency ||
        intent.amount_received < allocation.amount_paid
      )
        throw new FinancialError("Invoice payment evidence is not settled.");
    }
    payments.push({
      allocationId: allocation.id,
      paymentIntentId,
      amountCents: allocation.amount_paid,
      paidAt:
        date(allocation.status_transitions.paid_at) ??
        date(allocation.created)!,
    });
  }
  const failure = invoice.last_finalization_error;
  const failed =
    [
      "invoice.payment_failed",
      "invoice.payment_action_required",
      "invoice.finalization_failed",
    ].includes(event.type) &&
    invoice.status !== "paid" &&
    invoice.status !== "void";
  const unknownFailureTime =
    !failed &&
    ["open", "uncollectible"].includes(invoice.status ?? "") &&
    invoice.amount_remaining > 0 &&
    (invoice.attempted || invoice.attempt_count > 0);
  return {
    id: invoice.id,
    accountId,
    subscriptionId: invoiceSubscription(invoice),
    customerId: id(invoice.customer),
    status: (
      invoice.status ?? "draft"
    ).toUpperCase() as InvoiceEvidence["status"],
    number: invoice.number,
    currency: invoice.currency,
    subtotalCents: invoice.subtotal,
    taxCents:
      invoice.total_taxes?.reduce((sum, tax) => sum + tax.amount, 0) ?? 0,
    totalCents: invoice.total,
    amountPaidCents: invoice.amount_paid,
    amountDueCents: invoice.amount_remaining,
    issuedAt: date(invoice.created)!,
    dueAt: date(invoice.due_date),
    paidAt: date(invoice.status_transitions.paid_at),
    voidedAt: date(invoice.status_transitions.voided_at),
    firstFailedAt: failed ? (date(event.created) ?? new Date()) : undefined,
    failureCode: failed
      ? (failure?.code ?? "payment_requires_attention")
      : unknownFailureTime
        ? "payment_failure_time_unknown"
        : null,
    failureMessage: failed
      ? "Payment has not settled. Review the invoice payment options."
      : unknownFailureTime
        ? "An attempted payment is unpaid. The gym must verify its original failure date before granting a grace period."
        : null,
    payments,
  };
}

export async function reconcileMembershipSubscription(
  workspaceId: string,
  accountId: string,
  subscription: Stripe.Subscription,
) {
  return prisma.$transaction(async (tx) => {
    await lockClassSchedule(tx, workspaceId);
    await lockFinancialAccount(tx, workspaceId);
    const membership = await tx.memberMembership.findFirst({
      where: { workspaceId, stripeSubscriptionId: subscription.id },
    });
    if (!membership) return;
    const settings = await tx.workspaceStripeSettings.findUnique({
      where: { workspaceId },
    });
    if (
      settings?.stripeAccountId !== accountId ||
      !membership.stripeCustomerId ||
      membership.stripeCustomerId !== id(subscription.customer)
    )
      throw new FinancialError(
        "Subscription payer does not match this membership.",
      );
    const latestInvoiceId = id(subscription.latest_invoice);
    const invoice = latestInvoiceId
      ? await tx.invoice.findUnique({
          where: {
            workspaceId_stripeInvoiceId: {
              workspaceId,
              stripeInvoiceId: latestInvoiceId,
            },
          },
        })
      : null;
    const periodEnd = Math.max(
      ...subscription.items.data.map((item) => item.current_period_end),
    );
    const nextBillingDate = Number.isFinite(periodEnd) ? date(periodEnd) : null;
    const ended = ["canceled", "incomplete_expired"].includes(
      subscription.status,
    );
    if (ended && !["CANCELLED", "ENDED"].includes(membership.status)) {
      const providerEndedAt = date(subscription.ended_at) ?? new Date();
      const endedAt =
        membership.endedAt && membership.endedAt < providerEndedAt
          ? membership.endedAt
          : providerEndedAt;
      await tx.memberMembership.update({
        where: { id: membership.id },
        data: {
          status: "CANCELLED",
          endedAt,
          currentMembershipSlot: null,
          cancelAtPeriodEnd: false,
        },
      });
      // Lifecycle reconciliation resolves affected bookings through the shared cancellation path.
      await queueFinancialReview(tx, {
        workspaceId,
        sourceKey: `subscription-ended:${subscription.id}`,
        memberId: membership.memberId,
        payerAccountId: membership.payerAccountId,
        reason:
          "Processor billing has ended. Confirm the service end date and disposition of future bookings.",
      });
    } else if (!["CANCELLED", "ENDED"].includes(membership.status)) {
      const publicAcceptance =
        (membership.acceptedTerms as { acceptanceMethod?: string } | null)
          ?.acceptanceMethod === "PUBLIC_VERIFIED_ACCOUNT";
      // Public checkout has a separate consent/authority finalizer; generic subscription updates cannot bypass it.
      const activate =
        !publicAcceptance &&
        membership.status === "PENDING_PAYMENT_METHOD" &&
        subscription.status === "active" &&
        invoice?.status === "PAID" &&
        !membership.frozenFrom;
      await tx.memberMembership.update({
        where: { id: membership.id },
        data: {
          ...(activate ? { status: "ACTIVE" } : {}),
          nextBillingDate,
          // A local accepted cancellation is not withdrawn by an older provider observation.
          cancelAtPeriodEnd:
            subscription.cancel_at_period_end || membership.cancelAtPeriodEnd,
        },
      });
    }
    await recomputeMembershipBilling(tx, membership.id);
    await tx.membershipBillingState.updateMany({
      where: { memberMembershipId: membership.id },
      data: { nextBillingDate, latestSubscriptionId: subscription.id },
    });
  });
}

/** Re-fetch canonical resources; webhook delivery order is never an ordering guarantee. */
export async function reconcileMembershipWebhook(
  event: Stripe.Event & { account?: string },
) {
  if (!event.account) return false;
  const settings = await prisma.workspaceStripeSettings.findFirst({
    where: { stripeAccountId: event.account },
  });
  if (!settings) return false;
  const stripe = paymentProvider();
  if (event.type.startsWith("invoice.")) {
    const invoiceId = (event.data.object as Stripe.Invoice).id;
    const evidence = await retrieveInvoiceEvidence(
      event.account,
      invoiceId,
      event,
      stripe,
    );
    const result = await reconcileMembershipInvoice({
      workspaceId: settings.workspaceId,
      evidence,
      eventId: event.id,
    });
    if (result.status === "unlinked") return false;
    if (evidence.subscriptionId) {
      await reconcileMembershipSubscription(
        settings.workspaceId,
        event.account,
        await stripe.subscriptions.retrieve(
          evidence.subscriptionId,
          {},
          { stripeAccount: event.account },
        ),
      );
      await reconcileDueMembershipLifecycle({
        workspaceId: settings.workspaceId,
        subscriptionId: evidence.subscriptionId,
      });
    }
    return true;
  }
  if (event.type.startsWith("customer.subscription.")) {
    const subscription = await stripe.subscriptions.retrieve(
      (event.data.object as Stripe.Subscription).id,
      {},
      { stripeAccount: event.account },
    );
    const latestInvoiceId = id(subscription.latest_invoice);
    if (latestInvoiceId)
      await reconcileMembershipInvoice({
        workspaceId: settings.workspaceId,
        evidence: await retrieveInvoiceEvidence(
          event.account,
          latestInvoiceId,
          event,
          stripe,
        ),
        eventId: event.id,
      });
    await reconcileMembershipSubscription(
      settings.workspaceId,
      event.account,
      subscription,
    );
    await reconcileDueMembershipLifecycle({
      workspaceId: settings.workspaceId,
      subscriptionId: subscription.id,
    });
    return true;
  }
  return false;
}
