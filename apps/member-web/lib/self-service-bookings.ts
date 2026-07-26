import {
  buildUpcomingOccurrenceDateOptions,
  canCancelClassBooking,
  cleanupExpiredPendingBookings,
  createAccessBackedBooking,
  cancelAccessBackedBooking,
  formatMinutesAsTime,
  getOccurrenceStartsAt,
  getWorkspaceDateString,
  joinWaitlist,
  leaveWaitlist,
  prisma,
  resolveBookingAccessForProgram,
  toDateOnlyString,
  type ClassBookingStatus,
  type ClassBookingType,
  type Weekday,
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
}

interface ExistingBookingRecord {
  id: string;
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
  classTemplate: {
    id: string;
    title: string | null;
    startTimeMinutes: number;
    program: {
      name: string;
    };
    room: {
      name: string;
    };
  };
}

interface SeatHoldingBookingRecord {
  classTemplateId: string;
  scheduledForDate: Date;
}

interface SelfServiceBookingDatabase {
  classTemplate: {
    findMany(args: Record<string, unknown>): Promise<BookingTemplateRecord[]>;
  };
  classBooking: {
    findMany(args: Record<string, unknown>): Promise<
      Array<ExistingBookingRecord | SeatHoldingBookingRecord>
    >;
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
    | "FULL";
  accessLabel: string | null;
  action:
    | "book"
    | "pay_and_book"
    | "join_waitlist"
    | "none";
  actionLabel: string;
  note: string | null;
}

export interface MemberBookingSummary {
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
  waitlistEntryId: string;
  classTemplateId: string;
  scheduledForDate: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  timeLabel: string;
  joinedAt: Date;
}

export interface EligibleSelfServiceOccurrences {
  occurrences: ScheduleOccurrence[];
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

function isPastBookingCutoff(args: {
  scheduledForDate: string;
  startTimeMinutes: number;
  bookingCutoffMinutes: number;
  timezone: string;
  now: Date;
}): boolean {
  const startsAt = getOccurrenceStartsAt(args);

  return args.now.getTime() >= startsAt.getTime() - args.bookingCutoffMinutes * 60_000;
}

function mapBookingItem(
  booking: ExistingBookingRecord,
  args: {
    timezone: string;
    now: Date;
  },
): MemberBookingSummary {
  const scheduledForDate = toDateOnlyString(booking.scheduledForDate);
  const cancellation = canCancelClassBooking({
    bookingType: booking.bookingType,
    bookingStatus: booking.status,
    scheduledForDate,
    startTimeMinutes: booking.classTemplate.startTimeMinutes,
    cancellationCutoffMinutes:
      booking.classTemplate.cancellationCutoffMinutes,
    timezone: args.timezone,
    now: args.now,
  });

  return {
    bookingId: booking.id,
    classTemplateId: booking.classTemplateId,
    scheduledForDate,
    displayTitle: booking.classTemplate.title ?? booking.classTemplate.program.name,
    programName: booking.classTemplate.program.name,
    roomName: booking.classTemplate.room.name,
    timeLabel: formatMinutesAsTime(booking.classTemplate.startTimeMinutes),
    bookingType: booking.bookingType,
    status: booking.status,
    canCancel: cancellation.canCancel,
    lateCancellation: cancellation.lateCancellation,
  };
}

function mapWaitlistItem(entry: WaitlistEntryRecord): MemberWaitlistSummary {
  return {
    waitlistEntryId: entry.id,
    classTemplateId: entry.classTemplateId,
    scheduledForDate: toDateOnlyString(entry.scheduledForDate),
    displayTitle: entry.classTemplate.title ?? entry.classTemplate.program.name,
    programName: entry.classTemplate.program.name,
    roomName: entry.classTemplate.room.name,
    timeLabel: formatMinutesAsTime(entry.classTemplate.startTimeMinutes),
    joinedAt: entry.joinedAt,
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
  const today = getWorkspaceDateString(now, args.timezone);

  await cleanupExpiredPendingBookings({
    workspaceId: args.workspaceId,
    db: db as never,
    now,
  });

  const templates = await db.classTemplate.findMany({
    where: {
      workspaceId: args.workspaceId,
      archivedAt: null,
      program: {
        archivedAt: null,
      },
      room: {
        archivedAt: null,
        isActive: true,
      },
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
          capacity: true,
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

  const [existingBookings, waitlistEntries, accessEntries] = await Promise.all([
    db.classBooking.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        scheduledForDate: {
          gte: new Date(`${today}T00:00:00.000Z`),
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
                capacity: true,
              },
            },
          },
        },
      },
    }) as Promise<ExistingBookingRecord[]>,
    db.waitlistEntry.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        status: "ACTIVE",
        scheduledForDate: {
          gte: new Date(`${today}T00:00:00.000Z`),
        },
      },
      include: {
        classTemplate: {
          include: {
            program: {
              select: {
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
    }),
    Promise.all(
      Array.from(new Set(templates.map((template) => template.programId))).map(
        async (programId) => ({
          programId,
          access: await resolveBookingAccessForProgram({
            workspaceId: args.workspaceId,
            memberId: args.memberId,
            programId,
            allowDropIn: true,
            db: db as never,
          }),
        }),
      ),
    ),
  ]);

  const templateIds = templates.map((template) => template.id);
  const seatHoldingBookings = templateIds.length
    ? ((await db.classBooking.findMany({
        where: {
          workspaceId: args.workspaceId,
          classTemplateId: {
            in: templateIds,
          },
          scheduledForDate: {
            gte: new Date(`${today}T00:00:00.000Z`),
          },
          status: {
            in: ["BOOKED", "PENDING_PAYMENT"],
          },
        },
        select: {
          classTemplateId: true,
          scheduledForDate: true,
        },
      })) as SeatHoldingBookingRecord[])
    : [];
  const accessByProgramId = new Map(
    accessEntries.map((entry) => [entry.programId, entry.access]),
  );
  const bookingByOccurrenceKey = new Map(
    existingBookings.map((booking) => [
      buildOccurrenceKey(
        booking.classTemplateId,
        toDateOnlyString(booking.scheduledForDate),
      ),
      booking,
    ]),
  );
  const waitlistByOccurrenceKey = new Map(
    waitlistEntries.map((entry) => [
      buildOccurrenceKey(
        entry.classTemplateId,
        toDateOnlyString(entry.scheduledForDate),
      ),
      entry,
    ]),
  );
  const activeCounts = new Map<string, number>();

  for (const booking of seatHoldingBookings) {
    const key = buildOccurrenceKey(
      booking.classTemplateId,
      toDateOnlyString(booking.scheduledForDate),
    );

    activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
  }

  const occurrences = buildUpcomingOccurrenceDateOptions({
    templates,
    timezone: args.timezone,
    now,
    occurrenceCount: 8,
  }).flatMap(({ template, dateOptions }) =>
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
      .flatMap<ScheduleOccurrence>((dateOption) => {
        const key = buildOccurrenceKey(
          dateOption.classTemplateId,
          dateOption.scheduledForDate,
        );
        const existingBooking = bookingByOccurrenceKey.get(key);
        const existingWaitlistEntry = waitlistByOccurrenceKey.get(key);
        const activeCount = activeCounts.get(key) ?? 0;
        const effectiveCapacity = template.capacityOverride ?? template.room.capacity;
        const isFull =
          effectiveCapacity !== null && activeCount >= effectiveCapacity;
        const access = accessByProgramId.get(template.programId);

        if (!existingBooking && !existingWaitlistEntry && access?.type === "none") {
          return [];
        }

        if (existingBooking?.status === "BOOKED") {
          return [
            {
              classTemplateId: dateOption.classTemplateId,
              scheduledForDate: dateOption.scheduledForDate,
              displayTitle: template.title ?? template.program.name,
              programName: template.program.name,
              roomName: template.room.name,
              dateLabel: dateOption.label,
              timeLabel: formatMinutesAsTime(template.startTimeMinutes),
              capacityLabel: getCapacityLabel({
                capacityOverride: template.capacityOverride,
                roomCapacity: template.room.capacity,
                activeCount,
              }),
              bookingState: "BOOKED" as const,
              accessLabel:
                existingBooking.bookingType === "PUNCH_CARD"
                  ? "Punch card"
                  : existingBooking.bookingType === "DROP_IN"
                    ? "Drop-in"
                    : existingBooking.bookingType === "TRIAL"
                      ? "Trial"
                      : "Membership",
              action: "none" as const,
              actionLabel: "Already booked",
              note: null,
            },
          ];
        }

        if (existingBooking?.status === "PENDING_PAYMENT") {
          return [
            {
              classTemplateId: dateOption.classTemplateId,
              scheduledForDate: dateOption.scheduledForDate,
              displayTitle: template.title ?? template.program.name,
              programName: template.program.name,
              roomName: template.room.name,
              dateLabel: dateOption.label,
              timeLabel: formatMinutesAsTime(template.startTimeMinutes),
              capacityLabel: getCapacityLabel({
                capacityOverride: template.capacityOverride,
                roomCapacity: template.room.capacity,
                activeCount,
              }),
              bookingState: "PAYMENT_PENDING" as const,
              accessLabel: "Drop-in",
              action: "none" as const,
              actionLabel: "Payment pending",
              note: "Complete checkout to keep this booking.",
            },
          ];
        }

        if (existingWaitlistEntry) {
          return [
            {
              classTemplateId: dateOption.classTemplateId,
              scheduledForDate: dateOption.scheduledForDate,
              displayTitle: template.title ?? template.program.name,
              programName: template.program.name,
              roomName: template.room.name,
              dateLabel: dateOption.label,
              timeLabel: formatMinutesAsTime(template.startTimeMinutes),
              capacityLabel: getCapacityLabel({
                capacityOverride: template.capacityOverride,
                roomCapacity: template.room.capacity,
                activeCount,
              }),
              bookingState: "WAITLISTED" as const,
              accessLabel: null,
              action: "none" as const,
              actionLabel: "Already waitlisted",
              note: "Open bookings to leave the waitlist.",
            },
          ];
        }

        if (isFull && access?.type !== "membership" && access?.type !== "punch_card") {
          return [
            {
              classTemplateId: dateOption.classTemplateId,
              scheduledForDate: dateOption.scheduledForDate,
              displayTitle: template.title ?? template.program.name,
              programName: template.program.name,
              roomName: template.room.name,
              dateLabel: dateOption.label,
              timeLabel: formatMinutesAsTime(template.startTimeMinutes),
              capacityLabel: getCapacityLabel({
                capacityOverride: template.capacityOverride,
                roomCapacity: template.room.capacity,
                activeCount,
              }),
              bookingState: "FULL" as const,
              accessLabel:
                access?.type === "drop_in" ? "Drop-in" : null,
              action: "none" as const,
              actionLabel: "Full",
              note:
                access?.type === "drop_in"
                  ? "Drop-ins cannot join the waitlist yet."
                  : access?.message ?? "No access product allows this class.",
            },
          ];
        }

        if (isFull) {
          return [
            {
              classTemplateId: dateOption.classTemplateId,
              scheduledForDate: dateOption.scheduledForDate,
              displayTitle: template.title ?? template.program.name,
              programName: template.program.name,
              roomName: template.room.name,
              dateLabel: dateOption.label,
              timeLabel: formatMinutesAsTime(template.startTimeMinutes),
              capacityLabel: getCapacityLabel({
                capacityOverride: template.capacityOverride,
                roomCapacity: template.room.capacity,
                activeCount,
              }),
              bookingState: "FULL" as const,
              accessLabel: access?.type === "punch_card" ? "Punch card" : "Membership",
              action: "join_waitlist" as const,
              actionLabel: "Join waitlist",
              note: "The waitlist uses membership or punch-card access only.",
            },
          ];
        }

        if (access?.type === "drop_in") {
          return [
            {
              classTemplateId: dateOption.classTemplateId,
              scheduledForDate: dateOption.scheduledForDate,
              displayTitle: template.title ?? template.program.name,
              programName: template.program.name,
              roomName: template.room.name,
              dateLabel: dateOption.label,
              timeLabel: formatMinutesAsTime(template.startTimeMinutes),
              capacityLabel: getCapacityLabel({
                capacityOverride: template.capacityOverride,
                roomCapacity: template.room.capacity,
                activeCount,
              }),
              bookingState: "AVAILABLE" as const,
              accessLabel: "Drop-in",
              action: "pay_and_book" as const,
              actionLabel: "Pay and book",
              note: null,
            },
          ];
        }

        return [
          {
            classTemplateId: dateOption.classTemplateId,
            scheduledForDate: dateOption.scheduledForDate,
            displayTitle: template.title ?? template.program.name,
            programName: template.program.name,
            roomName: template.room.name,
            dateLabel: dateOption.label,
            timeLabel: formatMinutesAsTime(template.startTimeMinutes),
            capacityLabel: getCapacityLabel({
              capacityOverride: template.capacityOverride,
              roomCapacity: template.room.capacity,
              activeCount,
            }),
            bookingState: "AVAILABLE" as const,
            accessLabel: access?.type === "punch_card" ? "Punch card" : "Membership",
            action: "book" as const,
            actionLabel: "Book class",
            note: null,
          },
        ];
      }),
  );

  return {
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
                capacity: true,
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
    }) as Promise<ExistingBookingRecord[]>,
    db.waitlistEntry.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        status: "ACTIVE",
      },
      include: {
        classTemplate: {
          include: {
            program: {
              select: {
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
    });
    const startsAt = getOccurrenceStartsAt({
      scheduledForDate: item.scheduledForDate,
      startTimeMinutes: booking.classTemplate.startTimeMinutes,
      timezone: args.timezone,
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

  return {
    upcoming,
    history,
    waitlist: waitlistEntries.map(mapWaitlistItem),
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
  const result = await createAccessBackedBooking({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    classTemplateId: args.classTemplateId,
    scheduledForDate: args.scheduledForDate,
    timezone: args.timezone,
    source: "MEMBER_PORTAL",
    allowDropIn: true,
    db: (args.db ?? selfServiceBookingDatabase) as never,
    now: args.now,
  });

  if (result.status === "error") {
    return {
      status: "error",
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
  memberId: string;
  bookingId: string;
  timezone: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<SelfBookingMutationResult> {
  const result = await cancelAccessBackedBooking({
    workspaceId: args.workspaceId,
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
  memberId: string;
  classTemplateId: string;
  scheduledForDate: string;
  timezone: string;
  db?: SelfServiceBookingDatabase;
  now?: Date;
}): Promise<SelfBookingMutationResult> {
  const result = await joinWaitlist({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    classTemplateId: args.classTemplateId,
    scheduledForDate: args.scheduledForDate,
    timezone: args.timezone,
    source: "MEMBER_PORTAL",
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
  memberId: string;
  waitlistEntryId: string;
  db?: SelfServiceBookingDatabase;
}): Promise<SelfBookingMutationResult> {
  const result = await leaveWaitlist({
    workspaceId: args.workspaceId,
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
