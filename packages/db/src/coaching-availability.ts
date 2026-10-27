import { createHash } from "node:crypto";
import type {
  Prisma,
  CoachingEnrollment,
  CoachingProgramVersion,
} from "@prisma/client";
import {
  classOccurrenceInclude,
  classScheduleReviewDates,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import {
  addDays,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  toDateOnlyString,
  parseDateOnlyString,
} from "./occurrences.js";
import { normalizeAuthoritySerializationError } from "./staff-access.js";
import {
  coachingAppointmentResourceWindow,
  CoachingBookingPolicyError,
  resolveCoachingResolutionResponseHours,
} from "./coaching-booking-policy.js";
import {
  coachingPolicyForSlotTx,
  readCoachingBookingPolicyTx,
} from "./coaching-booking-settings.js";
import { readCoachingCheckoutHelpPromiseTx } from "./coaching-checkout-disclosure.js";
type Tx = Prisma.TransactionClient;
type Slot = {
  coachWorkspaceUserId: string;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date;
  bufferMinutes: number;
};
/** Exact resource identities are locked before lifecycle reads under Serializable. */
export async function findCoachingResourceConflictTx(
  tx: Tx,
  workspaceId: string,
  slot: Slot,
  excludedAppointmentId?: string,
): Promise<string | null> {
  try {
    await tx.$queryRaw`SELECT id FROM workspace_users WHERE id=${slot.coachWorkspaceUserId} AND "workspaceId"=${workspaceId} FOR SHARE`;
    if (slot.roomId)
      await tx.$queryRaw`SELECT r.id FROM rooms r JOIN locations l ON l.id=r."locationId" WHERE r.id=${slot.roomId} AND l."workspaceId"=${workspaceId} FOR SHARE OF r`;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
  if (
    !(await tx.workspaceUser.findFirst({
      where: {
        id: slot.coachWorkspaceUserId,
        workspaceId,
        isActive: true,
        role: { in: ["OWNER", "COACH"] },
        workspace: { status: { not: "DISABLED" } },
      },
      select: { id: true },
    }))
  )
    return "The appointed coach is no longer available. Ask the gym to review the assignment.";
  if (
    slot.roomId &&
    !(await tx.room.findFirst({
      where: {
        id: slot.roomId,
        isActive: true,
        archivedAt: null,
        location: { workspaceId },
      },
      select: { id: true },
    }))
  )
    return "This appointment room is no longer available.";
  const { from, until } = coachingAppointmentResourceWindow({
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    beforeBufferMinutes: slot.bufferMinutes,
    afterBufferMinutes: slot.bufferMinutes,
  });
  if (
    await tx.staffTimeOff.findFirst({
      where: {
        workspaceId,
        coachWorkspaceUserId: slot.coachWorkspaceUserId,
        revokedAt: null,
        startsAt: { lt: until },
        endsAt: { gt: from },
      },
      select: { id: true },
    })
  )
    return "The coach is on leave at this time, including the appointment buffer.";
  // Expand each accepted row by its own buffer. A fixed candidate padding can
  // miss long historical buffers even when the candidate has no buffer itself.
  const overlaps = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM coaching_appointments WHERE "workspaceId"=${workspaceId} AND status IN ('HELD','BOOKED') AND (${excludedAppointmentId ?? null}::text IS NULL OR id<>${excludedAppointmentId ?? null}) AND ("coachWorkspaceUserId"=${slot.coachWorkspaceUserId} OR (${slot.roomId}::text IS NOT NULL AND "roomId"=${slot.roomId})) AND "startsAt"-make_interval(mins=>"bufferMinutes")<${until} AND "endsAt"+make_interval(mins=>"bufferMinutes")>${from} LIMIT 1`;
  if (overlaps.length)
    return "The coach or room was booked for another appointment. Choose another time.";
  const location = await tx.location.findUnique({ where: { workspaceId } });
  if (!location) return "The gym must review the appointment timezone.";
  const templates = await tx.classTemplate.findMany({
    where: { workspaceId, archivedAt: null },
    include: classOccurrenceInclude,
  });
  const zones = await tx.workspaceTimezoneRevision.findMany({
    where: { workspaceId },
    orderBy: { version: "asc" },
  });
  const timezones = new Set([
      location.timezone,
      ...zones.map((row) => row.timezone),
    ]),
    edges = new Set<string>();
  for (const timezone of timezones) {
    for (const instant of [from, until]) {
      const date = getWorkspaceDateString(instant, timezone);
      if (parseDateOnlyString(date).status !== "ok")
        throw new CoachingBookingPolicyError(
          "The buffered interval exceeds the supported business calendar.",
        );
      for (let offset = -2; offset <= 2; offset++)
        edges.add(addDays(date, offset));
    }
  }
  const ordered = [...edges].sort(),
    first = ordered[0]!,
    last = ordered.at(-1)!;
  for (const zone of zones) {
    const date = toDateOnlyString(zone.effectiveFromDate);
    if (date >= first && date <= last) {
      edges.add(date);
      edges.add(addDays(date, -1));
      edges.add(addDays(date, 1));
    }
  }
  // Weekly patterns need one representative week per actual revision/exception
  // boundary, plus exact window/timezone edges, rather than a per-day scan of a
  // potentially multi-year buffer. Actual UTC overlap is still checked below.
  const dates = classScheduleReviewDates({
    templates,
    fromDate: first,
    recordedDates: [...edges],
  }).filter((date) => date >= first && date <= last);
  for (const date of dates)
    for (const template of templates) {
      const occurrence = resolveClassOccurrence({
        template,
        scheduledForDate: date,
      });
      if (
        !occurrence ||
        occurrence.status === "CANCELLED" ||
        (occurrence.coachWorkspaceUserId !== slot.coachWorkspaceUserId &&
          (!slot.roomId || occurrence.roomId !== slot.roomId))
      )
        continue;
      const startsAt = getZonedDateTimeAsUtc({
          dateString: date,
          minutes: occurrence.startTimeMinutes,
          timezone: occurrence.timezone ?? location.timezone,
        }),
        endsAt = getZonedDateTimeAsUtc({
          dateString: date,
          minutes: occurrence.endTimeMinutes,
          timezone: occurrence.timezone ?? location.timezone,
        });
      if (startsAt < until && endsAt > from)
        return "The coach or room has a class at that time.";
    }
  if (
    await tx.privateLessonSlot.findFirst({
      where: {
        workspaceId,
        coachWorkspaceUserId: slot.coachWorkspaceUserId,
        status: { not: "CANCELLED" },
        startsAt: { lt: until },
        endsAt: { gt: from },
      },
      select: { id: true },
    })
  )
    return "The coach has a private lesson at that time.";
  if (
    await tx.event.findFirst({
      where: {
        workspaceId,
        coachWorkspaceUserId: slot.coachWorkspaceUserId,
        status: "PUBLISHED",
        startsAt: { lt: until },
        endsAt: { gt: from },
      },
      select: { id: true },
    })
  )
    return "The coach has a published event at that time.";
  return null;
}
export type CoachingSafeSlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  room: { name: string } | null;
  bufferMinutes: number;
  timezone: string;
};
export type CoachingBookingDisclosure = {
  schemaVersion: 1;
  policyEventId: string;
  policyVersion: number;
  policyHash: string;
  reviewedAt: string;
  availabilityHash: string;
  availableCount: number;
  notOpenCount: number;
  resolutionOwnerWorkspaceUserId: string;
  resolutionOwnerNameSnapshot: string;
  resolutionResponseHours: number;
  notHeld: true;
};
export type CoachingPresale = {
  configured: boolean;
  message: string | null;
  slots: CoachingSafeSlot[];
  notOpenCount: number;
  caseOwnerName: string | null;
  resolutionResponseHours: number | null;
  disclosure: CoachingBookingDisclosure | null;
};
type Enrollment = Pick<
  CoachingEnrollment,
  | "id"
  | "memberId"
  | "workspaceId"
  | "currentCoachWorkspaceUserId"
  | "startsOn"
  | "endsOn"
  | "pauseStartsOn"
  | "pauseEndsOn"
  | "timezone"
  | "caseOwnerWorkspaceUserId"
> & {
  programVersion: Pick<
    CoachingProgramVersion,
    "appointmentUnits" | "appointmentMinutes"
  >;
};
/** Authorization belongs to the enclosing own-client/accepted-coach/owner read.
 * This projection contains no meeting URL, client identity or busy-record reason. */
export async function coachingPresaleTx(
  tx: Tx,
  enrollment: Enrollment,
  now = new Date(),
): Promise<CoachingPresale> {
  const empty = (message: string | null): CoachingPresale => ({
    configured: false,
    message,
    slots: [],
    notOpenCount: 0,
    caseOwnerName: null,
    resolutionResponseHours: null,
    disclosure: null,
  });
  if (enrollment.programVersion.appointmentUnits === 0)
    return { ...empty(null), configured: true };
  const head = await readCoachingBookingPolicyTx(tx, enrollment.workspaceId);
  if (!head)
    return empty(
      "The owner must confirm appointment service hours and booking rules before new appointment times or purchases are available.",
    );
  try {
    await tx.$queryRaw`SELECT id FROM workspace_users WHERE id=${enrollment.caseOwnerWorkspaceUserId} AND "workspaceId"=${enrollment.workspaceId} FOR SHARE`;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
  const caseOwner = await tx.workspaceUser.findFirst({
    where: {
      id: enrollment.caseOwnerWorkspaceUserId,
      workspaceId: enrollment.workspaceId,
      isActive: true,
      role: "OWNER",
    },
    include: { user: { select: { fullName: true, email: true } } },
  });
  // A later valid acceptance can have no availability disclosure while the
  // case owner is unavailable. It cannot silently erase an earlier faster
  // promise. Aggregate only this enrollment's accepted history in PostgreSQL;
  // do not fetch every old plan/private snapshot into the application.
  const promises = await tx.$queryRaw<Array<{ hours: string | null }>>`
    WITH disclosures AS (
      SELECT CASE WHEN jsonb_typeof(snapshot->'appointmentBookingDisclosure')='object'
        THEN snapshot->'appointmentBookingDisclosure' ELSE '{}'::jsonb END AS d, "acceptedAt"
      FROM coaching_accepted_plans
      WHERE "workspaceId"=${enrollment.workspaceId} AND "enrollmentId"=${enrollment.id}
    ), typed AS (
      SELECT d, "acceptedAt",
        CASE WHEN coaching_booking_json_integer(d->'resolutionResponseHours',1,${Math.floor(Number.MAX_SAFE_INTEGER / 3600000)})
          THEN (d->>'resolutionResponseHours')::numeric END AS hours,
        CASE WHEN coaching_booking_json_integer(d->'availableCount',0,${Number.MAX_SAFE_INTEGER})
          THEN (d->>'availableCount')::numeric END AS available_count,
        CASE WHEN coaching_booking_json_integer(d->'notOpenCount',0,${Number.MAX_SAFE_INTEGER})
          THEN (d->>'notOpenCount')::numeric END AS not_open_count
      FROM disclosures
    )
    SELECT min(t.hours)::text AS hours FROM typed t
    JOIN workspace_data_events receipt ON receipt.id=t.d->>'policyEventId'
      AND receipt."workspaceId"=${enrollment.workspaceId}
      AND receipt.kind='COACHING_BOOKING_POLICY_CONFIRMED'
      AND receipt.metadata->'version'=t.d->'policyVersion'
      AND receipt.metadata->'policyHash'=t.d->'policyHash'
    JOIN workspace_users help_owner ON help_owner.id=t.d->>'resolutionOwnerWorkspaceUserId'
      AND help_owner."workspaceId"=${enrollment.workspaceId}
    WHERE t.d ?& ARRAY['schemaVersion','policyEventId','policyVersion','policyHash','reviewedAt','availabilityHash','availableCount','notOpenCount','resolutionOwnerWorkspaceUserId','resolutionOwnerNameSnapshot','resolutionResponseHours','notHeld']
      AND t.d-ARRAY['schemaVersion','policyEventId','policyVersion','policyHash','reviewedAt','availabilityHash','availableCount','notOpenCount','resolutionOwnerWorkspaceUserId','resolutionOwnerNameSnapshot','resolutionResponseHours','notHeld']='{}'::jsonb
      AND t.d->'schemaVersion'='1'::jsonb AND t.d->'notHeld'='true'::jsonb
      AND jsonb_typeof(t.d->'policyEventId')='string' AND btrim(t.d->>'policyEventId')<>''
      AND jsonb_typeof(t.d->'policyHash')='string' AND t.d->>'policyHash' ~ '^[0-9a-f]{64}$'
      AND jsonb_typeof(t.d->'availabilityHash')='string' AND t.d->>'availabilityHash' ~ '^[0-9a-f]{64}$'
      AND jsonb_typeof(t.d->'reviewedAt')='string'
      AND t.d->>'reviewedAt'=to_char(t."acceptedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      AND jsonb_typeof(t.d->'resolutionOwnerWorkspaceUserId')='string' AND btrim(t.d->>'resolutionOwnerWorkspaceUserId')<>''
      AND jsonb_typeof(t.d->'resolutionOwnerNameSnapshot')='string' AND btrim(t.d->>'resolutionOwnerNameSnapshot')<>''
      AND t.hours>=1 AND t.hours<=${Math.floor(Number.MAX_SAFE_INTEGER / 3600000)}
      AND t.available_count>=0 AND t.available_count<=${Number.MAX_SAFE_INTEGER}
      AND t.not_open_count>=0 AND t.not_open_count<=${Number.MAX_SAFE_INTEGER}`;
  const acceptedHours = promises[0]?.hours == null ? undefined : Number(promises[0].hours);
  const checkoutHours = await readCoachingCheckoutHelpPromiseTx(tx, {
    workspaceId: enrollment.workspaceId,
    enrollmentId: enrollment.id,
    beneficiaryMemberId: enrollment.memberId,
  });
  const earlier = acceptedHours == null ? checkoutHours
    : checkoutHours == null ? acceptedHours : Math.min(acceptedHours, checkoutHours);
  const responseHours = resolveCoachingResolutionResponseHours({
    currentResolutionResponseHours:
      head.policy.appointments.resolutionResponseHours,
    acceptedResolutionResponseHours: earlier,
  });
  const result: CoachingPresale = {
    configured: true,
    message: caseOwner
      ? null
      : "The gym must name a current booking-help owner. Existing paid appointments and units remain yours.",
    slots: [],
    notOpenCount: 0,
    caseOwnerName: caseOwner
      ? (caseOwner.user.fullName ?? caseOwner.user.email)
      : null,
    resolutionResponseHours: responseHours,
    disclosure: null,
  };
  if (!enrollment.currentCoachWorkspaceUserId)
    return {
      ...result,
      message: "Accept your named coach to review matching appointment times.",
    };
  try {
    await tx.$queryRaw`SELECT id FROM coaching_availability WHERE "workspaceId"=${enrollment.workspaceId} AND "coachWorkspaceUserId"=${enrollment.currentCoachWorkspaceUserId} AND "startsAt">=${new Date(+enrollment.startsOn - 2 * 86400000)} AND "startsAt"<${new Date(+enrollment.endsOn + 3 * 86400000)} ORDER BY id FOR SHARE`;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
  const slots = await tx.coachingAvailability.findMany({
    where: {
      workspaceId: enrollment.workspaceId,
      coachWorkspaceUserId: enrollment.currentCoachWorkspaceUserId,
      withdrawnAt: null,
      startsAt: {
        gt: now,
        gte: new Date(+enrollment.startsOn - 2 * 86400000),
        lt: new Date(+enrollment.endsOn + 3 * 86400000),
      },
    },
    include: { room: { select: { name: true } } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });
  for (const slot of slots) {
    const date = getWorkspaceDateString(slot.startsAt, enrollment.timezone);
    if (
      +slot.endsAt - +slot.startsAt !==
        enrollment.programVersion.appointmentMinutes * 60000 ||
      date < toDateOnlyString(enrollment.startsOn) ||
      date > toDateOnlyString(enrollment.endsOn) ||
      (enrollment.pauseStartsOn &&
        enrollment.pauseEndsOn &&
        date >= toDateOnlyString(enrollment.pauseStartsOn) &&
        date <= toDateOnlyString(enrollment.pauseEndsOn))
    )
      continue;
    const evaluation = await coachingPolicyForSlotTx(
      tx,
      enrollment.workspaceId,
      slot,
      now,
      head,
    );
    if (!evaluation.result.allowed && evaluation.result.code !== "NOT_OPEN")
      continue;
    const effective = {
      ...slot,
      bufferMinutes: evaluation.result.effectiveBufferMinutes,
    };
    if (
      await findCoachingResourceConflictTx(
        tx,
        enrollment.workspaceId,
        effective,
      )
    )
      continue;
    if (evaluation.result.code === "NOT_OPEN") {
      result.notOpenCount++;
      continue;
    }
    result.slots.push({
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      room: slot.room,
      bufferMinutes: effective.bufferMinutes,
      timezone: evaluation.timezone,
    });
  }
  if (caseOwner)
    result.disclosure = {
      schemaVersion: 1,
      policyEventId: head.currentEventId,
      policyVersion: head.version,
      policyHash: head.policyHash,
      reviewedAt: now.toISOString(),
      availabilityHash: createHash("sha256")
        .update(
          JSON.stringify(
            result.slots.map((row) => ({
              id: row.id,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
              room: row.room,
              bufferMinutes: row.bufferMinutes,
              timezone: row.timezone,
            })),
          ),
        )
        .digest("hex"),
      availableCount: result.slots.length,
      notOpenCount: result.notOpenCount,
      resolutionOwnerWorkspaceUserId: caseOwner.id,
      resolutionOwnerNameSnapshot:
        caseOwner.user.fullName ?? caseOwner.user.email,
      resolutionResponseHours: responseHours,
      notHeld: true,
    };
  return result;
}
/** Call only after current payer/client authority, and only when creating a NEW
 * provider request. Replays and verified settlement never pass through here. */
export async function requireNewCoachingPurchaseTx(
  tx: Tx,
  workspaceId: string,
  enrollmentId: string,
  now = new Date(),
) {
  const e = await tx.coachingEnrollment.findFirst({
    where: { id: enrollmentId, workspaceId },
    include: { programVersion: true },
  });
  if (!e)
    throw new CoachingBookingPolicyError(
      "The client's appointment delivery needs review before a new purchase.",
    );
  if (e.programVersion.appointmentUnits === 0) return null;
  const value = await coachingPresaleTx(tx, e, now);
  if (!value.configured || !value.disclosure)
    throw new CoachingBookingPolicyError(
      "The client's appointment delivery and booking-help contact need review before a new purchase. No new payment was started.",
    );
  return value.disclosure;
}
