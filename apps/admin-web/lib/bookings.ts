import {
  addDays,
  evaluateClassSchedulingPolicy,
  readClassSchedulingPolicy,
  type SchedulingPolicyReader,
  classOccurrenceInclude,
  formatOccurrenceLabel,
  getOccurrenceStartsAt,
  getWorkspaceDateString,
  isUnambiguousClassTime,
  resolveClassOccurrence,
  type ClassOccurrenceTemplate,
  createAccessBackedBooking,
  prisma,
  type ClassBookingStatus,
  type ClassBookingType,
  type Weekday,
} from "@flowstate/db";

const bookingTypes: ClassBookingType[] = ["MEMBERSHIP", "TRIAL"];

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

type BookingTemplateRecord = ClassOccurrenceTemplate;

interface ExistingBookingRecord {
  id: string;
  status: ClassBookingStatus;
}

interface BookingDatabase extends SchedulingPolicyReader {
  $transaction<T>(callback: (tx: BookingDatabase) => Promise<T>): Promise<T>;
  member: {
    findMany(args: Record<string, unknown>): Promise<BookingMemberRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<unknown>;
  };
  memberPunchCard: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  dropInProduct: {
    findMany(args: Record<string, unknown>): Promise<unknown[]>;
  };
  familyLink: {
    findFirst(
      args: Record<string, unknown>,
    ): Promise<BookingGuardianLinkRecord | null>;
  };
  classTemplate: {
    findMany(args: Record<string, unknown>): Promise<BookingTemplateRecord[]>;
    findFirst(
      args: Record<string, unknown>,
    ): Promise<BookingTemplateRecord | null>;
  };
  classBooking: {
    findFirst(
      args: Record<string, unknown>,
    ): Promise<ExistingBookingRecord | null>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    count(args: Record<string, unknown>): Promise<number>;
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

function formatMemberContact(member: BookingMemberRecord): string {
  if (member.email && member.phone) {
    return `${member.email} / ${member.phone}`;
  }

  return member.email ?? member.phone ?? member.status;
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
      include: classOccurrenceInclude,
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

  const now = args.now ?? new Date();
  const policyRevision = await readClassSchedulingPolicy(
    db,
    args.workspaceId,
    now,
  );
  const today = getWorkspaceDateString(now, args.timezone);
  // This is an explicit six-week booking picker, not the recurrence's end date.
  const lastDate = addDays(today, 42);
  const templates: BookingTemplateOption[] = [];
  for (const template of templateRecords) {
    let option: BookingTemplateOption | null = null;
    for (let date = today; date <= lastDate; date = addDays(date, 1)) {
      const occurrence = resolveClassOccurrence({
        template,
        scheduledForDate: date,
      });
      if (
        !occurrence ||
        occurrence.status !== "ACTIVE" ||
        occurrence.program.archivedAt ||
        occurrence.room.archivedAt ||
        occurrence.room.isActive === false
      )
        continue;
      if (
        getOccurrenceStartsAt({
          scheduledForDate: date,
          startTimeMinutes: occurrence.startTimeMinutes,
          timezone: occurrence.timezone ?? args.timezone,
        }) <= now ||
        !isUnambiguousClassTime(
          date,
          occurrence.startTimeMinutes,
          occurrence.timezone ?? args.timezone,
        ) ||
        !isUnambiguousClassTime(
          date,
          occurrence.endTimeMinutes,
          occurrence.timezone ?? args.timezone,
        )
      )
        continue;
      if (
        !evaluateClassSchedulingPolicy({
          revision: policyRevision,
          date,
          timezone: occurrence.timezone ?? args.timezone,
          startTimeMinutes: occurrence.startTimeMinutes,
          endTimeMinutes: occurrence.endTimeMinutes,
          bookingCutoffMinutes: occurrence.bookingCutoffMinutes,
          now,
        }).allowed
      )
        continue;
      option ??= {
        id: template.id,
        displayTitle: occurrence.displayTitle,
        weekday: occurrence.weekday,
        programName: occurrence.program.name,
        roomName: occurrence.room.name,
        coachDisplayName: occurrence.coachDisplayName,
        dateOptions: [],
      };
      option.dateOptions.push({
        classTemplateId: template.id,
        scheduledForDate: date,
        label: `${formatOccurrenceLabel({ weekday: occurrence.weekday, dateString: date, startTimeMinutes: occurrence.startTimeMinutes })} · ${occurrence.displayTitle} · ${occurrence.room.name} · ${occurrence.coachDisplayName}`,
      });
    }
    if (option) templates.push(option);
  }

  return {
    members: members.map((member) => ({
      id: member.id,
      label: `${member.fullName} (${formatMemberContact(member)})`,
      status: member.status,
    })),
    guardians: [],
    templates,
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
  const bookingType = args.input.bookingType.trim() || "MEMBERSHIP";

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

  {
    const result = await createAccessBackedBooking({
      workspaceId: args.workspaceId,
      memberId,
      guardianId,
      classTemplateId,
      scheduledForDate,
      timezone: args.timezone,
      source: "ADMIN",
      allowDropIn: false,
      trial: bookingType === "TRIAL",
      db: db as never,
      now,
    });

    if (result.status === "error") {
      return {
        status: "error",
        message: result.message,
      };
    }

    if (result.status === "payment_required") {
      return {
        status: "error",
        message:
          "This class is only accessible through a paid drop-in flow. Ask the member to book it from the portal.",
      };
    }

    return {
      status: result.status,
      bookingId: result.bookingId,
    };
  }
}
