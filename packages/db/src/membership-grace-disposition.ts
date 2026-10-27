import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { classOccurrenceInclude, isUnambiguousClassTime, lockClassSchedule, resolveClassOccurrence } from "./class-occurrences.js";
import { getZonedDateTimeAsUtc, toDateOnlyString } from "./occurrences.js";
import { lockFinancialAccount, queueFinancialReview } from "./financial-operations.js";
import { settleMembershipAllowance } from "./membership-allowances.js";
import { memberNotificationRecipients } from "./member-notification-recipients.js";
import { enqueueNotificationJob } from "./notification-outbox.js";
import { isWorkspaceOperationallyReady } from "./workspace-readiness.js";

export const membershipGraceReceiptKind = "MEMBERSHIP_GRACE_BOOKING_RELEASED";
export type MembershipGraceBasis = "FIXED_GRACE_EXPIRED" | "UNRESOLVED_FAILURE_TIMING";
export interface MembershipGracePage {
  checked: number;
  cancelled: number;
  skipped: number;
  nextBookingId: string | null;
  throughBookingId: string | null;
  workspaceNotReady: boolean;
}
const clockNow = () => new Date();
const failedStatuses = ["PAST_DUE", "PAYMENT_FAILED"] as const;
const pendingDebt = {
  status: { in: ["OPEN", "UNCOLLECTIBLE"] }, amountDueCents: { gt: 0 },
  OR: [{ firstFailedAt: { not: null } }, { lastFailureCode: "payment_failure_time_unknown" }],
} satisfies Prisma.InvoiceWhereInput;

/** Shared order: schedule -> family -> financial -> exact business identities. No member session is invented for system maintenance. */
export async function lockMembershipGraceResourcesTx(tx: Prisma.TransactionClient, workspaceId: string) {
  await lockClassSchedule(tx, workspaceId);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))::text`;
  await lockFinancialAccount(tx, workspaceId);
  await tx.$queryRaw`SELECT id FROM workspaces WHERE id=${workspaceId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM workspace_migrations WHERE "workspaceId"=${workspaceId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM workspace_setup_activations WHERE "workspaceId"=${workspaceId} FOR SHARE`;
}

export function membershipGraceReceiptId(workspaceId: string, bookingId: string, fundingRevision: number) {
  return `membership-grace:${createHash("sha256").update(JSON.stringify([workspaceId, bookingId, fundingRevision])).digest("hex")}`;
}

/** Invoice debt is independent of current membership slot, freeze, archive and other service states. */
function restrictionFor(membership: {
  billingState: { status: string; gracePeriodEndsAt: Date | null } | null;
  _count: { invoices: number };
  invoices: Array<{ id: string; gracePeriodEndsAt: Date | null }>;
}, now: Date): { basis: MembershipGraceBasis; invoiceId: string | null; gracePeriodEndsAt: Date | null } | null {
  const restricting = membership.invoices.find(invoice => !invoice.gracePeriodEndsAt || invoice.gracePeriodEndsAt <= now);
  if (restricting) return { basis: restricting.gracePeriodEndsAt ? "FIXED_GRACE_EXPIRED" : "UNRESOLVED_FAILURE_TIMING", invoiceId: restricting.id, gracePeriodEndsAt: restricting.gracePeriodEndsAt };
  // An unresolved legacy billing state has the same fail-closed meaning as the
  // canonical access guard. Do not make up a first failure or a new grace date.
  const billing = membership.billingState;
  if (membership._count.invoices === 0 && billing && (failedStatuses as readonly string[]).includes(billing.status) && (!billing.gracePeriodEndsAt || billing.gracePeriodEndsAt <= now))
    return { basis: billing.gracePeriodEndsAt ? "FIXED_GRACE_EXPIRED" : "UNRESOLVED_FAILURE_TIMING", invoiceId: null, gracePeriodEndsAt: billing.gracePeriodEndsAt };
  return null;
}

/** Caller owns all three advisories via lockMembershipGraceResourcesTx, in this same READ COMMITTED transaction. */
export async function applyMembershipGraceDispositionTx(tx: Prisma.TransactionClient, input: {
  workspaceId: string;
  membershipId?: string;
  afterBookingId?: string;
  throughBookingId?: string;
  limit?: number;
  /** Deterministic test seam only; never derive this clock from a submitted form or pre-network provider timestamp. */
  graceClock?: () => Date;
}): Promise<MembershipGracePage> {
  const limit = input.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || [input.afterBookingId, input.throughBookingId].some(value => value !== undefined && !/^[A-Za-z0-9:_-]{1,150}$/.test(value)) || (!!input.afterBookingId !== !!input.throughBookingId)) throw new Error("Invalid grace maintenance page.");
  const result: MembershipGracePage = { checked: 0, cancelled: 0, skipped: 0, nextBookingId: null, throughBookingId: null, workspaceNotReady: false };
  const workspace = await tx.workspace.findUnique({ where: { id: input.workspaceId }, include: { migration: true, setupActivation: true } });
  if (!workspace || !isWorkspaceOperationallyReady({ workspaceStatus: workspace.status, setupActivation: workspace.setupActivation, migrationStage: workspace.migration?.stage, ownerReviewAcknowledgedAt: workspace.migration?.ownerReviewAcknowledgedAt, ownerReviewAcknowledgedByUserId: workspace.migration?.ownerReviewAcknowledgedByUserId, operationallyReadyAt: workspace.migration?.operationallyReadyAt, operationallyReadyByUserId: workspace.migration?.operationallyReadyByUserId })) {
    result.workspaceNotReady = true; return result;
  }
  // Query only exact membership funding with unresolved debt. The cursor scans
  // skipped/held/past rows as well, so an early non-actionable row cannot starve
  // later IDs. No tenant-wide member-ID list or unbounded time/history scan.
  const selectionTime = (input.graceClock ?? clockNow)();
  if (!Number.isFinite(+selectionTime)) throw new Error("Grace processing needs a valid current clock.");
  // All IANA local dates older than UTC today minus two days are already past.
  // This is only a broad candidate bound; exact future-ness is checked below.
  const candidateFrom = new Date(Date.UTC(selectionTime.getUTCFullYear(), selectionTime.getUTCMonth(), selectionTime.getUTCDate() - 2));
  const candidateWhere: Prisma.ClassBookingWhereInput = {
    workspaceId: input.workspaceId, status: "BOOKED", bookingType: "MEMBERSHIP", scheduledForDate: { gte: candidateFrom }, fundingMembershipId: input.membershipId ? input.membershipId : { not: null },
    fundingMembership: { workspaceId: input.workspaceId, OR: [ { invoices: { some: { ...pendingDebt, workspaceId: input.workspaceId } } }, { billingState: { workspaceId: input.workspaceId, status: { in: [...failedStatuses] } } } ] },
  };
  // Capture one fixed high-water ID for the whole pass. A growing workspace
  // cannot extend this pass indefinitely and starve later workspaces.
  const throughBookingId = input.throughBookingId ?? (await tx.classBooking.findFirst({ where: candidateWhere, select: { id: true }, orderBy: { id: "desc" } }))?.id;
  if (!throughBookingId) return result;
  const selected = await tx.classBooking.findMany({ where: { ...candidateWhere, id: { lte: throughBookingId, ...(input.afterBookingId ? { gt: input.afterBookingId } : {}) } }, select: { id: true, fundingMembershipId: true }, orderBy: { id: "asc" }, take: limit + 1 });
  const page = selected.slice(0, limit);
  if (selected.length > limit) { result.nextBookingId = page[page.length - 1]!.id; result.throughBookingId = throughBookingId; }
  if (!page.length) return result;
  const bookingIds = page.map(row => row.id), membershipIds = [...new Set(page.map(row => row.fundingMembershipId!))].sort();
  // Lock identities without a status predicate; reread after every possible wait.
  await tx.$queryRaw`SELECT id FROM member_memberships WHERE "workspaceId"=${input.workspaceId} AND id IN (${Prisma.join(membershipIds)}) ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM invoices WHERE "workspaceId"=${input.workspaceId} AND "memberMembershipId" IN (${Prisma.join(membershipIds)}) ORDER BY id FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM class_bookings WHERE "workspaceId"=${input.workspaceId} AND id IN (${Prisma.join(bookingIds)}) ORDER BY id FOR UPDATE`;
  const bookings = await tx.classBooking.findMany({ where: { workspaceId: input.workspaceId, id: { in: bookingIds } }, include: { classTemplate: { include: classOccurrenceInclude } }, orderBy: { id: "asc" } });
  const [memberships, holds, attendance, allocations] = await Promise.all([
    tx.memberMembership.findMany({ where: { workspaceId: input.workspaceId, id: { in: membershipIds } }, include: { billingState: true, _count: { select: { invoices: { where: { workspaceId: input.workspaceId } } } }, invoices: { where: { ...pendingDebt, workspaceId: input.workspaceId }, orderBy: [{ gracePeriodEndsAt: { sort: "asc", nulls: "first" } }, { id: "asc" }] } } }),
    tx.financialEntitlementHold.findMany({ where: { workspaceId: input.workspaceId, activeSlot: "ACTIVE", OR: [{ targetKind: "MEMBERSHIP", targetId: { in: membershipIds } }, { targetKind: "BOOKING", targetId: { in: bookingIds } }] }, select: { targetKind: true, targetId: true } }),
    tx.attendanceRecord.findMany({ where: { workspaceId: input.workspaceId, OR: bookings.map(row => ({ memberId: row.memberId, classTemplateId: row.classTemplateId, scheduledForDate: row.scheduledForDate })) }, select: { memberId: true, classTemplateId: true, scheduledForDate: true } }),
    tx.membershipAllowanceAllocation.findMany({ where: { workspaceId: input.workspaceId, bookingId: { in: bookingIds } }, select: { id: true, memberId: true, memberMembershipId: true, bookingId: true, bookingRevision: true, state: true } }),
  ]);
  const membershipById = new Map(memberships.map(row => [row.id, row]));
  const attendanceKeys = new Set(attendance.map(row => JSON.stringify([row.memberId, row.classTemplateId, toDateOnlyString(row.scheduledForDate)])));
  const recipients = await memberNotificationRecipients(tx, input.workspaceId, [...new Set(bookings.map(row => row.memberId))]);
  const priorReceipts = new Set((await tx.workspaceDataEvent.findMany({ where: { workspaceId: input.workspaceId, kind: membershipGraceReceiptKind, id: { in: bookings.map(booking => membershipGraceReceiptId(input.workspaceId, booking.id, booking.fundingRevision)) } }, select: { id: true } })).map(row => row.id));
  for (const booking of bookings) {
    result.checked++;
    const membership = booking.fundingMembershipId && membershipById.get(booking.fundingMembershipId);
    if (!membership || membership.memberId !== booking.memberId || booking.status !== "BOOKED" || booking.bookingType !== "MEMBERSHIP" || (input.membershipId && membership.id !== input.membershipId)) { result.skipped++; continue; }
    if ((membership.billingState && (membership.billingState.workspaceId !== input.workspaceId || membership.billingState.memberId !== booking.memberId)) || membership.invoices.some(invoice => invoice.memberId !== null && invoice.memberId !== booking.memberId)) {
      await queueFinancialReview(tx, { workspaceId: input.workspaceId, sourceKey: `membership-grace-scope:${booking.id}:${booking.fundingRevision}`, memberId: booking.memberId, bookingId: booking.id, reason: "Membership restriction evidence has an inconsistent business or participant binding. No reservation or allowance was changed." });
      result.skipped++; continue;
    }
    const restrictionCheckAt = (input.graceClock ?? clockNow)();
    if (!Number.isFinite(+restrictionCheckAt)) throw new Error("Grace processing needs a valid current clock.");
    if (!restrictionFor(membership, restrictionCheckAt)) { result.skipped++; continue; }
    const occurrence = resolveClassOccurrence({ template: booking.classTemplate, scheduledForDate: toDateOnlyString(booking.scheduledForDate) });
    const timezone = occurrence?.timezone;
    if (!occurrence || !timezone || !isUnambiguousClassTime(occurrence.scheduledForDate, occurrence.startTimeMinutes, timezone)) {
      await queueFinancialReview(tx, { workspaceId: input.workspaceId, sourceKey: `membership-grace-occurrence:${booking.id}:${booking.fundingRevision}`, memberId: booking.memberId, bookingId: booking.id, reason: "An unpaid membership has a reservation whose exact class start needs review; no seat or allowance was changed." });
      result.skipped++; continue;
    }
    const startsAt = getZonedDateTimeAsUtc({ dateString: occurrence.scheduledForDate, minutes: occurrence.startTimeMinutes, timezone });
    const currentAllocations = allocations.filter(row => row.bookingId === booking.id && row.bookingRevision === booking.fundingRevision);
    const receiptId = membershipGraceReceiptId(input.workspaceId, booking.id, booking.fundingRevision);
    // Last decision clock is evaluated after advisory + exact-row locks, rereads
    // and the batch receipt read. Historical/past/attended or held funding is untouched.
    const now = (input.graceClock ?? clockNow)();
    if (!Number.isFinite(+now)) throw new Error("Grace processing needs a valid current clock.");
    const restriction = restrictionFor(membership, now);
    if (!restriction || startsAt <= now || attendanceKeys.has(JSON.stringify([booking.memberId, booking.classTemplateId, occurrence.scheduledForDate]))) { result.skipped++; continue; }
    if (priorReceipts.has(receiptId) || holds.some(hold => (hold.targetKind === "MEMBERSHIP" && hold.targetId === membership.id) || (hold.targetKind === "BOOKING" && hold.targetId === booking.id)) || currentAllocations.some(row => row.memberId !== booking.memberId || row.memberMembershipId !== membership.id || row.state !== "RESERVED")) {
      await queueFinancialReview(tx, { workspaceId: input.workspaceId, sourceKey: `membership-grace-held:${booking.id}:${booking.fundingRevision}`, memberId: booking.memberId, bookingId: booking.id, reason: "Membership restriction needs review because this reservation has held or already-settled funding. Existing seats and units remain recorded." });
      result.skipped++; continue;
    }
    await settleMembershipAllowance({ workspaceId: input.workspaceId, bookingId: booking.id, outcome: "PROVIDER_CANCEL", reason: "Membership payment restriction: penalty-free reservation release", db: tx });
    await tx.classBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", pendingPaymentExpiresAt: null, providerChangedAt: now } });
    const currentRecipients = recipients.filter(row => row.memberId === booking.memberId);
    if (restriction.basis === "UNRESOLVED_FAILURE_TIMING") await queueFinancialReview(tx, { workspaceId: input.workspaceId, sourceKey: `membership-grace-timing:${restriction.invoiceId ?? membership.id}`, memberId: booking.memberId, payerAccountId: membership.payerAccountId, reason: "Membership payment restriction has no verified fixed grace deadline. Reservations were released without penalty; reconcile the original invoice timing rather than assigning a new deadline." });
    if (!currentRecipients.length) await queueFinancialReview(tx, { workspaceId: input.workspaceId, sourceKey: `membership-grace-recipient:${booking.id}:${booking.fundingRevision}`, memberId: booking.memberId, bookingId: booking.id, reason: "The restricted membership reservation was released, but no currently authorized participant or booking guardian account could receive its notice. No substitute contact address was used." });
    await tx.workspaceDataEvent.create({ data: { id: receiptId, workspaceId: input.workspaceId, actorUserId: null, kind: membershipGraceReceiptKind, createdAt: now, metadata: {
      schemaVersion: 1, bookingId: booking.id, fundingRevision: booking.fundingRevision, membershipId: membership.id, memberId: booking.memberId, classTemplateId: booking.classTemplateId,
      scheduledForDate: occurrence.scheduledForDate, startsAt: startsAt.toISOString(), timezone, basis: restriction.basis, invoiceId: restriction.invoiceId, gracePeriodEndsAt: restriction.gracePeriodEndsAt?.toISOString() ?? null, restrictedAt: now.toISOString(),
      action: "DEFAULT_CANCEL_RELEASE", from: "BOOKED", to: "CANCELLED", noShowPenalty: false, allowanceAllocationIds: currentAllocations.map(row => row.id).sort(), notificationRecipientCount: currentRecipients.length,
    } } });
    for (const recipient of currentRecipients) await enqueueNotificationJob({ db: tx, now, input: {
      workspaceId: input.workspaceId, templateKind: "ANNOUNCEMENT", recipientEmail: recipient.email, recipientName: recipient.name,
      dedupeKey: `membership-grace:${booking.id}:${booking.fundingRevision}:${recipient.email.toLowerCase()}`,
      context: { kind: "MEMBERSHIP_GRACE_RELEASE", bookingId: booking.id, memberId: booking.memberId, fundingRevision: booking.fundingRevision, receiptId },
      subject: "A class reservation was released",
      body: `${occurrence.displayTitle} on ${occurrence.scheduledForDate} was cancelled because its membership payment needs attention. The reserved allowance was released without a late-cancellation or no-show penalty. Payment does not restore this seat. Review your membership payment and book again subject to current eligibility and capacity.`,
    } });
    result.cancelled++;
  }
  return result;
}

/** Bounded one-page maintenance; the caller must follow nextBookingId until null. */
export async function processMembershipGraceDisposition(input: {
  workspaceId: string; afterBookingId?: string; throughBookingId?: string; limit?: number; db?: PrismaClient; graceClock?: () => Date;
}): Promise<MembershipGracePage> {
  return (input.db ?? prisma).$transaction(async tx => {
    await lockMembershipGraceResourcesTx(tx, input.workspaceId);
    return applyMembershipGraceDispositionTx(tx, input);
  }, { isolationLevel: "ReadCommitted", timeout: 30000 });
}

/** Read-only reuse of the exact source59 per-invoice predicate; paid/void history disables legacy fallback. */
export { pendingDebt as membershipGracePendingDebtWhere, restrictionFor as membershipGraceRestrictionFor };
