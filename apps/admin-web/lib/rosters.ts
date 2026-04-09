import {
  dateOnlyStringToUtcDate,
  formatMinutesAsTime,
  getWeekdayForDateString,
  getWorkspaceDateString,
  prisma,
  validateOccurrenceDate,
  WEEKDAY_LABELS,
  type AttendanceState,
  type ClassBookingStatus,
  type ClassBookingType,
  type UserRole,
  type Weekday,
} from "@hitlink/db";

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
  id: string;
  title: string | null;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  capacityOverride: number | null;
  coachWorkspaceUserId: string;
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
  };
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

interface RosterDatabase {
  member: {
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  classTemplate: {
    findMany(args: Record<string, unknown>): Promise<RosterTemplateRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<RosterTemplateRecord | null>;
  };
  classBooking: {
    findMany(args: Record<string, unknown>): Promise<RosterBookingRecord[]>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  attendanceRecord: {
    findMany(args: Record<string, unknown>): Promise<RosterAttendanceRecord[]>;
    upsert(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

export interface RosterAccessContext {
  workspaceId: string;
  workspaceUserId: string;
  role: "OWNER" | "COACH";
  timezone: string;
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
}

type AttendanceMutationResult =
  | {
      status: "recorded";
      attendanceRecordId: string;
    }
  | {
      status: "error";
      message: string;
    };

const rosterDatabase = prisma as unknown as RosterDatabase;

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function buildDisplayName(fullName: string | null, email: string): string {
  const trimmedName = fullName?.trim();

  return trimmedName ? trimmedName : email;
}

function mapTemplateDisplay(template: RosterTemplateRecord) {
  return {
    displayTitle: template.title ?? template.program.name,
    timeLabel: `${formatMinutesAsTime(template.startTimeMinutes)} - ${formatMinutesAsTime(template.endTimeMinutes)}`,
    weekdayLabel: WEEKDAY_LABELS[template.weekday],
    effectiveCapacity: template.capacityOverride ?? template.room.capacity,
    coachDisplayName: buildDisplayName(
      template.coachWorkspaceUser.user.fullName,
      template.coachWorkspaceUser.user.email,
    ),
  };
}

function getClassTemplateAccessWhere(args: {
  access: RosterAccessContext;
  templateId?: string;
  weekday?: Weekday;
}) {
  const where: Record<string, unknown> = {
    workspaceId: args.access.workspaceId,
    archivedAt: null,
    program: {
      archivedAt: null,
    },
    room: {
      archivedAt: null,
      isActive: true,
    },
  };

  if (args.templateId) {
    where.id = args.templateId;
  }

  if (args.weekday) {
    where.weekday = args.weekday;
  }

  if (args.access.role === "COACH") {
    where.coachWorkspaceUserId = args.access.workspaceUserId;
  }

  return where;
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
  db: RosterDatabase;
}): Promise<RosterTemplateRecord | null> {
  return args.db.classTemplate.findFirst({
    where: getClassTemplateAccessWhere({
      access: args.access,
      templateId: args.templateId,
    }),
    include: {
      program: {
        select: {
          name: true,
        },
      },
      room: {
        select: {
          name: true,
          capacity: true,
        },
      },
      coachWorkspaceUser: {
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

export async function listTodayClasses(args: {
  access: RosterAccessContext;
  db?: RosterDatabase;
  now?: Date;
}): Promise<TodayClassSummary[]> {
  const db = args.db ?? rosterDatabase;
  const now = args.now ?? new Date();
  const scheduledForDate = getWorkspaceDateString(now, args.access.timezone);
  const weekday = getWeekdayForDateString(scheduledForDate);
  const templates = await db.classTemplate.findMany({
    where: getClassTemplateAccessWhere({
      access: args.access,
      weekday,
    }),
    include: {
      program: {
        select: {
          name: true,
        },
      },
      room: {
        select: {
          name: true,
          capacity: true,
        },
      },
      coachWorkspaceUser: {
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        startTimeMinutes: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });
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
            notes: true,
            tags: true,
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
    const display = mapTemplateDisplay(template);
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
    db,
  });

  if (!template) {
    return null;
  }

  const occurrence = validateOccurrenceDate({
    scheduledForDate: args.scheduledForDate,
    templateWeekday: template.weekday,
    timezone: args.access.timezone,
    now,
    direction: "any",
  });

  if (occurrence.status === "error") {
    return null;
  }

  const [bookings, attendanceRecords] = await Promise.all([
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
          include: {
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
  ]);
  const attendanceByMemberId = new Map(
    attendanceRecords.map((record) => [record.memberId, record]),
  );
  const display = mapTemplateDisplay(template);

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
        notes: booking.member.notes,
        tags: booking.member.tags,
        bookingType: booking.bookingType,
        bookingStatus: booking.status,
        guardianName: guardian?.fullName ?? null,
        guardianContact: guardian ? formatGuardianContact(guardian) : null,
        attendanceState: attendance?.state ?? null,
        attendanceNote: attendance?.note ?? null,
      };
    }),
  };
}

export async function recordAttendance(args: {
  access: RosterAccessContext;
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  state: string;
  note?: string;
  db?: RosterDatabase;
  now?: Date;
}): Promise<AttendanceMutationResult> {
  const db = args.db ?? rosterDatabase;
  const now = args.now ?? new Date();
  const memberId = args.memberId.trim();
  const classTemplateId = args.classTemplateId.trim();
  const scheduledForDate = args.scheduledForDate.trim();
  const note = cleanNullable(args.note);

  if (!memberId || !classTemplateId || !scheduledForDate) {
    return {
      status: "error",
      message: "Attendance requires a member and class date.",
    };
  }

  if (!isAttendanceState(args.state)) {
    return {
      status: "error",
      message: "Choose a valid attendance state.",
    };
  }

  const [member, template] = await Promise.all([
    db.member.findFirst({
      where: {
        id: memberId,
        workspaceId: args.access.workspaceId,
      },
      select: {
        id: true,
      },
    }),
    getRosterTemplate({
      access: args.access,
      templateId: classTemplateId,
      db,
    }),
  ]);

  if (!member) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  if (!template) {
    return {
      status: "error",
      message: "Class roster not found.",
    };
  }

  const occurrence = validateOccurrenceDate({
    scheduledForDate,
    templateWeekday: template.weekday,
    timezone: args.access.timezone,
    now,
    direction: "past",
  });

  if (occurrence.status === "error") {
    return {
      status: "error",
      message: "Attendance can only be recorded for today or a past class date.",
    };
  }

  const attendanceRecord = await db.attendanceRecord.upsert({
    where: {
      workspaceId_memberId_classTemplateId_scheduledForDate: {
        workspaceId: args.access.workspaceId,
        memberId,
        classTemplateId,
        scheduledForDate: occurrence.date,
      },
    },
    update: {
      state: args.state,
      note,
      coachWorkspaceUserId: args.access.workspaceUserId,
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
    select: {
      id: true,
    },
  });

  await db.classBooking.updateMany({
    where: {
      workspaceId: args.access.workspaceId,
      memberId,
      classTemplateId,
      scheduledForDate: occurrence.date,
      status: {
        not: "CANCELLED",
      },
    },
    data: {
      status: mapAttendanceToBookingStatus(args.state),
    },
  });

  return {
    status: "recorded",
    attendanceRecordId: attendanceRecord.id,
  };
}
