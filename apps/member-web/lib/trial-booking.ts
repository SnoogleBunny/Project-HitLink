import {
  buildUpcomingOccurrenceDateOptions,
  dateOnlyStringToUtcDate,
  prisma,
  toDateOnlyString,
  type ClassBookingStatus,
  type Weekday,
} from "@hitlink/db";

const selectableCoachRoles = ["OWNER", "COACH"] as const;
const trialDateOptionCount = 4;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  classBooking: {
    findFirst(
      args: Record<string, unknown>,
    ): Promise<{ id: string; status: ClassBookingStatus } | null>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
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
      classBookingId: string;
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
  return buildUpcomingOccurrenceDateOptions({
    templates: args.templates,
    timezone: args.timezone,
    now: args.now,
    occurrenceCount: args.occurrenceCount ?? trialDateOptionCount,
  }).map(({ template, dateOptions }) => ({
    ...template,
    dateOptions,
  }));
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

    const scheduledForDate = dateOnlyStringToUtcDate(
      selectedOption.dateOption.scheduledForDate,
    );
    const existingBooking = await tx.classBooking.findFirst({
      where: {
        workspaceId: args.workspaceId,
        memberId: member.id,
        classTemplateId: selectedOption.template.id,
        scheduledForDate,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingBooking && existingBooking.status !== "CANCELLED") {
      return {
        status: "error",
        message: "This member already has a booking for that class date.",
      };
    }

    const booking = existingBooking
      ? await tx.classBooking.update({
          where: {
            id: existingBooking.id,
          },
          data: {
            status: "BOOKED",
          },
          select: {
            id: true,
          },
        })
      : await tx.classBooking.create({
          data: {
            workspaceId: args.workspaceId,
            memberId: member.id,
            guardianId: guardian?.id ?? null,
            classTemplateId: selectedOption.template.id,
            scheduledForDate,
            bookingType: "TRIAL",
            status: "BOOKED",
            source: "PUBLIC_TRIAL",
          },
          select: {
            id: true,
          },
        });

    return {
      status: "booked",
      memberId: member.id,
      classBookingId: booking.id,
      classTitle: selectedOption.template.displayTitle,
      scheduledForDate: selectedOption.dateOption.scheduledForDate,
      startsAt: selectedOption.dateOption.startsAt,
    };
  });
}
