import Stripe from "stripe";
import { Prisma, type PrismaClient, type InvoiceEvidence, prisma, FinancialError,
  requirePublicWorkspace, readPublicParticipant, publicEnrollmentFormsTx, requireFinancialPayer,
  lockClassSchedule, lockFinancialAccount, reserveFinancialOperation, transitionFinancialOperation, queueFinancialReview,
  parseGymWebsiteContent, isPublishedOfferCurrent, readAcceptedMembershipTerms, snapshotMembershipTerms, financialRequestHash,
  reconcileMembershipInvoice, recomputeMembershipBilling } from "@flowstate/db";
import { paymentProvider } from "./index.js";
import { retrieveInvoiceEvidence, invoiceSubscription } from "./membership-reconciliation.js";

type FinancialOperation = Awaited<ReturnType<typeof prisma.financialOperation.findUniqueOrThrow>>;
type CheckoutCreateParams = NonNullable<Parameters<Stripe["checkout"]["sessions"]["create"]>[0]>;
interface PublicMembershipRequest {
  purpose: "public_membership"; enrollmentId: string; membershipId: string; payerMemberId: string;
  planId: string; termsVersion: number; amountCents: number; currency: string; timezone: string;
  providerParams: CheckoutCreateParams;
}
export interface PublicMembershipEvidence {
  id: string; status: string; paymentStatus: string; url: string | null; expiresAt: number;
  amountTotal: number | null; currency: string | null; customerId: string | null; metadata: Record<string, string>;
  subscription: null | { id: string; status: string; customerId: string; metadata: Record<string, string>; startsAt: number; billingAnchor: number;
    currentPeriodStart: number; currentPeriodEnd: number; itemCount: number; amountCents: number | null; currency: string; interval: string | null; intervalCount: number | null };
  firstInvoice: InvoiceEvidence | null;
}
export interface PublicMembershipGateway {
  create(accountId: string, params: CheckoutCreateParams, key: string): Promise<{ id: string }>;
  retrieve(accountId: string, sessionId: string): Promise<PublicMembershipEvidence>;
}
export interface PublicMembershipResult { status: string; operationId: string; url?: string; message?: string }
type Options = { db?: PrismaClient; gateway?: PublicMembershipGateway; now?: Date };
function objectId(value: unknown): string | null { return typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null; }
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const requestOf = (operation: FinancialOperation) => operation.payload as unknown as PublicMembershipRequest;
function termsComparable(value: unknown) { const terms = readAcceptedMembershipTerms(value); if (!terms) return null; return { version: terms.version, monthlyPriceCents: terms.monthlyPriceCents, currency: terms.currency.toLowerCase(), weeklyClassLimit: terms.weeklyClassLimit, monthlyClassLimit: terms.monthlyClassLimit, allowanceCountingMode: terms.allowanceCountingMode, lateCancellationConsumesClass: terms.lateCancellationConsumesClass, noShowConsumesClass: terms.noShowConsumesClass, programIds: [...terms.programIds].sort(), cancellationPolicyReference: terms.cancellationPolicyReference, freezePolicyReference: terms.freezePolicyReference, lifecyclePolicy: terms.lifecyclePolicy ?? null }; }
function localDate(timestamp: number, timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp * 1000)); }
export function createStripePublicMembershipGateway(stripe = paymentProvider()): PublicMembershipGateway {
  return {
    async create(accountId, params, key) { const session = await stripe.checkout.sessions.create(params, { stripeAccount: accountId, idempotencyKey: key }); return { id: session.id }; },
    async retrieve(accountId, sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: accountId });
      const subscriptionId = objectId(session.subscription);
      let subscription: PublicMembershipEvidence["subscription"] = null, firstInvoice: InvoiceEvidence | null = null;
      if (subscriptionId) {
        const current = await stripe.subscriptions.retrieve(subscriptionId, {}, { stripeAccount: accountId });
        const item = current.items.data[0];
        subscription = { id: current.id, status: current.status, customerId: objectId(current.customer) ?? "", metadata: current.metadata,
          startsAt: current.start_date, billingAnchor: current.billing_cycle_anchor, currentPeriodStart: item?.current_period_start ?? 0, currentPeriodEnd: item?.current_period_end ?? 0,
          itemCount: current.items.data.length, amountCents: item?.price.unit_amount ?? null, currency: item?.price.currency ?? "", interval: item?.price.recurring?.interval ?? null, intervalCount: item?.price.recurring?.interval_count ?? null };
        let initial: Stripe.Invoice | null = null;
        for await (const invoice of stripe.invoices.list({ subscription: current.id, limit: 100 }, { stripeAccount: accountId })) {
          if (invoice.billing_reason === "subscription_create" && (!initial || invoice.created < initial.created)) initial = invoice;
        }
        if (initial) firstInvoice = await retrieveInvoiceEvidence(accountId, initial.id, { type: "public.membership.reconciliation", created: initial.created }, stripe);
      }
      return { id: session.id, status: session.status ?? "open", paymentStatus: session.payment_status, url: session.url, expiresAt: session.expires_at,
        amountTotal: session.amount_total, currency: session.currency, customerId: objectId(session.customer), metadata: session.metadata ?? {}, subscription, firstInvoice };
    },
  };
}
async function financialLock(tx: Prisma.TransactionClient, workspaceId: string) { await lockClassSchedule(tx, workspaceId); await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))`; await lockFinancialAccount(tx, workspaceId); }
async function enrollmentAuthority(tx: Prisma.TransactionClient, workspaceId: string, enrollmentId: string, actorUserId: string, validateForms: boolean) {
  const enrollment = await tx.publicEnrollment.findFirst({ where: { id: enrollmentId, workspaceId, kind: "MEMBERSHIP" } });
  if (!enrollment?.verifiedAt || !enrollment.memberId) throw new FinancialError("Verify the registration account before payment.");
  const participant = readPublicParticipant(enrollment);
  if (participant.accountUserId !== actorUserId || !participant.payerMemberId) throw new FinancialError("Sign in with the verified registration account.");
  const identity = await requireFinancialPayer(tx, { workspaceId, actorUserId, payerMemberId: participant.payerMemberId, beneficiaryMemberId: enrollment.memberId });
  if (participant.guardianId && !await tx.memberPortalGrant.findFirst({ where: { workspaceId, userId: actorUserId, memberId: enrollment.memberId, guardianId: participant.guardianId, revokedAt: null, canBook: true, canSign: true, canPay: true } })) throw new FinancialError("The gym must verify your family permissions before this membership can begin.");
  if (validateForms && (await publicEnrollmentFormsTx(tx, enrollment, actorUserId)).some((form) => !form.signed)) throw new FinancialError("Complete every current required form before paying for this membership.");
  return { enrollment, participant, identity };
}
function validateReturnUrl(value: string) {
  const url = new URL(value);
  const configured = process.env.NEXT_PUBLIC_MEMBER_WEB_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!configured || url.origin !== new URL(configured).origin || url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new FinancialError("The member website payment return address is not configured correctly.");
  return url;
}
export async function startPublicMembershipCheckout(args: { workspaceId: string; enrollmentId: string; actorUserId: string; returnUrl: string } & Options): Promise<PublicMembershipResult> {
  const db = args.db ?? prisma, now = args.now ?? new Date(), returnUrl = validateReturnUrl(args.returnUrl);
  const operation = await db.$transaction(async (tx) => {
    await financialLock(tx, args.workspaceId);
    const workspace = await requirePublicWorkspace(tx, args.workspaceId);
    const { enrollment, participant, identity } = await enrollmentAuthority(tx, args.workspaceId, args.enrollmentId, args.actorUserId, true);
    if (enrollment.operationId) return tx.financialOperation.findUniqueOrThrow({ where: { id: enrollment.operationId } });
    if (enrollment.createdAt.getTime() + 24 * 3600000 < now.getTime()) throw new FinancialError("This registration expired. Review the current offer and start again.");
    const accepted = enrollment.acceptedTerms as Prisma.JsonObject | null;
    const terms = readAcceptedMembershipTerms(accepted?.membership);
    const acceptance = accepted?.membership as Prisma.JsonObject | undefined;
    if (!accepted?.registrationConsent || !terms || acceptance?.acceptedByUserId !== args.actorUserId || acceptance?.beneficiaryMemberId !== enrollment.memberId) throw new FinancialError("Accept the current membership terms before payment.");
    const plan = await tx.membershipPlan.findFirst({ where: { id: participant.offerId, workspaceId: args.workspaceId, archivedAt: null }, include: { programRestrictions: true } });
    const website = await tx.workspaceWebsite.findUnique({ where: { workspaceId: args.workspaceId } });
    const offer = website?.published && parseGymWebsiteContent(website.published).offers.find((item) => item.id === participant.offerId && item.visible);
    if (!plan || !offer || !isPublishedOfferCurrent(offer, plan) || offer.termsFingerprint !== participant.termsFingerprint || financialRequestHash(termsComparable(terms)) !== financialRequestHash(termsComparable(snapshotMembershipTerms(plan)))) throw new FinancialError("This offer changed. Review and accept the current membership terms before payment.");
    const settings = await tx.workspaceStripeSettings.findUnique({ where: { workspaceId: args.workspaceId } });
    if (!settings?.stripeAccountId || !settings.chargesEnabled) throw new FinancialError("This gym cannot accept online payments yet.");
    if (await tx.memberMembership.findFirst({ where: { workspaceId: args.workspaceId, memberId: enrollment.memberId!, currentMembershipSlot: "CURRENT" } })) throw new FinancialError("This participant already has a current or pending membership. Ask the gym to review it before starting another.");
    const payer = await tx.financialAccount.upsert({ where: { workspaceId_userId: { workspaceId: args.workspaceId, userId: args.actorUserId } }, update: {}, create: { workspaceId: args.workspaceId, userId: args.actorUserId, memberId: participant.payerMemberId! } });
    if (payer.stripeCustomerId && payer.stripeAccountId !== settings.stripeAccountId) throw new FinancialError("The payer's processor account needs review before checkout.");
    const membership = await tx.memberMembership.create({ data: { workspaceId: args.workspaceId, memberId: enrollment.memberId!, membershipPlanId: plan.id, payerAccountId: payer.id, status: "PENDING_PAYMENT_METHOD", startedAt: now, acceptedTerms: json(acceptance), allowanceTimezone: workspace.location?.timezone ?? "UTC", stripeCustomerId: payer.stripeCustomerId } });
    const base = await reserveFinancialOperation(tx, { workspaceId: args.workspaceId, operationKey: `public-membership:${enrollment.id}`, kind: "CHECKOUT", actorUserId: args.actorUserId, payerAccountId: payer.id, beneficiaryMemberId: membership.memberId, targetId: membership.id, amountCents: terms.monthlyPriceCents, currency: terms.currency.toLowerCase(), providerAccountId: settings.stripeAccountId, expiresAt: new Date(now.getTime() + 31 * 60000), payload: { purpose: "public_membership", enrollmentId: enrollment.id, membershipId: membership.id } });
    const metadata = { purpose: "public_membership", operationId: base.id, workspaceId: args.workspaceId, enrollmentId: enrollment.id, membershipId: membership.id, payerAccountId: payer.id, beneficiaryMemberId: membership.memberId, termsVersion: String(terms.version) };
    const success = new URL(returnUrl); success.searchParams.set("checkout_session_id", "{CHECKOUT_SESSION_ID}");
    const cancel = new URL(returnUrl); cancel.searchParams.set("checkout", "cancelled");
    const providerParams: CheckoutCreateParams = { mode: "subscription", client_reference_id: base.id, ...(payer.stripeCustomerId ? { customer: payer.stripeCustomerId } : { customer_email: identity.payer.user!.email }),
      line_items: [{ quantity: 1, price_data: { currency: terms.currency.toLowerCase(), unit_amount: terms.monthlyPriceCents, recurring: { interval: "month", interval_count: 1 }, product_data: { name: plan.name } } }],
      adaptive_pricing: { enabled: false }, automatic_tax: { enabled: false }, allow_promotion_codes: false, expires_at: Math.floor((now.getTime() + 31 * 60000) / 1000),
      success_url: success.toString().replace(/%7BCHECKOUT_SESSION_ID%7D/g, "{CHECKOUT_SESSION_ID}"), cancel_url: cancel.toString(), metadata, subscription_data: { metadata } };
    const payload: PublicMembershipRequest = { purpose: "public_membership", enrollmentId: enrollment.id, membershipId: membership.id, payerMemberId: participant.payerMemberId!, planId: plan.id, termsVersion: terms.version, amountCents: terms.monthlyPriceCents, currency: terms.currency.toLowerCase(), timezone: workspace.location?.timezone ?? "UTC", providerParams };
    const final = await tx.financialOperation.update({ where: { id: base.id }, data: { payload: json(payload), requestHash: financialRequestHash(payload) } });
    await tx.publicEnrollment.update({ where: { id: enrollment.id }, data: { operationId: final.id, status: "PAYMENT_PENDING", version: { increment: 1 } } });
    return final;
  });
  return runPublicMembershipOperation(operation, { ...args, db, now });
}
async function recordReview(db: PrismaClient, operationId: string, message: string) {
  return db.$transaction(async (tx) => {
    const initial = await tx.financialOperation.findUniqueOrThrow({ where: { id: operationId } }); await financialLock(tx, initial.workspaceId);
    const current = await tx.financialOperation.findUniqueOrThrow({ where: { id: operationId } });
    await queueFinancialReview(tx, { workspaceId: current.workspaceId, sourceKey: `public-membership:${current.id}`, operationId: current.id, memberId: current.beneficiaryMemberId, payerAccountId: current.payerAccountId, amountCents: current.amountCents, currency: current.currency, reason: message });
    if (current.status !== "SUCCEEDED") await transitionFinancialOperation(tx, current, "REVIEW_REQUIRED", { action: "public-membership-review", message }, { lastError: message });
  });
}
function verifyEvidence(operation: FinancialOperation, evidence: PublicMembershipEvidence) {
  const request = requestOf(operation), expected = request.providerParams.metadata as Record<string, string>;
  if (request.purpose !== "public_membership" || !operation.providerAccountId || Object.entries(expected).some(([key, value]) => evidence.metadata[key] !== value) || (operation.providerReference && operation.providerReference !== evidence.id) || (evidence.currency && evidence.currency !== request.currency) || (evidence.amountTotal !== null && evidence.amountTotal !== request.amountCents)) throw new FinancialError("Checkout evidence differs from the accepted membership request.");
  const subscription = evidence.subscription;
  const completed = operation.status === "SUCCEEDED";
  if (subscription && (Object.entries(expected).some(([key, value]) => subscription.metadata[key] !== value) || subscription.customerId !== evidence.customerId || (!completed && (subscription.itemCount !== 1 || subscription.amountCents !== request.amountCents || subscription.currency !== request.currency || subscription.interval !== "month" || subscription.intervalCount !== 1)))) throw new FinancialError("The processor subscription differs from the accepted monthly membership.");
  const invoice = evidence.firstInvoice;
  if (invoice && (!subscription || invoice.accountId !== operation.providerAccountId || invoice.subscriptionId !== subscription.id || invoice.customerId !== evidence.customerId || invoice.currency !== request.currency || invoice.totalCents !== request.amountCents)) throw new FinancialError("The first invoice differs from the accepted membership amount or account.");
}
async function consumePublicMembershipEvidence(db: PrismaClient, operationId: string, evidence: PublicMembershipEvidence, now: Date): Promise<PublicMembershipResult> {
  let operation = await db.financialOperation.findUniqueOrThrow({ where: { id: operationId } }); verifyEvidence(operation, evidence);
  const request = requestOf(operation);
  await db.$transaction(async (tx) => {
    await financialLock(tx, operation.workspaceId);
    const current = await tx.financialOperation.findUniqueOrThrow({ where: { id: operation.id } }); verifyEvidence(current, evidence);
    const membership = await tx.memberMembership.findUniqueOrThrow({ where: { id: request.membershipId } });
    const payer = await tx.financialAccount.findUniqueOrThrow({ where: { id: current.payerAccountId! } });
    if (evidence.customerId && ((payer.stripeCustomerId && payer.stripeCustomerId !== evidence.customerId) || (membership.stripeCustomerId && membership.stripeCustomerId !== evidence.customerId))) throw new FinancialError("The processor payer does not match this registration.");
    if (membership.stripeSubscriptionId && evidence.subscription && membership.stripeSubscriptionId !== evidence.subscription.id) throw new FinancialError("A different subscription is already linked to this membership.");
    await tx.financialOperation.update({ where: { id: current.id }, data: { providerReference: evidence.id, providerUrl: evidence.url } });
    if (evidence.customerId) {
      await tx.financialAccount.update({ where: { id: payer.id }, data: { stripeAccountId: current.providerAccountId, stripeCustomerId: evidence.customerId } });
      await tx.memberMembership.update({ where: { id: membership.id }, data: { stripeCustomerId: evidence.customerId, ...(evidence.subscription ? { stripeSubscriptionId: evidence.subscription.id } : {}) } });
    }
    const unresolvedReview = current.status === "REVIEW_REQUIRED" || !!await tx.financialReviewCase.findFirst({ where: { workspaceId: current.workspaceId, operationId: current.id, resolvedAt: null } });
    if (evidence.status === "expired" && !evidence.subscription && current.status !== "SUCCEEDED" && !unresolvedReview) {
      await transitionFinancialOperation(tx, current, "FAILED", { action: "checkout-expired" }, { lastError: "Checkout expired without a subscription." });
      if (membership.status === "PENDING_PAYMENT_METHOD" && !membership.stripeSubscriptionId) await tx.memberMembership.update({ where: { id: membership.id }, data: { status: "ENDED", endedAt: now, currentMembershipSlot: null } });
      await tx.publicEnrollment.update({ where: { id: request.enrollmentId }, data: { status: "EXPIRED", version: { increment: 1 } } });
    }
  });
  if (evidence.firstInvoice) await reconcileMembershipInvoice({ workspaceId: operation.workspaceId, evidence: evidence.firstInvoice, eventId: `public-membership:${operation.id}:${evidence.firstInvoice.id}:${evidence.firstInvoice.status}`, db, now });
  // Reconcile canonical money even during review, but never return a payable URL or
  // activate automatically when a transient authority/form issue later disappears.
  const blocked = await db.$transaction(async (tx) => {
    await financialLock(tx, operation.workspaceId);
    const current = await tx.financialOperation.findUniqueOrThrow({ where: { id: operation.id } });
    if (current.status === "REVIEW_REQUIRED" || await tx.financialReviewCase.findFirst({ where: { workspaceId: current.workspaceId, operationId: current.id, resolvedAt: null } })) return "REVIEW_REQUIRED";
    return current.status === "FAILED" && evidence.status !== "expired" ? "FAILED" : null;
  });
  if (blocked) return { status: blocked, operationId, message: "This registration requires the gym's explicit reconciliation before checkout or access can continue." };
  if (evidence.status === "expired" && !evidence.subscription) return { status: "EXPIRED", operationId };
  const invoice = evidence.firstInvoice;
  if (invoice?.status === "PAID" && invoice.amountPaidCents !== request.amountCents) {
    await recordReview(db, operation.id, "The first invoice settled with a balance credit or another adjustment. Reconcile its money allocation before activating the membership.");
    return { status: "REVIEW_REQUIRED", operationId, message: "The first invoice's payment allocation needs review." };
  }
  const settled = evidence.status === "complete" && ["paid", "no_payment_required"].includes(evidence.paymentStatus) && invoice?.status === "PAID" && invoice.amountPaidCents === request.amountCents && invoice.amountDueCents === 0 && evidence.subscription?.status === "active";
  if (!settled) return { status: "PAYMENT_PENDING", operationId, ...(evidence.status === "open" && evidence.url ? { url: evidence.url } : {}), message: "The processor has not confirmed the first membership payment yet." };
  try {
    return await db.$transaction(async (tx) => {
      await financialLock(tx, operation.workspaceId);
      operation = await tx.financialOperation.findUniqueOrThrow({ where: { id: operation.id } });
      if (operation.status === "REVIEW_REQUIRED" || await tx.financialReviewCase.findFirst({ where: { workspaceId: operation.workspaceId, operationId: operation.id, resolvedAt: null } })) return { status: "REVIEW_REQUIRED", operationId, message: "This registration still requires explicit reconciliation." };
      if (operation.status === "FAILED") return { status: "FAILED", operationId };
      const membership = await tx.memberMembership.findUniqueOrThrow({ where: { id: request.membershipId } });
      const enrollment = await tx.publicEnrollment.findUniqueOrThrow({ where: { id: request.enrollmentId } });
      if (enrollment.status === "COMPLETE") return { status: "COMPLETE", operationId };
      await requirePublicWorkspace(tx, operation.workspaceId);
      await enrollmentAuthority(tx, operation.workspaceId, request.enrollmentId, operation.actorUserId!, true);
      if (membership.status !== "PENDING_PAYMENT_METHOD" || membership.endedAt || membership.frozenFrom || membership.currentMembershipSlot !== "CURRENT" || await tx.membershipLifecycleRequest.findFirst({ where: { membershipId: membership.id, activeSlot: "ACTIVE" } }) || await tx.financialEntitlementHold.findFirst({ where: { workspaceId: membership.workspaceId, targetKind: "MEMBERSHIP", targetId: membership.id, activeSlot: "ACTIVE" } })) throw new FinancialError("Payment settled, but this membership changed before activation. The gym must reconcile access and money.");
      const subscription = evidence.subscription!;
      if (subscription.currentPeriodStart > subscription.startsAt + 60 || subscription.billingAnchor !== subscription.startsAt) throw new FinancialError("The subscription has moved beyond its initial billing period or changed its anchor before registration completed. Review current debt and service dates before activation.");
      await tx.memberMembership.update({ where: { id: membership.id }, data: { status: "ACTIVE", startedAt: new Date(subscription.startsAt * 1000), allowanceAnchorDate: new Date(`${localDate(subscription.billingAnchor, request.timezone)}T00:00:00Z`), allowanceTimezone: request.timezone, nextBillingDate: new Date(subscription.currentPeriodEnd * 1000) } });
      await tx.member.update({ where: { id: membership.memberId }, data: { status: "ACTIVE" } });
      await tx.membershipBillingState.upsert({ where: { memberMembershipId: membership.id }, create: { workspaceId: membership.workspaceId, memberId: membership.memberId, memberMembershipId: membership.id, status: "ACTIVE", nextBillingDate: new Date(subscription.currentPeriodEnd * 1000), latestSubscriptionId: subscription.id, latestInvoiceId: invoice!.id }, update: { status: "ACTIVE", nextBillingDate: new Date(subscription.currentPeriodEnd * 1000), latestSubscriptionId: subscription.id, latestInvoiceId: invoice!.id } });
      await recomputeMembershipBilling(tx, membership.id, now);
      await transitionFinancialOperation(tx, operation, "SUCCEEDED", { action: "first-invoice-confirmed", membershipId: membership.id, invoiceId: invoice!.id }, { settledAt: now, result: { membershipId: membership.id, subscriptionId: subscription.id, invoiceId: invoice!.id }, lastError: null });
      await tx.publicEnrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETE", completedAt: now, version: { increment: 1 } } });
      await tx.notificationJob.create({ data: { workspaceId: membership.workspaceId, templateKind: "ANNOUNCEMENT", recipientEmail: enrollment.email, subject: "Your membership is ready", body: "Your first membership invoice is paid and your membership is active. Sign in to the member portal to book classes and see your billing dates.", status: "PENDING", nextAttemptAt: now } });
      return { status: "COMPLETE", operationId };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment settled but access needs review.";
    await recordReview(db, operation.id, message);
    return { status: "REVIEW_REQUIRED", operationId, message: "Your payment was received. The gym must review this registration before access can begin." };
  }
}
async function runPublicMembershipOperation(operation: FinancialOperation, options: Options): Promise<PublicMembershipResult> {
  const db = options.db ?? prisma, now = options.now ?? new Date(), gateway = options.gateway ?? createStripePublicMembershipGateway();
  const request = requestOf(operation);
  if (request.purpose !== "public_membership" || !operation.providerAccountId) throw new FinancialError("This is not a public membership checkout.");
  try {
    if (operation.providerReference) return await consumePublicMembershipEvidence(db, operation.id, await gateway.retrieve(operation.providerAccountId, operation.providerReference), now);
    if (operation.submittedAt && now.getTime() - operation.submittedAt.getTime() >= 23 * 3600000) {
      await recordReview(db, operation.id, "A membership checkout response was lost beyond the safe retry window. Locate the existing checkout or subscription before making another request.");
      return { status: "REVIEW_REQUIRED", operationId: operation.id, message: "The earlier checkout needs processor reconciliation." };
    }
    if (operation.status === "REVIEW_REQUIRED" || operation.status === "FAILED") return { status: operation.status, operationId: operation.id };
    operation = await db.$transaction(async (tx) => {
      await financialLock(tx, operation.workspaceId);
      const current = await tx.financialOperation.findUniqueOrThrow({ where: { id: operation.id } });
      if (current.status === "REVIEW_REQUIRED" || current.status === "FAILED" || await tx.financialReviewCase.findFirst({ where: { workspaceId: current.workspaceId, operationId: current.id, resolvedAt: null } })) throw new FinancialError("This registration requires explicit reconciliation before another checkout request.");
      if (current.submittedAt) return current;
      return transitionFinancialOperation(tx, current, "SUBMITTED", { action: "recurring-checkout-submission" }, { submittedAt: now });
    });
    const session = await gateway.create(operation.providerAccountId!, request.providerParams, operation.providerIdempotencyKey);
    return await consumePublicMembershipEvidence(db, operation.id, await gateway.retrieve(operation.providerAccountId!, session.id), now);
  } catch (error) {
    if (error instanceof FinancialError) { await recordReview(db, operation.id, error.message); return { status: "REVIEW_REQUIRED", operationId: operation.id, message: error.message }; }
    return { status: "PAYMENT_PENDING", operationId: operation.id, message: "The checkout response is still pending. Check this same registration again; do not start another payment." };
  }
}
export async function resumePublicMembershipCheckout(args: { workspaceId: string; operationId: string; actorUserId: string } & Options): Promise<PublicMembershipResult> {
  const db = args.db ?? prisma;
  const operation = await db.$transaction(async (tx) => {
    await financialLock(tx, args.workspaceId);
    const operation = await tx.financialOperation.findFirst({ where: { id: args.operationId, workspaceId: args.workspaceId, actorUserId: args.actorUserId, kind: "CHECKOUT" } });
    if (!operation || requestOf(operation).purpose !== "public_membership") throw new FinancialError("This checkout does not belong to this account.");
    await enrollmentAuthority(tx, args.workspaceId, requestOf(operation).enrollmentId, args.actorUserId, false);
    return operation;
  });
  return runPublicMembershipOperation(operation, args);
}

/** Called only after Stripe signature verification. Re-fetches canonical resources in the connected account. */
export async function handlePublicMembershipCheckoutWebhook(event: Stripe.Event & { account?: string }, options: Options = {}) {
  if (!event.type.startsWith("checkout.session.")) return false;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.purpose !== "public_membership") return false;
  const db = options.db ?? prisma;
  const operation = session.metadata.operationId ? await db.financialOperation.findUnique({ where: { id: session.metadata.operationId } }) : null;
  if (!operation || !event.account || operation.providerAccountId !== event.account || requestOf(operation).purpose !== "public_membership") throw new FinancialError("Public checkout webhook does not match its durable payment request.");
  const result = await consumePublicMembershipEvidence(db, operation.id, await (options.gateway ?? createStripePublicMembershipGateway()).retrieve(event.account, session.id), options.now ?? new Date());
  if (result.status === "PAYMENT_PENDING" && session.payment_status === "paid") throw new FinancialError("The paid checkout's canonical first invoice is still unavailable; retry this event.");
  return true;
}
/** A recurring invoice can arrive before the checkout-create response or checkout webhook. */
export async function handlePublicMembershipSubscriptionWebhook(event: Stripe.Event & { account?: string }) {
  if (!event.account || !(event.type.startsWith("invoice.") || event.type.startsWith("customer.subscription."))) return false;
  const stripe = paymentProvider();
  const subscriptionId = event.type.startsWith("customer.subscription.") ? (event.data.object as Stripe.Subscription).id : invoiceSubscription(await stripe.invoices.retrieve((event.data.object as Stripe.Invoice).id, {}, { stripeAccount: event.account }));
  if (!subscriptionId) return false;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, { stripeAccount: event.account });
  if (subscription.metadata.purpose !== "public_membership") return false;
  const operation = subscription.metadata.operationId ? await prisma.financialOperation.findUnique({ where: { id: subscription.metadata.operationId } }) : null;
  if (!operation || operation.providerAccountId !== event.account) throw new FinancialError("The recurring subscription has no matching durable public checkout request yet.");
  const linked = await prisma.memberMembership.findFirst({ where: { id: requestOf(operation).membershipId, workspaceId: operation.workspaceId, stripeSubscriptionId: subscription.id, stripeCustomerId: objectId(subscription.customer) } });
  if (linked && operation.status === "SUCCEEDED") return false;
  const sessions = await stripe.checkout.sessions.list({ subscription: subscription.id, limit: 100 }, { stripeAccount: event.account });
  const matches = sessions.data.filter((session) => session.metadata?.operationId === operation.id);
  if (matches.length !== 1) throw new FinancialError("The recurring subscription's original checkout is not available yet. Retry reconciliation.");
  await consumePublicMembershipEvidence(prisma, operation.id, await createStripePublicMembershipGateway(stripe).retrieve(event.account, matches[0]!.id), new Date());
  // The shared recurring handler still records this specific renewal/failure after initial linkage.
  return false;
}
