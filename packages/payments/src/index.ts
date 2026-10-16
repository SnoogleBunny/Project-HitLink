import Stripe from "stripe";
export { checkCoachingPayment, startCoachingPayment, handleCoachingCheckoutWebhook } from "./coaching.js";
export { reconcileMembershipWebhook, retrieveInvoiceEvidence, reconcileMembershipSubscription } from "./membership-reconciliation.js";
export { retryMembershipInvoice, InvoiceRetryDeclined, type InvoiceRetryGateway } from "./invoice-retry.js";
import { FinancialError, prisma, saveCheckoutEvidence, type CheckoutEvidence, type CheckoutGateway } from "@flowstate/db";

function id(value: string | { id: string } | null) { return typeof value === "string" ? value : value?.id ?? null; }
export function checkoutEvidence(session: Stripe.Checkout.Session): CheckoutEvidence {
  return { id: session.id, state: session.status ?? "open", paid: session.payment_status === "paid", url: session.url,
    amountCents: session.amount_total, currency: session.currency, paymentIntentId: id(session.payment_intent), customerId: id(session.customer),
    operationId: session.metadata?.operationId ?? null, payerAccountId: session.metadata?.payerAccountId ?? null,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
  };
}
export function paymentProvider() {
  if (!process.env.STRIPE_SECRET_KEY) throw new FinancialError("Online payments are not configured. Your purchase has not been confirmed.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export function createStripeCheckoutGateway(stripe = paymentProvider()): CheckoutGateway {
  return {
    async create(request, idempotencyKey) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment", client_reference_id: request.operationId,
        ...(request.customerId ? { customer: request.customerId } : { customer_email: request.email, customer_creation: "always" }),
        line_items: [{ quantity: 1, price_data: { currency: request.currency, unit_amount: request.amountCents, product_data: { name: request.name } } }],
        // These exact, reviewed amounts are sent again on recovery, even if the catalogue changes.
        adaptive_pricing: { enabled: false }, automatic_tax: { enabled: false }, allow_promotion_codes: false,
        success_url: request.successUrl, cancel_url: request.cancelUrl, expires_at: request.expiresAt,
        metadata: request.metadata, payment_intent_data: { metadata: request.metadata },
      }, { stripeAccount: request.accountId, idempotencyKey });
      return checkoutEvidence(session);
    },
    async retrieve(accountId, sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] }, { stripeAccount: accountId });
      const evidence = checkoutEvidence(session);
      if (evidence.paid) {
        const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
        if (!intent || intent.status !== "succeeded" || intent.amount_received !== session.amount_total || intent.currency !== session.currency) throw new FinancialError("The processor has not confirmed the full payment yet.");
      }
      return evidence;
    },
    async expire(accountId, sessionId) { await stripe.checkout.sessions.expire(sessionId, {}, { stripeAccount: accountId, idempotencyKey: `hitlink:expire:${sessionId}` }); },
  };
}

/** Called only after webhook signature verification. Session metadata alone never grants access. */
export async function reconcileCheckoutWebhook(event: Stripe.Event & { account?: string }) {
  if (!event.type.startsWith("checkout.session.")) return false;
  const session = event.data.object as Stripe.Checkout.Session;
  const operationId = session.metadata?.operationId;
  if (!operationId) return false;
  const operation = await prisma.financialOperation.findUnique({ where: { id: operationId } });
  if (!operation || operation.kind !== "CHECKOUT" || !event.account || operation.providerAccountId !== event.account) throw new FinancialError("Checkout webhook account does not match its payment request.");
  // Coaching has its own entitlement reconciler and payment allocation.
  if (session.metadata?.purpose === "coaching") return false;
  const evidence = await createStripeCheckoutGateway().retrieve(operation.providerAccountId, session.id);
  await saveCheckoutEvidence({ operationId, accountId: operation.providerAccountId, evidence });
  return true;
}
export { createStripeAdjustmentGateway, reconcileAdjustmentWebhook } from "./adjustments.js";
export { processMembershipLifecycleChange, retryMembershipLifecycleChange, reconcileDueMembershipLifecycle, createStripeMembershipLifecycleGateway, type MembershipLifecycleGateway } from "./membership-lifecycle.js";
export { startPublicMembershipCheckout, resumePublicMembershipCheckout, handlePublicMembershipCheckoutWebhook, handlePublicMembershipSubscriptionWebhook, createStripePublicMembershipGateway, type PublicMembershipGateway, type PublicMembershipEvidence } from "./public-membership.js";

export * from "./legacy-checkout.js";
export * from "./workspace-offboarding.js";
