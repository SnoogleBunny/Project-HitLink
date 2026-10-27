import { prisma, coachingStatus, type PrismaClient } from "@flowstate/db";
import { coachingHref } from "../app/app/coaching/navigation";

type Enrollment = { id: string; status: string };
export function portalLanding(input: {
  enrollments: Enrollment[];
  hasPayerRequests: boolean;
  hasClasses: boolean;
}) {
  const hasCoaching = input.enrollments.length > 0 || input.hasPayerRequests;
  if (!hasCoaching) return { href: "/app/schedule", coachingHref: null };
  const enrollment =
    input.enrollments.length === 1 ? input.enrollments[0]! : null;
  const href = enrollment
    ? coachingHref(
        enrollment.id,
        ["ACTIVE", "PAUSED"].includes(enrollment.status) ? "notes" : "program",
      )
    : "/app/coaching";
  return { href: input.hasClasses ? null : href, coachingHref: href };
}

/** The selected child never becomes the signed-in adult coaching identity. */
export async function getPortalLanding(
  input: {
    workspaceId: string;
    userId: string;
    accountMemberId: string;
    authorizedMemberIds: string[];
  },
  db: PrismaClient = prisma,
  now = new Date(),
) {
  const scope = {
    workspaceId: input.workspaceId,
    memberId: {
      in: [...new Set([input.accountMemberId, ...input.authorizedMemberIds])],
    },
  };
  const [enrollments, payerRequests, memberships, packs, bookings] =
    await Promise.all([
      db.coachingEnrollment.findMany({
        where: {
          workspaceId: input.workspaceId,
          memberId: input.accountMemberId,
          member: { userId: input.userId },
          OR: [{ closedAt: null }, { retrievalUntil: { gt: now } }],
        },
        select: {
          id: true,
          status: true,
          closedAt: true,
          acceptedAt: true,
          contactVerifiedAt: true,
          currentCoachWorkspaceUserId: true,
          currentCoach: { select: { isActive: true } },
          paymentState: true,
          timezone: true,
          startsOn: true,
          endsOn: true,
          pauseStartsOn: true,
          pauseEndsOn: true,
        },
        orderBy: { createdAt: "asc" },
        take: 2,
      }),
      db.coachingPayerGrant.count({
        where: {
          workspaceId: input.workspaceId,
          payerUserId: input.userId,
          payerMemberId: input.accountMemberId,
          activeSlot: "ACTIVE",
          revokedAt: null,
        },
      }),
      db.memberMembership.count({
        where: {
          ...scope,
          currentMembershipSlot: "CURRENT",
          status: { notIn: ["ENDED", "CANCELLED"] },
        },
      }),
      db.memberPunchCard.count({
        where: { ...scope, status: "ACTIVE", remainingPunches: { gt: 0 } },
      }),
      db.classBooking.count({
        where: { ...scope, status: { not: "CANCELLED" } },
      }),
    ]);
  return portalLanding({
    enrollments: enrollments.map((enrollment) => ({
      id: enrollment.id,
      status: coachingStatus(enrollment, now),
    })),
    hasPayerRequests: payerRequests > 0,
    hasClasses: memberships + packs + bookings > 0,
  });
}
