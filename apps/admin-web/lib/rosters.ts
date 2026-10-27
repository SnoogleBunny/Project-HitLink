import { evaluateBookingFormsTx } from "@flowstate/db";
import { checkMemberClassEligibility } from "@flowstate/db";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  classOccurrenceInclude,
  settleMembershipAllowance,
  settlePunchCardBooking,
  financialEntitlementHoldReason,
  resolveClassOccurrence,
  lockClassSchedule,
  toDateOnlyString,
  type ClassOccurrenceTemplate,
  type ClassScheduleLockDatabase,
  dateOnlyStringToUtcDate,
  formatMinutesAsTime,
  getWorkspaceDateString,
  getOccurrenceStartsAt,
  listOccurrenceWaitlist,
  promoteNextWaitlistEntry,
  prisma,
  removeWaitlistEntry,
  validateOccurrenceDate,
  WEEKDAY_LABELS,
  type AttendanceState,
  type ClassBookingStatus,
  type ClassBookingType,
  type UserRole,
  type Weekday,
} from "@flowstate/db";

const attendanceStates: AttendanceState[] = [
  "PRESENT",
  "LATE",
  "ABSENT",
  "NO_SHOW",
];

const activeBookingStatuses: ClassBookingStatus[] = [
  "BOOKED",
  "ATTENDED",
  "ABSENT",
  "NO_SHOW",
];

interface RosterTemplateRecord {
  timezone?: string;
  id: string;
  title: string | null;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  capacityOverride: number | null;
  coachWorkspaceUserId: string | null;
  program: {
    name: string;
  };
  room: {
    name: string;
    capacity: number | null;
  };
  coachWorkspaceUser: {
    id: string;
    role: UserRole;
    isActive: boolean;
    user: {
      fullName: string | null;
      email: string;
    };
  } | null;
}

interface RosterBookingRecord {
  id: string;
  memberId: string;
  guardianId: string | null;
  bookingType: ClassBookingType;
  status: ClassBookingStatus;
  classTemplateId: string;
  member: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    status: string;
    notes: string | null;
    tags: string[];
    familyLinks: Array<{
      id: string;
      relationshipLabel: string | null;
      isPrimary: boolean;
      guardian: {
        id: string;
        fullName: string;
        email: string | null;
        phone: string | null;
      };
    }>;
  };
  guardian: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
  } | null;
}

interface RosterAttendanceRecord {
  id: string;
  memberId: string;
  classTemplateId: string;
  state: AttendanceState;
  note: string | null;
  updatedAt: Date;
}

interface RosterDatabase extends ClassScheduleLockDatabase {
  workspaceUser: Pick<Prisma.TransactionClient["workspaceUser"], "findFirst">;
  attendanceOperation: Pick<
    Prisma.TransactionClient["attendanceOperation"],
    "findUnique" | "create"
  >;
  attendanceEvent: Pick<
    Prisma.TransactionClient["attendanceEvent"],
    "findMany" | "createMany"
  >;
  programPromotion?: Prisma.TransactionClient["programPromotion"];
  financialEntitlementHold?: Prisma.TransactionClient["financialEntitlementHold"];
  punchCardEntry?: Prisma.TransactionClient["punchCardEntry"];
  membershipAllowanceAllocation?: Prisma.TransactionClient["membershipAllowanceAllocation"];
  $transaction<T>(
    callback: (tx: RosterDatabase) => Promise<T>,
    options?: { timeout: number },
  ): Promise<T>;
  member: {
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<unknown>;
  };
  memberPunchCard: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    findFirst(args: Record<string, unknown>): Promise<unknown>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  dropInProduct: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
  };
  classTemplate: {
    findMany(args: Record<string, unknown>): Promise<RosterTemplateRecord[]>;
    findFirst(
      args: Record<string, unknown>,
    ): Promise<RosterTemplateRecord | null>;
  };
  classBooking: {
    findMany(args: Record<string, unknown>): Promise<RosterBookingRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<unknown>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    count(args: Record<string, unknown>): Promise<number>;
  };
  waitlistEntry: {
    findFirst(args: Record<string, unknown>): Promise<unknown>;
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  attendanceRecord: {
    findMany(args: Record<string, unknown>): Promise<RosterAttendanceRecord[]>;
    findFirst(
      args: Record<string, unknown>,
    ): Promise<RosterAttendanceRecord | null>;
    upsert(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

export interface RosterAccessContext {
  workspaceId: string;
  workspaceUserId: string;
  role: "OWNER" | "COACH";
  timezone: string;
  locale?: string;
}

export interface TodayClassSummary {
  id: string;
  displayTitle: string;
  scheduledForDate: string;
  weekdayLabel: string;
  timeLabel: string;
  roomName: string;
  coachDisplayName: string;
  effectiveCapacity: number | null;
  rosterCount: number;
  trialCount: number;
  attendanceRecordedCount: number;
}

export interface RosterMemberRow {
  bookingId: string;
  memberId: string;
  memberName: string;
  memberStatus: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
  bookingType: ClassBookingType;
  bookingStatus: ClassBookingStatus;
  guardianName: string | null;
  guardianContact: string | null;
  attendanceState: AttendanceState | null;
  attendanceNote: string | null;
  attendanceVersion?: string;
  attendanceHistory?: Array<{
    id: string;
    previousState: AttendanceState | null;
    state: AttendanceState;
    reason: string | null;
    actorName: string;
    createdAt: string;
  }>;
}

export interface ClassRoster {
  templateId: string;
  scheduledForDate: string;
  displayTitle: string;
  weekdayLabel: string;
  timeLabel: string;
  programName: string;
  roomName: string;
  coachDisplayName: string;
  effectiveCapacity: number | null;
  rows: RosterMemberRow[];
  noShowCutoffAt: string;
  occurrenceTimezone: string;
  canClose: boolean;
  unresolvedCount: number;
  waitlist: Array<{
    id: string;
    memberId: string;
    memberName: string;
    memberStatus: string;
    email: string | null;
    phone: string | null;
    position: number;
    joinedAt: Date;
    autoPromotionOptedInAt?: Date | null;
    lastSkipReason?: string | null;
  }>;
}

export type AttendanceMutationResult =
  | {
      status: "recorded";
      attendanceRecordId: string;
    }
  | {
      status: "error";
      message: string;
    };

export type CloseRosterResult =
  | {
      status: "closed";
      closedCount: number;
      skipped: Array<{ memberId: string; reason: string }>;
    }
  | { status: "error"; message: string };

const rosterDatabase = prisma as unknown as RosterDatabase;

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function buildDisplayName(fullName: string | null, email: string): string {
  const trimmedName = fullName?.trim();

  return trimmedName ? trimmedName : email;
}

function mapTemplateDisplay(template: RosterTemplateRecord, locale?: string) {
  return {
    displayTitle: template.title ?? template.program.name,
    timeLabel: `${formatMinutesAsTime(template.startTimeMinutes, locale)} - ${formatMinutesAsTime(template.endTimeMinutes, locale)}`,
    weekdayLabel: WEEKDAY_LABELS[template.weekday],
    effectiveCapacity: template.capacityOverride ?? template.room.capacity,
    coachDisplayName: template.coachWorkspaceUser
      ? buildDisplayName(
          template.coachWorkspaceUser.user.fullName,
          template.coachWorkspaceUser.user.email,
        )
      : "Needs coach",
  };
}

function isAttendanceState(value: string): value is AttendanceState {
  return attendanceStates.includes(value as AttendanceState);
}

function mapAttendanceToBookingStatus(
  state: AttendanceState,
): ClassBookingStatus {
  if (state === "PRESENT" || state === "LATE") {
    return "ATTENDED";
  }

  return state;
}

function formatGuardianContact(
  guardian: NonNullable<RosterBookingRecord["guardian"]>,
): string | null {
  if (guardian.email && guardian.phone) {
    return `${guardian.email} / ${guardian.phone}`;
  }

  return guardian.email ?? guardian.phone;
}

function selectGuardianForBooking(
  booking: RosterBookingRecord,
): NonNullable<RosterBookingRecord["guardian"]> | null {
  if (booking.guardian) {
    return booking.guardian;
  }

  const primaryLink =
    booking.member.familyLinks.find((link) => link.isPrimary) ??
    booking.member.familyLinks[0];

  return primaryLink?.guardian ?? null;
}

async function getRosterTemplate(args: {
  access: RosterAccessContext;
  templateId: string;
  scheduledForDate: string;
  db: RosterDatabase;
}): Promise<RosterTemplateRecord | null> {
  const template = await args.db.classTemplate.findFirst({
    where: { id: args.templateId, workspaceId: args.access.workspaceId },
    include: classOccurrenceInclude,
  });
  if (!template) return null;
  const occurrence = resolveClassOccurrence({
    template: template as unknown as ClassOccurrenceTemplate,
    scheduledForDate: args.scheduledForDate,
  });
  if (!occurrence || occurrence.status !== "ACTIVE") return null;
  if (
    args.access.role === "COACH" &&
    occurrence.coachWorkspaceUserId !== args.access.workspaceUserId
  )
    return null;
  return occurrence as RosterTemplateRecord;
}

export async function listTodayClasses(args: {
  access: RosterAccessContext;
  db?: RosterDatabase;
  now?: Date;
}): Promise<TodayClassSummary[]> {
  const db = args.db ?? rosterDatabase;
  const now = args.now ?? new Date();
  const scheduledForDate = getWorkspaceDateString(now, args.access.timezone);
  const rawTemplates = await db.classTemplate.findMany({
    where: { workspaceId: args.access.workspaceId, archivedAt: null },
    include: classOccurrenceInclude,
  });
  const templates = rawTemplates
    .map((template) =>
      resolveClassOccurrence({
        template: template as unknown as ClassOccurrenceTemplate,
        scheduledForDate,
      }),
    )
    .filter(
      (item) =>
        item &&
        item.status === "ACTIVE" &&
        (args.access.role === "OWNER" ||
          item.coachWorkspaceUserId === args.access.workspaceUserId),
    ) as RosterTemplateRecord[];
  templates.sort((a, b) => a.startTimeMinutes - b.startTimeMinutes);
  const templateIds = templates.map((template) => template.id);

  if (templateIds.length === 0) {
    return [];
  }

  const scheduledDate = dateOnlyStringToUtcDate(scheduledForDate);
  const [bookings, attendanceRecords] = await Promise.all([
    db.classBooking.findMany({
      where: {
        workspaceId: args.access.workspaceId,
        classTemplateId: {
          in: templateIds,
        },
        scheduledForDate: scheduledDate,
        status: {
          in: activeBookingStatuses,
        },
      },
      select: {
        id: true,
        memberId: true,
        guardianId: true,
        bookingType: true,
        status: true,
        classTemplateId: true,
        member: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            status: true,
            familyLinks: {
              include: {
                guardian: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
              orderBy: {
                isPrimary: "desc",
              },
            },
          },
        },
        guardian: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
    }),
    db.attendanceRecord.findMany({
      where: {
        workspaceId: args.access.workspaceId,
        classTemplateId: {
          in: templateIds,
        },
        scheduledForDate: scheduledDate,
      },
      select: {
        id: true,
        memberId: true,
        classTemplateId: true,
        state: true,
        note: true,
        updatedAt: true,
      },
    }),
  ]);

  return templates.map((template) => {
    const display = mapTemplateDisplay(template, args.access.locale);
    const templateBookings = bookings.filter(
      (booking) => booking.classTemplateId === template.id,
    );
    const templateAttendanceRecords = attendanceRecords.filter(
      (record) => record.classTemplateId === template.id,
    );

    return {
      id: template.id,
      displayTitle: display.displayTitle,
      scheduledForDate,
      weekdayLabel: display.weekdayLabel,
      timeLabel: display.timeLabel,
      roomName: template.room.name,
      coachDisplayName: display.coachDisplayName,
      effectiveCapacity: display.effectiveCapacity,
      rosterCount: templateBookings.length,
      trialCount: templateBookings.filter(
        (booking) => booking.bookingType === "TRIAL",
      ).length,
      attendanceRecordedCount: templateAttendanceRecords.length,
    };
  });
}

export async function getClassRoster(args: {
  access: RosterAccessContext;
  templateId: string;
  scheduledForDate: string;
  db?: RosterDatabase;
  now?: Date;
}): Promise<ClassRoster | null> {
  const db = args.db ?? rosterDatabase;
  const now = args.now ?? new Date();
  const template = await getRosterTemplate({
    access: args.access,
    templateId: args.templateId,
    scheduledForDate: args.scheduledForDate,
    db,
  });

  if (!template) {
    return null;
  }

  const occurrence = validateOccurrenceDate({
    scheduledForDate: args.scheduledForDate,
    templateWeekday: template.weekday,
    timezone: template.timezone ?? args.access.timezone,
    now,
    direction: "any",
  });

  if (occurrence.status === "error") {
    return null;
  }
  const cutoff = attendanceCutoff(
    template,
    occurrence.dateString,
    args.access.timezone,
  );

  const [bookings, attendanceRecords, history] = await Promise.all([
    db.classBooking.findMany({
      where: {
        workspaceId: args.access.workspaceId,
        classTemplateId: template.id,
        scheduledForDate: occurrence.date,
        status: {
          in: activeBookingStatuses,
        },
      },
      include: {
        member: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            status: true,
            familyLinks: {
              include: {
                guardian: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
              orderBy: {
                isPrimary: "desc",
              },
            },
          },
        },
        guardian: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: [
        {
          bookingType: "desc",
        },
        {
          createdAt: "asc",
        },
      ],
    }),
    db.attendanceRecord.findMany({
      where: {
        workspaceId: args.access.workspaceId,
        classTemplateId: template.id,
        scheduledForDate: occurrence.date,
      },
      select: {
        id: true,
        memberId: true,
        classTemplateId: true,
        state: true,
        note: true,
        updatedAt: true,
      },
    }),
    db.attendanceEvent.findMany({
      where: {
        workspaceId: args.access.workspaceId,
        classTemplateId: template.id,
        scheduledForDate: occurrence.date,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        memberId: true,
        previousState: true,
        state: true,
        reason: true,
        actorNameSnapshot: true,
        createdAt: true,
      },
    }),
  ]);
  const attendanceByMemberId = new Map(
    attendanceRecords.map((record) => [record.memberId, record]),
  );
  const waitlist = await listOccurrenceWaitlist({
    workspaceId: args.access.workspaceId,
    classTemplateId: template.id,
    scheduledForDate: occurrence.dateString,
    db: db as never,
  });
  const display = mapTemplateDisplay(template, args.access.locale);

  return {
    templateId: template.id,
    scheduledForDate: occurrence.dateString,
    displayTitle: display.displayTitle,
    weekdayLabel: display.weekdayLabel,
    timeLabel: display.timeLabel,
    programName: template.program.name,
    roomName: template.room.name,
    coachDisplayName: display.coachDisplayName,
    effectiveCapacity: display.effectiveCapacity,
    noShowCutoffAt: cutoff.at.toISOString(),
    occurrenceTimezone: cutoff.timezone,
    canClose: now >= cutoff.at,
    unresolvedCount: bookings.filter(
      (booking) =>
        booking.status === "BOOKED" &&
        !attendanceByMemberId.has(booking.memberId),
    ).length,
    rows: bookings.map((booking) => {
      const guardian = selectGuardianForBooking(booking);
      const attendance = attendanceByMemberId.get(booking.memberId);

      return {
        bookingId: booking.id,
        memberId: booking.memberId,
        memberName: booking.member.fullName,
        memberStatus: booking.member.status,
        email: booking.member.email,
        phone: booking.member.phone,
        // Legacy profile free text has no roster visibility classification.
        notes: null,
        tags: [],
        bookingType: booking.bookingType,
        bookingStatus: booking.status,
        guardianName: guardian?.fullName ?? null,
        guardianContact: guardian ? formatGuardianContact(guardian) : null,
        attendanceState: attendance?.state ?? null,
        attendanceNote: attendance?.note ?? null,
        attendanceVersion: attendance?.updatedAt.toISOString() ?? "UNRECORDED",
        attendanceHistory: history
          .filter((event) => event.memberId === booking.memberId)
          .map((event) => ({
            id: event.id,
            previousState: event.previousState,
            state: event.state,
            reason: event.reason,
            actorName: event.actorNameSnapshot,
            createdAt: event.createdAt.toISOString(),
          })),
      };
    }),
    waitlist: waitlist.entries.map((entry) => ({
      id: entry.id,
      memberId: entry.memberId,
      memberName: entry.memberName,
      memberStatus: entry.memberStatus,
      email: entry.memberEmail,
      phone: entry.memberPhone,
      position: entry.position,
      joinedAt: entry.joinedAt,
      autoPromotionOptedInAt: entry.autoPromotionOptedInAt,
      lastSkipReason: entry.lastSkipReason,
    })),
  };
}

type AttendanceCommand = {
  access: RosterAccessContext;
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  state: string;
  note?: string;
  reason?: string;
  expectedVersion?: string;
  requestKey?: string;
  db?: RosterDatabase;
  now?: Date;
};
type AttendanceEventInput = Omit<
  Prisma.AttendanceEventCreateManyInput,
  "operationId"
>;

async function freshRosterActor(
  db: RosterDatabase,
  access: RosterAccessContext,
) {
  const actor = await db.workspaceUser.findFirst({
    where: {
      id: access.workspaceUserId,
      workspaceId: access.workspaceId,
      isActive: true,
      role: { in: ["OWNER", "COACH"] },
    },
    select: { id: true, role: true, user: { select: { fullName: true } } },
  });
  if (!actor || (actor.role !== "OWNER" && actor.role !== "COACH")) return null;
  return {
    access: { ...access, workspaceUserId: actor.id, role: actor.role },
    name: actor.user.fullName?.trim() || "Gym staff",
  };
}

function attendanceCutoff(
  template: RosterTemplateRecord,
  date: string,
  fallbackTimezone: string,
) {
  const timezone = template.timezone ?? fallbackTimezone;
  return {
    timezone,
    at: getOccurrenceStartsAt({
      scheduledForDate: date,
      startTimeMinutes: template.endTimeMinutes,
      timezone,
    }),
  };
}

function attendanceRequestKey(value?: string) {
  const key = value?.trim() ?? randomUUID();
  return key && key.length <= 160 ? key : null;
}
function attendancePayloadHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function saveAttendanceOperation(
  db: RosterDatabase,
  args: {
    access: RosterAccessContext;
    requestKey: string;
    payloadHash: string;
    action: "RECORD" | "CLOSE";
    result: AttendanceMutationResult | CloseRosterResult;
    events: AttendanceEventInput[];
  },
) {
  const operation = await db.attendanceOperation.create({
    data: {
      workspaceId: args.access.workspaceId,
      requestKey: args.requestKey,
      payloadHash: args.payloadHash,
      action: args.action,
      actorWorkspaceUserId: args.access.workspaceUserId,
      result: args.result as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  if (args.events.length)
    await db.attendanceEvent.createMany({
      data: args.events.map((event) => ({
        ...event,
        operationId: operation.id,
      })),
    });
}

async function writeAttendance(
  db: RosterDatabase,
  args: AttendanceCommand & { actorName: string; now: Date },
): Promise<{ result: AttendanceMutationResult; event?: AttendanceEventInput }> {
  const fail = (message: string) => ({
    result: { status: "error" as const, message },
  });
  const memberId = args.memberId.trim(),
    classTemplateId = args.classTemplateId.trim(),
    scheduledForDate = args.scheduledForDate.trim();
  const note = cleanNullable(args.note),
    reason = cleanNullable(args.reason);
  if (!memberId || !classTemplateId || !scheduledForDate)
    return fail("Attendance requires a member and class date.");
  if (!isAttendanceState(args.state))
    return fail("Choose a valid attendance state.");
  if ((note?.length ?? 0) > 2000 || (reason?.length ?? 0) > 1000)
    return fail(
      "Keep the attendance note within 2,000 characters and correction reason within 1,000.",
    );
  const [member, template] = await Promise.all([
    db.member.findFirst({
      where: { id: memberId, workspaceId: args.access.workspaceId },
      select: { id: true },
    }),
    getRosterTemplate({
      access: args.access,
      templateId: classTemplateId,
      scheduledForDate,
      db,
    }),
  ]);
  if (!member) return fail("Member not found.");
  if (!template) return fail("Class roster not found.");
  const cutoff = attendanceCutoff(
    template,
    scheduledForDate,
    args.access.timezone,
  );
  const occurrence = validateOccurrenceDate({
    scheduledForDate,
    templateWeekday: template.weekday,
    timezone: cutoff.timezone,
    now: args.now,
    direction: "past",
  });
  if (occurrence.status === "error")
    return fail(
      "Attendance can only be recorded for today or a past class date.",
    );
  if (args.state === "NO_SHOW" && args.now < cutoff.at)
    return fail(
      "No-shows can only be recorded after the scheduled class has ended.",
    );
  const fundedBooking = (await db.classBooking.findFirst({
    where: {
      workspaceId: args.access.workspaceId,
      memberId,
      classTemplateId,
      scheduledForDate: occurrence.date,
      status: { in: activeBookingStatuses },
    },
    select: {
      id: true,
      status: true,
      memberPunchCardId: true,
      fundingMembershipId: true,
      fundedByBookingId: true,
      bookingType: true,
    },
  })) as {
    id: string;
    status: ClassBookingStatus;
    bookingType?: string;
    memberPunchCardId?: string;
    fundingMembershipId?: string;
    fundedByBookingId?: string;
  } | null;
  if (!fundedBooking)
    return fail("Add this member to the class before recording attendance.");
  const previous = await db.attendanceRecord.findFirst({
    where: {
      workspaceId: args.access.workspaceId,
      memberId,
      classTemplateId,
      scheduledForDate: occurrence.date,
    },
    select: {
      id: true,
      memberId: true,
      classTemplateId: true,
      state: true,
      note: true,
      updatedAt: true,
    },
  });
  const version = previous?.updatedAt.toISOString() ?? "UNRECORDED";
  if (args.expectedVersion !== undefined && args.expectedVersion !== version)
    return fail(
      "Attendance changed while you were editing. Refresh the roster before saving.",
    );
  if (previous && previous.state === args.state && previous.note === note)
    return { result: { status: "recorded", attendanceRecordId: previous.id } };
  if (previous && !reason)
    return fail("Give a reason when correcting recorded attendance.");
  if (
    !previous &&
    args.state === "NO_SHOW" &&
    fundedBooking.status !== "BOOKED"
  )
    return fail(
      "Only unresolved confirmed bookings can be marked as no-shows.",
    );
  const held = await financialEntitlementHoldReason({
    workspaceId: args.access.workspaceId,
    targets: [
      { targetKind: "BOOKING", targetId: fundedBooking.id },
      { targetKind: "BOOKING", targetId: fundedBooking.fundedByBookingId },
      { targetKind: "MEMBERSHIP", targetId: fundedBooking.fundingMembershipId },
      { targetKind: "PUNCH_CARD", targetId: fundedBooking.memberPunchCardId },
    ],
    db,
  });
  if (held) return fail(held);
  if (db.programPromotion && ["PRESENT", "LATE"].includes(args.state)) {
    const eligibility = await checkMemberClassEligibility({
      workspaceId: args.access.workspaceId,
      memberId,
      scheduledForDate: occurrence.dateString,
      occurrence: { ...template, classTemplateId: template.id } as never,
      db: db as unknown as Prisma.TransactionClient,
    });
    if (!eligibility.eligible)
      return fail(
        eligibility.reason ??
          "This member does not meet the class requirements.",
      );
  }
  const forms = await evaluateBookingFormsTx(
    db as unknown as Prisma.TransactionClient,
    {
      workspaceId: args.access.workspaceId,
      bookingId: fundedBooking.id,
      serviceAt: getOccurrenceStartsAt({
        scheduledForDate,
        startTimeMinutes: template.startTimeMinutes,
        timezone: cutoff.timezone,
      }),
      now: args.now,
      state: args.state as "PRESENT" | "LATE" | "NO_SHOW" | "ABSENT",
    },
  );
  if (forms.kind !== "CLEAR")
    return fail(
      forms.kind === "PROVIDER_RECOVERY_REQUIRED"
        ? "This accepted booking needs penalty-free form recovery. No attendance or funding consequence was recorded. Open Forms → Booking recovery."
        : forms.kind === "MISSING_ACCEPTANCE"
          ? "Complete the exact forms valid for this class before admission."
          : "The accepted form evidence needs owner review before attendance or a funding consequence can be recorded.",
    );

  const outcome =
    args.state === "NO_SHOW"
      ? "NO_SHOW"
      : args.state === "ABSENT"
        ? "EXCUSED"
        : "ATTENDED";
  if (db.punchCardEntry) {
    const settled = await settlePunchCardBooking({
      workspaceId: args.access.workspaceId,
      bookingId: fundedBooking.id,
      outcome,
      db: db as unknown as Prisma.TransactionClient,
      actorWorkspaceUserId: args.access.workspaceUserId,
    });
    if (!settled.ok) return fail(settled.message);
  }
  const recorded = await db.attendanceRecord.upsert({
    where: {
      workspaceId_memberId_classTemplateId_scheduledForDate: {
        workspaceId: args.access.workspaceId,
        memberId,
        classTemplateId,
        scheduledForDate: occurrence.date,
      },
    },
    // Keep the original recorder. Every subsequent actor is attributable in the
    // event history instead of rewriting the original attendance provenance.
    update: {
      state: args.state,
      note,
      ...(previous
        ? {
            updatedAt: new Date(
              Math.max(Date.now(), previous.updatedAt.getTime() + 1),
            ),
          }
        : {}),
    },
    create: {
      workspaceId: args.access.workspaceId,
      memberId,
      classTemplateId,
      scheduledForDate: occurrence.date,
      state: args.state,
      note,
      coachWorkspaceUserId: args.access.workspaceUserId,
    },
    select: { id: true },
  });
  await db.classBooking.updateMany({
    where: {
      id: fundedBooking.id,
      workspaceId: args.access.workspaceId,
      status: { in: activeBookingStatuses },
    },
    data: { status: mapAttendanceToBookingStatus(args.state) },
  });
  if (db.membershipAllowanceAllocation)
    await settleMembershipAllowance({
      workspaceId: args.access.workspaceId,
      bookingId: fundedBooking.id,
      outcome,
      actorWorkspaceUserId: args.access.workspaceUserId,
      db: db as unknown as Prisma.TransactionClient,
    });
  return {
    result: { status: "recorded", attendanceRecordId: recorded.id },
    event: {
      workspaceId: args.access.workspaceId,
      attendanceRecordId: recorded.id,
      bookingId: fundedBooking.id,
      memberId,
      classTemplateId,
      scheduledForDate: occurrence.date,
      actorWorkspaceUserId: args.access.workspaceUserId,
      actorNameSnapshot: args.actorName,
      actorRole: args.access.role,
      previousState: previous?.state ?? null,
      state: args.state,
      previousNote: previous?.note ?? null,
      note,
      reason,
      occurrenceTimezone: cutoff.timezone,
      noShowCutoffAt: cutoff.at,
      createdAt: args.now,
    },
  };
}

export async function recordAttendance(
  args: AttendanceCommand,
): Promise<AttendanceMutationResult> {
  const database = args.db ?? rosterDatabase;
  return database.$transaction(
    async (db) => {
      await lockClassSchedule(db, args.access.workspaceId);
      const actor = await freshRosterActor(db, args.access);
      if (
        !actor ||
        !(await getRosterTemplate({
          access: actor.access,
          templateId: args.classTemplateId.trim(),
          scheduledForDate: args.scheduledForDate.trim(),
          db,
        }))
      )
        return {
          status: "error",
          message: "You no longer have access to this class roster.",
        };
      const requestKey = attendanceRequestKey(args.requestKey);
      if (!requestKey)
        return {
          status: "error",
          message:
            "Refresh the roster before trying this attendance request again.",
        };
      const payloadHash = attendancePayloadHash({
        action: "RECORD",
        actorId: actor.access.workspaceUserId,
        memberId: args.memberId.trim(),
        classTemplateId: args.classTemplateId.trim(),
        date: args.scheduledForDate.trim(),
        state: args.state,
        note: cleanNullable(args.note),
        reason: cleanNullable(args.reason),
        expectedVersion: args.expectedVersion ?? null,
      });
      const existing = await db.attendanceOperation.findUnique({
        where: {
          workspaceId_requestKey: {
            workspaceId: args.access.workspaceId,
            requestKey,
          },
        },
      });
      if (existing) {
        if (
          existing.payloadHash !== payloadHash ||
          existing.action !== "RECORD"
        )
          return {
            status: "error",
            message:
              "This attendance request was already used for different details. Refresh the roster.",
          };
        const result = existing.result as unknown as AttendanceMutationResult;
        if (
          result.status !== "recorded" ||
          typeof result.attendanceRecordId !== "string"
        )
          return {
            status: "error",
            message: "This request could not be confirmed. Refresh the roster.",
          };
        return result;
      }
      const written = await writeAttendance(db, {
        ...args,
        access: actor.access,
        actorName: actor.name,
        now: args.now ?? new Date(),
      });
      if (written.result.status === "error") return written.result;
      await saveAttendanceOperation(db, {
        access: actor.access,
        requestKey,
        payloadHash,
        action: "RECORD",
        result: written.result,
        events: written.event ? [written.event] : [],
      });
      return written.result;
    },
    { timeout: 20_000 },
  );
}

export async function closeClassRoster(args: {
  access: RosterAccessContext;
  classTemplateId: string;
  scheduledForDate: string;
  requestKey?: string;
  reason?: string;
  db?: RosterDatabase;
  now?: Date;
}): Promise<CloseRosterResult> {
  const database = args.db ?? rosterDatabase;
  return database.$transaction(
    async (db) => {
      await lockClassSchedule(db, args.access.workspaceId);
      const actor = await freshRosterActor(db, args.access);
      const template = actor
        ? await getRosterTemplate({
            access: actor.access,
            templateId: args.classTemplateId.trim(),
            scheduledForDate: args.scheduledForDate.trim(),
            db,
          })
        : null;
      if (!actor || !template)
        return {
          status: "error",
          message: "You no longer have access to this class roster.",
        };
      const now = args.now ?? new Date(),
        cutoff = attendanceCutoff(
          template,
          args.scheduledForDate,
          actor.access.timezone,
        );
      if (now < cutoff.at)
        return {
          status: "error",
          message:
            "Close the roster only after the scheduled class has ended. Late arrivals must not be marked as no-shows early.",
        };
      const requestKey = attendanceRequestKey(args.requestKey),
        reason =
          cleanNullable(args.reason) ??
          "Roster closed after the scheduled class ended.";
      if (!requestKey || reason.length > 1000)
        return {
          status: "error",
          message:
            "Refresh the roster and keep the closure reason within 1,000 characters.",
        };
      const payloadHash = attendancePayloadHash({
        action: "CLOSE",
        actorId: actor.access.workspaceUserId,
        classTemplateId: args.classTemplateId.trim(),
        date: args.scheduledForDate.trim(),
        reason,
      });
      const existing = await db.attendanceOperation.findUnique({
        where: {
          workspaceId_requestKey: {
            workspaceId: args.access.workspaceId,
            requestKey,
          },
        },
      });
      if (existing) {
        if (existing.payloadHash !== payloadHash || existing.action !== "CLOSE")
          return {
            status: "error",
            message:
              "This closure request was already used for different details. Refresh the roster.",
          };
        const result = existing.result as unknown as CloseRosterResult;
        return result.status === "closed" && Array.isArray(result.skipped)
          ? result
          : {
              status: "error",
              message:
                "This closure could not be confirmed. Refresh the roster.",
            };
      }
      const date = dateOnlyStringToUtcDate(args.scheduledForDate);
      const candidates = await db.classBooking.findMany({
        where: {
          workspaceId: actor.access.workspaceId,
          classTemplateId: template.id,
          scheduledForDate: date,
          status: "BOOKED",
        },
        take: 501,
        orderBy: { id: "asc" },
      });
      if (candidates.length > 500)
        return {
          status: "error",
          message:
            "This roster is too large to close at once. Record attendance individually.",
        };
      const explicit = await db.attendanceRecord.findMany({
        where: {
          workspaceId: actor.access.workspaceId,
          classTemplateId: template.id,
          scheduledForDate: date,
        },
        select: { memberId: true },
      });
      const resolved = new Set(explicit.map((record) => record.memberId));
      const events: AttendanceEventInput[] = [],
        skipped: Array<{ memberId: string; reason: string }> = [];
      let closedCount = 0;
      for (const booking of candidates) {
        if (resolved.has(booking.memberId)) continue;
        if (db.programPromotion) {
          const eligibility = await checkMemberClassEligibility({
            workspaceId: actor.access.workspaceId,
            memberId: booking.memberId,
            scheduledForDate: args.scheduledForDate,
            occurrence: { ...template, classTemplateId: template.id } as never,
            db: db as unknown as Prisma.TransactionClient,
          });
          if (!eligibility.eligible) {
            skipped.push({
              memberId: booking.memberId,
              reason:
                eligibility.reason ??
                "The member does not meet the class requirements.",
            });
            continue;
          }
        }
        // Individual and bulk closure use the same service-time/cause guard in
        // writeAttendance; today's current pointer cannot alter an old no-show.
        const written = await writeAttendance(db, {
          access: actor.access,
          actorName: actor.name,
          memberId: booking.memberId,
          classTemplateId: template.id,
          scheduledForDate: args.scheduledForDate,
          state: "NO_SHOW",
          reason,
          expectedVersion: "UNRECORDED",
          now,
        });
        if (written.result.status === "error") {
          skipped.push({
            memberId: booking.memberId,
            reason: written.result.message,
          });
          continue;
        }
        closedCount++;
        if (written.event) events.push(written.event);
      }
      const result: CloseRosterResult = {
        status: "closed",
        closedCount,
        skipped,
      };
      await saveAttendanceOperation(db, {
        access: actor.access,
        requestKey,
        payloadHash,
        action: "CLOSE",
        result,
        events,
      });
      return result;
    },
    { timeout: 20_000 },
  );
}

export async function promoteRosterWaitlist(args: {
  access: RosterAccessContext;
  classTemplateId: string;
  scheduledForDate: string;
  db?: RosterDatabase;
  now?: Date;
}): Promise<
  | {
      status: "promoted";
      bookingId: string;
      waitlistEntryId: string;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const db = args.db ?? rosterDatabase;
  const template = await getRosterTemplate({
    access: args.access,
    templateId: args.classTemplateId,
    scheduledForDate: args.scheduledForDate,
    db,
  });
  if (!template) return { status: "error", message: "Class roster not found." };
  const result = await promoteNextWaitlistEntry({
    workspaceId: args.access.workspaceId,
    classTemplateId: args.classTemplateId,
    scheduledForDate: args.scheduledForDate,
    timezone: args.access.timezone,
    source: "ADMIN",
    authorize: async (tx) =>
      Boolean(
        await getRosterTemplate({
          access: args.access,
          templateId: args.classTemplateId,
          scheduledForDate: args.scheduledForDate,
          db: tx as unknown as RosterDatabase,
        }),
      ),
    db: db as never,
    now: args.now,
  });

  if (result.status === "error") {
    return result;
  }

  return {
    status: "promoted",
    bookingId: result.bookingId,
    waitlistEntryId: result.waitlistEntryId,
  };
}

export async function removeRosterWaitlist(args: {
  access: RosterAccessContext;
  waitlistEntryId: string;
  db?: RosterDatabase;
}): Promise<
  | {
      status: "removed";
      waitlistEntryId: string;
    }
  | {
      status: "error";
      message: string;
    }
> {
  const db = args.db ?? rosterDatabase;
  const entry = (await db.waitlistEntry.findFirst({
    where: { id: args.waitlistEntryId, workspaceId: args.access.workspaceId },
  })) as { classTemplateId: string; scheduledForDate: Date } | null;
  if (
    !entry ||
    !(await getRosterTemplate({
      access: args.access,
      templateId: entry.classTemplateId,
      scheduledForDate: toDateOnlyString(entry.scheduledForDate),
      db,
    }))
  )
    return { status: "error", message: "Class roster not found." };
  const result = await removeWaitlistEntry({
    workspaceId: args.access.workspaceId,
    waitlistEntryId: args.waitlistEntryId,
    authorize: async (tx) =>
      Boolean(
        await getRosterTemplate({
          access: args.access,
          templateId: entry.classTemplateId,
          scheduledForDate: toDateOnlyString(entry.scheduledForDate),
          db: tx as unknown as RosterDatabase,
        }),
      ),
    db: db as never,
  });

  if (result.status === "error") {
    return result;
  }

  return {
    status: "removed",
    waitlistEntryId: result.waitlistEntryId,
  };
}
