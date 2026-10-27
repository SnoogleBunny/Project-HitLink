import { randomUUID } from "node:crypto";

export const STRIPE_WEBHOOK_FAILURE_CODES = [
  "DISPUTE_RECONCILIATION_PENDING",
  "MEMBERSHIP_RECONCILIATION_PENDING",
  "REFUND_RECONCILIATION_PENDING",
  "CHECKOUT_RECONCILIATION_PENDING",
  "STRIPE_ACCOUNT_RECONCILIATION_PENDING",
  "STRIPE_WEBHOOK_RECONCILIATION_PENDING",
] as const;
export type StripeWebhookFailureCode = (typeof STRIPE_WEBHOOK_FAILURE_CODES)[number];
export interface StripeWebhookFailure {
  code: StripeWebhookFailureCode;
  diagnosticId: string;
  message: string;
}
const eventCodes = new Map<string, StripeWebhookFailureCode>([
  ...["created", "updated", "closed", "funds_withdrawn", "funds_reinstated"].map((suffix) => [`charge.dispute.${suffix}`, "DISPUTE_RECONCILIATION_PENDING"] as const),
  ...["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "invoice.finalization_failed", "invoice.updated", "invoice.voided", "invoice.marked_uncollectible"].map((type) => [type, "MEMBERSHIP_RECONCILIATION_PENDING"] as const),
  ...["refund.created", "refund.updated", "refund.failed"].map((type) => [type, "REFUND_RECONCILIATION_PENDING"] as const),
  ...["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].map((type) => [type, "CHECKOUT_RECONCILIATION_PENDING"] as const),
  ["account.updated", "STRIPE_ACCOUNT_RECONCILIATION_PENDING"],
  ["account.application.deauthorized", "STRIPE_ACCOUNT_RECONCILIATION_PENDING"],
]);
const referencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicMessage = "Stripe reconciliation is incomplete. Retry this event; if it continues, contact support with the diagnostic reference. No successful outcome is confirmed by this response.";
function failureCode(value: unknown): StripeWebhookFailureCode {
  return typeof value === "string" && STRIPE_WEBHOOK_FAILURE_CODES.includes(value as StripeWebhookFailureCode)
    ? value as StripeWebhookFailureCode
    : "STRIPE_WEBHOOK_RECONCILIATION_PENDING";
}
/** Public projection never trusts a caller's human message or unbounded exception fields. */
export function stripeWebhookPublicFailure(failure: { code?: unknown; diagnosticId?: unknown }) {
  return {
    error: publicMessage,
    code: failureCode(failure.code),
    ...(typeof failure.diagnosticId === "string" && referencePattern.test(failure.diagnosticId) ? { diagnosticId: failure.diagnosticId } : {}),
  };
}
/** Use after a claimed receipt fails. Do not pass the original error or provider response here. */
export function createStripeWebhookFailure(args: {
  eventType: string;
  stripeEventId: string;
  stripeAccountId: string | null;
  livemode: boolean;
}): StripeWebhookFailure {
  const code = eventCodes.get(args.eventType) ?? "STRIPE_WEBHOOK_RECONCILIATION_PENDING";
  const diagnosticId = randomUUID();
  const record = {
    schemaVersion: 1,
    event: "stripe.webhook.error",
    code,
    diagnosticId,
    occurredAt: new Date().toISOString(),
    eventType: eventCodes.has(args.eventType) ? args.eventType : "UNCLASSIFIED",
    ...(typeof args.stripeEventId === "string" && /^evt_[A-Za-z0-9]{1,200}$/.test(args.stripeEventId) ? { stripeEventId: args.stripeEventId } : {}),
    ...(typeof args.stripeAccountId === "string" && /^acct_[A-Za-z0-9]{1,200}$/.test(args.stripeAccountId) ? { stripeAccountId: args.stripeAccountId } : {}),
    livemode: args.livemode === true,
  };
  // Logging availability must not change the durable ERROR/retry outcome. Never forward a sink exception to Next.
  try { console.error(JSON.stringify(record)); } catch { /* The safe receipt/reference still identifies this failed attempt. */ }
  return { code, diagnosticId, message: publicMessage };
}
