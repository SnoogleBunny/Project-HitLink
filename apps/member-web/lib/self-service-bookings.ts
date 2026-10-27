import {
  checkMemberClassEligibility,
  membershipGraceReleaseMessage,
  addDays,
  evaluateClassSchedulingPolicy,
  readClassSchedulingPolicy,
  type SchedulingPolicyReader,
  classOccurrenceInclude,
  formatOccurrenceDate,
  listClassOccurrences,
  resolveClassOccurrence,
  canCancelClassBooking,
  cleanupExpiredPendingBookings,
  createReviewedDirectClassBooking,
  buildDirectBookingFundingReview,
  type DirectBookingFundingReview,
  type MemberCommandActor,
  cancelMemberClassBooking,
  formatMinutesAsTime,
  getOccurrenceStartsAt,
  getMembershipAllowanceSummary,
  getWorkspaceDateString,
  joinMemberClassWaitlist,
  leaveMemberClassWaitlist,
  prisma,
  resolveBookingAccessForProgram,
  toDateOnlyString,
  type ClassBookingStatus,
  type ClassBookingType,
  type Weekday,
  type ClassOccurrenceTemplate,
} from "@flowstate/db";

interface BookingTemplateRecord {
  id: string;
  programId: string;
  title: string | null;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  capacityOverride: number | null;
  program: {
    id: string;
    name: string;
  };
  room: {
    name: string;
    capacity: number | null;
  };
  workspaceId?: string;
  coachWorkspaceUserId?: string | null;
  coachWorkspaceUser?: ClassOccurrenceTemplate["coachWorkspaceUser"];
  scheduleRevisions?: ClassOccurrenceTemplate["scheduleRevisions"];
  classInstances?: ClassOccurrenceTemplate["classInstances"];
  scheduleStartsOn?: Date | null;
}

interface ExistingBookingRecord {
  id: string;
  fundingRevision?: number;
  classTemplateId: string;
  scheduledForDate: Date;
  bookingType: ClassBookingType;
  status: ClassBookingStatus;
  pendingPaymentExpiresAt: Date | null;
  classTemplate: BookingTemplateRecord;
}

interface WaitlistEntryRecord {
  id: string;
  classTemplateId: string;
  scheduledForDate: Date;
  joinedAt: Date;
  autoPromotionOptedInAt?: Date | null;
  lastSkipReason?: string | null;
  classTemplate: BookingTemplateRecord;
}

interface SeatHoldingBookingRecord {
  classTemplateId: string;
  scheduledForDate: Date;
}

interface SelfServiceBookingDatabase extends SchedulingPolicyReader {
  workspaceDataEvent?: { findMany(args: Record<string, unknown>): Promise<Array<{ metadata: unknown }>> };
  programPromotion?: unknown;
  classTemplate: {
    findMany(args: Record<string, unknown>): Promise<BookingTemplateRecord[]>;
  };
  classBooking: {
    findMany(
      args: Record<string, unknown>,
    ): Promise<Array<ExistingBookingRecord | SeatHoldingBookingRecord>>;
  };
  waitlistEntry: {
    findMany(args: Record<string, unknown>): Promise<WaitlistEntryRecord[]>;
  };
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<unknown>;
  };
  memberPunchCard: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
  };
  dropInProduct: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
  };
  $transaction?<T>(callback: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface ScheduleOccurrence {
  reviewedFunding?: DirectBookingFundingReview;
  fundingSourceName?: string;
  autoPromotionDeadline?: string;
  fundingNote?: string;
  timezone?: string;
  programId?: string;
  coachName?: string;
  endTimeLabel?: string;
  bookingId?: string;
  waitlistEntryId?: string;
  classTemplateId: string;
  scheduledForDate: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  dateLabel: string;
  timeLabel: string;
  capacityLabel: string;
  bookingState:
    | "AVAILABLE"
    | "BOOKED"
    | "PAYMENT_PENDING"
    | "WAITLISTED"
    | "ATTENDED"
    | "FULL";
  accessLabel: string | null;
  action: "book" | "pay_and_book" | "join_waitlist" | "none";
  actionLabel: string;
  note: string | null;
}

export interface MemberBookingSummary {
  paymentRestrictionMessage?: string;
  timezone?: string;
  startsAt?: string;
  coachName?: string;
  endTimeLabel?: string;
  pendingPaymentExpiresAt?: string | null;
  classCancelled?: boolean;
  bookingId: string;
  classTemplateId: string;
  scheduledForDate: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  timeLabel: string;
  bookingType: ClassBookingType;
  status: ClassBookingStatus;
  canCancel: boolean;
  lateCancellation: boolean;
}

export interface MemberWaitlistSummary {
  timezone?: string;
  coachName?: string;
  waitlistEntryId: string;
  classTemplateId: string;
  scheduledForDate: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  timeLabel: string;
  joinedAt: Date;
  autoPromotionOptedInAt?: Date | null;
  lastSkipReason?: string | null;
}

export interface EligibleSelfServiceOccurrences {
  occurrences: ScheduleOccurrence[];
  fromDate: string;
  toDate: string;
}

type SelfBookingMutationResult =
  | {
      status: "created" | "restored" | "cancelled";
      bookingId: string;
    }
  | {
      status: "payment_required";
      bookingId: string;
      dropInProductId: string;
      priceCents: number;
      currency: string;
    }
  | {
      status: "waitlist_joined" | "waitlist_restored" | "waitlist_left";
      waitlistEntryId: string;
    }
  | {
      status: "error";
      message: string;
      code?: "REVIEW_REQUIRED";
    };

const selfServiceBookingDatabase =
  prisma as unknown as SelfServiceBookingDatabase;

function buildOccurrenceKey(classTemplateId: string, scheduledForDate: string) {
  return `${classTemplateId}:${scheduledForDate}`;
}

function getCapacityLabel(args: {
  capacityOverride: number | null;
  roomCapacity: number | null;
  activeCount: number;
}): string {
  const effectiveCapacity = args.capacityOverride ?? args.roomCapacity;

  if (effectiveCapacity === null) {
    return `${args.activeCount} booked`;
  }

  return `${args.activeCount} / ${effectiveCapacity} booked`;
}

function mapBookingItem(
  booking: ExistingBookingRecord,
  args: {
    timezone: string;
    now: Date;
    locale?: string;
  },
): MemberBookingSummary {
  const scheduledForDate = toDateOnlyString(booking.scheduledForDate);
  const occurrence = resolveClassOccurrence({
    template: booking.classTemplate as ClassOccurrenceTemplate,
    scheduledForDate,
  });
  const schedule = occurrence ?? booking.classTemplate;
  const cancellation = canCancelClassBooking({
    bookingType: booking.bookingType,
    bookingStatus: booking.status,
    scheduledForDate,
    startTimeMinutes: schedule.startTimeMinutes,
    cancellationCutoffMinutes: schedule.cancellationCutoffMinutes,
    timezone: occurrence?.timezone ?? args.timezone,
    now: args.now,
  });

  return {
    timezone: occurrence?.timezone ?? args.timezone,
    bookingId: booking.id,
    startsAt: getOccurrenceStartsAt({
      scheduledForDate,
      startTimeMinutes: schedule.startTimeMinutes,
      timezone: occurrence?.timezone ?? args.timezone,
    }).toISOString(),
    classTemplateId: booking.classTemplateId,
    scheduledForDate,
    displayTitle: schedule.title ?? schedule.program.name,
    programName: schedule.program.name,
    roomName: schedule.room.name,
    coachName: occurrence?.coachDisplayName ?? "Coach to be confirmed",
    timeLabel: formatMinutesAsTime(schedule.startTimeMinutes, args.locale),
    endTimeLabel: formatMinutesAsTime(schedule.endTimeMinutes, args.locale),
    pendingPaymentExpiresAt:
      booking.pendingPaymentExpiresAt?.toISOString() ?? null,
    classCancelled: occurrence?.status === "CANCELLED",
    bookingType: booking.bookingType,
    status: booking.status,
    canCancel: cancellation.canCancel,
    lateCancellation: cancellation.lateCancellation,
  };
}

function mapWaitlistItem(entry: WaitlistEntryRecord, locale?: string): MemberWaitlistSummary {
  const occurrence = resolveClassOccurrence({
    template: entry.classTemplate as ClassOccurrenceTemplate,
    scheduledForDate: toDateOnlyString(entry.scheduledForDate),
  });
  const schedule = occurrence ?? entry.classTemplate;
  return {
    timezone: occurrence?.timezone,
    waitlistEntryId: entry.id,
    classTemplateId: entry.classTemplateId,
    scheduledForDate: toDateOnlyString(entry.scheduledForDate),
    displayTitle: schedule.title ?? schedule.program.name,
    programName: schedule.program.name,
    roomName: schedule.room.name,
    coachName: occurrence?.coachDisplayName ?? "Coach to be confirmed",
    timeLabel: formatMinutesAsTime(schedule.startTimeMinutes, locale),
    joinedAt: entry.joinedAt,
    autoPromotionOptedInAt: entry.autoPromotionOptedInAt,
    lastSkipReason: entry.lastSkipReason,
  };
}

export async function listEligibleSelfServiceOccurrences(args: {
  workspaceId: string;
  memberId: string;
  timezone: string;
  locale?: string;
  fromDate?: string;
  toDate?: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<EligibleSelfServiceOccurrences> {
  const db = args.db ?? selfServiceBookingDatabase;
  const now = args.now ?? new Date();
  const policyRevision = await readClassSchedulingPolicy(db, args.workspaceId, now);
  const today = getWorkspaceDateString(now, args.timezone);
  const fromDate = args.fromDate ?? today;
  const toDate = args.toDate ?? addDays(fromDate, 55);
  await cleanupExpiredPendingBookings({
    workspaceId: args.workspaceId,
    db: db as never,
    now,
  });
  const datedClasses = await listClassOccurrences({
    workspaceId: args.workspaceId,
    fromDate,
    toDate,
    db: db as never,
  });
  const availableClasses = datedClasses.filter(
    (item) =>
      !item.program.archivedAt &&
      !item.room.archivedAt &&
      item.room.isActive !== false,
  );
  const dateRange = {
    gte: new Date(`${fromDate}T00:00:00.000Z`),
    lte: new Date(`${toDate}T00:00:00.000Z`),
  };
  const [existingBookings, waitlistEntries, accessEntries, currentMembership] = await Promise.all([
    db.classBooking.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        scheduledForDate: dateRange,
        status: { not: "CANCELLED" },
      },
      include: { classTemplate: { include: classOccurrenceInclude } },
    }) as Promise<ExistingBookingRecord[]>,
    db.waitlistEntry.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        status: "ACTIVE",
        scheduledForDate: dateRange,
      },
      include: { classTemplate: { include: classOccurrenceInclude } },
    }),
    Promise.all(
      availableClasses.map(
        async (item) => ({
          programId: buildOccurrenceKey(item.classTemplateId, item.scheduledForDate),
          access: await resolveBookingAccessForProgram({
            workspaceId: args.workspaceId,
            memberId: args.memberId,
            programId: item.programId,
            scheduledForDate: item.scheduledForDate, occurrenceStartsAt: getOccurrenceStartsAt({ scheduledForDate: item.scheduledForDate, startTimeMinutes: item.startTimeMinutes, timezone: item.timezone ?? args.timezone }), now,
            allowDropIn: true,
            includeDirectBookingFunding: true,
            db: db as never,
          }),
        }),
      ),
    ),
    db.memberMembership.findFirst({
      where: { workspaceId: args.workspaceId, memberId: args.memberId, currentMembershipSlot: "CURRENT", status: { in: ["ACTIVE", "PAST_DUE", "PENDING_PAYMENT_METHOD"] } },
      select: { allowanceTimezone: true },
    }) as Promise<{ allowanceTimezone: string | null } | null>,
  ]);
  const templateIds = [
    ...new Set(availableClasses.map((item) => item.classTemplateId)),
  ];
  const seats = templateIds.length
    ? ((await db.classBooking.findMany({
        where: {
          workspaceId: args.workspaceId,
          classTemplateId: { in: templateIds },
          scheduledForDate: dateRange,
          status: { in: ["BOOKED", "PENDING_PAYMENT"] },
        },
        select: { classTemplateId: true, scheduledForDate: true },
      })) as SeatHoldingBookingRecord[])
    : [];
  const accessByProgram = new Map(
    accessEntries.map((item) => [item.programId, item.access]),
  );
  // Accepted contract calendar days survive a later business timezone change.
  // Show the actual allowance period when this class crosses that calendar boundary.
  const fundingNotes = new Map<string, string>();
  if (currentMembership?.allowanceTimezone) {
    const contractTimezone = currentMembership.allowanceTimezone;
    const label = (date: string) => new Intl.DateTimeFormat(args.locale ?? "en-CA", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00Z`));
    await Promise.all(availableClasses.map(async item => {
      const key = buildOccurrenceKey(item.classTemplateId, item.scheduledForDate);
      if (accessByProgram.get(key)?.type !== "membership") return;
      const occurrenceStartsAt = getOccurrenceStartsAt({ scheduledForDate: item.scheduledForDate, startTimeMinutes: item.startTimeMinutes, timezone: item.timezone ?? args.timezone });
      const contractDate = getWorkspaceDateString(occurrenceStartsAt, contractTimezone);
      if (contractDate === item.scheduledForDate) return;
      const summary = await getMembershipAllowanceSummary({ workspaceId: args.workspaceId, memberId: args.memberId, scheduledForDate: item.scheduledForDate, occurrenceStartsAt, timezone: item.timezone ?? args.timezone, db: db as never });
      const windows = summary?.windows.map(window => `${window.kind === "WEEK" ? "Weekly" : "Billing-month"} allowance from ${label(window.startsOn)} up to ${label(window.endsOn)}: ${window.remaining} of ${window.limit} classes remaining.`).join(" ") ?? "";
      fundingNotes.set(key, `This class counts on ${label(contractDate)} in your membership's accepted timezone (${contractTimezone}).${windows ? ` ${windows}` : ""} Allowance is checked again when you book.`);
    }));
  }
  const bookingsByKey = new Map(
    existingBookings.map((booking) => [
      buildOccurrenceKey(
        booking.classTemplateId,
        toDateOnlyString(booking.scheduledForDate),
      ),
      booking,
    ]),
  );
  const waitlistByKey = new Map(
    waitlistEntries.map((entry) => [
      buildOccurrenceKey(
        entry.classTemplateId,
        toDateOnlyString(entry.scheduledForDate),
      ),
      entry,
    ]),
  );
  const counts = new Map<string, number>();
  for (const seat of seats) {
    const key = buildOccurrenceKey(
      seat.classTemplateId,
      toDateOnlyString(seat.scheduledForDate),
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const eligibilityEntries = db.programPromotion ? await Promise.all(availableClasses.map(async (item) => ({ key: buildOccurrenceKey(item.classTemplateId, item.scheduledForDate), eligibility: await checkMemberClassEligibility({ workspaceId: args.workspaceId, memberId: args.memberId, scheduledForDate: item.scheduledForDate, occurrence: item, db: db as never }) }))) : [];
  const eligibilityByKey = new Map(eligibilityEntries.map((item) => [item.key, item.eligibility]));
  const occurrences = availableClasses.flatMap<ScheduleOccurrence>((item) => {
    const key = buildOccurrenceKey(item.classTemplateId, item.scheduledForDate);
    const booked = bookingsByKey.get(key),
      waitlisted = waitlistByKey.get(key),
      access = accessByProgram.get(buildOccurrenceKey(item.classTemplateId, item.scheduledForDate));
    const activeCount = counts.get(key) ?? 0;
    const full =
      item.effectiveCapacity !== null && activeCount >= item.effectiveCapacity;
    const policyEvaluation = evaluateClassSchedulingPolicy({ revision: policyRevision, date: item.scheduledForDate, timezone: item.timezone ?? args.timezone, startTimeMinutes: item.startTimeMinutes, endTimeMinutes: item.endTimeMinutes, bookingCutoffMinutes: full ? Math.max(item.bookingCutoffMinutes, item.cancellationCutoffMinutes) : item.bookingCutoffMinutes, now });
    const cutoffClosed = !policyEvaluation.allowed;
    if (!booked && !waitlisted && (cutoffClosed || access?.type === "none"))
      return [];
    const occurrence: ScheduleOccurrence = {
      ...(access?.directBookingFunding ? {
        fundingSourceName: access.directBookingFunding.sourceName,
        reviewedFunding: buildDirectBookingFundingReview({
          workspaceId: args.workspaceId, memberId: args.memberId, classTemplateId: item.classTemplateId,
          scheduledForDate: item.scheduledForDate,
          occurrence: { programId: item.programId, timezone: item.timezone ?? args.timezone, cancellationCutoffMinutes: item.cancellationCutoffMinutes,
            startsAt: getOccurrenceStartsAt({ scheduledForDate: item.scheduledForDate, startTimeMinutes: item.startTimeMinutes, timezone: item.timezone ?? args.timezone }).toISOString(),
            endsAt: getOccurrenceStartsAt({ scheduledForDate: item.scheduledForDate, startTimeMinutes: item.endTimeMinutes, timezone: item.timezone ?? args.timezone }).toISOString() },
          funding: access.directBookingFunding.funding,
        }),
      } : {}),
      timezone: item.timezone ?? args.timezone,
      ...(full && policyEvaluation.allowed ? { autoPromotionDeadline: new Intl.DateTimeFormat(args.locale ?? "en-CA", { timeZone: item.timezone ?? args.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(policyEvaluation.snapshot.closesAt!)) } : {}),
      ...(fundingNotes.has(key) ? { fundingNote: fundingNotes.get(key) } : {}),
      classTemplateId: item.classTemplateId,
      scheduledForDate: item.scheduledForDate,
      displayTitle: item.displayTitle,
      programId: item.programId,
      programName: item.program.name,
      roomName: item.room.name,
      coachName: item.coachDisplayName,
      dateLabel: formatOccurrenceDate(item.scheduledForDate, args.locale),
      timeLabel: formatMinutesAsTime(item.startTimeMinutes, args.locale),
      endTimeLabel: formatMinutesAsTime(item.endTimeMinutes, args.locale),
      capacityLabel: getCapacityLabel({
        capacityOverride: item.capacityOverride,
        roomCapacity: item.room.capacity,
        activeCount,
      }),
      bookingState: "AVAILABLE",
      accessLabel:
        access?.type === "punch_card"
          ? "Punch card"
          : access?.type === "drop_in"
            ? "Drop-in"
            : "Membership",
      action: "book",
      actionLabel: "Book class",
      note: null,
    };
    if (booked) {
      occurrence.bookingId = booked.id;
      occurrence.action = "none";
      occurrence.actionLabel = "Manage";
      occurrence.accessLabel =
        booked.bookingType === "PUNCH_CARD"
          ? "Punch card"
          : booked.bookingType === "DROP_IN"
            ? "Drop-in"
            : booked.bookingType === "TRIAL"
              ? "Trial"
              : "Membership";
      occurrence.bookingState =
        booked.status === "PENDING_PAYMENT"
          ? "PAYMENT_PENDING"
          : booked.status === "ATTENDED"
            ? "ATTENDED"
            : "BOOKED";
      if (booked.status === "PENDING_PAYMENT")
        occurrence.note =
          "Your place is held while payment is pending. Check its status before starting another payment.";
    } else if (waitlisted) {
      occurrence.waitlistEntryId = waitlisted.id;
      occurrence.bookingState = "WAITLISTED";
      occurrence.action = "none";
      occurrence.actionLabel = "Manage";
      occurrence.note =
        "You are on the waitlist. This is not a confirmed place.";
    } else if (full) {
      occurrence.bookingState = "FULL";
      if (access?.type === "membership" || access?.type === "punch_card") {
        occurrence.action = "join_waitlist";
        occurrence.actionLabel = "Join waitlist";
      } else {
        occurrence.action = "none";
        occurrence.actionLabel = "Full";
        occurrence.note = "Drop-ins cannot join this waitlist.";
      }
    } else if (access?.type === "drop_in") {
      occurrence.action = "pay_and_book";
      occurrence.actionLabel = "Pay and book";
    }
    if ((occurrence.action === "book" || occurrence.action === "pay_and_book") && !occurrence.reviewedFunding) {
      occurrence.action = "none";
      occurrence.actionLabel = "Funding review needed";
      occurrence.note = "Ask the gym to review the accepted funding terms before booking.";
    }
    const eligibility = eligibilityByKey.get(key);
    if (eligibility && !eligibility.eligible) { occurrence.action = "none"; occurrence.actionLabel = "Not eligible"; occurrence.note = eligibility.reason; }
    else if (eligibility && !occurrence.note && item.program.rankPolicy) occurrence.note = `Current rank: ${eligibility.currentRank}`;
    return [occurrence];
  });
  return { occurrences, fromDate, toDate };
}

export async function listMemberBookings(args: {
  workspaceId: string;
  memberId: string;
  timezone: string;
  locale?: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<{
  upcoming: MemberBookingSummary[];
  history: MemberBookingSummary[];
  waitlist: MemberWaitlistSummary[];
}> {
  const db = args.db ?? selfServiceBookingDatabase;
  const now = args.now ?? new Date();

  await cleanupExpiredPendingBookings({
    workspaceId: args.workspaceId,
    db: db as never,
    now,
  });

  const [bookings, waitlistEntries] = await Promise.all([
    db.classBooking.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
      },
      include: { classTemplate: { include: classOccurrenceInclude } },
      orderBy: [
        {
          scheduledForDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    }) as Promise<ExistingBookingRecord[]>,
    db.waitlistEntry.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        status: "ACTIVE",
      },
      include: { classTemplate: { include: classOccurrenceInclude } },
      orderBy: [
        {
          scheduledForDate: "asc",
        },
        {
          joinedAt: "asc",
        },
      ],
    }),
  ]);

  const upcoming: MemberBookingSummary[] = [];
  const history: MemberBookingSummary[] = [];

  for (const booking of bookings) {
    const item = mapBookingItem(booking, {
      timezone: args.timezone,
      now,
      locale: args.locale,
    });
    const startsAt = getOccurrenceStartsAt({
      scheduledForDate: item.scheduledForDate,
      startTimeMinutes:
        resolveClassOccurrence({
          template: booking.classTemplate as ClassOccurrenceTemplate,
          scheduledForDate: item.scheduledForDate,
        })?.startTimeMinutes ?? booking.classTemplate.startTimeMinutes,
      timezone: item.timezone ?? args.timezone,
    });

    if (
      (booking.status === "BOOKED" || booking.status === "PENDING_PAYMENT") &&
      startsAt > now
    ) {
      upcoming.push(item);
      continue;
    }

    history.push(item);
  }

  const visibleHistory = history.slice(0, 30);
  const cancelled = bookings.filter(booking => booking.status === "CANCELLED" && visibleHistory.some(item => item.bookingId === booking.id) && Number.isSafeInteger(booking.fundingRevision) && Number(booking.fundingRevision) > 0);
  if (cancelled.length && db.workspaceDataEvent) {
    const receipts = await db.workspaceDataEvent.findMany({ where: { workspaceId: args.workspaceId, kind: "MEMBERSHIP_GRACE_BOOKING_RELEASED", AND: [ { metadata: { path: ["memberId"], equals: args.memberId } }, { OR: cancelled.map(booking => ({ AND: [ { metadata: { path: ["bookingId"], equals: booking.id } }, { metadata: { path: ["fundingRevision"], equals: booking.fundingRevision } } ] })) } ] }, select: { metadata: true }, take: 31 });
    for (const item of visibleHistory) {
      const booking = cancelled.find(row => row.id === item.bookingId);
      if (!booking) continue;
      if (receipts.some(row => { const proof = row.metadata as { bookingId?: unknown; memberId?: unknown; fundingRevision?: unknown } | null; return proof?.bookingId === booking.id && proof.memberId === args.memberId && proof.fundingRevision === booking.fundingRevision; })) item.paymentRestrictionMessage = membershipGraceReleaseMessage;
    }
  }
  return {
    upcoming: upcoming.sort((a, b) =>
      (a.startsAt ?? a.scheduledForDate).localeCompare(
        b.startsAt ?? b.scheduledForDate,
      ),
    ),
    history: visibleHistory,
    waitlist: waitlistEntries.map((entry) => mapWaitlistItem(entry, args.locale)),
  };
}

export async function createSelfBooking(args: {
  workspaceId: string;
  actor: MemberCommandActor;
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  reviewedFunding: DirectBookingFundingReview;
  allowDropIn?: boolean;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<SelfBookingMutationResult> {
  const result = await createReviewedDirectClassBooking({
    workspaceId: args.workspaceId,
    actor: args.actor,
    memberId: args.memberId,
    classTemplateId: args.classTemplateId,
    scheduledForDate: args.scheduledForDate,
    timezone: args.timezone,
    reviewedFunding: args.reviewedFunding,
    allowDropIn: args.allowDropIn ?? true,
    db: (args.db ?? selfServiceBookingDatabase) as never,
    now: args.now,
  });

  if (result.status === "error") {
    return {
      status: "error",
      ...(result.code === "REVIEW_REQUIRED" ? { code: "REVIEW_REQUIRED" as const } : {}),
      message:
        result.code === "FULL"
          ? "This class is full. Join the waitlist if membership or punch-card access applies."
          : result.message,
    };
  }

  if (result.status === "payment_required") {
    return result;
  }

  return {
    status: result.status,
    bookingId: result.bookingId,
  };
}

export async function cancelSelfBooking(args: {
  workspaceId: string;
  actor: MemberCommandActor;
  memberId: string;
  bookingId: string;
  timezone: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<SelfBookingMutationResult> {
  const result = await cancelMemberClassBooking({
    workspaceId: args.workspaceId,
    actor: args.actor,
    memberId: args.memberId,
    bookingId: args.bookingId,
    timezone: args.timezone,
    db: (args.db ?? selfServiceBookingDatabase) as never,
    now: args.now,
  });

  if (result.status === "error") {
    return result;
  }

  return {
    status: "cancelled",
    bookingId: result.bookingId,
  };
}

export async function joinSelfWaitlist(args: {
  workspaceId: string;
  actor: MemberCommandActor;
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  autoPromotionOptIn?: boolean;
  allowPunchCardFunding?: boolean;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<SelfBookingMutationResult> {
  const result = await joinMemberClassWaitlist({
    workspaceId: args.workspaceId,
    actor: args.actor,
    memberId: args.memberId,
    classTemplateId: args.classTemplateId,
    scheduledForDate: args.scheduledForDate,
    timezone: args.timezone,
    source: "MEMBER_PORTAL",
    autoPromotionOptIn: args.autoPromotionOptIn,
    allowPunchCardFunding: args.allowPunchCardFunding,
    db: (args.db ?? selfServiceBookingDatabase) as never,
    now: args.now,
  });

  if (result.status === "error") {
    return result;
  }

  return {
    status:
      result.status === "joined" ? "waitlist_joined" : "waitlist_restored",
    waitlistEntryId: result.waitlistEntryId,
  };
}

export async function leaveSelfWaitlist(args: {
  workspaceId: string;
  actor: MemberCommandActor;
  memberId: string;
  waitlistEntryId: string;
  db?: SelfServiceBookingDatabase;
}): Promise<SelfBookingMutationResult> {
  const result = await leaveMemberClassWaitlist({
    workspaceId: args.workspaceId,
    actor: args.actor,
    memberId: args.memberId,
    waitlistEntryId: args.waitlistEntryId,
    db: (args.db ?? selfServiceBookingDatabase) as never,
  });

  if (result.status === "error") {
    return result;
  }

  return {
    status: "waitlist_left",
    waitlistEntryId: result.waitlistEntryId,
  };
}
