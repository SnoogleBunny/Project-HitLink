import { sourceBillingCoversDate } from "./source-billing.js";
import { memberNotificationRecipients } from "./member-notification-recipients.js";
import { financialEntitlementHoldReason } from "./entitlement-holds.js";
import { lockClassSchedule } from "./class-occurrences.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { toDateOnlyString, dateOnlyStringToUtcDate, parseDateOnlyString } from "./occurrences.js";
import { parseMembershipLifecyclePolicy, type MembershipLifecyclePolicy } from "./membership-lifecycle-policy.js";

export interface AcceptedMembershipTerms {
  version: number;
  monthlyPriceCents: number;
  currency: string;
  weeklyClassLimit: number | null;
  monthlyClassLimit: number | null;
  allowanceCountingMode: "RESERVATION" | "ATTENDANCE";
  lateCancellationConsumesClass: boolean;
  noShowConsumesClass: boolean;
  programIds: string[];
  cancellationPolicyReference: string | null;
  freezePolicyReference: string | null;
  lifecyclePolicy?: MembershipLifecyclePolicy | null;
  capturedAt: string;
}
type PlanTerms = Partial<Omit<AcceptedMembershipTerms, "programIds" | "capturedAt" | "version" | "lifecyclePolicy">> & { lifecyclePolicy?: unknown; termsVersion?: number; programRestrictions?: Array<{ programId: string }> };
export function snapshotMembershipTerms(plan: PlanTerms, now = new Date()): AcceptedMembershipTerms {
  return { version: plan.termsVersion ?? 1, monthlyPriceCents: plan.monthlyPriceCents ?? 0, currency: plan.currency ?? "usd",
    weeklyClassLimit: plan.weeklyClassLimit ?? null, monthlyClassLimit: plan.monthlyClassLimit ?? null,
    allowanceCountingMode: plan.allowanceCountingMode ?? "ATTENDANCE", lateCancellationConsumesClass: plan.lateCancellationConsumesClass ?? true,
    noShowConsumesClass: plan.noShowConsumesClass ?? true, programIds: (plan.programRestrictions ?? []).map((p) => p.programId),
    cancellationPolicyReference: plan.cancellationPolicyReference ?? null, freezePolicyReference: plan.freezePolicyReference ?? null,
    lifecyclePolicy: parseMembershipLifecyclePolicy(plan.lifecyclePolicy), capturedAt: now.toISOString() };
}
export function readAcceptedMembershipTerms(value: unknown): AcceptedMembershipTerms | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as AcceptedMembershipTerms;
  if (!Number.isInteger(v.version) || !Array.isArray(v.programIds) || !["ATTENDANCE", "RESERVATION"].includes(v.allowanceCountingMode)) return null;
  if (![v.weeklyClassLimit, v.monthlyClassLimit].every((cap) => cap === null || (Number.isSafeInteger(cap) && cap > 0))) return null;
  return v;
}
const day = 86400000;
function shiftMonth(anchor: string, months: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return toDateOnlyString(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d!, lastDay))));
}
export interface AllowanceWindow { kind: "WEEK" | "BILLING_MONTH"; startsOn: string; endsOn: string; limit: number }
/** Months keep the original anchor day after short months. Ends are exclusive; the final short week retains its full cap. */
export function membershipAllowanceWindows(args: { anchorDate: string; scheduledForDate: string; weeklyClassLimit: number | null; monthlyClassLimit: number | null }): AllowanceWindow[] {
  if (parseDateOnlyString(args.anchorDate).status === "error" || parseDateOnlyString(args.scheduledForDate).status === "error") throw new Error("Choose a valid allowance date.");
  const a = dateOnlyStringToUtcDate(args.anchorDate), date = dateOnlyStringToUtcDate(args.scheduledForDate);
  let offset = (date.getUTCFullYear() - a.getUTCFullYear()) * 12 + date.getUTCMonth() - a.getUTCMonth();
  if (shiftMonth(args.anchorDate, offset) > args.scheduledForDate) offset--;
  const startsOn = shiftMonth(args.anchorDate, offset), endsOn = shiftMonth(args.anchorDate, offset + 1);
  const windows: AllowanceWindow[] = [];
  if (args.monthlyClassLimit !== null) windows.push({ kind: "BILLING_MONTH", startsOn, endsOn, limit: args.monthlyClassLimit });
  if (args.weeklyClassLimit !== null) {
    const start = dateOnlyStringToUtcDate(startsOn).getTime();
    const weekStart = start + Math.floor((date.getTime() - start) / day / 7) * 7 * day;
    windows.push({ kind: "WEEK", startsOn: toDateOnlyString(new Date(weekStart)), endsOn: toDateOnlyString(new Date(Math.min(weekStart + 7 * day, dateOnlyStringToUtcDate(endsOn).getTime()))), limit: args.weeklyClassLimit });
  }
  return windows;
}
type Db = Prisma.TransactionClient | PrismaClient;
export interface AllowanceWindowSummary extends AllowanceWindow { reserved: number; used: number; remaining: number }
export interface MembershipAllowanceSummary { membershipId: string; countingMode: "RESERVATION" | "ATTENDANCE"; unlimited: boolean; windows: AllowanceWindowSummary[] }
export async function prepareMembershipAllowance(args: { workspaceId: string; memberId: string; membershipId: string; scheduledForDate: string; timezone: string; db: Db; ignoreBookingId?: string }) {
  const membership = await args.db.memberMembership.findFirst({ where: { id: args.membershipId, workspaceId: args.workspaceId, memberId: args.memberId }, include: { sourceBillingEvidence: true, membershipPlan: { include: { programRestrictions: true } } } });
  if (!membership) return { error: "Membership not found." } as const;
  if (!sourceBillingCoversDate(membership, args.scheduledForDate)) return { error: "The source payment or resume evidence does not cover this class date. Ask the gym to check the original-system receipts." } as const;
  // Null snapshots from imports are treated as the legacy unlimited contract, never as today's changed catalog cap.
  if (membership.acceptedTerms !== null && !readAcceptedMembershipTerms(membership.acceptedTerms)) return { error: "The accepted membership terms need owner review before booking." } as const;
  const terms = readAcceptedMembershipTerms(membership.acceptedTerms) ?? snapshotMembershipTerms({ ...membership.membershipPlan, weeklyClassLimit: null, monthlyClassLimit: null });
  const zone = membership.allowanceTimezone ?? args.timezone;
  const local = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (args.scheduledForDate < local(membership.startedAt) || (membership.endedAt && args.scheduledForDate >= local(membership.endedAt)) || (!membership.endedAt && membership.cancelAtPeriodEnd && membership.nextBillingDate && args.scheduledForDate >= local(membership.nextBillingDate))) return { error: "This class falls outside the membership's active dates." } as const;
  if (membership.frozenFrom && membership.frozenUntil && args.scheduledForDate >= toDateOnlyString(membership.frozenFrom) && args.scheduledForDate < toDateOnlyString(membership.frozenUntil)) return { error: "This membership is frozen on the class date." } as const;
  const anchorDate = membership.allowanceAnchorDate ? toDateOnlyString(membership.allowanceAnchorDate) : local(membership.nextBillingDate ?? membership.startedAt);
  const windows = membershipAllowanceWindows({ anchorDate, scheduledForDate: args.scheduledForDate, ...terms });
  const summaries: AllowanceWindowSummary[] = [];
  for (const window of windows) {
    const allocations = await args.db.membershipAllowanceAllocation.findMany({ where: { workspaceId: args.workspaceId, memberId: args.memberId, memberMembershipId: membership.id, kind: window.kind, periodStart: dateOnlyStringToUtcDate(window.startsOn), state: { not: "RELEASED" }, ...(args.ignoreBookingId ? { bookingId: { not: args.ignoreBookingId } } : {}) }, select: { state: true } });
    const opening = await args.db.membershipAllowanceOpeningBalance?.findFirst({ where: { workspaceId: args.workspaceId, memberMembershipId: membership.id, kind: window.kind, periodStart: dateOnlyStringToUtcDate(window.startsOn) } });
    const reserved = allocations.filter((a) => a.state === "RESERVED").length, used = allocations.filter((a) => a.state === "USED").length + (opening?.usedCount ?? 0);
    const adjustment = await args.db.membershipAllowanceAdjustment.aggregate({ where: { workspaceId: args.workspaceId, memberMembershipId: membership.id, kind: window.kind, periodStart: dateOnlyStringToUtcDate(window.startsOn) }, _sum: { delta: true } });
    const limit = window.limit + (adjustment._sum.delta ?? 0);
    summaries.push({ ...window, limit, reserved, used, remaining: Math.max(0, limit - reserved - used) });
  }
  return { terms, windows: summaries, membershipId: membership.id };
}
export async function getMembershipAllowanceSummary(args: { workspaceId: string; memberId: string; scheduledForDate: string; timezone: string; db?: Db }): Promise<MembershipAllowanceSummary | null> {
  const db = args.db ?? prisma;
  const membership = await db.memberMembership.findFirst({ where: { workspaceId: args.workspaceId, memberId: args.memberId, currentMembershipSlot: "CURRENT", status: { in: ["ACTIVE", "PAST_DUE", "PENDING_PAYMENT_METHOD"] } }, select: { id: true } });
  if (!membership) return null;
  const prepared = await prepareMembershipAllowance({ ...args, db, membershipId: membership.id });
  if ("error" in prepared) return null;
  return { membershipId: membership.id, countingMode: prepared.terms.allowanceCountingMode, unlimited: !prepared.windows.length, windows: prepared.windows };
}
/** Caller holds the workspace scheduling lock and has checked every window before creating a booking. */
export async function reserveMembershipAllowance(args: { workspaceId: string; memberId: string; membershipId: string; bookingId: string; windows: AllowanceWindow[]; bookingRevision: number; db: Db }) {
  for (const w of args.windows) {
    const existing = await args.db.membershipAllowanceAllocation.findUnique({ where: { bookingId_bookingRevision_kind_periodStart: { bookingId: args.bookingId, bookingRevision: args.bookingRevision, kind: w.kind, periodStart: dateOnlyStringToUtcDate(w.startsOn) } } });
    if (existing && existing.state !== "RELEASED") continue;
    const allocation = existing ? await args.db.membershipAllowanceAllocation.update({ where: { id: existing.id }, data: { state: "RESERVED", revision: { increment: 1 } } }) : await args.db.membershipAllowanceAllocation.create({ data: { workspaceId: args.workspaceId, memberId: args.memberId, memberMembershipId: args.membershipId, bookingId: args.bookingId, bookingRevision: args.bookingRevision, kind: w.kind, periodStart: dateOnlyStringToUtcDate(w.startsOn), periodEnd: dateOnlyStringToUtcDate(w.endsOn), limit: w.limit } });
    await args.db.membershipAllowanceEntry.create({ data: { workspaceId: args.workspaceId, allocationId: allocation.id, revision: allocation.revision, reservedDelta: 1, usedDelta: 0, reason: "Booking reserved" } });
  }
}
/** Settlement changes the original windows; attendance corrections never allocate a second use. */
export async function settleMembershipAllowance(args: { workspaceId: string; bookingId: string; outcome: "ATTENDED" | "NO_SHOW" | "EXCUSED" | "TIMELY_CANCEL" | "LATE_CANCEL" | "PROVIDER_CANCEL"; db: Db; actorWorkspaceUserId?: string; financialOperationId?: string; reason?: string }) {
  const booking = await args.db.classBooking.findFirst({ where: { id: args.bookingId, workspaceId: args.workspaceId }, select: { acceptedPolicy: true, fundingRevision: true, fundingMembershipId: true } });
  const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "MEMBERSHIP", targetId: booking?.fundingMembershipId }, { targetKind: "BOOKING", targetId: args.bookingId }], db: args.db, exceptOperationId: args.financialOperationId });
  if (held) throw new Error(held);
  const terms = readAcceptedMembershipTerms(booking?.acceptedPolicy);
  const used = args.outcome === "ATTENDED" || (args.outcome === "NO_SHOW" && (terms?.noShowConsumesClass ?? true)) || (args.outcome === "LATE_CANCEL" && (terms?.lateCancellationConsumesClass ?? true));
  const target = used ? "USED" : "RELEASED";
  const allocations = await args.db.membershipAllowanceAllocation.findMany({ where: { workspaceId: args.workspaceId, bookingId: args.bookingId, bookingRevision: booking?.fundingRevision ?? 1 } });
  for (const old of allocations) {
    if (old.state === target) continue;
    const updated = await args.db.membershipAllowanceAllocation.update({ where: { id: old.id }, data: { state: target, revision: { increment: 1 } } });
    await args.db.membershipAllowanceEntry.create({ data: { workspaceId: args.workspaceId, allocationId: old.id, revision: updated.revision, reservedDelta: old.state === "RESERVED" ? -1 : 0, usedDelta: (used ? 1 : 0) - (old.state === "USED" ? 1 : 0), reason: args.reason ?? args.outcome, actorWorkspaceUserId: args.actorWorkspaceUserId } });
  }
}


export async function adjustMembershipAllowance(args: { workspaceId: string; memberId: string; membershipId: string; workspaceUserId: string; scheduledForDate: string; timezone: string; kind: "WEEK" | "BILLING_MONTH"; delta: number; reason: string; mutationId: string; db?: PrismaClient }): Promise<{ ok: true } | { ok: false; message: string }> {
  if (parseDateOnlyString(args.scheduledForDate).status === "error" || !Number.isSafeInteger(args.delta) || !args.delta || !args.reason.trim() || args.reason.length > 1000 || !/^[\da-f-]{36}$/i.test(args.mutationId)) return { ok: false, message: "Enter a whole-number adjustment and a reason." };
  return (args.db ?? prisma).$transaction(async (tx) => {
    await lockClassSchedule(tx, args.workspaceId);
    if (!await tx.workspaceUser.findFirst({ where: { id: args.workspaceUserId, workspaceId: args.workspaceId, role: "OWNER", isActive: true }, select: { id: true } })) return { ok: false, message: "Only an active owner can adjust allowances." };
    const prior = await tx.membershipAllowanceAdjustment.findUnique({ where: { id: args.mutationId } });
    if (prior) return prior.workspaceId === args.workspaceId && prior.memberId === args.memberId && prior.memberMembershipId === args.membershipId && prior.kind === args.kind && prior.delta === args.delta && prior.reason === args.reason.trim() && args.scheduledForDate >= toDateOnlyString(prior.periodStart) && args.scheduledForDate < toDateOnlyString(prior.periodEnd) ? { ok: true } : { ok: false, message: "This adjustment was already used for different details." };
    const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "MEMBERSHIP", targetId: args.membershipId }], db: tx });
    if (held) return { ok: false, message: held };
    const prepared = await prepareMembershipAllowance({ ...args, db: tx });
    if ("error" in prepared) return { ok: false, message: prepared.error ?? "Membership not found." };
    const window = prepared.windows.find((item) => item.kind === args.kind);
    if (!window) return { ok: false, message: "This membership has no limit of that type to adjust." };
    if (window.limit + args.delta < window.used + window.reserved) return { ok: false, message: "The adjusted allowance cannot be below classes already used or reserved." };
    await tx.membershipAllowanceAdjustment.create({ data: { id: args.mutationId, workspaceId: args.workspaceId, memberId: args.memberId, memberMembershipId: args.membershipId, kind: args.kind, periodStart: dateOnlyStringToUtcDate(window.startsOn), periodEnd: dateOnlyStringToUtcDate(window.endsOn), delta: args.delta, reason: args.reason.trim(), actorWorkspaceUserId: args.workspaceUserId } });
    return { ok: true };
  });
}

/** Called inside the caller's transaction with the workspace schedule lock held. End is exclusive. */
export async function cancelMembershipFundedBookingsTx(args: { workspaceId: string; membershipId: string; fromDate: string; toDate?: string; reason: string; actorWorkspaceUserId?: string; db: Prisma.TransactionClient }): Promise<{ cancelled: number }> {
  const bookings = await args.db.classBooking.findMany({ where: { workspaceId: args.workspaceId, fundingMembershipId: args.membershipId, bookingType: "MEMBERSHIP", status: "BOOKED", scheduledForDate: { gte: dateOnlyStringToUtcDate(args.fromDate), ...(args.toDate ? { lt: dateOnlyStringToUtcDate(args.toDate) } : {}) } }, include: { member: { select: { fullName: true, email: true } }, guardian: { select: { fullName: true, email: true } }, classTemplate: { select: { title: true, program: { select: { name: true } } } } } });
  const held = await financialEntitlementHoldReason({ workspaceId: args.workspaceId, targets: [{ targetKind: "MEMBERSHIP", targetId: args.membershipId }, ...bookings.map((booking) => ({ targetKind: "BOOKING", targetId: booking.id }))], db: args.db });
  if (held) throw new Error(held);
  for (const booking of bookings) {
    await settleMembershipAllowance({ workspaceId: args.workspaceId, bookingId: booking.id, outcome: "PROVIDER_CANCEL", db: args.db, actorWorkspaceUserId: args.actorWorkspaceUserId, reason: args.reason });
    await args.db.classBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", providerChangedAt: new Date() } });
    const recipients = await memberNotificationRecipients(args.db, args.workspaceId, [booking.memberId]);
    for (const recipient of recipients) await args.db.notificationJob.create({ data: { workspaceId: args.workspaceId, templateKind: "ANNOUNCEMENT", context: { kind: "MEMBER_ACCESS", memberId: booking.memberId }, dedupeKey: `membership-booking-cancel:${booking.id}:${booking.fundingRevision}:${recipient.email.toLowerCase()}`, recipientEmail: recipient.email, recipientName: recipient.name, subject: "Class booking cancelled", body: `${booking.classTemplate.title ?? booking.classTemplate.program.name} on ${toDateOnlyString(booking.scheduledForDate)} was cancelled. ${args.reason}\nThe reserved class has been restored. View your classes in the member portal.`, status: "PENDING", nextAttemptAt: new Date() } });
  }
  return { cancelled: bookings.length };
}
