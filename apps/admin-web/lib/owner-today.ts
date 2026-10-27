import {
  dateOnlyStringToUtcDate,
  getWorkspaceDateString,
  getOccurrenceStartsAt,
  listClassOccurrences,
  prisma,
  type ResolvedClassOccurrence,
} from "@flowstate/db";
import { formatBillingStateStatus, listFailedPaymentQueue } from "./failed-payments";
import { getFinancialReviewQueue } from "./financial-review";

export interface OwnerTodayAttentionItem {
  id: string;
  category: "Payment" | "Membership" | "Attendance";
  tone: "danger" | "warning";
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  amountCents?: number | null;
  currency?: string | null;
  deadline?: Date | null;
}

export function chooseTodayClass<
  T extends Pick<ResolvedClassOccurrence, "startTimeMinutes" | "endTimeMinutes">,
>(classes: T[], now: Date, timezone: string): T | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const minutes = Number(parts.find((part) => part.type === "hour")?.value) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value);
  return classes.find((item) => item.endTimeMinutes > minutes) ?? classes.at(-1) ?? null;
}

export async function getOwnerToday(workspaceId: string, timezone: string, now = new Date()) {
  const date = getWorkspaceDateString(now, timezone);
  const scheduledForDate = dateOnlyStringToUtcDate(date);
  const [occurrences, bookings, activeMembers, paymentQueue, financialReviews, attendance, membershipRequests] = await Promise.all([
    listClassOccurrences({ workspaceId, fromDate: date, toDate: date }),
    prisma.classBooking.findMany({
      where: {
        workspaceId, scheduledForDate,
        status: { in: ["BOOKED", "PENDING_PAYMENT", "ATTENDED", "ABSENT", "NO_SHOW"] },
      },
      select: {
        id: true, classTemplateId: true, bookingType: true, status: true,
        member: { select: { id: true, fullName: true } },
      },
    }),
    prisma.member.count({ where: { workspaceId, status: "ACTIVE", archivedAt: null } }),
    listFailedPaymentQueue({ workspaceId }),
    // Match Billing's unresolved payment, refund recovery and dispute cases.
    // Assigning a reviewer does not resolve a financial case.
    getFinancialReviewQueue({ workspaceId }),
    prisma.attendanceRecord.findMany({
      where: { workspaceId, scheduledForDate },
      select: { memberId: true, classTemplateId: true },
    }),
    prisma.membershipLifecycleRequest.findMany({
      where: { workspaceId, state: "RECEIVED", activeSlot: "ACTIVE" },
      select: {
        id: true, kind: true,
        membership: { select: { member: { select: { id: true, fullName: true } } } },
      },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const classes = occurrences
    .filter((item) => item.status === "ACTIVE")
    .sort((a, b) => a.startTimeMinutes - b.startTimeMinutes || a.displayTitle.localeCompare(b.displayTitle))
    .map((item) => ({
      ...item,
      canEdit: getOccurrenceStartsAt({ scheduledForDate: date, startTimeMinutes: item.startTimeMinutes, timezone: item.timezone ?? timezone }) > now,
      booked: bookings.filter((booking) => booking.classTemplateId === item.classTemplateId).length,
    }));
  const selectedClass = chooseTodayClass(classes, now, timezone);
  const trials = bookings.filter((booking) => booking.bookingType === "TRIAL").flatMap((booking) => {
    const occurrence = classes.find((item) => item.classTemplateId === booking.classTemplateId);
    return occurrence ? [{ ...booking, occurrence }] : [];
  });
  const invoiceIds = paymentQueue.flatMap((item) => item.latestInvoiceId ? [item.latestInvoiceId] : []);
  const invoices = invoiceIds.length ? await prisma.invoice.findMany({
    where: { workspaceId, stripeInvoiceId: { in: invoiceIds } },
    select: { stripeInvoiceId: true, amountDueCents: true, currency: true },
  }) : [];
  const invoiceById = new Map(invoices.map((item) => [item.stripeInvoiceId, item]));
  const attention: OwnerTodayAttentionItem[] = [
    ...paymentQueue.map((item): OwnerTodayAttentionItem => ({
      id: `payment:${item.id}`, category: "Payment",
      tone: item.status === "PAYMENT_FAILED" || item.status === "PAST_DUE" ? "danger" : "warning",
      title: `${item.member.fullName} · ${formatBillingStateStatus(item.status, "failed-payment-queue").toLowerCase()}`,
      description: item.memberMembership.membershipPlan.name,
      href: `/dashboard/members/${item.member.id}/billing`,
      actionLabel: `Review ${item.member.fullName} payment`,
      // A plan price is not evidence of an invoice's remaining obligation.
      amountCents: item.latestInvoiceId ? invoiceById.get(item.latestInvoiceId)?.amountDueCents : undefined,
      currency: item.latestInvoiceId ? invoiceById.get(item.latestInvoiceId)?.currency : undefined,
      deadline: item.gracePeriodEndsAt,
    })),
    ...financialReviews.map((item): OwnerTodayAttentionItem => ({
      id: `review:${item.id}`, category: "Payment", tone: "warning",
      title: `${item.member?.fullName ?? item.payerAccount?.member.fullName ?? "Account service"} · payment review required`,
      description: item.reason,
      href: `/dashboard/billing/reviews/${item.id}`,
      actionLabel: "Review payment case",
      amountCents: item.amountCents, currency: item.currency,
    })),
    ...membershipRequests.map((item): OwnerTodayAttentionItem => {
      const member = item.membership.member;
      const names: Record<string, string> = { CANCEL: "cancellation", FREEZE: "freeze", WITHDRAW: "withdrawal", RESUME: "resume" };
      return {
        id: `membership:${item.id}`, category: "Membership", tone: "warning",
        title: `${member.fullName} · membership ${names[item.kind] ?? "change"} requested`,
        description: "Review the request, accepted policy and affected bookings before confirming.",
        href: `/dashboard/members/${member.id}/billing`,
        actionLabel: `Review ${member.fullName} membership`,
      };
    }),
  ];
  const recorded = new Set(attendance.map((item) => `${item.classTemplateId}:${item.memberId}`));
  for (const item of classes) {
    const ended = getOccurrenceStartsAt({ scheduledForDate: date, startTimeMinutes: item.endTimeMinutes, timezone: item.timezone ?? timezone }) <= now;
    if (!ended) continue;
    const missing = bookings.filter((booking) =>
      booking.classTemplateId === item.classTemplateId && booking.status === "BOOKED" &&
      !recorded.has(`${item.classTemplateId}:${booking.member.id}`),
    ).length;
    if (!missing) continue;
    attention.push({
      id: `attendance:${item.classTemplateId}:${date}`, category: "Attendance", tone: "warning",
      title: `${item.displayTitle} · attendance not recorded`,
      description: `${missing} booked ${missing === 1 ? "member needs" : "members need"} an attendance decision.`,
      href: `/dashboard/schedule/${item.id}/roster?date=${date}`,
      actionLabel: "Open dated roster",
    });
  }
  return {
    date, activeMembers, paymentCount: paymentQueue.length + financialReviews.length,
    classes, selectedClass, trials, attention,
  };
}
