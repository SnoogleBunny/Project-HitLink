import { prisma, type Weekday } from "@hitlink/db";

const selectableCoachRoles = ["OWNER", "COACH"] as const;
const trialDateOptionCount = 4;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const weekdayLabels: Record<Weekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

const weekdayByUtcDay: Record<number, Weekday> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

export interface TrialBookingTemplateForDates {
  id: string;
  displayTitle: string;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  programName: string;
  roomName: string;
  coachDisplayName: string;
}

export interface TrialBookingDateOption {
  classTemplateId: string;
  scheduledForDate: string;
  startsAt: Date;
  label: string;
}

export interface TrialBookingTemplateOption
  extends TrialBookingTemplateForDates {
  dateOptions: TrialBookingDateOption[];
}

export interface TrialBookingFormInput {
  classTemplateId: string;
  scheduledForDate: string;
  fullName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  guardianFullName?: string;
  guardianEmail?: string;
  guardianPhone?: string;
  relationshipLabel?: string;
}

interface TrialWorkspaceRecord {
  id: string;
  name: string;
  status: "ACTIVE" | "SETUP_INCOMPLETE" | "DISABLED";
  location: {
    id: string;
    timezone: string;
  } | null;
}

interface TrialClassTemplateRecord {
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
  };
  coachWorkspaceUser: {
    user: {
      fullName: string | null;
      email: string;
    };
  };
}

interface TrialBookingTransactionDatabase {
  member: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  guardian: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  familyLink: {
    count(args: Record<string, unknown>): Promise<number>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  trialBooking: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

interface TrialBookingDatabase extends TrialBookingTransactionDatabase {
  workspace: {
    findFirst(args: Record<string, unknown>): Promise<TrialWorkspaceRecord | null>;
  };
  classTemplate: {
    findMany(args: Record<string, unknown>): Promise<TrialClassTemplateRecord[]>;
  };
  $transaction<T>(
    callback: (tx: TrialBookingTransactionDatabase) => Promise<T>,
  ): Promise<T>;
}

export interface TrialBookingOptionsResult {
  workspaceId: string;
  workspaceName: string;
  timezone: string;
  templates: TrialBookingTemplateOption[];
}

type TrialBookingMutationResult =
  | {
      status: "booked";
      memberId: string;
      trialBookingId: string;
      classTitle: string;
      scheduledForDate: string;
      startsAt: Date;
    }
  | {
      status: "error";
      message: string;
    };

const trialBookingDatabase = prisma as unknown as TrialBookingDatabase;

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeEmail(value: string | undefined): string | null | "invalid" {
  const email = cleanNullable(value)?.toLowerCase() ?? null;

  if (!email) {
    return null;
  }

  if (!emailPattern.test(email)) {
    return "invalid";
  }

  return email;
}

function toDateOnlyString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDateOnly(
  value: string | undefined,
  now: Date,
): Date | null | "invalid" {
  const dateString = cleanNullable(value);

  if (!dateString) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return "invalid";
  }

  const parsed = new Date(`${dateString}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || toDateOnlyString(parsed) !== dateString) {
    return "invalid";
  }

  if (dateString > toDateOnlyString(now)) {
    return "invalid";
  }

  return parsed;
}

function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHourValue = hours % 12 || 12;

  return `${twelveHourValue}:${String(remainder).padStart(2, "0")} ${suffix}`;
}

function getZonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function getZonedDateString(value: Date, timezone: string): string {
  const parts = getZonedParts(value, timezone);

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function getTimezoneOffsetMs(timezone: string, value: Date): number {
  const parts = getZonedParts(value, timezone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return zonedAsUtc - value.getTime();
}

function getZonedDateTimeAsUtc(args: {
  dateString: string;
  minutes: number;
  timezone: string;
}): Date {
  const [year = 0, month = 1, day = 1] = args.dateString
    .split("-")
    .map(Number);
  const hour = Math.floor(args.minutes / 60);
  const minute = args.minutes % 60;
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const firstOffset = getTimezoneOffsetMs(args.timezone, utcGuess);
  const firstResult = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimezoneOffsetMs(args.timezone, firstResult);

  if (secondOffset === firstOffset) {
    return firstResult;
  }

  return new Date(utcGuess.getTime() - secondOffset);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return toDateOnlyString(date);
}

function getWeekdayForDateString(dateString: string): Weekday {
  const date = new Date(`${dateString}T00:00:00.000Z`);

  return weekdayByUtcDay[date.getUTCDay()] ?? "SUNDAY";
}

function formatDateOption(dateString: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${dateString}T00:00:00.000Z`));
}

function mapClassTemplate(
  template: TrialClassTemplateRecord,
): TrialBookingTemplateForDates {
  const coachName = template.coachWorkspaceUser.user.fullName?.trim();

  return {
    id: template.id,
    displayTitle: template.title ?? template.program.name,
    weekday: template.weekday,
    startTimeMinutes: template.startTimeMinutes,
    endTimeMinutes: template.endTimeMinutes,
    programName: template.program.name,
    roomName: template.room.name,
    coachDisplayName: coachName || template.coachWorkspaceUser.user.email,
  };
}

export function buildTrialBookingDateOptions(args: {
  templates: TrialBookingTemplateForDates[];
  timezone: string;
  now: Date;
  occurrenceCount?: number;
}): TrialBookingTemplateOption[] {
  const occurrenceCount = args.occurrenceCount ?? trialDateOptionCount;
  const today = getZonedDateString(args.now, args.timezone);

  return args.templates
    .map((template) => {
      const dateOptions: TrialBookingDateOption[] = [];

      for (let dayOffset = 0; dateOptions.length < occurrenceCount && dayOffset < 42; dayOffset += 1) {
        const dateString = addDays(today, dayOffset);

        if (getWeekdayForDateString(dateString) !== template.weekday) {
          continue;
        }

        const startsAt = getZonedDateTimeAsUtc({
          dateString,
          minutes: template.startTimeMinutes,
          timezone: args.timezone,
        });

        if (startsAt.getTime() <= args.now.getTime()) {
          continue;
        }

        dateOptions.push({
          classTemplateId: template.id,
          scheduledForDate: dateString,
          startsAt,
          label: `${weekdayLabels[template.weekday]}, ${formatDateOption(dateString)} at ${formatMinutesAsTime(template.startTimeMinutes)}`,
        });
      }

      return {
        ...template,
        dateOptions,
      };
    })
    .filter((template) => template.dateOptions.length > 0);
}

export function findTrialBookingDateOption(args: {
  options: TrialBookingTemplateOption[];
  classTemplateId: string;
  scheduledForDate: string;
}):
  | {
      template: TrialBookingTemplateOption;
      dateOption: TrialBookingDateOption;
    }
  | null {
  for (const template of args.options) {
    if (template.id !== args.classTemplateId) {
      continue;
    }

    const dateOption = template.dateOptions.find(
      (option) => option.scheduledForDate === args.scheduledForDate,
    );

    if (dateOption) {
      return {
        template,
        dateOption,
      };
    }
  }

  return null;
}

async function getTrialWorkspaceData(args: {
  workspaceId: string;
  db: TrialBookingDatabase;
}): Promise<
  | {
      workspace: TrialWorkspaceRecord & {
        location: NonNullable<TrialWorkspaceRecord["location"]>;
      };
      templates: TrialBookingTemplateForDates[];
    }
  | null
> {
  const workspace = await args.db.workspace.findFirst({
    where: {
      id: args.workspaceId,
      status: "ACTIVE",
    },
    include: {
      location: true,
    },
  });

  if (!workspace?.location) {
    return null;
  }

  const templateRecords = await args.db.classTemplate.findMany({
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
      coachWorkspaceUser: {
        isActive: true,
        role: {
          in: selectableCoachRoles,
        },
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
  });

  return {
    workspace: {
      ...workspace,
      location: workspace.location,
    },
    templates: templateRecords.map(mapClassTemplate),
  };
}

export async function listTrialBookingOptions(args: {
  workspaceId: string;
  db?: TrialBookingDatabase;
  now?: Date;
}): Promise<TrialBookingOptionsResult | null> {
  const db = args.db ?? trialBookingDatabase;
  const data = await getTrialWorkspaceData({
    workspaceId: args.workspaceId,
    db,
  });

  if (!data) {
    return null;
  }

  return {
    workspaceId: data.workspace.id,
    workspaceName: data.workspace.name,
    timezone: data.workspace.location.timezone,
    templates: buildTrialBookingDateOptions({
      templates: data.templates,
      timezone: data.workspace.location.timezone,
      now: args.now ?? new Date(),
    }),
  };
}

function sanitizeTrialBookingInput(input: TrialBookingFormInput, now: Date) {
  return {
    classTemplateId: input.classTemplateId.trim(),
    scheduledForDate: input.scheduledForDate.trim(),
    fullName: input.fullName.trim(),
    email: normalizeEmail(input.email),
    phone: cleanNullable(input.phone),
    dateOfBirth: parseDateOnly(input.dateOfBirth, now),
    guardianFullName: cleanNullable(input.guardianFullName),
    guardianEmail: normalizeEmail(input.guardianEmail),
    guardianPhone: cleanNullable(input.guardianPhone),
    relationshipLabel: cleanNullable(input.relationshipLabel),
  };
}

function validateTrialBookingInput(
  input: ReturnType<typeof sanitizeTrialBookingInput>,
):
  | {
      status: "ok";
      value: {
        classTemplateId: string;
        scheduledForDate: string;
        fullName: string;
        email: string | null;
        phone: string | null;
        dateOfBirth: Date | null;
        guardianFullName: string | null;
        guardianEmail: string | null;
        guardianPhone: string | null;
        relationshipLabel: string | null;
      };
    }
  | {
      status: "error";
      message: string;
    } {
  if (!input.classTemplateId || !input.scheduledForDate) {
    return {
      status: "error",
      message: "Choose a trial class date.",
    };
  }

  if (!input.fullName) {
    return {
      status: "error",
      message: "Participant full name is required.",
    };
  }

  if (input.email === "invalid") {
    return {
      status: "error",
      message: "Enter a valid participant email address.",
    };
  }

  if (!input.email && !input.phone) {
    return {
      status: "error",
      message: "Enter an email or phone number.",
    };
  }

  if (input.dateOfBirth === "invalid") {
    return {
      status: "error",
      message: "Enter a valid date of birth that is not in the future.",
    };
  }

  if (input.guardianEmail === "invalid") {
    return {
      status: "error",
      message: "Enter a valid guardian email address.",
    };
  }

  const hasGuardianContact = Boolean(
    input.guardianFullName || input.guardianEmail || input.guardianPhone,
  );

  if (hasGuardianContact && !input.guardianFullName) {
    return {
      status: "error",
      message: "Guardian full name is required when guardian details are provided.",
    };
  }

  return {
    status: "ok",
    value: {
      classTemplateId: input.classTemplateId,
      scheduledForDate: input.scheduledForDate,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      guardianFullName: input.guardianFullName,
      guardianEmail: input.guardianEmail,
      guardianPhone: input.guardianPhone,
      relationshipLabel: input.relationshipLabel,
    },
  };
}

async function findOrCreateTrialMember(args: {
  workspaceId: string;
  input: ReturnType<typeof validateTrialBookingInput> & { status: "ok" };
  tx: TrialBookingTransactionDatabase;
}): Promise<{ id: string }> {
  const input = args.input.value;
  const existingMember = input.email
    ? await args.tx.member.findFirst({
        where: {
          workspaceId: args.workspaceId,
          email: input.email,
        },
        select: {
          id: true,
        },
      })
    : await args.tx.member.findFirst({
        where: {
          workspaceId: args.workspaceId,
          phone: input.phone,
        },
        select: {
          id: true,
        },
      });

  if (existingMember) {
    return existingMember;
  }

  return args.tx.member.create({
    data: {
      workspaceId: args.workspaceId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      status: "TRIAL",
      formStatus: "NOT_REQUESTED",
      tags: [],
      notes: null,
    },
    select: {
      id: true,
    },
  });
}

async function findOrCreateGuardian(args: {
  workspaceId: string;
  memberId: string;
  input: ReturnType<typeof validateTrialBookingInput> & { status: "ok" };
  tx: TrialBookingTransactionDatabase;
}): Promise<{ id: string } | null | "too-many-guardians"> {
  const input = args.input.value;

  if (!input.guardianFullName) {
    return null;
  }

  const existingGuardian = input.guardianEmail
    ? await args.tx.guardian.findFirst({
        where: {
          workspaceId: args.workspaceId,
          email: input.guardianEmail,
        },
        select: {
          id: true,
        },
      })
    : input.guardianPhone
      ? await args.tx.guardian.findFirst({
          where: {
            workspaceId: args.workspaceId,
            phone: input.guardianPhone,
          },
          select: {
            id: true,
          },
        })
      : null;

  if (existingGuardian) {
    const existingLink = await args.tx.familyLink.findFirst({
      where: {
        workspaceId: args.workspaceId,
        guardianId: existingGuardian.id,
        childMemberId: args.memberId,
      },
      select: {
        id: true,
      },
    });

    if (existingLink) {
      return existingGuardian;
    }
  }

  const guardianCount = await args.tx.familyLink.count({
    where: {
      workspaceId: args.workspaceId,
      childMemberId: args.memberId,
    },
  });

  if (guardianCount >= 2) {
    return "too-many-guardians";
  }

  const guardian =
    existingGuardian ??
    (await args.tx.guardian.create({
      data: {
        workspaceId: args.workspaceId,
        fullName: input.guardianFullName,
        email: input.guardianEmail,
        phone: input.guardianPhone,
        notes: null,
      },
      select: {
        id: true,
      },
    }));

  await args.tx.familyLink.create({
    data: {
      workspaceId: args.workspaceId,
      guardianId: guardian.id,
      childMemberId: args.memberId,
      relationshipLabel: input.relationshipLabel,
      isPrimary: guardianCount === 0,
    },
    select: {
      id: true,
    },
  });

  return guardian;
}

export async function createTrialBooking(args: {
  workspaceId: string;
  input: TrialBookingFormInput;
  db?: TrialBookingDatabase;
  now?: Date;
}): Promise<TrialBookingMutationResult> {
  const db = args.db ?? trialBookingDatabase;
  const now = args.now ?? new Date();
  const input = validateTrialBookingInput(
    sanitizeTrialBookingInput(args.input, now),
  );

  if (input.status === "error") {
    return input;
  }

  const data = await getTrialWorkspaceData({
    workspaceId: args.workspaceId,
    db,
  });

  if (!data) {
    return {
      status: "error",
      message: "Trial booking is not available for this workspace.",
    };
  }

  const bookingOptions = buildTrialBookingDateOptions({
    templates: data.templates,
    timezone: data.workspace.location.timezone,
    now,
  });
  const selectedOption = findTrialBookingDateOption({
    options: bookingOptions,
    classTemplateId: input.value.classTemplateId,
    scheduledForDate: input.value.scheduledForDate,
  });

  if (!selectedOption) {
    return {
      status: "error",
      message: "Choose an available upcoming trial date.",
    };
  }

  return db.$transaction(async (tx) => {
    const member = await findOrCreateTrialMember({
      workspaceId: args.workspaceId,
      input,
      tx,
    });
    const guardian = await findOrCreateGuardian({
      workspaceId: args.workspaceId,
      memberId: member.id,
      input,
      tx,
    });

    if (guardian === "too-many-guardians") {
      return {
        status: "error",
        message: "This member already has two guardians linked.",
      };
    }

    const booking = await tx.trialBooking.create({
      data: {
        workspaceId: args.workspaceId,
        memberId: member.id,
        guardianId: guardian?.id ?? null,
        classTemplateId: selectedOption.template.id,
        scheduledForDate: new Date(
          `${selectedOption.dateOption.scheduledForDate}T00:00:00.000Z`,
        ),
      },
      select: {
        id: true,
      },
    });

    return {
      status: "booked",
      memberId: member.id,
      trialBookingId: booking.id,
      classTitle: selectedOption.template.displayTitle,
      scheduledForDate: selectedOption.dateOption.scheduledForDate,
      startsAt: selectedOption.dateOption.startsAt,
    };
  });
}
