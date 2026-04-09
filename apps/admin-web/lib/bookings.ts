import {
  buildUpcomingOccurrenceDateOptions,
  dateOnlyStringToUtcDate,
  prisma,
  validateOccurrenceDate,
  type ClassBookingStatus,
  type ClassBookingType,
  type Weekday,
} from "@hitlink/db";

const bookingTypes: ClassBookingType[] = ["STANDARD", "TRIAL"];

interface BookingMemberRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
}

interface BookingGuardianLinkRecord {
  id: string;
  guardian: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
  };
}

interface BookingTemplateRecord {
  id: string;
  title: string | null;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  program: {
    name: string;
  };
  room: {
    name: string;
    capacity: number | null;
  };
  coachWorkspaceUser: {
    user: {
      fullName: string | null;
      email: string;
    };
  };
}

interface ExistingBookingRecord {
  id: string;
  status: ClassBookingStatus;
}

interface BookingDatabase {
  member: {
    findMany(args: Record<string, unknown>): Promise<BookingMemberRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  familyLink: {
    findFirst(args: Record<string, unknown>): Promise<BookingGuardianLinkRecord | null>;
  };
  classTemplate: {
    findMany(args: Record<string, unknown>): Promise<BookingTemplateRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<BookingTemplateRecord | null>;
  };
  classBooking: {
    findFirst(args: Record<string, unknown>): Promise<ExistingBookingRecord | null>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

export interface BookingFormInput {
  memberId: string;
  guardianId?: string;
  classTemplateId: string;
  scheduledForDate: string;
  bookingType: string;
}

export interface BookingMemberOption {
  id: string;
  label: string;
  status: string;
}

export interface BookingGuardianOption {
  id: string;
  memberId: string;
  label: string;
}

export interface BookingDateOption {
  classTemplateId: string;
  scheduledForDate: string;
  label: string;
}

export interface BookingTemplateOption {
  id: string;
  displayTitle: string;
  weekday: Weekday;
  programName: string;
  roomName: string;
  coachDisplayName: string;
  dateOptions: BookingDateOption[];
}

export interface BookingFormOptions {
  members: BookingMemberOption[];
  guardians: BookingGuardianOption[];
  templates: BookingTemplateOption[];
}

type BookingMutationResult =
  | {
      status: "created" | "restored";
      bookingId: string;
    }
  | {
      status: "error";
      message: string;
    };

const bookingDatabase = prisma as unknown as BookingDatabase;

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function buildDisplayName(fullName: string | null, email: string): string {
  const trimmedName = fullName?.trim();

  return trimmedName ? trimmedName : email;
}

function formatMemberContact(member: BookingMemberRecord): string {
  if (member.email && member.phone) {
    return `${member.email} / ${member.phone}`;
  }

  return member.email ?? member.phone ?? member.status;
}

function mapTemplateForOptions(
  template: BookingTemplateRecord,
): Omit<BookingTemplateOption, "dateOptions"> & {
  startTimeMinutes: number;
} {
  const coachDisplayName = buildDisplayName(
    template.coachWorkspaceUser.user.fullName,
    template.coachWorkspaceUser.user.email,
  );

  return {
    id: template.id,
    displayTitle: template.title ?? template.program.name,
    weekday: template.weekday,
    startTimeMinutes: template.startTimeMinutes,
    programName: template.program.name,
    roomName: template.room.name,
    coachDisplayName,
  };
}

function isBookingType(value: string): value is ClassBookingType {
  return bookingTypes.includes(value as ClassBookingType);
}

export async function listBookingFormOptions(args: {
  workspaceId: string;
  timezone: string;
  db?: BookingDatabase;
  now?: Date;
}): Promise<BookingFormOptions> {
  const db = args.db ?? bookingDatabase;
  const [members, templateRecords] = await Promise.all([
    db.member.findMany({
      where: {
        workspaceId: args.workspaceId,
      },
      orderBy: {
        fullName: "asc",
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
      },
      take: 200,
    }),
    db.classTemplate.findMany({
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
          weekday: "asc",
        },
        {
          startTimeMinutes: "asc",
        },
      ],
    }),
  ]);

  const templatesForDates = templateRecords.map(mapTemplateForOptions);
  const templatesWithDates = buildUpcomingOccurrenceDateOptions({
    templates: templatesForDates,
    timezone: args.timezone,
    now: args.now ?? new Date(),
    occurrenceCount: 6,
  });

  return {
    members: members.map((member) => ({
      id: member.id,
      label: `${member.fullName} (${formatMemberContact(member)})`,
      status: member.status,
    })),
    guardians: [],
    templates: templatesWithDates.map(({ template, dateOptions }) => ({
      id: template.id,
      displayTitle: template.displayTitle,
      weekday: template.weekday,
      programName: template.programName,
      roomName: template.roomName,
      coachDisplayName: template.coachDisplayName,
      dateOptions: dateOptions.map((dateOption) => ({
        classTemplateId: dateOption.classTemplateId,
        scheduledForDate: dateOption.scheduledForDate,
        label: dateOption.label,
      })),
    })),
  };
}

export async function createClassBooking(args: {
  workspaceId: string;
  timezone: string;
  input: BookingFormInput;
  db?: BookingDatabase;
  now?: Date;
}): Promise<BookingMutationResult> {
  const db = args.db ?? bookingDatabase;
  const now = args.now ?? new Date();
  const memberId = args.input.memberId.trim();
  const guardianId = cleanNullable(args.input.guardianId);
  const classTemplateId = args.input.classTemplateId.trim();
  const scheduledForDate = args.input.scheduledForDate.trim();
  const bookingType = args.input.bookingType.trim() || "STANDARD";

  if (!memberId) {
    return {
      status: "error",
      message: "Choose a member.",
    };
  }

  if (!classTemplateId || !scheduledForDate) {
    return {
      status: "error",
      message: "Choose a class date.",
    };
  }

  if (!isBookingType(bookingType)) {
    return {
      status: "error",
      message: "Choose a valid booking type.",
    };
  }

  const [member, template] = await Promise.all([
    db.member.findFirst({
      where: {
        id: memberId,
        workspaceId: args.workspaceId,
      },
      select: {
        id: true,
      },
    }),
    db.classTemplate.findFirst({
      where: {
        id: classTemplateId,
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
      message: "Choose an active class template in this workspace.",
    };
  }

  if (guardianId) {
    const guardianLink = await db.familyLink.findFirst({
      where: {
        workspaceId: args.workspaceId,
        guardianId,
        childMemberId: memberId,
      },
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
    });

    if (!guardianLink) {
      return {
        status: "error",
        message: "Guardian is not linked to this member.",
      };
    }
  }

  const occurrence = validateOccurrenceDate({
    scheduledForDate,
    templateWeekday: template.weekday,
    timezone: args.timezone,
    now,
    direction: "future",
  });

  if (occurrence.status === "error") {
    return {
      status: "error",
      message: "Choose a valid upcoming date for this class.",
    };
  }

  const existingBooking = await db.classBooking.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId,
      classTemplateId,
      scheduledForDate: occurrence.date,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existingBooking) {
    if (existingBooking.status === "CANCELLED") {
      const booking = await db.classBooking.update({
        where: {
          id: existingBooking.id,
        },
        data: {
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
      message: "This member already has an active booking for that class date.",
    };
  }

  const booking = await db.classBooking.create({
    data: {
      workspaceId: args.workspaceId,
      memberId,
      guardianId,
      classTemplateId,
      scheduledForDate: dateOnlyStringToUtcDate(occurrence.dateString),
      bookingType,
      status: "BOOKED",
      source: "ADMIN",
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
