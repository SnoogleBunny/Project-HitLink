import { createHash } from "node:crypto";
import { membershipCanFundDate } from "./class-access.js";
import {
  lockMembershipGraceResourcesTx,
  membershipGracePendingDebtWhere,
  membershipGraceRestrictionFor,
} from "./membership-grace-disposition.js";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import {
  classOccurrenceInclude,
  isUnambiguousClassTime,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import {
  addDays,
  dateOnlyStringToUtcDate,
  getZonedDateTimeAsUtc,
  toDateOnlyString,
} from "./occurrences.js";
import { lockFormRequirementsTx } from "./form-requirements.js";
import { resolveRequiredFormStatusesForMember } from "./forms.js";
import { memberNotificationRecipients } from "./member-notification-recipients.js";
import {
  enqueueNotificationJob,
  isLegacyVerifiedTrialNoticeEnvelope,
  type NotificationJobRecord,
} from "./notification-outbox.js";
import { checkMemberClassEligibility } from "./program-progress.js";
import { lockStaffAuthorityTx } from "./staff-access.js";
import { financialEntitlementHoldReason } from "./entitlement-holds.js";
import { isWorkspaceOperationallyReady } from "./workspace-readiness.js";

type Tx = Prisma.TransactionClient;
export type ClassBookingNoticeKind = "CONFIRMATION" | "REMINDER";
export interface ClassReminderCursor {
  afterId: string;
  highWaterId: string;
  settingsVersion: number;
}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
function portalLink(date: string, configured?: string) {
  const base =
    configured ??
    process.env.NEXT_PUBLIC_MEMBER_WEB_URL ??
    process.env.NEXT_PUBLIC_MEMBER_APP_URL;
  if (!base) return "your secure member portal → Classes";
  try {
    const url = new URL(base);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      return "your secure member portal → Classes";
    return new URL(`/app/schedule?date=${encodeURIComponent(date)}`, url.origin)
      .href;
  } catch {
    return "your secure member portal → Classes";
  }
}

/** Schedule -> family -> financial -> exact funding -> recipient identities. No email path changes seats or funding. */
async function currentNoticeState(
  tx: Tx,
  args: { workspaceId: string; bookingId: string; now?: Date },
) {
  await lockMembershipGraceResourcesTx(tx, args.workspaceId);
  await lockFormRequirementsTx(tx, args.workspaceId);
  const selected = await tx.classBooking.findFirst({
    where: {
      id: args.bookingId,
      workspaceId: args.workspaceId,
      status: "BOOKED",
    },
    select: {
      id: true,
      memberId: true,
      fundingMembershipId: true,
      bookingType: true,
    },
  });
  if (!selected) return null;
  if (selected.fundingMembershipId) {
    await tx.$queryRaw`SELECT id FROM member_memberships WHERE "workspaceId"=${args.workspaceId} AND id=${selected.fundingMembershipId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM invoices WHERE "workspaceId"=${args.workspaceId} AND "memberMembershipId"=${selected.fundingMembershipId} ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM membership_billing_states WHERE "workspaceId"=${args.workspaceId} AND "memberMembershipId"=${selected.fundingMembershipId} FOR SHARE`;
  }
  await tx.$queryRaw`SELECT id FROM class_bookings WHERE "workspaceId"=${args.workspaceId} AND id=${selected.id} FOR SHARE`;
  const candidates = await memberNotificationRecipients(tx, args.workspaceId, [
    selected.memberId,
  ]);
  const users = await tx.user.findMany({
    where: { email: { in: candidates.map((recipient) => recipient.email) } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const user of users)
    await lockStaffAuthorityTx(tx, {
      workspaceId: args.workspaceId,
      userId: user.id,
    });
  // All decisions use this post-wait clock and current reads, including a recipient-role wait.
  const now = args.now ?? new Date();
  if (!Number.isFinite(+now))
    throw new Error("Class notices need a valid current clock.");
  const booking = await tx.classBooking.findFirst({
    where: { id: selected.id, workspaceId: args.workspaceId, status: "BOOKED" },
    include: {
      member: { select: { fullName: true, status: true, archivedAt: true } },
      classTemplate: { include: classOccurrenceInclude },
      workspace: {
        include: {
          location: true,
          migration: true,
          setupActivation: true,
          settings: true,
        },
      },
    },
  });
  if (
    !booking ||
    booking.memberId !== selected.memberId ||
    booking.fundingMembershipId !== selected.fundingMembershipId ||
    booking.member.archivedAt ||
    !["ACTIVE", "TRIAL"].includes(booking.member.status)
  )
    return null;
  const workspace = booking.workspace;
  if (
    !isWorkspaceOperationallyReady({
      workspaceStatus: workspace.status,
      setupActivation: workspace.setupActivation,
      migrationStage: workspace.migration?.stage,
      ownerReviewAcknowledgedAt: workspace.migration?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId:
        workspace.migration?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: workspace.migration?.operationallyReadyAt,
      operationallyReadyByUserId:
        workspace.migration?.operationallyReadyByUserId,
    })
  )
    return null;
  const date = toDateOnlyString(booking.scheduledForDate),
    occurrence = resolveClassOccurrence({
      template: booking.classTemplate,
      scheduledForDate: date,
    });
  const location = workspace.location,
    timezone = occurrence?.timezone ?? location?.timezone;
  if (
    !occurrence ||
    occurrence.status !== "ACTIVE" ||
    booking.classTemplate.archivedAt ||
    occurrence.program.archivedAt ||
    occurrence.room.archivedAt ||
    occurrence.room.isActive === false ||
    !location ||
    !timezone ||
    !isUnambiguousClassTime(date, occurrence.startTimeMinutes, timezone) ||
    !isUnambiguousClassTime(
      occurrence.endTimeMinutes === 1440 ? addDays(date, 1) : date,
      occurrence.endTimeMinutes === 1440 ? 0 : occurrence.endTimeMinutes,
      timezone,
    )
  )
    return null;
  const startsAt = getZonedDateTimeAsUtc({
      dateString: date,
      minutes: occurrence.startTimeMinutes,
      timezone,
    }),
    endsAt = getZonedDateTimeAsUtc({
      dateString: date,
      minutes: occurrence.endTimeMinutes,
      timezone,
    });
  if (startsAt <= now || endsAt <= startsAt) return null;
  if (booking.bookingType === "MEMBERSHIP") {
    if (!booking.fundingMembershipId) return null;
    const membership = await tx.memberMembership.findFirst({
      where: {
        id: booking.fundingMembershipId,
        workspaceId: args.workspaceId,
        memberId: booking.memberId,
      },
      include: {
        billingState: true,
        sourceBillingEvidence: true,
        _count: {
          select: { invoices: { where: { workspaceId: args.workspaceId } } },
        },
        invoices: {
          where: {
            ...membershipGracePendingDebtWhere,
            workspaceId: args.workspaceId,
          },
          orderBy: [
            { gracePeriodEndsAt: { sort: "asc", nulls: "first" } },
            { id: "asc" },
          ],
        },
      },
    });
    if (
      !membership ||
      (membership.billingState &&
        (membership.billingState.workspaceId !== args.workspaceId ||
          membership.billingState.memberId !== booking.memberId)) ||
      membership.invoices.some(
        (invoice) =>
          invoice.memberId !== null && invoice.memberId !== booking.memberId,
      ) ||
      membershipGraceRestrictionFor(membership, now)
    )
      return null;
    // Canonical invoice history outranks a stale summary. Do not choose another product.
    // A pending failed invoice's fixed grace still applies; paid/void history has no debt.
    const canonical = membership._count.invoices > 0;
    const pendingGrace = membership.invoices[0]?.gracePeriodEndsAt;
    const billingState = canonical
      ? pendingGrace
        ? {
            ...membership.billingState,
            status: "GRACE_PERIOD" as const,
            gracePeriodEndsAt: pendingGrace,
          }
        : null
      : membership.billingState;
    const effective = {
      ...membership,
      status:
        canonical && membership.status === "PAST_DUE" && !pendingGrace
          ? ("ACTIVE" as const)
          : membership.status,
      billingState,
    };
    if (!membershipCanFundDate(effective, date, now)) return null;
  }
  if (
    !(
      await checkMemberClassEligibility({
        workspaceId: args.workspaceId,
        memberId: booking.memberId,
        scheduledForDate: date,
        occurrence,
        db: tx,
      })
    ).eligible
  )
    return null;
  if (
    await financialEntitlementHoldReason({
      workspaceId: args.workspaceId,
      targets: [
        { targetKind: "BOOKING", targetId: booking.id },
        { targetKind: "BOOKING", targetId: booking.fundedByBookingId },
        { targetKind: "PUNCH_CARD", targetId: booking.memberPunchCardId },
        { targetKind: "MEMBERSHIP", targetId: booking.fundingMembershipId },
      ],
      db: tx,
    })
  )
    return null;
  const forms = await resolveRequiredFormStatusesForMember({
    workspaceId: args.workspaceId,
    memberId: booking.memberId,
    targets: ["TRIAL", "MEMBER", "GUARDIAN"],
    ensureRequests: false,
    serviceAt: startsAt,
    db: tx as unknown as typeof prisma,
    now,
  });
  const outstandingForms = forms.items.filter(
    (item) => item.status !== "SIGNED",
  ).length;
  const recipients = await memberNotificationRecipients(tx, args.workspaceId, [
    booking.memberId,
  ]);
  const address = [
    location.name,
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.region,
    location.postalCode,
    location.countryCode,
  ]
    .filter(Boolean)
    .map((value) => clean(value!))
    .join(", ");
  const cancellationClosesAt = new Date(
    +startsAt - occurrence.cancellationCutoffMinutes * 60_000,
  );
  const service = {
    title: clean(occurrence.displayTitle),
    date,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone,
    room: clean(occurrence.room.name),
    address,
    cancellationClosesAt: cancellationClosesAt.toISOString(),
    providerChangedAt: booking.providerChangedAt?.toISOString() ?? null,
  };
  const details = {
    ...service,
    participant: clean(booking.member.fullName),
    outstandingForms,
  };
  return {
    booking,
    occurrence,
    startsAt,
    endsAt,
    recipients,
    details,
    detailsHash: hash(details),
    serviceHash: hash(service),
    now,
  };
}
const formSentence = (count: number) =>
  count
    ? `${count} required ${count === 1 ? "form needs" : "forms need"} completion before attendance.`
    : "No outstanding required forms for this class.";
function noticeBody(
  state: NonNullable<Awaited<ReturnType<typeof currentNoticeState>>>,
  kind: ClassBookingNoticeKind,
  configured?: string,
) {
  const d = state.details,
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: d.timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  const forms = formSentence(d.outstandingForms);
  const cancellation = d.providerChangedAt
    ? "The gym changed this booking. Open Classes to review the current recovery and cancellation options."
    : `Cancellation deadline: ${formatter.format(new Date(d.cancellationClosesAt))} (${d.timezone}). Later cancellations follow the terms accepted for this booking.`;
  return `${kind === "REMINDER" ? "Class reminder" : state.booking.bookingType === "TRIAL" ? "Trial booking confirmed" : "Booking confirmed"} for ${d.participant}: ${d.title}.\n${formatter.format(state.startsAt)}–${new Intl.DateTimeFormat("en-CA", { timeZone: d.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(state.endsAt)} (${d.timezone}).\nLocation: ${d.address}. Room: ${d.room}.\n${forms}\n${cancellation}\nReview required forms or cancel this exact booking in Classes: ${portalLink(d.date, configured)}.`;
}

/** Enqueue inside the transaction that commits the actual booking, never a pending payment or source restoration. */
export async function enqueueClassBookingConfirmationTx(
  tx: Tx,
  args: {
    workspaceId: string;
    bookingId: string;
    now: Date;
    portalBaseUrl?: string;
  },
) {
  const state = await currentNoticeState(tx, args);
  if (!state) return { queued: 0 };
  for (const recipient of state.recipients)
    await enqueueNotificationJob({
      db: tx,
      now: state.now,
      input: {
        workspaceId: args.workspaceId,
        templateKind:
          state.booking.bookingType === "TRIAL"
            ? "TRIAL_CONFIRMATION"
            : "BOOKING_CONFIRMATION",
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        subject:
          state.booking.bookingType === "TRIAL"
            ? "Your trial booking is confirmed"
            : "Your class booking is confirmed",
        body: noticeBody(state, "CONFIRMATION", args.portalBaseUrl),
        dedupeKey: `class-confirmation:${state.booking.id}:${state.booking.fundingRevision}:${recipient.email.toLowerCase()}`,
        context: {
          kind: "CLASS_SERVICE_NOTICE",
          notice: "CONFIRMATION",
          bookingId: state.booking.id,
          fundingRevision: state.booking.fundingRevision,
          detailsHash: state.detailsHash,
          serviceHash: state.serviceHash,
          participant: state.details.participant,
          outstandingForms: state.details.outstandingForms,
        },
        expiresAt: state.startsAt,
      },
    });
  return { queued: state.recipients.length };
}

/** No default timing. Missing/off owner configuration performs no booking scan and creates no reminders. */
export async function processClassBookingReminders(args: {
  workspaceId: string;
  db?: PrismaClient;
  now?: Date;
  limit?: number;
  cursor?: ClassReminderCursor;
  portalBaseUrl?: string;
}) {
  const db = args.db ?? prisma,
    limit = Math.min(
      100,
      Math.max(1, Math.floor(Number.isFinite(args.limit) ? args.limit! : 25)),
    );
  return db.$transaction(async (tx) => {
    await lockMembershipGraceResourcesTx(tx, args.workspaceId);
    await lockFormRequirementsTx(tx, args.workspaceId);
    const workspace = await tx.workspace.findUnique({
      where: { id: args.workspaceId },
      include: { settings: true, migration: true, setupActivation: true },
    });
    const now = args.now ?? new Date(),
      settings = workspace?.settings;
    if (
      !workspace ||
      !isWorkspaceOperationallyReady({
        workspaceStatus: workspace.status,
        setupActivation: workspace.setupActivation,
        migrationStage: workspace.migration?.stage,
        ownerReviewAcknowledgedAt:
          workspace.migration?.ownerReviewAcknowledgedAt,
        ownerReviewAcknowledgedByUserId:
          workspace.migration?.ownerReviewAcknowledgedByUserId,
        operationallyReadyAt: workspace.migration?.operationallyReadyAt,
        operationallyReadyByUserId:
          workspace.migration?.operationallyReadyByUserId,
      })
    )
      return {
        scanned: 0,
        queued: 0,
        nextCursor: null,
        configured: false,
        workspaceNotReady: true,
      };
    if (!settings?.classReminderLeadMinutes)
      return { scanned: 0, queued: 0, nextCursor: null, configured: false };
    if (
      !Number.isSafeInteger(settings.classReminderLeadMinutes) ||
      settings.classReminderLeadMinutes < 1 ||
      settings.classReminderLeadMinutes > 527040
    )
      throw new Error("Class reminder configuration needs review.");
    if (
      args.cursor &&
      args.cursor.settingsVersion !== settings.classReminderVersion
    )
      return {
        scanned: 0,
        queued: 0,
        nextCursor: null,
        configured: true,
        configurationChanged: true,
      };
    if (
      args.cursor &&
      (!/^[A-Za-z0-9:_-]{1,150}$/.test(args.cursor.afterId) ||
        !/^[A-Za-z0-9:_-]{1,150}$/.test(args.cursor.highWaterId) ||
        args.cursor.afterId === args.cursor.highWaterId)
    )
      throw new Error("Class reminder processing changed. Start a fresh pass.");
    const today = toDateOnlyString(now),
      through = toDateOnlyString(
        new Date(+now + settings.classReminderLeadMinutes * 60_000),
      );
    const where: Prisma.ClassBookingWhereInput = {
      workspaceId: args.workspaceId,
      status: "BOOKED",
      scheduledForDate: {
        gte: dateOnlyStringToUtcDate(addDays(today, -2)),
        lte: dateOnlyStringToUtcDate(addDays(through, 2)),
      },
    };
    const highWaterId =
      args.cursor?.highWaterId ??
      (
        await tx.classBooking.findFirst({
          where,
          orderBy: { id: "desc" },
          select: { id: true },
        })
      )?.id;
    if (!highWaterId)
      return { scanned: 0, queued: 0, nextCursor: null, configured: true };
    const candidates = await tx.classBooking.findMany({
      where: {
        ...where,
        id: {
          lte: highWaterId,
          ...(args.cursor ? { gt: args.cursor.afterId } : {}),
        },
      },
      orderBy: { id: "asc" },
      take: limit,
      select: { id: true },
    });
    let queued = 0;
    for (const candidate of candidates) {
      const state = await currentNoticeState(tx, {
        workspaceId: args.workspaceId,
        bookingId: candidate.id,
        now: args.now,
      });
      if (
        !state ||
        +state.startsAt - state.now.getTime() >
          settings.classReminderLeadMinutes * 60_000
      )
        continue;
      for (const recipient of state.recipients) {
        // Replace only an unattempted obsolete body. SENT/SENDING or a recorded provider boundary retain the original delivery identity.
        const sent = await tx.notificationJob.findFirst({
          where: {
            workspaceId: args.workspaceId,
            recipientEmail: recipient.email.toLowerCase(),
            OR: [
              { status: { in: ["SENT", "SENDING"] } },
              { classNoticeDeliveryStartedAt: { not: null } },
            ],
            AND: [
              { context: { path: ["kind"], equals: "CLASS_SERVICE_NOTICE" } },
              { context: { path: ["notice"], equals: "REMINDER" } },
              { context: { path: ["bookingId"], equals: state.booking.id } },
              {
                context: {
                  path: ["fundingRevision"],
                  equals: state.booking.fundingRevision,
                },
              },
            ],
          },
          select: { id: true },
        });
        if (sent) continue;
        const dedupeKey = `class-reminder:${state.booking.id}:${state.booking.fundingRevision}:${settings.classReminderVersion}:${state.detailsHash}:${recipient.email.toLowerCase()}`;
        const existing = await tx.notificationJob.findUnique({
          where: {
            workspaceId_dedupeKey: { workspaceId: args.workspaceId, dedupeKey },
          },
          select: { id: true },
        });
        if (existing) continue;
        await enqueueNotificationJob({
          db: tx,
          now: args.now,
          input: {
            workspaceId: args.workspaceId,
            templateKind: "CLASS_REMINDER",
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            subject:
              state.booking.bookingType === "TRIAL"
                ? "Your trial class reminder"
                : "Your class reminder",
            body: noticeBody(state, "REMINDER", args.portalBaseUrl),
            dedupeKey,
            context: {
              kind: "CLASS_SERVICE_NOTICE",
              notice: "REMINDER",
              bookingId: state.booking.id,
              fundingRevision: state.booking.fundingRevision,
              detailsHash: state.detailsHash,
              serviceHash: state.serviceHash,
              participant: state.details.participant,
              outstandingForms: state.details.outstandingForms,
              settingsVersion: settings.classReminderVersion,
            },
            expiresAt: state.startsAt,
          },
        });
        queued++;
      }
    }
    const last = candidates.at(-1)?.id;
    const more =
      last &&
      !!(await tx.classBooking.findFirst({
        where: { ...where, id: { gt: last, lte: highWaterId } },
        select: { id: true },
      }));
    return {
      scanned: candidates.length,
      queued,
      nextCursor: more
        ? {
            afterId: last!,
            highWaterId,
            settingsVersion: settings.classReminderVersion,
          }
        : null,
      configured: true,
    };
  });
}

/** Recheck exact booking/revision, dated details, forms, eligibility and current service recipient immediately before dispatch. */
async function checkClassBookingNotice(
  job: NotificationJobRecord,
  db: PrismaClient | Tx,
  suppliedNow: Date | undefined,
  refreshUnattempted: false | "CLAIMED" | "RETRY",
) {
  const context = job.context as Record<string, unknown> | null;
  if (
    !context ||
    context.kind !== "CLASS_SERVICE_NOTICE" ||
    !["CONFIRMATION", "REMINDER"].includes(String(context.notice)) ||
    typeof context.bookingId !== "string" ||
    !Number.isSafeInteger(context.fundingRevision) ||
    typeof context.detailsHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(context.detailsHash)
  )
    return null;
  const check = async (tx: Tx) => {
    const state = await currentNoticeState(tx, {
      workspaceId: job.workspaceId,
      bookingId: context.bookingId as string,
      now: suppliedNow,
    });
    const dispatchNow = state?.now ?? suppliedNow ?? new Date();
    if (
      !state ||
      state.startsAt <= dispatchNow ||
      state.booking.fundingRevision !== context.fundingRevision ||
      !state.recipients.some(
        (recipient) =>
          recipient.email.toLowerCase() === job.recipientEmail.toLowerCase(),
      )
    )
      return null;
    const workspace = state.booking.workspace;
    if (
      !isWorkspaceOperationallyReady({
        workspaceStatus: workspace.status,
        setupActivation: workspace.setupActivation,
        migrationStage: workspace.migration?.stage,
        ownerReviewAcknowledgedAt:
          workspace.migration?.ownerReviewAcknowledgedAt,
        ownerReviewAcknowledgedByUserId:
          workspace.migration?.ownerReviewAcknowledgedByUserId,
        operationallyReadyAt: workspace.migration?.operationallyReadyAt,
        operationallyReadyByUserId:
          workspace.migration?.operationallyReadyByUserId,
      })
    )
      return null;
    if (context.notice === "REMINDER") {
      const delivered = await tx.notificationJob.findFirst({
        where: {
          id: { not: job.id },
          workspaceId: job.workspaceId,
          recipientEmail: job.recipientEmail.toLowerCase(),
          status: "SENT",
          AND: [
            { context: { path: ["kind"], equals: "CLASS_SERVICE_NOTICE" } },
            { context: { path: ["notice"], equals: "REMINDER" } },
            { context: { path: ["bookingId"], equals: state.booking.id } },
            {
              context: {
                path: ["fundingRevision"],
                equals: state.booking.fundingRevision,
              },
            },
          ],
        },
        select: { id: true },
      });
      if (delivered) return null;
      const settings = state.booking.workspace.settings;
      if (
        !(
          !!settings?.classReminderLeadMinutes &&
          context.settingsVersion === settings.classReminderVersion &&
          +state.startsAt - +dispatchNow <=
            settings.classReminderLeadMinutes * 60_000
        )
      )
        return null;
    }
    if (state.detailsHash === context.detailsHash) return job;
    if (
      !refreshUnattempted ||
      context.notice !== "CONFIRMATION" ||
      job.classNoticeDeliveryStartedAt != null ||
      context.serviceHash !== state.serviceHash ||
      typeof context.participant !== "string" ||
      !Number.isSafeInteger(context.outstandingForms) ||
      Number(context.outstandingForms) < 0
    )
      return null;
    // Change exactly the participant and forms lines. Retain link, service, ID and provider key.
    const lines = job.body.split("\n"),
      heading =
        state.booking.bookingType === "TRIAL"
          ? "Trial booking confirmed"
          : "Booking confirmed";
    if (
      lines.length !== 6 ||
      lines[0] !==
        `${heading} for ${context.participant}: ${state.details.title}.` ||
      lines[3] !== formSentence(Number(context.outstandingForms))
    )
      return null;
    lines[0] = `${heading} for ${state.details.participant}: ${state.details.title}.`;
    lines[3] = formSentence(state.details.outstandingForms);
    if (refreshUnattempted === "RETRY") return job; // Authorization only; the claimed worker later refreshes exact bytes.
    const body = lines.join("\n"),
      updatedContext = {
        ...context,
        detailsHash: state.detailsHash,
        participant: state.details.participant,
        outstandingForms: state.details.outstandingForms,
      } as Prisma.InputJsonObject;
    const updated = await tx.notificationJob.updateMany({
      where: {
        id: job.id,
        workspaceId: job.workspaceId,
        status: "SENDING",
        attempts: job.attempts + 1,
        classNoticeDeliveryStartedAt: null,
        body: job.body,
        context: { equals: job.context as Prisma.InputJsonValue },
      },
      data: { body, context: updatedContext },
    });
    return updated.count === 1
      ? { ...job, body, context: updatedContext as Prisma.JsonObject }
      : null;
  };
  return typeof (db as PrismaClient).$transaction === "function"
    ? (db as PrismaClient).$transaction(check)
    : check(db as Tx);
}

/** Pure delivery predicate for previews/retry. It never refreshes an unclaimed message. */
export async function shouldDeliverClassBookingNotice(
  job: NotificationJobRecord,
  db: PrismaClient | Tx = prisma,
  suppliedNow?: Date,
) {
  return !!(await checkClassBookingNotice(job, db, suppliedNow, false));
}
/** Outbox-only preparation. Refresh is fenced by its actual SENDING attempt, before any provider boundary. */
export async function prepareClassBookingNoticeForDelivery(
  job: NotificationJobRecord,
  db: PrismaClient,
  suppliedNow?: Date,
) {
  return checkClassBookingNotice(job, db, suppliedNow, "CLAIMED");
}

/** Owner retry may authorize a harmless refresh, but never mutates an unclaimed body or returns refreshed adapter bytes. */
export async function canRetryClassBookingNotice(
  job: NotificationJobRecord,
  tx: Tx,
  suppliedNow?: Date,
) {
  return !!(await checkClassBookingNotice(job, tx, suppliedNow, "RETRY"));
}

/** The last awaited identity lock is the claimed transport row, before final currentness and the provider marker. */
export async function finalizeClassBookingNoticeForDelivery(
  job: NotificationJobRecord,
  db: PrismaClient,
  suppliedNow?: Date,
) {
  return db.$transaction(async (tx) => {
    await lockMembershipGraceResourcesTx(tx, job.workspaceId);
    // Transport identity is acquired within the canonical scopes, before reading exact funding/recipient state.
    await tx.$queryRaw`SELECT id FROM notification_jobs WHERE id=${job.id} AND "workspaceId"=${job.workspaceId} FOR UPDATE`;
    const claimed = await tx.notificationJob.findFirst({
      where: {
        id: job.id,
        workspaceId: job.workspaceId,
        status: "SENDING",
        attempts: job.attempts + 1,
      },
    });
    if (
      !claimed ||
      claimed.recipientEmail.toLowerCase() !== job.recipientEmail.toLowerCase()
    )
      return null;
    const current = await checkClassBookingNotice(
      { ...claimed, attempts: job.attempts },
      tx,
      suppliedNow,
      "CLAIMED",
    );
    if (!current) return null;
    // This row is already locked. No later DB wait separates the final currentness guard from the durable marker.
    const boundaryAt =
      current.classNoticeDeliveryStartedAt ?? suppliedNow ?? new Date();
    const marked = await tx.notificationJob.updateMany({
      where: {
        id: job.id,
        workspaceId: job.workspaceId,
        status: "SENDING",
        attempts: job.attempts + 1,
      },
      data: { classNoticeDeliveryStartedAt: boundaryAt },
    });
    return marked.count === 1
      ? { ...current, classNoticeDeliveryStartedAt: boundaryAt }
      : null;
  });
}

/** Narrow pre60 upgrade: only an actual never-claimed original trial may acquire accurate bytes under its existing transport identity. */
export async function prepareLegacyVerifiedTrialNoticeForDelivery(
  job: NotificationJobRecord,
  db: PrismaClient,
  suppliedNow?: Date,
): Promise<NotificationJobRecord | null> {
  // This is the lifetime state selected BEFORE the outbox increments its claim.
  // FAILED/SENDING or attempts>0 cannot be proven safe by the newly added NULL marker.
  if (
    !isLegacyVerifiedTrialNoticeEnvelope(job) ||
    job.status !== "PENDING" ||
    job.attempts !== 0 ||
    job.providerMessageId != null ||
    job.sentAt != null ||
    job.classNoticeDeliveryStartedAt != null
  )
    return null;
  return db.$transaction(async (tx) => {
    await lockMembershipGraceResourcesTx(tx, job.workspaceId);
    await tx.$queryRaw`SELECT id FROM notification_jobs WHERE id=${job.id} AND "workspaceId"=${job.workspaceId} FOR UPDATE`;
    const claimed = await tx.notificationJob.findFirst({
      where: {
        id: job.id,
        workspaceId: job.workspaceId,
        status: "SENDING",
        attempts: 1,
      },
    });
    if (
      !claimed ||
      !isLegacyVerifiedTrialNoticeEnvelope(claimed) ||
      claimed.dedupeKey !== job.dedupeKey ||
      claimed.recipientEmail.toLowerCase() !==
        job.recipientEmail.toLowerCase() ||
      claimed.body !== job.body ||
      claimed.subject !== job.subject ||
      claimed.providerMessageId != null ||
      claimed.sentAt != null ||
      claimed.classNoticeDeliveryStartedAt != null
    )
      return null;
    const context = claimed.context as {
      kind?: unknown;
      bookingId?: unknown;
    } | null;
    if (typeof context?.bookingId !== "string") return null;
    const booking = await tx.classBooking.findFirst({
      where: { id: context.bookingId, workspaceId: job.workspaceId },
    });
    const policy = booking?.acceptedPolicy as {
      trialEnrollmentId?: unknown;
      trialProgramId?: unknown;
      oneTrialPerProgram?: unknown;
    } | null;
    if (
      !booking ||
      booking.status !== "BOOKED" ||
      booking.source !== "PUBLIC_TRIAL" ||
      booking.bookingType !== "TRIAL" ||
      booking.fundingRevision !== 1 ||
      booking.fundingMembershipId != null ||
      booking.memberPunchCardId != null ||
      booking.fundedByBookingId != null ||
      booking.providerChangedAt != null ||
      typeof policy?.trialEnrollmentId !== "string" ||
      typeof policy.trialProgramId !== "string" ||
      policy.oneTrialPerProgram !== true ||
      claimed.dedupeKey !==
        `verified-trial:${policy.trialEnrollmentId}:${booking.id}`
    )
      return null;
    // Lock the historical binding before currentNoticeState's final identity waits/clock.
    await tx.$queryRaw`SELECT id FROM public_enrollments WHERE id=${policy.trialEnrollmentId} AND "workspaceId"=${job.workspaceId} FOR SHARE`;
    const enrollment = await tx.publicEnrollment.findFirst({
      where: {
        id: policy.trialEnrollmentId,
        workspaceId: job.workspaceId,
        kind: "TRIAL",
      },
    });
    const participant = enrollment?.participant as
      | {
          accountUserId?: unknown;
          classBookingId?: unknown;
          classTemplateId?: unknown;
          scheduledForDate?: unknown;
          guardianId?: unknown;
          identityReview?: unknown;
        }
      | undefined;
    if (
      !enrollment?.verifiedAt ||
      enrollment.status !== "COMPLETE" ||
      !enrollment.completedAt ||
      enrollment.memberId !== booking.memberId ||
      enrollment.email.toLowerCase() !== claimed.recipientEmail.toLowerCase() ||
      typeof participant?.accountUserId !== "string" ||
      participant.identityReview === true ||
      participant.classBookingId !== booking.id ||
      participant.classTemplateId !== booking.classTemplateId ||
      participant.scheduledForDate !==
        toDateOnlyString(booking.scheduledForDate) ||
      (participant.guardianId ?? null) !== booking.guardianId
    )
      return null;
    const state = await currentNoticeState(tx, {
      workspaceId: job.workspaceId,
      bookingId: booking.id,
      now: suppliedNow,
    });
    if (
      !state ||
      state.booking.fundingRevision !== 1 ||
      state.booking.source !== "PUBLIC_TRIAL" ||
      state.booking.bookingType !== "TRIAL" ||
      state.booking.memberId !== enrollment.memberId ||
      state.booking.guardianId !== booking.guardianId ||
      state.occurrence.programId !== policy.trialProgramId ||
      state.booking.providerChangedAt != null ||
      !claimed.expiresAt ||
      +claimed.expiresAt !== +state.startsAt
    )
      return null;
    const recipient = state.recipients.find(
      (item) =>
        item.email.toLowerCase() === claimed.recipientEmail.toLowerCase(),
    );
    const account = await tx.user.findFirst({
      where: { id: participant.accountUserId, email: claimed.recipientEmail },
      select: { id: true },
    });
    const member = await tx.member.findFirst({
      where: { id: state.booking.memberId, workspaceId: job.workspaceId },
      select: { userId: true },
    });
    if (!recipient || !account || !member) return null;
    if (state.booking.guardianId) {
      const grant = await tx.memberPortalGrant.findFirst({
        where: {
          workspaceId: job.workspaceId,
          userId: account.id,
          memberId: state.booking.memberId,
          guardianId: state.booking.guardianId,
          revokedAt: null,
          canBook: true,
          guardian: {
            workspaceId: job.workspaceId,
            familyLinks: {
              some: {
                workspaceId: job.workspaceId,
                childMemberId: state.booking.memberId,
              },
            },
          },
        },
        select: { id: true, verifiedAt: true },
      });
      if (!grant?.verifiedAt) return null;
    } else if (member.userId !== account.id) return null;
    const modern = await tx.notificationJob.findFirst({
      where: {
        id: { not: claimed.id },
        workspaceId: job.workspaceId,
        recipientEmail: claimed.recipientEmail,
        AND: [
          { context: { path: ["kind"], equals: "CLASS_SERVICE_NOTICE" } },
          { context: { path: ["notice"], equals: "CONFIRMATION" } },
          { context: { path: ["bookingId"], equals: state.booking.id } },
          { context: { path: ["fundingRevision"], equals: 1 } },
        ],
      },
      select: { id: true },
    });
    if (modern) return null; // That existing exact producer owns this confirmation, regardless of its transport outcome.
    const updatedContext: Prisma.InputJsonObject = {
      kind: "CLASS_SERVICE_NOTICE",
      notice: "CONFIRMATION",
      bookingId: state.booking.id,
      fundingRevision: 1,
      detailsHash: state.detailsHash,
      serviceHash: state.serviceHash,
      participant: state.details.participant,
      outstandingForms: state.details.outstandingForms,
      legacyVerifiedTrialEnrollmentId: enrollment.id,
    };
    const body = noticeBody(state, "CONFIRMATION");
    const updated = await tx.notificationJob.updateMany({
      where: {
        id: claimed.id,
        workspaceId: job.workspaceId,
        status: "SENDING",
        attempts: 1,
        templateKind: "ANNOUNCEMENT",
        dedupeKey: claimed.dedupeKey,
        classNoticeDeliveryStartedAt: null,
        providerMessageId: null,
        sentAt: null,
        body: claimed.body,
        context: { equals: claimed.context as Prisma.InputJsonValue },
      },
      data: {
        templateKind: "TRIAL_CONFIRMATION",
        recipientName: recipient.name,
        subject: "Your trial booking is confirmed",
        body,
        context: updatedContext,
      },
    });
    return updated.count === 1
      ? {
          ...claimed,
          attempts: job.attempts,
          templateKind: "TRIAL_CONFIRMATION" as const,
          recipientName: recipient.name,
          subject: "Your trial booking is confirmed",
          body,
          context: updatedContext as Prisma.JsonObject,
        }
      : null;
  });
}
