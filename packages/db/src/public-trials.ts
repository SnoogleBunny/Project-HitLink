import { enqueueClassBookingConfirmationTx } from "./class-booking-notifications.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { classOccurrenceInclude, lockClassSchedule, resolveClassOccurrence } from "./class-occurrences.js";
import { createVerifiedTrialBookingTx } from "./class-access.js";
import { dateOnlyStringToUtcDate, parseDateOnlyString, toDateOnlyString } from "./occurrences.js";
import { PublicEnrollmentError, publicEnrollmentFormsTx, readPublicParticipant, requirePublicWorkspace } from "./public-enrollment.js";

export type VerifiedTrialResult = { status: "booked" | "already_booked"; bookingId: string; formsRequired: number } | { status: "error"; message: string };
class TrialFailure extends Error {}
function isMinor(date: Date, now: Date) { return new Date(Date.UTC(date.getUTCFullYear() + 18, date.getUTCMonth(), date.getUTCDate())) > now; }
/** Email verification is a prerequisite, not authority to join another person's records. */
export async function completeVerifiedTrial(args: { workspaceId: string; enrollmentId: string; actorUserId: string; portalBaseUrl?: string; db?: PrismaClient; now?: Date }): Promise<VerifiedTrialResult> {
  const db = args.db ?? prisma, now = args.now ?? new Date();
  try {
    return await db.$transaction(async (tx) => {
      await lockClassSchedule(tx, args.workspaceId);
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))::text", `family-access:${args.workspaceId}`);
      const enrollment = await tx.publicEnrollment.findFirst({ where: { id: args.enrollmentId, workspaceId: args.workspaceId, kind: "TRIAL" } });
      if (!enrollment?.verifiedAt || !enrollment.memberId) throw new TrialFailure("Verify your account before booking a trial.");
      const participant = readPublicParticipant(enrollment);
      if (participant.accountUserId !== args.actorUserId) throw new TrialFailure("Sign in to the account used for this trial registration.");
      const [member, account] = await Promise.all([
        tx.member.findFirst({ where: { id: enrollment.memberId, workspaceId: args.workspaceId } }),
        tx.workspaceUser.findFirst({ where: { workspaceId: args.workspaceId, userId: args.actorUserId, role: "CUSTOMER", isActive: true } }),
      ]);
      if (!member || !account || parseDateOnlyString(participant.dateOfBirth).status === "error") throw new TrialFailure("This account cannot book the trial. Ask the gym to review your access.");
      const birthday = member.dateOfBirth ?? dateOnlyStringToUtcDate(participant.dateOfBirth);
      if (member.dateOfBirth && toDateOnlyString(member.dateOfBirth) !== participant.dateOfBirth) throw new TrialFailure("The participant details changed. Ask the gym to review this registration.");
      if (isMinor(birthday, now)) {
        const grant = participant.guardianId ? await tx.memberPortalGrant.findFirst({ where: { workspaceId: args.workspaceId, userId: args.actorUserId, memberId: member.id, guardianId: participant.guardianId, revokedAt: null, canBook: true, canSign: true }, include: { guardian: true } }) : null;
        if (!grant?.verifiedAt || grant.guardian.workspaceId !== args.workspaceId || !await tx.familyLink.findFirst({ where: { workspaceId: args.workspaceId, guardianId: grant.guardianId, childMemberId: member.id } })) throw new TrialFailure("The gym must verify guardian access before this child can be booked or signed for.");
      } else if (member.userId !== args.actorUserId || participant.guardianId) throw new TrialFailure("An adult trial needs the participant's own verified account.");
      if (participant.classBookingId) {
        const prior = await tx.classBooking.findFirst({ where: { id: participant.classBookingId, workspaceId: args.workspaceId, memberId: member.id, bookingType: "TRIAL" } });
        if (!prior || prior.status === "CANCELLED") throw new TrialFailure("This trial booking was cancelled or changed. It has not been restored. Choose a new trial date or contact the gym.");
        const forms = await publicEnrollmentFormsTx(tx, enrollment, args.actorUserId, true, now);
        return { status: "already_booked" as const, bookingId: prior.id, formsRequired: forms.filter((form) => !form.signed).length };
      }
      if (enrollment.createdAt.getTime() + 24 * 3600_000 <= now.getTime() || ["FAILED", "EXPIRED", "COMPLETE"].includes(enrollment.status)) throw new TrialFailure("This registration expired or is no longer available. Start a new trial registration.");
      const workspace = await requirePublicWorkspace(tx, args.workspaceId, now);
      if (!workspace.location) throw new TrialFailure("The gym needs to finish its location settings first.");
      const website = await tx.workspaceWebsite.findUnique({ where: { workspaceId: args.workspaceId } });
      if (!website?.publishedAt || !website.published) throw new TrialFailure("Online trial registration is not currently published.");
      if (!participant.classTemplateId || parseDateOnlyString(participant.scheduledForDate).status === "error") throw new TrialFailure("Choose a valid trial class date.");
      const template = await tx.classTemplate.findFirst({ where: { id: participant.classTemplateId, workspaceId: args.workspaceId, archivedAt: null }, include: classOccurrenceInclude });
      const occurrence = template && resolveClassOccurrence({ template, scheduledForDate: participant.scheduledForDate });
      if (!occurrence || occurrence.status !== "ACTIVE") throw new TrialFailure("This class changed. Choose another trial date.");
      const priorTrials = await tx.classBooking.findMany({ where: { workspaceId: args.workspaceId, memberId: member.id, bookingType: "TRIAL", status: { not: "CANCELLED" } }, include: { classTemplate: { include: classOccurrenceInclude } } });
      const hasTrial = priorTrials.some((booking) => {
        const policy = booking.acceptedPolicy as { trialProgramId?: string } | null;
        const programId = policy?.trialProgramId ?? resolveClassOccurrence({ template: booking.classTemplate, scheduledForDate: toDateOnlyString(booking.scheduledForDate) })?.programId ?? booking.classTemplate.programId;
        return programId === occurrence.programId;
      });
      if (hasTrial) throw new TrialFailure("This participant already has a trial in this program. Open Classes to manage it, or ask the gym about the next step.");
      const sameDate = await tx.classBooking.findFirst({ where: { workspaceId: args.workspaceId, memberId: member.id, classTemplateId: template!.id, scheduledForDate: dateOnlyStringToUtcDate(participant.scheduledForDate) } });
      if (sameDate) throw new TrialFailure("This participant already has a record for that class date. Choose another date or ask the gym to review it.");
      const booked = await createVerifiedTrialBookingTx({ workspaceId: args.workspaceId, memberId: member.id, guardianId: participant.guardianId, classTemplateId: template!.id, scheduledForDate: participant.scheduledForDate, timezone: workspace.location.timezone, db: tx, now });
      if (booked.status === "error") throw new TrialFailure(booked.message);
      if (booked.status === "payment_required") throw new TrialFailure("This trial could not be booked. Contact the gym.");
      await tx.classBooking.update({ where: { id: booked.bookingId }, data: { acceptedPolicy: { trialEnrollmentId: enrollment.id, trialProgramId: occurrence.programId, oneTrialPerProgram: true } } });
      const forms = await publicEnrollmentFormsTx(tx, enrollment, args.actorUserId, true, now);
      await tx.publicEnrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETE", completedAt: now, participant: { ...participant, classBookingId: booked.bookingId, identityReview: false } as unknown as Prisma.InputJsonObject, version: { increment: 1 } } });
      await enqueueClassBookingConfirmationTx(tx, { workspaceId: args.workspaceId, bookingId: booked.bookingId, now, portalBaseUrl: args.portalBaseUrl });
      return { status: "booked" as const, bookingId: booked.bookingId, formsRequired: forms.filter((form) => !form.signed).length };
    });
  } catch (error) {
    if (error instanceof TrialFailure || error instanceof PublicEnrollmentError) return { status: "error", message: error.message };
    throw error;
  }
}
