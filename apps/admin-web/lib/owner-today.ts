import { dateOnlyStringToUtcDate, getWorkspaceDateString, getOccurrenceStartsAt, listClassOccurrences, prisma, type ResolvedClassOccurrence } from "@flowstate/db";
import { listFailedPaymentQueue } from "./failed-payments";

export function chooseTodayClass<T extends Pick<ResolvedClassOccurrence, "startTimeMinutes" | "endTimeMinutes">>(classes: T[], now: Date, timezone: string): T | null {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minutes = Number(parts.find((part) => part.type === "hour")?.value) * 60 + Number(parts.find((part) => part.type === "minute")?.value);
  return classes.find((item) => item.endTimeMinutes > minutes) ?? classes.at(-1) ?? null;
}

export async function getOwnerToday(workspaceId: string, timezone: string, now = new Date()) {
  const date = getWorkspaceDateString(now, timezone);
  const [occurrences, bookings, activeMembers, paymentQueue, financialReviews] = await Promise.all([
    listClassOccurrences({ workspaceId, fromDate: date, toDate: date }),
    prisma.classBooking.findMany({ where: { workspaceId, scheduledForDate: dateOnlyStringToUtcDate(date), status: { in: ["BOOKED", "PENDING_PAYMENT", "ATTENDED", "ABSENT", "NO_SHOW"] } }, select: { id: true, classTemplateId: true, bookingType: true, status: true, member: { select: { id: true, fullName: true } } } }),
    prisma.member.count({ where: { workspaceId, status: "ACTIVE" } }),
    listFailedPaymentQueue({ workspaceId }),
    prisma.financialReviewCase.count({ where: { workspaceId, resolvedAt: null } }),
  ]);
  const classes = occurrences.map((item) => ({ ...item, canEdit: getOccurrenceStartsAt({ scheduledForDate: date, startTimeMinutes: item.startTimeMinutes, timezone }) > now, booked: bookings.filter((booking) => booking.classTemplateId === item.id).length }));
  const selectedClass = chooseTodayClass(classes, now, timezone);
  const trials = bookings.filter((booking) => booking.bookingType === "TRIAL").flatMap((booking) => {
    const occurrence = classes.find((item) => item.id === booking.classTemplateId);
    return occurrence ? [{ ...booking, occurrence }] : [];
  });
  return { date, activeMembers, paymentCount: paymentQueue.length + financialReviews, classes, selectedClass, trials };
}
