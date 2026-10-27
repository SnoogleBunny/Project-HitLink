import { createHash } from "node:crypto";
import {
  dateOnlyStringToUtcDate,
  getWorkspaceDateString,
  resolveWorkspaceClockTimezone,
  type Prisma,
} from "@flowstate/db";

export async function readMemberArchiveImpact(
  db: Prisma.TransactionClient,
  scope: { workspaceId: string; memberId: string },
  now: Date,
) {
  const location = await db.location.findUnique({
    where: { workspaceId: scope.workspaceId },
    select: { timezone: true },
  });
  const timezone = await resolveWorkspaceClockTimezone({
    workspaceId: scope.workspaceId,
    baselineTimezone: location?.timezone ?? "UTC",
    now,
    db,
  });
  const today = dateOnlyStringToUtcDate(getWorkspaceDateString(now, timezone));
  const [
    memberships,
    classes,
    waitlist,
    coaching,
    events,
    lessons,
    checkout,
    debt,
    credits,
    packs,
  ] = await Promise.all([
    db.memberMembership.count({
      where: { ...scope, status: { notIn: ["CANCELLED", "ENDED"] } },
    }),
    db.classBooking.count({
      where: {
        ...scope,
        scheduledForDate: { gte: today },
        status: { in: ["BOOKED", "PENDING_PAYMENT"] },
      },
    }),
    db.waitlistEntry.count({
      where: { ...scope, status: "ACTIVE", scheduledForDate: { gte: today } },
    }),
    db.coachingEnrollment.count({ where: { ...scope, closedAt: null } }),
    db.eventBooking.count({
      where: { ...scope, status: "BOOKED", event: { startsAt: { gte: now } } },
    }),
    db.privateLessonBooking.count({
      where: {
        ...scope,
        status: "BOOKED",
        privateLessonSlot: { startsAt: { gte: now } },
      },
    }),
    db.publicEnrollment.count({
      where: {
        ...scope,
        status: {
          in: ["VERIFYING", "VERIFIED", "FORMS_REQUIRED", "PAYMENT_PENDING"],
        },
      },
    }),
    db.invoice.groupBy({
      by: ["currency"],
      where: {
        ...scope,
        amountDueCents: { gt: 0 },
        status: { in: ["OPEN", "UNCOLLECTIBLE"] },
      },
      _sum: { amountDueCents: true },
      orderBy: { currency: "asc" },
    }),
    db.accountCredit.groupBy({
      by: ["currency"],
      where: { ...scope, remainingAmountCents: { gt: 0 } },
      _sum: { remainingAmountCents: true },
      orderBy: { currency: "asc" },
    }),
    db.memberPunchCard.groupBy({
      by: ["punchCardProductId"],
      where: { ...scope, remainingPunches: { gt: 0 } },
      _sum: { remainingPunches: true },
      orderBy: { punchCardProductId: "asc" },
    }),
  ]);
  const impact = {
    blockers: {
      memberships,
      classes,
      waitlist,
      coaching,
      events,
      lessons,
      checkout,
    },
    debt: debt.map((row) => ({
      currency: row.currency,
      amountMinor: row._sum.amountDueCents ?? 0,
    })),
    credits: credits.map((row) => ({
      currency: row.currency,
      amountMinor: row._sum.remainingAmountCents ?? 0,
    })),
    units: packs.map((row) => ({
      productId: row.punchCardProductId,
      units: row._sum.remainingPunches ?? 0,
    })),
    disposition: "RETAIN_BALANCES_AND_UNITS" as const,
  };
  return {
    ...impact,
    hash: createHash("sha256").update(JSON.stringify(impact)).digest("hex"),
  };
}
export type MemberArchiveImpact = Awaited<
  ReturnType<typeof readMemberArchiveImpact>
>;
