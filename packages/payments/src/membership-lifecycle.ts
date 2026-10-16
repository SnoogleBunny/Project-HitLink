import Stripe from "stripe";
import { Prisma, prisma, approveMembershipLifecycleChange, applyMembershipLifecycleEvidence, getMembershipLifecycle,
  MembershipLifecycleError, lockClassSchedule, lockFinancialAccount, transitionFinancialOperation, reserveFinancialOperation, queueFinancialReview,
  getZonedDateTimeAsUtc, type MembershipLifecycleActor, type MembershipLifecycleOverride, type MembershipLifecycleProviderEvidence } from "@flowstate/db";
import { paymentProvider } from "./index.js";
type FinancialOperation = Awaited<ReturnType<typeof prisma.financialOperation.findUniqueOrThrow>>;
type MembershipLifecycleRequest = Awaited<ReturnType<typeof prisma.membershipLifecycleRequest.findUniqueOrThrow>>;

export interface LifecycleProviderRequest {
  accountId: string; subscriptionId: string; customerId: string; kind: string;
  effectiveOn: string; resumeOn: string | null; timezone: string;
  noticeBillingDecision: string; collectExistingDebt: boolean;
  parentRequestId?: string; preservePauseUntil?: number | null;
  providerAction?: "CANCEL_NOW" | "UPDATE" | "STOP_DEBT_COLLECTION";
}
export interface MembershipLifecycleGateway {
  retrieve(request: LifecycleProviderRequest): Promise<MembershipLifecycleProviderEvidence>;
  change(request: LifecycleProviderRequest, idempotencyKey: string): Promise<void>;
}
function objectId(value: string | { id: string } | null) { return typeof value === "string" ? value : value?.id ?? ""; }
function boundary(date: string, timezone: string) { return Math.floor(getZonedDateTimeAsUtc({ dateString: date, minutes: 0, timezone }).getTime() / 1000); }
function local(timestamp: number, timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp * 1000)); }

export function createStripeMembershipLifecycleGateway(stripe = paymentProvider()): MembershipLifecycleGateway {
  return {
    async retrieve(request) {
      const subscription = await stripe.subscriptions.retrieve(request.subscriptionId, {}, { stripeAccount: request.accountId });
      if (objectId(subscription.customer) !== request.customerId) throw new MembershipLifecycleError("The processor customer differs from this membership.");
      if (subscription.items.data.length !== 1 || subscription.items.data.some((item) => item.price.recurring?.interval !== "month" || item.price.recurring.interval_count !== 1)) throw new MembershipLifecycleError("This subscription needs a separately reviewed billing schedule. Monthly membership lifecycle changes are supported here.");
      let existingDebtCollectionStopped = true;
      if (!request.collectExistingDebt) {
        for await (const invoice of stripe.invoices.list({ subscription: request.subscriptionId, status: "open", limit: 100 }, { stripeAccount: request.accountId })) {
          if (invoice.auto_advance) existingDebtCollectionStopped = false;
        }
      }
      return { subscriptionId: subscription.id, accountId: request.accountId, customerId: objectId(subscription.customer), status: subscription.status,
        cancelAt: subscription.cancel_at, pauseBehavior: subscription.pause_collection?.behavior ?? null, pauseResumesAt: subscription.pause_collection?.resumes_at ?? null,
        currentPeriodEnd: subscription.items.data[0]!.current_period_end, existingDebtCollectionStopped };
    },
    async change(request, key) {
      const options = { stripeAccount: request.accountId, idempotencyKey: key };
      if (request.providerAction === "STOP_DEBT_COLLECTION") {
        if (request.kind !== "CANCEL" || request.collectExistingDebt) throw new MembershipLifecycleError("The accepted policy does not permit this debt-collection change.");
        for await (const invoice of stripe.invoices.list({ subscription: request.subscriptionId, status: "open", limit: 100 }, { stripeAccount: request.accountId })) {
          if (invoice.auto_advance) await stripe.invoices.update(invoice.id, { auto_advance: false }, { stripeAccount: request.accountId, idempotencyKey: `${key}:invoice:${invoice.id}` });
        }
        return;
      }
      if (request.providerAction === "CANCEL_NOW") {
        await stripe.subscriptions.cancel(request.subscriptionId, { invoice_now: false, prorate: false }, options);
      } else {
        const params: Stripe.SubscriptionUpdateParams = { proration_behavior: "none" };
        if (request.kind === "CANCEL") {
          params.cancel_at = boundary(request.effectiveOn, request.timezone);
          if (request.noticeBillingDecision === "WAIVE_FUTURE") params.pause_collection = { behavior: "void" };
        } else if (request.kind === "FREEZE") {
          params.pause_collection = { behavior: "void", resumes_at: boundary(request.resumeOn!, request.timezone) };
        } else if (request.kind === "WITHDRAW") {
          params.cancel_at = "";
          params.cancel_at_period_end = false;
          params.pause_collection = request.preservePauseUntil ? { behavior: "void", resumes_at: request.preservePauseUntil } : "";
        } else params.pause_collection = "";
        await stripe.subscriptions.update(request.subscriptionId, params, options);
      }
    },
  };
}
function providerRequest(payload: Prisma.JsonValue, accountId: string | null): LifecycleProviderRequest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new MembershipLifecycleError("The approved processor request is missing.");
  const value = payload as unknown as LifecycleProviderRequest;
  if (!accountId || !value.subscriptionId || !value.customerId || !value.effectiveOn || !value.timezone) throw new MembershipLifecycleError("The membership needs verified processor account and customer linkage.");
  return { ...value, accountId };
}
async function persistProviderState(operationId: string, update: { state: "RESERVED" | "SUBMITTED" | "REVIEW_REQUIRED"; error?: string; request?: LifecycleProviderRequest }, now: Date) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.financialOperation.findUniqueOrThrow({ where: { id: operationId } });
    await lockClassSchedule(tx, initial.workspaceId); await lockFinancialAccount(tx, initial.workspaceId);
    const operation = await tx.financialOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (update.state === "SUBMITTED" && !operation.submittedAt) {
      const lifecycle = await tx.membershipLifecycleRequest.findUniqueOrThrow({ where: { providerOperationId: operation.id } });
      if (!["APPROVED", "SCHEDULED"].includes(lifecycle.state)) throw new MembershipLifecycleError("This request changed before processor submission. Review it again.");
      const hold = await tx.financialEntitlementHold.findFirst({ where: { workspaceId: operation.workspaceId, targetKind: "MEMBERSHIP", targetId: lifecycle.membershipId, activeSlot: "ACTIVE" } });
      if (hold && hold.operationId !== operation.id) throw new MembershipLifecycleError("Another financial change is still being reconciled for this membership.");
      if (!hold) await tx.financialEntitlementHold.create({ data: { workspaceId: operation.workspaceId, operationId: operation.id, targetKind: "MEMBERSHIP", targetId: lifecycle.membershipId } });
    }
    const payload = update.request ? { ...(operation.payload as Prisma.InputJsonObject), providerRequest: JSON.parse(JSON.stringify(update.request)) } : undefined;
    if (payload && !operation.submittedAt) await tx.financialOperation.update({ where: { id: operation.id }, data: { payload } });
    const updated = await transitionFinancialOperation(tx, operation, update.state, { action: update.state === "SUBMITTED" ? "provider-submission" : "provider-review", message: update.error ?? null }, { ...(update.state === "SUBMITTED" ? { submittedAt: operation.submittedAt ?? now } : {}), lastError: update.error ?? null });
    if (update.state === "REVIEW_REQUIRED") await queueFinancialReview(tx, { workspaceId: operation.workspaceId, sourceKey: `membership-lifecycle:${operation.id}`, memberId: operation.beneficiaryMemberId, payerAccountId: operation.payerAccountId, operationId: operation.id, reason: update.error ?? "Membership billing change needs processor reconciliation." });
    return updated;
  });
}
async function deferRequest(requestId: string) {
  await prisma.$transaction(async (tx) => {
    const initial = await tx.membershipLifecycleRequest.findUniqueOrThrow({ where: { id: requestId } });
    await lockClassSchedule(tx, initial.workspaceId);
    const request = await tx.membershipLifecycleRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.state === "APPROVED") {
      await tx.membershipLifecycleRequest.update({ where: { id: request.id }, data: { state: "SCHEDULED", version: { increment: 1 } } });
      await tx.membershipLifecycleEvent.create({ data: { requestId, version: request.version + 1, state: "SCHEDULED", detail: { reason: "Wait for the final ordinary billing period before pausing collection." } } });
    }
  });
}
/** Stopping renewals and stopping collection of old invoices are different provider operations.
 * A future cancellation must leave notice-period debt retries untouched. */
async function reconcileDebtCollection(operation: FinancialOperation, request: MembershipLifecycleRequest, provider: LifecycleProviderRequest, evidence: MembershipLifecycleProviderEvidence, gateway: MembershipLifecycleGateway, now: Date) {
  if (provider.kind !== "CANCEL" || provider.collectExistingDebt || local(Math.floor(now.getTime() / 1000), provider.timezone) < provider.effectiveOn) return evidence;
  if (!["canceled", "incomplete_expired"].includes(evidence.status) && evidence.cancelAt !== boundary(provider.effectiveOn, provider.timezone)) return evidence;
  const debtRequest: LifecycleProviderRequest = { ...provider, providerAction: "STOP_DEBT_COLLECTION" };
  let debtOperation = await prisma.$transaction(async (tx) => {
    await lockClassSchedule(tx, operation.workspaceId); await lockFinancialAccount(tx, operation.workspaceId);
    const current = await tx.membershipLifecycleRequest.findUniqueOrThrow({ where: { id: request.id } });
    if (["WITHDRAWN", "SUPERSEDED"].includes(current.state)) throw new MembershipLifecycleError("The cancellation changed before old-invoice collection could be stopped.");
    return reserveFinancialOperation(tx, { workspaceId: operation.workspaceId, operationKey: `membership-lifecycle-debt:${request.id}`, kind: "STOP_RENEWALS", actorUserId: operation.actorUserId ?? undefined, beneficiaryMemberId: operation.beneficiaryMemberId ?? undefined, payerAccountId: operation.payerAccountId ?? undefined, targetId: request.membershipId, providerAccountId: provider.accountId, payload: { purpose: "STOP_EXISTING_DEBT_COLLECTION", requestId: request.id, providerRequest: JSON.parse(JSON.stringify(debtRequest)) } });
  });
  const save = async (state: "SUBMITTED" | "SUCCEEDED" | "REVIEW_REQUIRED", message?: string) => prisma.$transaction(async (tx) => {
    await lockClassSchedule(tx, operation.workspaceId); await lockFinancialAccount(tx, operation.workspaceId);
    const fresh = await tx.financialOperation.findUniqueOrThrow({ where: { id: debtOperation.id } });
    const updated = await transitionFinancialOperation(tx, fresh, state, { action: "stop-existing-debt-collection", message: message ?? null }, { lastError: message ?? null, ...(state === "SUBMITTED" ? { submittedAt: fresh.submittedAt ?? now } : {}), ...(state === "SUCCEEDED" ? { settledAt: now, providerReference: provider.subscriptionId, result: JSON.parse(JSON.stringify(evidence)) } : {}) });
    if (state === "REVIEW_REQUIRED") await queueFinancialReview(tx, { workspaceId: operation.workspaceId, sourceKey: `lifecycle-debt:${request.id}:provider`, memberId: operation.beneficiaryMemberId, payerAccountId: operation.payerAccountId, operationId: fresh.id, reason: message ?? "Verify automatic collection is stopped before completing cancellation." });
    return updated;
  });
  try {
    if (evidence.existingDebtCollectionStopped) { await save("SUCCEEDED"); return evidence; }
    if (debtOperation.status === "SUCCEEDED") throw new MembershipLifecycleError("Automatic collection was enabled after its confirmed stop. Review the affected invoices before completing cancellation.");
    if (debtOperation.status === "REVIEW_REQUIRED" || (debtOperation.submittedAt && now.getTime() - debtOperation.submittedAt.getTime() >= 23 * 3600000)) throw new MembershipLifecycleError("The earlier old-invoice stop is uncertain beyond the safe replay window. Verify the existing invoices before another change.");
    debtOperation = await save("SUBMITTED");
    await gateway.change(debtRequest, debtOperation.providerIdempotencyKey);
    evidence = await gateway.retrieve(provider);
    if (!evidence.existingDebtCollectionStopped) throw new MembershipLifecycleError("The processor has not confirmed that automatic collection of old invoices is stopped.");
    await save("SUCCEEDED");
    return evidence;
  } catch (error) {
    if (error instanceof MembershipLifecycleError) await save("REVIEW_REQUIRED", error.message);
    throw error;
  }
}
/** Internal worker path; HTTP callers must use the authenticated wrapper below. */
async function reconcileOperation(operationId: string, gateway: MembershipLifecycleGateway, now: Date) {
  let operation = await prisma.financialOperation.findUniqueOrThrow({ where: { id: operationId } });
  const request = await prisma.membershipLifecycleRequest.findUniqueOrThrow({ where: { providerOperationId: operation.id } });
  if (["COMPLETE", "WITHDRAWN", "SUPERSEDED"].includes(request.state)) return { state: request.state, requestId: request.id };
  const payload = operation.payload as Prisma.JsonObject;
  let provider = providerRequest(payload.providerRequest ?? payload, operation.providerAccountId);
  try {
    let evidence = await gateway.retrieve(provider);
    evidence = await reconcileDebtCollection(operation, request, provider, evidence, gateway, now);
    // Retrieving first recovers a lost response even after the idempotency-key retention window.
    try {
      const confirmed = await applyMembershipLifecycleEvidence({ operationId, evidence, now });
      return { state: confirmed.state, requestId: request.id };
    } catch (error) {
      if (!(error instanceof MembershipLifecycleError) || !error.message.includes("has not confirmed")) throw error;
    }
    if (operation.status === "SUCCEEDED") throw new MembershipLifecycleError("The processor no longer matches this confirmed change. Review it before changing billing again.");
    if (operation.submittedAt && now.getTime() - operation.submittedAt.getTime() >= 23 * 60 * 60 * 1000) throw new MembershipLifecycleError("The earlier processor response is still uncertain. Reconcile the existing subscription; do not submit a new billing change with an expired retry key.");
    if (operation.status === "REVIEW_REQUIRED") return { state: "REVIEW_REQUIRED", requestId: request.id };
    const today = local(Math.floor(now.getTime() / 1000), provider.timezone);
    if (!operation.submittedAt && provider.kind === "FREEZE") {
      if (local(evidence.currentPeriodEnd, provider.timezone) < provider.effectiveOn) { await deferRequest(request.id); return { state: "SCHEDULED", requestId: request.id }; }
      if (today >= provider.effectiveOn && evidence.pauseBehavior !== "void") throw new MembershipLifecycleError("The freeze boundary arrived before the processor pause was verified. Review any intervening renewal and reconcile before confirming the freeze.");
    }
    if (!operation.submittedAt && provider.kind === "RESUME" && today < provider.effectiveOn) { await deferRequest(request.id); return { state: "SCHEDULED", requestId: request.id }; }
    if (!operation.submittedAt) {
      const activeFreeze = provider.kind === "WITHDRAW" ? await prisma.membershipLifecycleRequest.findFirst({ where: { membershipId: request.membershipId, kind: "FREEZE", activeSlot: "ACTIVE", confirmedAt: { not: null }, resumeOn: { gt: now } } }) : null;
      provider = { ...provider, providerAction: provider.kind === "CANCEL" && boundary(provider.effectiveOn, provider.timezone) <= Math.floor(now.getTime() / 1000) ? "CANCEL_NOW" : "UPDATE", preservePauseUntil: activeFreeze?.resumeOn ? boundary(activeFreeze.resumeOn.toISOString().slice(0, 10), provider.timezone) : null };
      operation = await persistProviderState(operation.id, { state: "SUBMITTED", request: provider }, now);
    }
    await gateway.change(provider, operation.providerIdempotencyKey);
    evidence = await gateway.retrieve(provider);
    evidence = await reconcileDebtCollection(operation, request, provider, evidence, gateway, now);
    const confirmed = await applyMembershipLifecycleEvidence({ operationId, evidence, now });
    return { state: confirmed.state, requestId: request.id };
  } catch (error) {
    const message = error instanceof MembershipLifecycleError ? error.message : "The processor outcome is uncertain. The existing request remains open for reconciliation.";
    // Network errors can be retried under the same key; semantic or aged uncertainty needs review.
    await persistProviderState(operation.id, { state: error instanceof MembershipLifecycleError ? "REVIEW_REQUIRED" : operation.submittedAt ? "SUBMITTED" : "RESERVED", error: message }, now);
    return { state: error instanceof MembershipLifecycleError ? "REVIEW_REQUIRED" : "PENDING_PROVIDER", requestId: request.id };
  }
}
export async function processMembershipLifecycleChange(actor: MembershipLifecycleActor, input: { requestId: string; reviewToken: string; override?: MembershipLifecycleOverride }, options: { gateway?: MembershipLifecycleGateway; now?: Date } = {}) {
  const approved = await approveMembershipLifecycleChange(actor, input, { now: options.now });
  return reconcileOperation(approved.operation.id, options.gateway ?? createStripeMembershipLifecycleGateway(), options.now ?? new Date());
}
export async function retryMembershipLifecycleChange(actor: MembershipLifecycleActor, requestId: string, options: { gateway?: MembershipLifecycleGateway; now?: Date } = {}) {
  const request = await prisma.membershipLifecycleRequest.findFirst({ where: { id: requestId, workspaceId: actor.workspaceId } });
  if (!request?.providerOperationId) throw new MembershipLifecycleError("This request has not been approved yet.");
  await getMembershipLifecycle(actor, request.membershipId);
  return reconcileOperation(request.providerOperationId, options.gateway ?? createStripeMembershipLifecycleGateway(), options.now ?? new Date());
}
/** Run alongside the existing server-side billing/notification worker and after verified subscription webhooks. */
export async function reconcileDueMembershipLifecycle(options: { workspaceId?: string; subscriptionId?: string; gateway?: MembershipLifecycleGateway; now?: Date; limit?: number } = {}) {
  const rows = await prisma.membershipLifecycleRequest.findMany({ where: { ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}), ...(options.subscriptionId ? { membership: { stripeSubscriptionId: options.subscriptionId } } : {}), providerOperationId: { not: null }, state: { in: ["APPROVED", "SCHEDULED", "CONFIRMED", "RECONCILIATION_REQUIRED"] } }, orderBy: { updatedAt: "asc" }, take: Math.min(options.limit ?? 100, 500) });
  const results = [];
  for (const request of rows) {
    results.push(await reconcileOperation(request.providerOperationId!, options.gateway ?? createStripeMembershipLifecycleGateway(), options.now ?? new Date()));
    await prisma.membershipLifecycleRequest.update({ where: { id: request.id }, data: { updatedAt: options.now ?? new Date() } });
  }
  return results;
}
