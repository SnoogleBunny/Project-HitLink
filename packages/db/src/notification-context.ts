import type { PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import type { NotificationJobRecord } from "./notification-outbox.js";
/** Only operational metadata is queried. Private note text never enters delivery logs or messages. */
export async function shouldDeliverNotification(
  job: NotificationJobRecord,
  db: PrismaClient = prisma,
  now = new Date(),
) {
  const context = job.context as
    | {
        kind?: string;
        enrollmentId?: string;
        noteId?: string;
        revisionId?: string;
        revisionNumber?: number;
        bookingId?: string;
        memberId?: string;
        grantId?: string;
        verificationHash?: string;
        issuedAt?: string;
      }
    | null
    | undefined;
  if (!context?.kind) return true;
  if (context.kind === "COACHING_UPDATE")
    return (
      !!context.enrollmentId &&
      !!(await db.coachingEnrollment.findFirst({
        where: {
          id: context.enrollmentId,
          workspaceId: job.workspaceId,
          workspace: { status: { not: "DISABLED" } },
          member: {
            user: {
              email: job.recipientEmail,
              workspaceUsers: {
                some: {
                  workspaceId: job.workspaceId,
                  role: "CUSTOMER",
                  isActive: true,
                },
              },
            },
          },
        },
        select: { id: true },
      }))
    );
  if (context.kind === "COACHING_PAYER_VERIFICATION") {
    if (
      !context.grantId ||
      !context.verificationHash ||
      !context.issuedAt ||
      !Number.isFinite(Date.parse(context.issuedAt))
    )
      return false;
    const grant = await db.coachingPayerGrant.findFirst({
      where: {
        id: context.grantId,
        workspaceId: job.workspaceId,
        revokedAt: null,
        activeSlot: "ACTIVE",
        payerContactVerifiedAt: null,
        verificationHash: context.verificationHash,
        verificationExpiresAt: { gt: now },
        verificationSentAt: new Date(context.issuedAt),
        workspace: { status: { not: "DISABLED" } },
        enrollment: {
          workspaceId: job.workspaceId,
          closedAt: null,
          acceptedAt: { not: null },
          contactVerifiedAt: { not: null },
        },
      },
      select: {
        id: true,
        payerUserId: true,
        payerMemberId: true,
        clientUserId: true,
        enrollment: {
          select: {
            currentPayerGrantId: true,
            member: { select: { userId: true } },
          },
        },
      },
    });
    if (
      !grant ||
      grant.enrollment.currentPayerGrantId !== grant.id ||
      grant.enrollment.member.userId !== grant.clientUserId ||
      grant.payerUserId === grant.clientUserId
    )
      return false;
    const [payer, client] = await Promise.all([
      db.member.findFirst({
        where: {
          id: grant.payerMemberId,
          workspaceId: job.workspaceId,
          userId: grant.payerUserId,
          user: {
            email: job.recipientEmail,
            workspaceUsers: {
              some: {
                workspaceId: job.workspaceId,
                role: "CUSTOMER",
                isActive: true,
              },
            },
          },
        },
        select: { id: true },
      }),
      db.workspaceUser.findFirst({
        where: {
          workspaceId: job.workspaceId,
          userId: grant.clientUserId,
          role: "CUSTOMER",
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    return !!payer && !!client;
  }
  if (context.kind === "PUBLIC_VERIFICATION")
    return (
      !!context.enrollmentId &&
      !!(await db.publicEnrollment.findFirst({
        where: {
          id: context.enrollmentId,
          workspaceId: job.workspaceId,
          email: job.recipientEmail,
          verifiedAt: null,
          verificationExpiresAt: { gt: now },
        },
        select: { id: true },
      }))
    );
  if (context.kind === "COACHING_VERIFICATION") {
    if (
      !context.enrollmentId ||
      !context.verificationHash ||
      !context.issuedAt ||
      !Number.isFinite(Date.parse(context.issuedAt))
    )
      return false;
    const enrollment = await db.coachingEnrollment.findFirst({
      where: {
        id: context.enrollmentId,
        workspaceId: job.workspaceId,
        closedAt: null,
        contactVerifiedAt: null,
        verificationHash: context.verificationHash,
        verificationExpiresAt: { gt: now },
        verificationSentAt: new Date(context.issuedAt),
        member: { user: { email: job.recipientEmail } },
      },
      select: { member: { select: { userId: true } } },
    });
    return (
      !!enrollment?.member.userId &&
      !!(await db.workspaceUser.findFirst({
        where: {
          workspaceId: job.workspaceId,
          userId: enrollment.member.userId,
          role: "CUSTOMER",
          isActive: true,
        },
        select: { id: true },
      }))
    );
  }
  if (context.kind === "COACHING_NOTE") {
    if (!context.noteId || !context.revisionId || !context.enrollmentId)
      return false;
    const note = await db.coachingDailyNote.findFirst({
      where: {
        id: context.noteId,
        enrollmentId: context.enrollmentId,
        withdrawnAt: null,
        status: { in: ["PUBLISHED", "AMENDED"] },
        enrollment: {
          workspaceId: job.workspaceId,
          member: { user: { email: job.recipientEmail } },
          OR: [{ closedAt: null }, { retrievalUntil: { gt: now } }],
        },
      },
      select: {
        revisions: {
          orderBy: { number: "desc" },
          take: 1,
          select: { id: true, number: true, withdrawnAt: true },
        },
        enrollment: { select: { member: { select: { userId: true } } } },
      },
    });
    const revision = note?.revisions[0],
      userId = note?.enrollment.member.userId;
    return (
      !!revision &&
      !revision.withdrawnAt &&
      revision.id === context.revisionId &&
      revision.number === context.revisionNumber &&
      !!userId &&
      !!(await db.workspaceUser.findFirst({
        where: {
          workspaceId: job.workspaceId,
          userId,
          role: "CUSTOMER",
          isActive: true,
        },
        select: { id: true },
      }))
    );
  }
  if (context.kind === "CLASS_BOOKING" || context.kind === "MEMBER_ACCESS") {
    const memberId =
      context.kind === "CLASS_BOOKING"
        ? context.bookingId &&
          (
            await db.classBooking.findFirst({
              where: {
                id: context.bookingId,
                workspaceId: job.workspaceId,
                status: "BOOKED",
              },
              select: { memberId: true },
            })
          )?.memberId
        : context.memberId;
    if (!memberId) return false;
    const user = await db.user.findFirst({
      where: {
        email: job.recipientEmail,
        workspaceUsers: {
          some: {
            workspaceId: job.workspaceId,
            role: "CUSTOMER",
            isActive: true,
          },
        },
      },
      select: { id: true },
    });
    if (!user) return false;
    if (
      await db.member.findFirst({
        where: { id: memberId, workspaceId: job.workspaceId, userId: user.id },
        select: { id: true },
      })
    )
      return true;
    const grant = await db.memberPortalGrant.findFirst({
      where: {
        memberId,
        workspaceId: job.workspaceId,
        userId: user.id,
        revokedAt: null,
        canBook: true,
      },
      select: { guardianId: true },
    });
    return (
      !!grant &&
      !!(await db.familyLink.findFirst({
        where: {
          workspaceId: job.workspaceId,
          guardianId: grant.guardianId,
          childMemberId: memberId,
        },
        select: { id: true },
      }))
    );
  }
  return false;
}
