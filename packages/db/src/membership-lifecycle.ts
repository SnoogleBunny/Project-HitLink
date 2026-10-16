import { Prisma, type PrismaClient, type MembershipLifecycleRequest, type MemberMembership } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { toDateOnlyString, dateOnlyStringToUtcDate, parseDateOnlyString, getZonedDateTimeAsUtc, addDays } from "./occurrences.js";
import { readAcceptedMembershipTerms, cancelMembershipFundedBookingsTx } from "./membership-allowances.js";
import { parseMembershipLifecyclePolicy, type MembershipLifecyclePolicy } from "./membership-lifecycle-policy.js";
import { financialRequestHash, lockFinancialAccount, reserveFinancialOperation, transitionFinancialOperation, queueFinancialReview } from "./financial-operations.js";
import { financialEntitlementHoldReason } from "./entitlement-holds.js";
import { recomputeMembershipBilling } from "./invoice-reconciliation.js";
import { memberNotificationRecipients } from "./member-notification-recipients.js";

export class MembershipLifecycleError extends Error {}
export interface MembershipLifecycleActor { workspaceId: string; userId: string }
export type MembershipLifecycleKind = "CANCEL" | "FREEZE" | "WITHDRAW" | "RESUME";
export interface MembershipLifecycleOverride { effectiveOn?: string; noticeBillingDecision?: "CONTINUE" | "WAIVE_FUTURE"; reason?: string }
type Tx = Prisma.TransactionClient;
type Db = PrismaClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const iso = (date: Date | null) => date ? toDateOnlyString(date) : null;
const localDate = (date: Date, timezone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
function checkDate(value: string) { if (parseDateOnlyString(value).status === "error") throw new MembershipLifecycleError("Choose a valid date."); return value; }
export function shiftLifecycleMonth(anchor: string, months: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + months, 1));
  return toDateOnlyString(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d!, new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()))));
}
export function lifecycleBillingBoundary(anchor: string, date: string, strictlyAfter = false): string {
  let month = (Number(date.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(date.slice(5, 7)) - Number(anchor.slice(5, 7));
  let boundary = shiftLifecycleMonth(anchor, month);
  if (boundary < date || (strictlyAfter && boundary === date)) boundary = shiftLifecycleMonth(anchor, ++month);
  return boundary;
}
export function membershipCancellationDates(input: { receivedOn: string; anchor: string; policy: MembershipLifecyclePolicy }) {
  const { receivedOn, anchor, policy } = input;
  checkDate(receivedOn); checkDate(anchor);
  const next = lifecycleBillingBoundary(anchor, receivedOn, true);
  const noticeEndsOn = policy.noticeUnit === "DAYS" ? addDays(receivedOn, policy.noticeLength) : policy.noticeUnit === "CALENDAR_MONTHS" ? shiftLifecycleMonth(receivedOn, policy.noticeLength) : policy.noticeLength === 0 ? receivedOn : shiftLifecycleMonth(anchor, (Number(next.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(next.slice(5, 7)) - Number(anchor.slice(5, 7)) + policy.noticeLength - 1);
  return { noticeEndsOn, effectiveOn: policy.alignment === "NEXT_BILLING_BOUNDARY" ? lifecycleBillingBoundary(anchor, noticeEndsOn) : noticeEndsOn };
}
async function locked<T>(db: Db, actor: MembershipLifecycleActor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${actor.workspaceId}`}))`;
    await lockFinancialAccount(tx, actor.workspaceId);
    return fn(tx);
  });
}
async function authorize(tx: Tx, actor: MembershipLifecycleActor, membershipId: string) {
  const membership = await tx.memberMembership.findFirst({ where: { id: membershipId, workspaceId: actor.workspaceId }, include: { member: true, workspace: { include: { location: true, stripeSettings: true } } } });
  const staff = await tx.workspaceUser.findFirst({ where: { workspaceId: actor.workspaceId, userId: actor.userId, isActive: true } });
  if (!membership || !staff || staff.role === "COACH") throw new MembershipLifecycleError("This account cannot manage this membership.");
  const owner = staff.role === "OWNER";
  if (!owner && membership.member.userId !== actor.userId) {
    const grant = await tx.memberPortalGrant.findUnique({ where: { workspaceId_userId_memberId: { workspaceId: actor.workspaceId, userId: actor.userId, memberId: membership.memberId } } });
    if (!grant || grant.revokedAt || !grant.canPay || !grant.canBook || !await tx.familyLink.findFirst({ where: { workspaceId: actor.workspaceId, childMemberId: membership.memberId, guardianId: grant.guardianId } })) throw new MembershipLifecycleError("You no longer have permission to manage this family membership.");
  }
  return { membership, owner, staffId: staff.id, timezone: membership.allowanceTimezone ?? membership.workspace.location?.timezone ?? "UTC" };
}
async function event(tx: Tx, request: MembershipLifecycleRequest, state: string, actorUserId: string | null, detail: unknown, data: Prisma.MembershipLifecycleRequestUpdateInput = {}) {
  const updated = await tx.membershipLifecycleRequest.update({ where: { id: request.id }, data: { ...data, state, version: { increment: 1 } } });
  await tx.membershipLifecycleEvent.create({ data: { requestId: request.id, version: updated.version, state, actorUserId, detail: json(detail) } });
  return updated;
}
function acceptedPolicy(membership: MemberMembership) { return parseMembershipLifecyclePolicy(readAcceptedMembershipTerms(membership.acceptedTerms)?.lifecyclePolicy); }
function anchorOf(membership: MemberMembership) { return iso(membership.allowanceAnchorDate) ?? toDateOnlyString(membership.startedAt); }
async function membershipNotice(tx: Tx, workspaceId: string, memberId: string, requestId: string, state: string, now: Date) {
  const recipients = await memberNotificationRecipients(tx, workspaceId, [memberId]);
  for (const recipient of recipients) await tx.notificationJob.create({ data: { workspaceId, templateKind: "ANNOUNCEMENT", recipientEmail: recipient.email, recipientName: recipient.name, subject: state === "RECEIVED" ? "Membership request received" : "Membership request updated", body: "There is an update to a membership request. Sign in to your HitLink member portal to review its receipt, dates and current status.", context: { kind: "MEMBER_ACCESS", memberId }, dedupeKey: `membership-lifecycle:${requestId}:${state}:${recipient.email.toLowerCase()}`, status: "PENDING", nextAttemptAt: now } });
}
export async function requestMembershipLifecycleChange(actor: MembershipLifecycleActor, input: { membershipId: string; kind: MembershipLifecycleKind; operationKey: string; fromDate?: string; toDate?: string; reason?: string; parentRequestId?: string }, options: { db?: Db; now?: Date } = {}) {
  const now = options.now ?? new Date();
  if (!input.operationKey.trim() || input.operationKey.length > 150 || !["CANCEL", "FREEZE", "WITHDRAW", "RESUME"].includes(input.kind)) throw new MembershipLifecycleError("This membership request is invalid.");
  const hash = financialRequestHash(input);
  return locked(options.db ?? prisma, actor, async (tx) => {
    const { membership, owner, timezone } = await authorize(tx, actor, input.membershipId);
    const prior = await tx.membershipLifecycleRequest.findUnique({ where: { workspaceId_operationKey: { workspaceId: actor.workspaceId, operationKey: input.operationKey } } });
    if (prior) { if (prior.inputHash !== hash || prior.requesterUserId !== actor.userId) throw new MembershipLifecycleError("This request key belongs to different details."); return prior; }
    if (["CANCELLED", "ENDED"].includes(membership.status)) throw new MembershipLifecycleError("This membership has already ended.");
    const policy = acceptedPolicy(membership);
    // Receipt is still durable for legacy contracts; approval requires a member-beneficial owner decision.
    if (!owner && policy && ((input.kind === "CANCEL" && !policy.allowMemberCancellation) || (input.kind === "FREEZE" && !policy.allowMemberFreeze))) throw new MembershipLifecycleError("Contact the gym owner to request this membership change.");
    const active = await tx.membershipLifecycleRequest.findFirst({ where: { membershipId: membership.id, kind: input.kind, activeSlot: "ACTIVE" } });
    if (active) return active;
    const today = localDate(now, timezone);
    let effectiveOn: string | null = null, noticeEndsOn: string | null = null;
    if (input.kind === "CANCEL" && policy) ({ effectiveOn, noticeEndsOn } = membershipCancellationDates({ receivedOn: today, anchor: anchorOf(membership), policy }));
    if (input.kind === "FREEZE") {
      if (!policy?.freezeEnabled) throw new MembershipLifecycleError("This contract needs an accepted freeze policy before a freeze can be requested.");
      if (!input.fromDate || !input.toDate) throw new MembershipLifecycleError("Choose a finite freeze start and resume date.");
      checkDate(input.fromDate); checkDate(input.toDate);
      const anchor = anchorOf(membership);
      if (input.fromDate < today || input.toDate <= input.fromDate || lifecycleBillingBoundary(anchor, input.fromDate) !== input.fromDate || lifecycleBillingBoundary(anchor, input.toDate) !== input.toDate) throw new MembershipLifecycleError("Freezes must begin and end on billing-cycle boundaries. Other dates need a separate billing agreement.");
      if (input.toDate > shiftLifecycleMonth(input.fromDate, policy.freezeMaxCycles)) throw new MembershipLifecycleError("This freeze exceeds the accepted policy's maximum length.");
      effectiveOn = input.fromDate;
    }
    if (input.kind === "WITHDRAW" || input.kind === "RESUME") {
      const parent = input.parentRequestId ? await tx.membershipLifecycleRequest.findFirst({ where: { id: input.parentRequestId, membershipId: membership.id, activeSlot: "ACTIVE", kind: input.kind === "WITHDRAW" ? "CANCEL" : "FREEZE" } }) : null;
      if (!parent) throw new MembershipLifecycleError("Choose the active cancellation or freeze to change.");
      if (input.kind === "WITHDRAW" && parent.effectiveOn && iso(parent.effectiveOn)! <= today) throw new MembershipLifecycleError("Cancellation is already effective. A new membership requires new acceptance.");
      effectiveOn = input.kind === "RESUME" ? checkDate(input.fromDate ?? today) : today;
      if (input.kind === "RESUME" && lifecycleBillingBoundary(anchorOf(membership), effectiveOn) !== effectiveOn) throw new MembershipLifecycleError("Early resume is supported on a billing boundary. Other dates require a complete billing agreement.");
    }
    const request = await tx.membershipLifecycleRequest.create({ data: { workspaceId: actor.workspaceId, membershipId: membership.id, operationKey: input.operationKey, inputHash: hash, requesterUserId: actor.userId, kind: input.kind, receivedAt: now, policy: json(policy ?? { legacyReviewRequired: true }), policyVersion: policy?.version ?? 0, requestedFrom: input.fromDate ? dateOnlyStringToUtcDate(input.fromDate) : null, requestedUntil: input.toDate ? dateOnlyStringToUtcDate(input.toDate) : null, effectiveOn: effectiveOn ? dateOnlyStringToUtcDate(effectiveOn) : null, noticeEndsOn: noticeEndsOn ? dateOnlyStringToUtcDate(noticeEndsOn) : null, resumeOn: input.kind === "FREEZE" ? dateOnlyStringToUtcDate(input.toDate!) : null, reason: input.reason?.trim().slice(0, 2000) || null, parentRequestId: input.parentRequestId ?? null, events: { create: { version: 1, actorUserId: actor.userId, state: "RECEIVED", detail: { receivedAt: now.toISOString(), policyVersion: policy?.version ?? 0 } } } } });
    if (input.kind === "CANCEL") await tx.memberMembership.update({ where: { id: membership.id }, data: { cancelRequestedAt: now } });
    await membershipNotice(tx, actor.workspaceId, membership.memberId, request.id, "RECEIVED", request.receivedAt);
    return request;
  });
}

export interface MembershipLifecycleReview {
  requestId: string; kind: string; version: number; receivedAt: string; acceptedPolicyVersion: number; policy: MembershipLifecyclePolicy | null;
  effectiveOn: string; noticeEndsOn: string | null; resumeOn: string | null; timezone: string;
  renewals: Array<{ date: string; subtotalCents: number; currency: string }>; finalPlannedRenewal: string | null;
  affectedBookings: Array<{ id: string; date: string; title: string }>; outstandingDebtCents: number; debtCollection: boolean;
  notices: string[]; reviewToken: string; override: MembershipLifecycleOverride; ownerApprovalRequired: boolean;
}
async function reviewTx(tx: Tx, actor: MembershipLifecycleActor, requestId: string, override: MembershipLifecycleOverride, now: Date): Promise<MembershipLifecycleReview> {
  const request = await tx.membershipLifecycleRequest.findFirst({ where: { id: requestId, workspaceId: actor.workspaceId } });
  if (!request) throw new MembershipLifecycleError("This request was not found.");
  const { membership, owner, timezone } = await authorize(tx, actor, request.membershipId);
  const policy = parseMembershipLifecyclePolicy(request.policy), terms = readAcceptedMembershipTerms(membership.acceptedTerms);
  const hasOverride = !!(override.effectiveOn || override.noticeBillingDecision || override.reason);
  if (hasOverride && (!owner || !override.reason?.trim())) throw new MembershipLifecycleError("An owner exception needs a recorded reason.");
  const effectiveOn = override.effectiveOn ? checkDate(override.effectiveOn) : iso(request.effectiveOn);
  if (!effectiveOn) throw new MembershipLifecycleError("Legacy notice terms need owner review. Record an agreed, member-beneficial end date and reason.");
  if (!policy && (request.kind !== "CANCEL" || !owner || effectiveOn > localDate(request.receivedAt, timezone))) throw new MembershipLifecycleError("Unknown legacy terms cannot add a new notice period. Agree new terms separately or waive notice.");
  if (override.effectiveOn && request.effectiveOn && effectiveOn > iso(request.effectiveOn)!) throw new MembershipLifecycleError("An owner exception cannot extend an accepted notice period. New adverse terms require separate member acceptance.");
  if (request.kind === "FREEZE" && override.effectiveOn && effectiveOn !== iso(request.effectiveOn)) throw new MembershipLifecycleError("Submit a new finite freeze request to change its dates.");
  if (request.kind === "FREEZE" && await tx.membershipLifecycleRequest.findFirst({ where: { membershipId: membership.id, kind: "CANCEL", activeSlot: "ACTIVE", effectiveOn: { lte: request.resumeOn! } } })) throw new MembershipLifecycleError("The cancellation takes precedence. Resolve its date before approving this freeze.");
  if (request.kind === "RESUME" && await tx.membershipLifecycleRequest.findFirst({ where: { membershipId: membership.id, kind: "CANCEL", activeSlot: "ACTIVE", effectiveOn: { lte: dateOnlyStringToUtcDate(effectiveOn) } } })) throw new MembershipLifecycleError("Cancellation is effective before this resume. Access cannot restart.");
  if (policy?.noticeBilling === "OWNER_REVIEW" && request.kind === "CANCEL" && !override.noticeBillingDecision) throw new MembershipLifecycleError("The owner must decide whether future notice-period renewals continue or are waived.");
  const waive = override.noticeBillingDecision === "WAIVE_FUTURE";
  const anchor = anchorOf(membership), today = localDate(now, timezone);
  const next = membership.nextBillingDate ? localDate(membership.nextBillingDate, timezone) : lifecycleBillingBoundary(anchor, today, true);
  const renewals: MembershipLifecycleReview["renewals"] = [];
  if (!waive && request.kind === "CANCEL" && terms) {
    for (let date = next; date < effectiveOn; date = lifecycleBillingBoundary(anchor, date, true)) {
      if (renewals.length > 1200) throw new MembershipLifecycleError("This notice requires a separately reviewed billing schedule.");
      renewals.push({ date, subtotalCents: terms.monthlyPriceCents, currency: terms.currency });
    }
  }
  const bookings = ["CANCEL", "FREEZE"].includes(request.kind) ? await tx.classBooking.findMany({ where: { workspaceId: actor.workspaceId, fundingMembershipId: membership.id, status: "BOOKED", scheduledForDate: { gte: dateOnlyStringToUtcDate(effectiveOn), ...(request.kind === "FREEZE" && request.resumeOn ? { lt: request.resumeOn } : {}) } }, include: { classTemplate: { select: { title: true, program: { select: { name: true } } } } }, orderBy: [{ scheduledForDate: "asc" }, { id: "asc" }] }) : [];
  const ambiguous = await tx.classBooking.count({ where: { workspaceId: actor.workspaceId, memberId: membership.memberId, bookingType: "MEMBERSHIP", fundingMembershipId: null, status: "BOOKED", scheduledForDate: { gte: dateOnlyStringToUtcDate(effectiveOn) } } });
  if (ambiguous) throw new MembershipLifecycleError("Some future reservations have unconfirmed membership funding. Resolve those bookings before approving this change.");
  const held = await financialEntitlementHoldReason({ workspaceId: actor.workspaceId, targets: [{ targetKind: "MEMBERSHIP", targetId: membership.id }, ...bookings.map((b) => ({ targetKind: "BOOKING", targetId: b.id }))], db: tx });
  if (held) throw new MembershipLifecycleError(held);
  const debt = await tx.invoice.findMany({ where: { memberMembershipId: membership.id, status: { in: ["OPEN", "UNCOLLECTIBLE"] }, amountDueCents: { gt: 0 } }, orderBy: { id: "asc" } });
  const result = { requestId, kind: request.kind, version: request.version, receivedAt: request.receivedAt.toISOString(), acceptedPolicyVersion: request.policyVersion, policy, effectiveOn, noticeEndsOn: iso(request.noticeEndsOn), resumeOn: iso(request.resumeOn), timezone, renewals, finalPlannedRenewal: renewals.at(-1)?.date ?? null, affectedBookings: bookings.map((b) => ({ id: b.id, date: toDateOnlyString(b.scheduledForDate), title: b.classTemplate.title ?? b.classTemplate.program.name })), outstandingDebtCents: debt.reduce((sum, i) => sum + i.amountDueCents, 0), debtCollection: policy?.collectExistingDebt ?? false,
    notices: ["Tax, if applicable, follows the accepted billing agreement.", "Existing debt is separate from membership access.", ...(request.kind === "FREEZE" ? ["Billing and allowance anchors stay unchanged. No quota carries over and cancelled seats are not recreated.", "The processor pause is scheduled after the final ordinary renewal before the freeze."] : []), ...(request.kind === "CANCEL" && effectiveOn !== lifecycleBillingBoundary(anchor, effectiveOn) ? ["This end date is inside a paid period. No automatic proration or refund is included; the owner must settle any agreed adjustment separately."] : []), ...(effectiveOn < today ? ["The accepted boundary has already passed. Any renewal at or after it needs void or refund reconciliation."] : [])], override, ownerApprovalRequired: policy?.approvalRequired ?? true };
  return { ...result, reviewToken: financialRequestHash({ result, membership: { updatedAt: membership.updatedAt, acceptedTerms: membership.acceptedTerms, subscription: membership.stripeSubscriptionId, anchor }, bookings: bookings.map((b) => [b.id, b.updatedAt, b.fundingRevision]), debt: debt.map((i) => [i.id, i.updatedAt, i.status, i.amountDueCents]) }) };
}
export async function reviewMembershipLifecycleChange(actor: MembershipLifecycleActor, input: { requestId: string; override?: MembershipLifecycleOverride }, options: { db?: Db; now?: Date } = {}) {
  return locked(options.db ?? prisma, actor, (tx) => reviewTx(tx, actor, input.requestId, input.override ?? {}, options.now ?? new Date()));
}
export async function approveMembershipLifecycleChange(actor: MembershipLifecycleActor, input: { requestId: string; reviewToken: string; override?: MembershipLifecycleOverride }, options: { db?: Db; now?: Date } = {}) {
  const now = options.now ?? new Date();
  return locked(options.db ?? prisma, actor, async (tx) => {
    const request = await tx.membershipLifecycleRequest.findFirst({ where: { id: input.requestId, workspaceId: actor.workspaceId } });
    if (!request) throw new MembershipLifecycleError("This request was not found.");
    const { membership, owner } = await authorize(tx, actor, request.membershipId);
    if (request.providerOperationId) return { request, operation: await tx.financialOperation.findUniqueOrThrow({ where: { id: request.providerOperationId } }) };
    if (request.state !== "RECEIVED") throw new MembershipLifecycleError("This request is no longer awaiting approval.");
    const review = await reviewTx(tx, actor, request.id, input.override ?? {}, now);
    if (!owner && (review.ownerApprovalRequired || request.kind === "RESUME" || request.kind === "WITHDRAW")) throw new MembershipLifecycleError("The gym owner must approve this request.");
    if (review.reviewToken !== input.reviewToken) throw new MembershipLifecycleError("The membership, bookings or money changed. Review the current preview before approving.");
    if (!membership.stripeSubscriptionId || !membership.workspace.stripeSettings?.stripeAccountId) throw new MembershipLifecycleError("The recurring subscription needs verified provider linkage before billing changes can be applied.");
    const payload = { requestId: request.id, membershipId: membership.id, subscriptionId: membership.stripeSubscriptionId, customerId: membership.stripeCustomerId, kind: request.kind, effectiveOn: review.effectiveOn, resumeOn: review.resumeOn, timezone: review.timezone, anchor: anchorOf(membership), noticeBillingDecision: input.override?.noticeBillingDecision ?? "CONTINUE", collectExistingDebt: review.debtCollection, acceptedPolicyVersion: review.acceptedPolicyVersion, approvedReview: review };
    const operation = await reserveFinancialOperation(tx, { workspaceId: actor.workspaceId, operationKey: `membership-lifecycle:${request.id}`, kind: request.kind === "CANCEL" ? "STOP_RENEWALS" : request.kind === "WITHDRAW" ? "RESTORE_RENEWALS" : request.kind === "FREEZE" ? "FREEZE" : "RESUME", actorUserId: actor.userId, beneficiaryMemberId: membership.memberId, payerAccountId: membership.payerAccountId ?? undefined, targetId: membership.id, providerAccountId: membership.workspace.stripeSettings.stripeAccountId, payload: json(payload) as Prisma.InputJsonObject });
    const updated = await event(tx, request, "APPROVED", actor.userId, { reviewedToken: review.reviewToken, acceptedPolicyVersion: review.acceptedPolicyVersion }, { effectiveOn: dateOnlyStringToUtcDate(review.effectiveOn), ownerExceptionReason: input.override?.reason ?? null, decision: json(review), providerOperationId: operation.id, reviewedByUserId: actor.userId });
    return { request: updated, operation };
  });
}
export async function getMembershipLifecycle(actor: MembershipLifecycleActor, membershipId: string, options: { db?: Db } = {}) {
  return locked(options.db ?? prisma, actor, async (tx) => {
    const { membership, owner } = await authorize(tx, actor, membershipId);
    return { membershipId, policy: acceptedPolicy(membership), owner, requests: await tx.membershipLifecycleRequest.findMany({ where: { membershipId }, include: { events: { orderBy: { version: "asc" } } }, orderBy: { receivedAt: "desc" } }) };
  });
}

export interface MembershipLifecycleProviderEvidence {
  subscriptionId: string; accountId: string; customerId: string; status: string;
  cancelAt: number | null; pauseBehavior: string | null; pauseResumesAt: number | null;
  currentPeriodEnd: number; existingDebtCollectionStopped: boolean;
}
export async function applyMembershipLifecycleEvidence(input: { operationId: string; evidence: MembershipLifecycleProviderEvidence; db?: Db; now?: Date }) {
  const db = input.db ?? prisma, now = input.now ?? new Date();
  const initial = await db.financialOperation.findUniqueOrThrow({ where: { id: input.operationId } });
  return locked(db, { workspaceId: initial.workspaceId, userId: initial.actorUserId ?? "system" }, async (tx) => {
    const operation = await tx.financialOperation.findUniqueOrThrow({ where: { id: initial.id } });
    const request = await tx.membershipLifecycleRequest.findUniqueOrThrow({ where: { providerOperationId: operation.id } });
    const membership = await tx.memberMembership.findUniqueOrThrow({ where: { id: request.membershipId }, include: { member: true } });
    const payload = operation.payload as { subscriptionId: string; customerId: string | null; effectiveOn: string; resumeOn: string | null; timezone: string; noticeBillingDecision: string; collectExistingDebt: boolean };
    const evidence = input.evidence;
    if (evidence.accountId !== operation.providerAccountId || evidence.subscriptionId !== payload.subscriptionId || !payload.customerId || evidence.customerId !== payload.customerId) throw new MembershipLifecycleError("The processor subscription does not match the approved membership.");
    const boundary = Math.floor(getZonedDateTimeAsUtc({ dateString: payload.effectiveOn, minutes: 0, timezone: payload.timezone }).getTime() / 1000);
    const resumeBoundary = payload.resumeOn ? Math.floor(getZonedDateTimeAsUtc({ dateString: payload.resumeOn, minutes: 0, timezone: payload.timezone }).getTime() / 1000) : null;
    const ended = ["canceled", "incomplete_expired"].includes(evidence.status);
    const today = localDate(now, payload.timezone);
    let verified = false;
    if (request.kind === "CANCEL") verified = (ended || evidence.cancelAt === boundary) && (payload.noticeBillingDecision !== "WAIVE_FUTURE" || ended || evidence.pauseBehavior === "void") && (today < payload.effectiveOn || payload.collectExistingDebt || evidence.existingDebtCollectionStopped);
    if (request.kind === "FREEZE") verified = !ended && (today >= payload.resumeOn! ? evidence.pauseBehavior === null : evidence.pauseBehavior === "void" && evidence.pauseResumesAt === resumeBoundary);
    if (request.kind === "WITHDRAW") verified = !ended && evidence.cancelAt === null;
    if (request.kind === "RESUME") verified = !ended && today >= payload.effectiveOn && evidence.pauseBehavior === null;
    if (!verified) throw new MembershipLifecycleError("The processor has not confirmed the approved billing change.");
    if (["COMPLETE", "WITHDRAWN", "SUPERSEDED"].includes(request.state)) return request;
    await tx.financialEntitlementHold.updateMany({ where: { operationId: operation.id, activeSlot: "ACTIVE" }, data: { activeSlot: null, releasedAt: now } });
    const held = await financialEntitlementHoldReason({ workspaceId: membership.workspaceId, targets: [{ targetKind: "MEMBERSHIP", targetId: membership.id }], db: tx });
    if (held) throw new MembershipLifecycleError(held);
    if (["CANCEL", "FREEZE"].includes(request.kind) && !request.confirmedAt) await cancelMembershipFundedBookingsTx({ workspaceId: membership.workspaceId, membershipId: membership.id, fromDate: payload.effectiveOn, ...(request.kind === "FREEZE" && payload.resumeOn ? { toDate: payload.resumeOn } : {}), reason: request.kind === "CANCEL" ? "Membership ends on the accepted cancellation date." : "Membership is frozen during these dates.", db: tx });
    if (request.kind === "CANCEL") {
      await tx.memberMembership.update({ where: { id: membership.id }, data: { endedAt: new Date(boundary * 1000), cancelAtPeriodEnd: true, ...(today >= payload.effectiveOn ? { status: "CANCELLED", currentMembershipSlot: null } : {}) } });
      const overriddenFreezes = await tx.membershipLifecycleRequest.findMany({ where: { membershipId: membership.id, kind: "FREEZE", activeSlot: "ACTIVE", resumeOn: { gt: dateOnlyStringToUtcDate(payload.effectiveOn) } } });
      for (const freeze of overriddenFreezes) await event(tx, freeze, "SUPERSEDED", operation.actorUserId, { cancellationRequestId: request.id, effectiveOn: payload.effectiveOn }, { activeSlot: null, completedAt: now });
      const erroneous = await tx.invoice.findMany({ where: { memberMembershipId: membership.id, issuedAt: { gte: new Date(boundary * 1000) }, status: { in: ["OPEN", "PAID", "UNCOLLECTIBLE"] } } });
      for (const invoice of erroneous) await queueFinancialReview(tx, { workspaceId: membership.workspaceId, sourceKey: `lifecycle-renewal:${request.id}:${invoice.id}`, memberId: membership.memberId, payerAccountId: membership.payerAccountId, operationId: operation.id, amountCents: invoice.totalCents, currency: invoice.currency, reason: `A renewal invoice was issued at or after the accepted cancellation boundary. Verify its service period, then void unpaid renewal or refund settled renewal. Receipt ${request.receivedAt.toISOString()} must not be extended.` });
      if (today >= payload.effectiveOn && !payload.collectExistingDebt) {
        const remainingDebt = await tx.invoice.findMany({ where: { memberMembershipId: membership.id, status: { in: ["OPEN", "UNCOLLECTIBLE"] }, amountDueCents: { gt: 0 } } });
        for (const invoice of remainingDebt) await queueFinancialReview(tx, { workspaceId: membership.workspaceId, sourceKey: `lifecycle-debt:${request.id}:${invoice.id}`, memberId: membership.memberId, payerAccountId: membership.payerAccountId, operationId: operation.id, amountCents: invoice.amountDueCents, currency: invoice.currency, reason: "Automatic collection stopped at the accepted membership end date. This unpaid amount remains due. Review the agreed recovery, credit or waiver separately; cancellation does not forgive debt." });
      }
    } else if (request.kind === "FREEZE") {
      if (membership.endedAt && membership.endedAt <= now) throw new MembershipLifecycleError("Cancellation takes precedence over this freeze.");
      const inFreeze = today >= payload.effectiveOn && today < payload.resumeOn!;
      await tx.memberMembership.update({ where: { id: membership.id }, data: { frozenFrom: dateOnlyStringToUtcDate(payload.effectiveOn), frozenUntil: dateOnlyStringToUtcDate(payload.resumeOn!), ...(inFreeze ? { status: "FROZEN" } : today >= payload.resumeOn! && membership.status === "FROZEN" ? { status: "ACTIVE", frozenFrom: null, frozenUntil: null } : {}) } });
    } else if (request.kind === "WITHDRAW") {
      if (membership.endedAt && membership.endedAt <= now) throw new MembershipLifecycleError("An effective cancellation cannot be withdrawn.");
      await tx.memberMembership.update({ where: { id: membership.id }, data: { endedAt: null, cancelAtPeriodEnd: false, cancelRequestedAt: null } });
      if (request.parentRequestId) { const parent = await tx.membershipLifecycleRequest.findUniqueOrThrow({ where: { id: request.parentRequestId } }); await event(tx, parent, "WITHDRAWN", operation.actorUserId, { withdrawalRequestId: request.id }, { activeSlot: null, completedAt: now }); }
    } else {
      if (membership.endedAt && membership.endedAt <= now) throw new MembershipLifecycleError("Cancellation takes precedence. Resume cannot restore access.");
      await tx.memberMembership.update({ where: { id: membership.id }, data: { frozenFrom: null, frozenUntil: null, ...(membership.status === "FROZEN" ? { status: "ACTIVE" } : {}) } });
      if (request.parentRequestId) { const parent = await tx.membershipLifecycleRequest.findUniqueOrThrow({ where: { id: request.parentRequestId } }); await event(tx, parent, "COMPLETE", operation.actorUserId, { resumeRequestId: request.id }, { activeSlot: null, completedAt: now }); }
    }
    await recomputeMembershipBilling(tx, membership.id, now);
    if (operation.status !== "SUCCEEDED") await transitionFinancialOperation(tx, operation, "SUCCEEDED", { action: "provider-confirmed", requestId: request.id }, { settledAt: now, providerReference: evidence.subscriptionId, result: json(evidence) as Prisma.InputJsonObject, lastError: null });
    const complete = request.kind === "CANCEL" ? today >= payload.effectiveOn : request.kind === "FREEZE" ? today >= payload.resumeOn! : true;
    const recoveryPending = request.kind === "CANCEL" && await tx.financialReviewCase.count({ where: { workspaceId: membership.workspaceId, OR: [{ sourceKey: { startsWith: `lifecycle-renewal:${request.id}:` } }, { sourceKey: { startsWith: `lifecycle-debt:${request.id}:` } }], resolvedAt: null } }) > 0;
    const state = recoveryPending ? "RECONCILIATION_REQUIRED" : complete ? "COMPLETE" : "CONFIRMED";
    if (request.state === state) return request;
    const updated = await event(tx, request, state, operation.actorUserId, { effectiveOn: payload.effectiveOn, resumeOn: payload.resumeOn, providerSubscriptionId: evidence.subscriptionId }, { confirmedAt: request.confirmedAt ?? now, ...(complete && !recoveryPending ? { completedAt: now, activeSlot: null } : {}) });
    await membershipNotice(tx, membership.workspaceId, membership.memberId, request.id, state, now);
    return updated;
  });
}
