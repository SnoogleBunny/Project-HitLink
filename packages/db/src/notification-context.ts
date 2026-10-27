import type { PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import {
  isLegacyVerifiedTrialNoticeEnvelope,
  type NotificationJobRecord,
} from "./notification-outbox.js";
import { shouldDeliverClassBookingNotice } from "./class-booking-notifications.js";
/** Only operational metadata is queried. Private note text never enters delivery logs or messages. */
export async function shouldDeliverNotification(
  job: NotificationJobRecord,
  db: PrismaClient = prisma,
  suppliedNow?: Date,
) {
  const now = suppliedNow ?? new Date();
  const context = job.context as
    | {
        kind?: string;
        enrollmentId?: string;
        noteId?: string;
        revisionId?: string;
        revisionNumber?: number;
        bookingId?: string;
        fundingRevision?: number;
        receiptId?: string;
        memberId?: string;
        grantId?: string;
        verificationHash?: string;
        issuedAt?: string;
        inviteId?: string;
        tokenHash?: string;
        setupId?: string;
        confirmationId?: string;
        snapshotHash?: string;
        payerUserId?: string;
        invoiceId?: string;
        payerAccountId?: string;
      }
    | null
    | undefined;
  if (!context?.kind) return true;
  if (context.kind === "CLASS_SERVICE_NOTICE") {
    return shouldDeliverClassBookingNotice(job, db, suppliedNow);
  }
  if (context.kind === "FORM_REQUIREMENT") {
    const { shouldDeliverFormRequirementNotice } =
      await import("./form-requirements.js");
    return shouldDeliverFormRequirementNotice(job, db, now);
  }
  if (context.kind === "MEMBERSHIP_GRACE_RELEASE") {
    if (
      !context.bookingId ||
      !context.memberId ||
      !context.receiptId ||
      !Number.isSafeInteger(context.fundingRevision) ||
      Number(context.fundingRevision) < 1
    )
      return false;
    const [booking, receipt] = await Promise.all([
      db.classBooking.findFirst({
        where: {
          id: context.bookingId,
          workspaceId: job.workspaceId,
          memberId: context.memberId,
          status: "CANCELLED",
          fundingRevision: context.fundingRevision,
        },
        select: { id: true },
      }),
      db.workspaceDataEvent.findFirst({
        where: {
          id: context.receiptId,
          workspaceId: job.workspaceId,
          kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED",
        },
        select: { metadata: true },
      }),
    ]);
    const proof = receipt?.metadata as
      | { bookingId?: unknown; memberId?: unknown; fundingRevision?: unknown }
      | undefined;
    if (
      !booking ||
      proof?.bookingId !== context.bookingId ||
      proof.memberId !== context.memberId ||
      proof.fundingRevision !== context.fundingRevision
    )
      return false;
    // Current exact beneficiary/guardian authorization, never a saved contact address.
    const { memberNotificationRecipients } =
      await import("./member-notification-recipients.js");
    const recipients = await memberNotificationRecipients(db, job.workspaceId, [
      context.memberId,
    ]);
    return recipients.some(
      (recipient) =>
        recipient.email.toLowerCase() === job.recipientEmail.toLowerCase(),
    );
  }
  if (context.kind === "INVOICE_PAYMENT_FAILURE") {
    if (!context.invoiceId || !context.payerAccountId) return false;
    return !!(await db.invoice.findFirst({
      where: {
        id: context.invoiceId,
        workspaceId: job.workspaceId,
        payerAccountId: context.payerAccountId,
        status: { in: ["OPEN", "UNCOLLECTIBLE"] },
        amountDueCents: { gt: 0 },
        payerAccount: {
          workspaceId: job.workspaceId,
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
    }));
  }
  if (context.kind === "PAYMENT_CONFIRMATION") {
    if (
      !context.confirmationId ||
      !context.snapshotHash ||
      !context.payerUserId
    )
      return false;
    return !!(await db.paymentConfirmation.findFirst({
      where: {
        id: context.confirmationId,
        workspaceId: job.workspaceId,
        snapshotHash: context.snapshotHash,
        payerUserId: context.payerUserId,
        payerAccount: {
          workspaceId: job.workspaceId,
          userId: context.payerUserId,
          user: {
            email: job.recipientEmail,
            workspaceUsers: {
              some: {
                workspaceId: job.workspaceId,
                userId: context.payerUserId,
                role: "CUSTOMER",
                isActive: true,
              },
            },
          },
        },
      },
      select: { id: true },
    }));
  }
  if (context.kind === "WORKSPACE_SETUP") {
    if (
      !context.setupId ||
      !context.verificationHash ||
      !context.issuedAt ||
      !Number.isFinite(Date.parse(context.issuedAt))
    )
      return false;
    const setup = await db.workspaceSetup.findFirst({
      where: {
        id: context.setupId,
        workspaceId: job.workspaceId,
        verificationHash: context.verificationHash,
        verificationRequestedAt: new Date(context.issuedAt),
        verificationExpiresAt: { gt: now },
        ownerVerifiedAt: null,
        workspace: {
          status: "SETUP_INCOMPLETE",
          migration: null,
          setupActivation: null,
        },
      },
      select: { ownerUserId: true, verificationEmailHash: true },
    });
    if (!setup) return false;
    const owner = await db.workspaceUser.findFirst({
      where: {
        workspaceId: job.workspaceId,
        userId: setup.ownerUserId,
        role: "OWNER",
        isActive: true,
        user: { email: job.recipientEmail },
      },
      select: { user: { select: { email: true } } },
    });
    if (!owner) return false;
    const { createHash } = await import("node:crypto");
    return (
      setup.verificationEmailHash ===
      createHash("sha256")
        .update(owner.user.email.trim().toLowerCase())
        .digest("hex")
    );
  }
  if (context.kind === "STAFF_INVITE") {
    if (!context.inviteId || !context.tokenHash) return false;
    const invite = await db.staffInvite.findFirst({
      where: {
        id: context.inviteId,
        workspaceId: job.workspaceId,
        token: context.tokenHash,
        email: job.recipientEmail,
        role: "COACH",
        status: "PENDING",
        expiresAt: { gt: now },
        workspace: { status: { not: "DISABLED" } },
      },
      select: { invitedByUserId: true },
    });
    return (
      !!invite &&
      !!(await db.workspaceUser.findFirst({
        where: {
          workspaceId: job.workspaceId,
          userId: invite.invitedByUserId,
          role: "OWNER",
          isActive: true,
        },
        select: { id: true },
      }))
    );
  }
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
    if (context.kind === "CLASS_BOOKING") {
      // A preview/retry predicate cannot modernize historical bytes or establish an unattempted claim.
      // Read the stored envelope even when a caller supplied only the older transport projection.
      const stored = await db.notificationJob.findFirst({
        where: { id: job.id, workspaceId: job.workspaceId },
        select: { templateKind: true, dedupeKey: true, context: true },
      });
      if (
        isLegacyVerifiedTrialNoticeEnvelope(job) ||
        isLegacyVerifiedTrialNoticeEnvelope({ ...job, ...stored }) ||
        (stored &&
          (stored.context as { kind?: string } | null)?.kind !==
            "CLASS_BOOKING")
      )
        return false;
    }
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
