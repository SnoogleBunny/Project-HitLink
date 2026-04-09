import {
  buildUpcomingOccurrenceDateOptions,
  dateOnlyStringToUtcDate,
  formatMinutesAsTime,
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  prisma,
  toDateOnlyString,
  validateOccurrenceDate,
  type ClassBookingStatus,
  type ClassBookingType,
  type Weekday,
} from "@hitlink/db";
import {
  canMemberSelfBook,
  getAllowedProgramIdsForCurrentMembership,
  getCurrentMemberMembershipContext,
  type MemberMembershipDatabase,
} from "./member-membership";

interface BookingTemplateRecord {
  id: string;
  programId: string;
  title: string | null;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  program: {
    id: string;
    name: string;
  };
  room: {
    name: string;
  };
}

interface ExistingBookingRecord {
  id: string;
  classTemplateId: string;
  scheduledForDate: Date;
  bookingType: ClassBookingType;
  status: ClassBookingStatus;
  classTemplate: BookingTemplateRecord;
}

interface SelfServiceBookingDatabase extends MemberMembershipDatabase {
  classTemplate: {
    findMany(args: Record<string, unknown>): Promise<BookingTemplateRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<BookingTemplateRecord | null>;
  };
  classBooking: {
    findMany(args: Record<string, unknown>): Promise<ExistingBookingRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<ExistingBookingRecord | null>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
}

export interface ScheduleOccurrence {
  classTemplateId: string;
  scheduledForDate: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  dateLabel: string;
  timeLabel: string;
  bookingCutoffMinutes: number;
  isBooked: boolean;
}

export interface MemberBookingSummary {
  bookingId: string;
  classTemplateId: string;
  scheduledForDate: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  timeLabel: string;
  status: ClassBookingStatus;
  canCancel: boolean;
}

export interface EligibleSelfServiceOccurrences {
  eligibility: "eligible" | "no_membership" | "membership_blocked";
  occurrences: ScheduleOccurrence[];
}

type SelfBookingMutationResult =
  | {
      status: "created" | "restored" | "cancelled";
      bookingId: string;
    }
  | {
      status: "error";
      message: string;
    };

const selfServiceBookingDatabase =
  prisma as unknown as SelfServiceBookingDatabase;

function buildTemplateWhere(args: {
  workspaceId: string;
  allowedProgramIds: string[] | null;
}) {
  const where: Record<string, unknown> = {
    workspaceId: args.workspaceId,
    archivedAt: null,
    program: {
      archivedAt: null,
    },
    room: {
      archivedAt: null,
      isActive: true,
    },
  };

  if (args.allowedProgramIds) {
    where.programId = {
      in: args.allowedProgramIds,
    };
  }

  return where;
}

function getOccurrenceStartsAt(args: {
  scheduledForDate: string;
  startTimeMinutes: number;
  timezone: string;
}): Date {
  return getZonedDateTimeAsUtc({
    dateString: args.scheduledForDate,
    minutes: args.startTimeMinutes,
    timezone: args.timezone,
  });
}

function isPastBookingCutoff(args: {
  scheduledForDate: string;
  startTimeMinutes: number;
  bookingCutoffMinutes: number;
  timezone: string;
  now: Date;
}): boolean {
  const startsAt = getOccurrenceStartsAt(args);

  return args.now.getTime() > startsAt.getTime() - args.bookingCutoffMinutes * 60_000;
}

function isPastCancellationCutoff(args: {
  scheduledForDate: string;
  startTimeMinutes: number;
  cancellationCutoffMinutes: number;
  timezone: string;
  now: Date;
}): boolean {
  const startsAt = getOccurrenceStartsAt(args);

  return (
    args.now.getTime() > startsAt.getTime() - args.cancellationCutoffMinutes * 60_000
  );
}

function formatBookingItem(booking: ExistingBookingRecord, args: {
  timezone: string;
  now: Date;
}): MemberBookingSummary {
  const scheduledForDate = toDateOnlyString(booking.scheduledForDate);

  return {
    bookingId: booking.id,
    classTemplateId: booking.classTemplateId,
    scheduledForDate,
    displayTitle: booking.classTemplate.title ?? booking.classTemplate.program.name,
    programName: booking.classTemplate.program.name,
    roomName: booking.classTemplate.room.name,
    timeLabel: formatMinutesAsTime(booking.classTemplate.startTimeMinutes),
    status: booking.status,
    canCancel:
      booking.status === "BOOKED" &&
      !isPastCancellationCutoff({
        scheduledForDate,
        startTimeMinutes: booking.classTemplate.startTimeMinutes,
        cancellationCutoffMinutes:
          booking.classTemplate.cancellationCutoffMinutes,
        timezone: args.timezone,
        now: args.now,
      }),
  };
}

export async function listEligibleSelfServiceOccurrences(args: {
  workspaceId: string;
  memberId: string;
  timezone: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<EligibleSelfServiceOccurrences> {
  const db = args.db ?? selfServiceBookingDatabase;
  const now = args.now ?? new Date();
  const membership = await getCurrentMemberMembershipContext({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });

  if (!membership) {
    return {
      eligibility: "no_membership",
      occurrences: [],
    };
  }

  if (!canMemberSelfBook(membership)) {
    return {
      eligibility: "membership_blocked",
      occurrences: [],
    };
  }

  const allowedProgramIds = getAllowedProgramIdsForCurrentMembership(membership);
  const templates = await db.classTemplate.findMany({
    where: buildTemplateWhere({
      workspaceId: args.workspaceId,
      allowedProgramIds,
    }),
    include: {
      program: {
        select: {
          id: true,
          name: true,
        },
      },
      room: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      {
        weekday: "asc",
      },
      {
        startTimeMinutes: "asc",
      },
    ],
  });

  const today = getWorkspaceDateString(now, args.timezone);
  const existingBookings = await db.classBooking.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      scheduledForDate: {
        gte: dateOnlyStringToUtcDate(today),
      },
      status: {
        not: "CANCELLED",
      },
    },
    include: {
      classTemplate: {
        include: {
          program: {
            select: {
              id: true,
              name: true,
            },
          },
          room: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
  const existingBookingKeys = new Set(
    existingBookings.map(
      (booking) =>
        `${booking.classTemplateId}:${toDateOnlyString(booking.scheduledForDate)}`,
    ),
  );

  const occurrences = buildUpcomingOccurrenceDateOptions({
    templates,
    timezone: args.timezone,
    now,
    occurrenceCount: 8,
  })
    .flatMap(({ template, dateOptions }) =>
      dateOptions
        .filter(
          (dateOption) =>
            !isPastBookingCutoff({
              scheduledForDate: dateOption.scheduledForDate,
              startTimeMinutes: template.startTimeMinutes,
              bookingCutoffMinutes: template.bookingCutoffMinutes,
              timezone: args.timezone,
              now,
            }),
        )
        .map((dateOption) => ({
          classTemplateId: dateOption.classTemplateId,
          scheduledForDate: dateOption.scheduledForDate,
          displayTitle: template.title ?? template.program.name,
          programName: template.program.name,
          roomName: template.room.name,
          dateLabel: dateOption.label,
          timeLabel: formatMinutesAsTime(template.startTimeMinutes),
          bookingCutoffMinutes: template.bookingCutoffMinutes,
          isBooked: existingBookingKeys.has(
            `${dateOption.classTemplateId}:${dateOption.scheduledForDate}`,
          ),
        })),
    );

  return {
    eligibility: "eligible",
    occurrences,
  };
}

export async function listMemberBookings(args: {
  workspaceId: string;
  memberId: string;
  timezone: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<{
  upcoming: MemberBookingSummary[];
  history: MemberBookingSummary[];
}> {
  const db = args.db ?? selfServiceBookingDatabase;
  const now = args.now ?? new Date();
  const bookings = await db.classBooking.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
    },
    include: {
      classTemplate: {
        include: {
          program: {
            select: {
              id: true,
              name: true,
            },
          },
          room: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        scheduledForDate: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
    take: 30,
  });

  const upcoming: MemberBookingSummary[] = [];
  const history: MemberBookingSummary[] = [];

  for (const booking of bookings) {
    const item = formatBookingItem(booking, {
      timezone: args.timezone,
      now,
    });
    const startsAt = getOccurrenceStartsAt({
      scheduledForDate: item.scheduledForDate,
      startTimeMinutes: booking.classTemplate.startTimeMinutes,
      timezone: args.timezone,
    });

    if (booking.status === "BOOKED" && startsAt > now) {
      upcoming.push(item);
      continue;
    }

    history.push(item);
  }

  return {
    upcoming,
    history,
  };
}

export async function createSelfBooking(args: {
  workspaceId: string;
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<SelfBookingMutationResult> {
  const db = args.db ?? selfServiceBookingDatabase;
  const now = args.now ?? new Date();
  const membership = await getCurrentMemberMembershipContext({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });

  if (!membership) {
    return {
      status: "error",
      message: "A current membership is required before booking classes.",
    };
  }

  if (!canMemberSelfBook(membership)) {
    return {
      status: "error",
      message: "This membership cannot book classes right now.",
    };
  }

  const template = await db.classTemplate.findFirst({
    where: {
      id: args.classTemplateId,
      ...buildTemplateWhere({
        workspaceId: args.workspaceId,
        allowedProgramIds: getAllowedProgramIdsForCurrentMembership(membership),
      }),
    },
    include: {
      program: {
        select: {
          id: true,
          name: true,
        },
      },
      room: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!template) {
    return {
      status: "error",
      message: "Choose an active class that your membership allows.",
    };
  }

  const occurrence = validateOccurrenceDate({
    scheduledForDate: args.scheduledForDate,
    templateWeekday: template.weekday,
    timezone: args.timezone,
    now,
    direction: "future",
  });

  if (occurrence.status === "error") {
    return {
      status: "error",
      message: "Choose a valid upcoming class date.",
    };
  }

  if (
    isPastBookingCutoff({
      scheduledForDate: occurrence.dateString,
      startTimeMinutes: template.startTimeMinutes,
      bookingCutoffMinutes: template.bookingCutoffMinutes,
      timezone: args.timezone,
      now,
    })
  ) {
    return {
      status: "error",
      message: "Booking cutoff has already passed for this class.",
    };
  }

  const existingBooking = await db.classBooking.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      classTemplateId: args.classTemplateId,
      scheduledForDate: occurrence.date,
    },
    include: {
      classTemplate: {
        include: {
          program: {
            select: {
              id: true,
              name: true,
            },
          },
          room: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (existingBooking) {
    if (existingBooking.status === "CANCELLED") {
      const booking = await db.classBooking.update({
        where: {
          id: existingBooking.id,
        },
        data: {
          bookingType: "STANDARD",
          guardianId: null,
          source: "MEMBER_PORTAL",
          status: "BOOKED",
        },
        select: {
          id: true,
        },
      });

      return {
        status: "restored",
        bookingId: booking.id,
      };
    }

    return {
      status: "error",
      message: "You already have an active booking for that class date.",
    };
  }

  const booking = await db.classBooking.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      guardianId: null,
      classTemplateId: args.classTemplateId,
      scheduledForDate: dateOnlyStringToUtcDate(occurrence.dateString),
      bookingType: "STANDARD",
      status: "BOOKED",
      source: "MEMBER_PORTAL",
    },
    select: {
      id: true,
    },
  });

  return {
    status: "created",
    bookingId: booking.id,
  };
}

export async function cancelSelfBooking(args: {
  workspaceId: string;
  memberId: string;
  bookingId: string;
  timezone: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<SelfBookingMutationResult> {
  const db = args.db ?? selfServiceBookingDatabase;
  const now = args.now ?? new Date();
  const booking = await db.classBooking.findFirst({
    where: {
      id: args.bookingId,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
    },
    include: {
      classTemplate: {
        include: {
          program: {
            select: {
              id: true,
              name: true,
            },
          },
          room: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!booking) {
    return {
      status: "error",
      message: "Booking not found.",
    };
  }

  if (booking.status !== "BOOKED") {
    return {
      status: "error",
      message: "Only active upcoming bookings can be cancelled here.",
    };
  }

  const scheduledForDate = toDateOnlyString(booking.scheduledForDate);

  if (
    isPastCancellationCutoff({
      scheduledForDate,
      startTimeMinutes: booking.classTemplate.startTimeMinutes,
      cancellationCutoffMinutes: booking.classTemplate.cancellationCutoffMinutes,
      timezone: args.timezone,
      now,
    })
  ) {
    return {
      status: "error",
      message: "Cancellation cutoff has already passed for this booking.",
    };
  }

  const result = await db.classBooking.updateMany({
    where: {
      id: booking.id,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      status: "BOOKED",
    },
    data: {
      status: "CANCELLED",
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Booking could not be cancelled.",
    };
  }

  return {
    status: "cancelled",
    bookingId: booking.id,
  };
}
