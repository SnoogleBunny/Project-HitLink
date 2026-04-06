import { prisma, type UserRole, type Weekday } from "@hitlink/db";

const selectableCoachRoles: UserRole[] = ["OWNER", "COACH"];

export const WEEKDAY_ORDER: Weekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const weekdayLabels: Record<Weekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

interface ProgramOptionRecord {
  id: string;
  name: string;
}

interface RoomOptionRecord {
  id: string;
  name: string;
  capacity: number | null;
}

interface CoachOptionRecord {
  id: string;
  role: UserRole;
  isActive: boolean;
  user: {
    fullName: string | null;
    email: string;
  };
}

interface ClassTemplateRecord {
  id: string;
  title: string | null;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  capacityOverride: number | null;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  program: {
    id: string;
    name: string;
  };
  room: {
    id: string;
    name: string;
    capacity: number | null;
  };
  coachWorkspaceUser: CoachOptionRecord;
}

interface ClassTemplateDatabase {
  program: {
    findMany(args: Record<string, unknown>): Promise<ProgramOptionRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  room: {
    findMany(args: Record<string, unknown>): Promise<RoomOptionRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  workspaceUser: {
    findMany(args: Record<string, unknown>): Promise<CoachOptionRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  classTemplate: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    findMany(args: Record<string, unknown>): Promise<ClassTemplateRecord[]>;
    findFirst(
      args: Record<string, unknown>,
    ): Promise<ClassTemplateRecord | null>;
  };
}

const classTemplateDatabase = prisma as unknown as ClassTemplateDatabase;

export interface ClassTemplateFormInput {
  programId: string;
  roomId: string;
  coachWorkspaceUserId: string;
  title?: string;
  weekday: string;
  startTime: string;
  endTime: string;
  capacityOverride?: string;
  bookingCutoffMinutes: string;
  cancellationCutoffMinutes: string;
}

export interface ClassTemplateFormOptions {
  programs: ProgramOptionRecord[];
  rooms: RoomOptionRecord[];
  coaches: Array<{
    id: string;
    displayName: string;
    email: string;
    role: "OWNER" | "COACH";
    label: string;
  }>;
  missingPrerequisites: Array<"programs" | "rooms" | "coaches">;
  hasRequiredOptions: boolean;
}

export interface WeeklyScheduleTemplate {
  id: string;
  title: string | null;
  displayTitle: string;
  weekday: Weekday;
  weekdayLabel: string;
  startTimeMinutes: number;
  endTimeMinutes: number;
  timeLabel: string;
  capacityOverride: number | null;
  effectiveCapacity: number | null;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  archivedAt: Date | null;
  programName: string;
  roomName: string;
  coachDisplayName: string;
  coachEmail: string;
  coachRole: UserRole;
  coachIsActive: boolean;
}

export interface WeeklyScheduleDay {
  weekday: Weekday;
  label: string;
  templates: WeeklyScheduleTemplate[];
}

export interface WeeklyScheduleData {
  days: WeeklyScheduleDay[];
  archivedTemplates: WeeklyScheduleTemplate[];
}

export interface EditableClassTemplate extends WeeklyScheduleTemplate {
  programId: string;
  roomId: string;
  coachWorkspaceUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

type ClassTemplateMutationResult =
  | {
      status: "created" | "updated" | "archived";
      templateId: string;
    }
  | {
      status: "error";
      message: string;
    };

interface ParsedClassTemplateInput {
  programId: string;
  roomId: string;
  coachWorkspaceUserId: string;
  title: string | null;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  capacityOverride: number | null;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
}

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function buildDisplayName(fullName: string | null, email: string): string {
  const trimmedName = fullName?.trim();

  return trimmedName ? trimmedName : email;
}

function getRoleLabel(role: "OWNER" | "COACH"): string {
  return role === "OWNER" ? "Owner" : "Coach";
}

function parsePositiveInteger(
  value: string | undefined,
): number | null | "invalid" {
  const sanitizedValue = cleanNullable(value);

  if (!sanitizedValue) {
    return null;
  }

  const parsedValue = Number(sanitizedValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return "invalid";
  }

  return parsedValue;
}

function parseNonNegativeInteger(
  value: string | undefined,
): number | "invalid" {
  const sanitizedValue = cleanNullable(value);

  if (!sanitizedValue) {
    return "invalid";
  }

  const parsedValue = Number(sanitizedValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return "invalid";
  }

  return parsedValue;
}

function isWeekday(value: string): value is Weekday {
  return WEEKDAY_ORDER.includes(value as Weekday);
}

export function parseTimeToMinutes(value: string): number | null {
  const sanitizedValue = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(sanitizedValue);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutesAsTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new Error("Minutes must be a whole number between 0 and 1439.");
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHourValue = hours % 12 || 12;

  return `${twelveHourValue}:${String(remainder).padStart(2, "0")} ${suffix}`;
}

function mapTemplateRecord(
  record: ClassTemplateRecord,
): WeeklyScheduleTemplate {
  const coachDisplayName = buildDisplayName(
    record.coachWorkspaceUser.user.fullName,
    record.coachWorkspaceUser.user.email,
  );

  return {
    id: record.id,
    title: record.title,
    displayTitle: record.title ?? record.program.name,
    weekday: record.weekday,
    weekdayLabel: weekdayLabels[record.weekday],
    startTimeMinutes: record.startTimeMinutes,
    endTimeMinutes: record.endTimeMinutes,
    timeLabel: `${formatMinutesAsTime(record.startTimeMinutes)} - ${formatMinutesAsTime(record.endTimeMinutes)}`,
    capacityOverride: record.capacityOverride,
    effectiveCapacity: record.capacityOverride ?? record.room.capacity,
    bookingCutoffMinutes: record.bookingCutoffMinutes,
    cancellationCutoffMinutes: record.cancellationCutoffMinutes,
    archivedAt: record.archivedAt,
    programName: record.program.name,
    roomName: record.room.name,
    coachDisplayName,
    coachEmail: record.coachWorkspaceUser.user.email,
    coachRole: record.coachWorkspaceUser.role,
    coachIsActive: record.coachWorkspaceUser.isActive,
  };
}

async function validateClassTemplateInput(args: {
  workspaceId: string;
  locationId: string;
  input: ClassTemplateFormInput;
  db: ClassTemplateDatabase;
}): Promise<
  | {
      status: "error";
      message: string;
    }
  | {
      status: "ok";
      value: ParsedClassTemplateInput;
    }
> {
  const programId = String(args.input.programId ?? "").trim();
  const roomId = String(args.input.roomId ?? "").trim();
  const coachWorkspaceUserId = String(
    args.input.coachWorkspaceUserId ?? "",
  ).trim();
  const title = cleanNullable(args.input.title);
  const weekday = String(args.input.weekday ?? "").trim();
  const startTimeMinutes = parseTimeToMinutes(
    String(args.input.startTime ?? ""),
  );
  const endTimeMinutes = parseTimeToMinutes(String(args.input.endTime ?? ""));
  const capacityOverride = parsePositiveInteger(args.input.capacityOverride);
  const bookingCutoffMinutes = parseNonNegativeInteger(
    args.input.bookingCutoffMinutes,
  );
  const cancellationCutoffMinutes = parseNonNegativeInteger(
    args.input.cancellationCutoffMinutes,
  );

  if (!programId) {
    return {
      status: "error",
      message: "Program selection is required.",
    };
  }

  if (!roomId) {
    return {
      status: "error",
      message: "Room selection is required.",
    };
  }

  if (!coachWorkspaceUserId) {
    return {
      status: "error",
      message: "Coach selection is required.",
    };
  }

  if (!isWeekday(weekday)) {
    return {
      status: "error",
      message: "Select a valid weekday.",
    };
  }

  if (startTimeMinutes === null) {
    return {
      status: "error",
      message: "Select a valid start time.",
    };
  }

  if (endTimeMinutes === null) {
    return {
      status: "error",
      message: "Select a valid end time.",
    };
  }

  if (endTimeMinutes <= startTimeMinutes) {
    return {
      status: "error",
      message: "End time must be later than start time.",
    };
  }

  if (capacityOverride === "invalid") {
    return {
      status: "error",
      message: "Capacity override must be a positive whole number.",
    };
  }

  if (bookingCutoffMinutes === "invalid") {
    return {
      status: "error",
      message: "Booking cutoff must be zero or a positive whole number.",
    };
  }

  if (cancellationCutoffMinutes === "invalid") {
    return {
      status: "error",
      message: "Cancellation cutoff must be zero or a positive whole number.",
    };
  }

  const [program, room, coachWorkspaceUser] = await Promise.all([
    args.db.program.findFirst({
      where: {
        id: programId,
        workspaceId: args.workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
      },
    }),
    args.db.room.findFirst({
      where: {
        id: roomId,
        locationId: args.locationId,
        archivedAt: null,
        isActive: true,
      },
      select: {
        id: true,
      },
    }),
    args.db.workspaceUser.findFirst({
      where: {
        id: coachWorkspaceUserId,
        workspaceId: args.workspaceId,
        isActive: true,
        role: {
          in: selectableCoachRoles,
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!program) {
    return {
      status: "error",
      message: "Select an active program in this workspace.",
    };
  }

  if (!room) {
    return {
      status: "error",
      message: "Select an active room in the primary location.",
    };
  }

  if (!coachWorkspaceUser) {
    return {
      status: "error",
      message: "Select an active owner or coach.",
    };
  }

  return {
    status: "ok",
    value: {
      programId,
      roomId,
      coachWorkspaceUserId,
      title,
      weekday,
      startTimeMinutes,
      endTimeMinutes,
      capacityOverride,
      bookingCutoffMinutes,
      cancellationCutoffMinutes,
    },
  };
}

export async function getClassTemplateFormOptions(args: {
  workspaceId: string;
  locationId: string;
  db?: ClassTemplateDatabase;
}): Promise<ClassTemplateFormOptions> {
  const db = args.db ?? classTemplateDatabase;
  const [programs, rooms, coachRecords] = await Promise.all([
    db.program.findMany({
      where: {
        workspaceId: args.workspaceId,
        archivedAt: null,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
      },
    }),
    db.room.findMany({
      where: {
        locationId: args.locationId,
        archivedAt: null,
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        capacity: true,
      },
    }),
    db.workspaceUser.findMany({
      where: {
        workspaceId: args.workspaceId,
        isActive: true,
        role: {
          in: selectableCoachRoles,
        },
      },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  const coaches = coachRecords
    .filter(
      (
        coach,
      ): coach is CoachOptionRecord & {
        role: "OWNER" | "COACH";
      } => coach.role === "OWNER" || coach.role === "COACH",
    )
    .map((coach) => {
      const displayName = buildDisplayName(
        coach.user.fullName,
        coach.user.email,
      );

      return {
        id: coach.id,
        displayName,
        email: coach.user.email,
        role: coach.role,
        label: `${displayName} (${getRoleLabel(coach.role)})`,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  const missingPrerequisites: ClassTemplateFormOptions["missingPrerequisites"] =
    [];

  if (programs.length === 0) {
    missingPrerequisites.push("programs");
  }

  if (rooms.length === 0) {
    missingPrerequisites.push("rooms");
  }

  if (coaches.length === 0) {
    missingPrerequisites.push("coaches");
  }

  return {
    programs,
    rooms,
    coaches,
    missingPrerequisites,
    hasRequiredOptions: missingPrerequisites.length === 0,
  };
}

export async function listWeeklyClassTemplates(args: {
  workspaceId: string;
  db?: ClassTemplateDatabase;
}): Promise<WeeklyScheduleData> {
  const db = args.db ?? classTemplateDatabase;
  const [activeRecords, archivedRecords] = await Promise.all([
    db.classTemplate.findMany({
      where: {
        workspaceId: args.workspaceId,
        archivedAt: null,
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
            id: true,
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
    }),
    db.classTemplate.findMany({
      where: {
        workspaceId: args.workspaceId,
        archivedAt: {
          not: null,
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
            id: true,
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
          archivedAt: "desc",
        },
        {
          weekday: "asc",
        },
        {
          startTimeMinutes: "asc",
        },
      ],
    }),
  ]);

  const activeTemplates = activeRecords.map(mapTemplateRecord);
  const archivedTemplates = archivedRecords.map(mapTemplateRecord);

  return {
    days: WEEKDAY_ORDER.map((weekday) => ({
      weekday,
      label: weekdayLabels[weekday],
      templates: activeTemplates
        .filter((template) => template.weekday === weekday)
        .sort((left, right) => {
          if (left.startTimeMinutes !== right.startTimeMinutes) {
            return left.startTimeMinutes - right.startTimeMinutes;
          }

          return left.displayTitle.localeCompare(right.displayTitle);
        }),
    })),
    archivedTemplates,
  };
}

export async function getClassTemplateForEdit(args: {
  templateId: string;
  workspaceId: string;
  db?: ClassTemplateDatabase;
}): Promise<EditableClassTemplate | null> {
  const db = args.db ?? classTemplateDatabase;
  const record = await db.classTemplate.findFirst({
    where: {
      id: args.templateId,
      workspaceId: args.workspaceId,
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
          id: true,
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

  if (!record) {
    return null;
  }

  const template = mapTemplateRecord(record);

  return {
    ...template,
    programId: record.program.id,
    roomId: record.room.id,
    coachWorkspaceUserId: record.coachWorkspaceUser.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function createClassTemplate(args: {
  workspaceId: string;
  locationId: string;
  input: ClassTemplateFormInput;
  db?: ClassTemplateDatabase;
}): Promise<ClassTemplateMutationResult> {
  const db = args.db ?? classTemplateDatabase;
  const parsedInput = await validateClassTemplateInput({
    workspaceId: args.workspaceId,
    locationId: args.locationId,
    input: args.input,
    db,
  });

  if (parsedInput.status === "error") {
    return parsedInput;
  }

  const template = await db.classTemplate.create({
    data: {
      workspaceId: args.workspaceId,
      programId: parsedInput.value.programId,
      roomId: parsedInput.value.roomId,
      coachWorkspaceUserId: parsedInput.value.coachWorkspaceUserId,
      title: parsedInput.value.title,
      weekday: parsedInput.value.weekday,
      startTimeMinutes: parsedInput.value.startTimeMinutes,
      endTimeMinutes: parsedInput.value.endTimeMinutes,
      capacityOverride: parsedInput.value.capacityOverride,
      bookingCutoffMinutes: parsedInput.value.bookingCutoffMinutes,
      cancellationCutoffMinutes: parsedInput.value.cancellationCutoffMinutes,
    },
    select: {
      id: true,
    },
  });

  return {
    status: "created",
    templateId: template.id,
  };
}

export async function updateClassTemplate(args: {
  templateId: string;
  workspaceId: string;
  locationId: string;
  input: ClassTemplateFormInput;
  db?: ClassTemplateDatabase;
}): Promise<ClassTemplateMutationResult> {
  const db = args.db ?? classTemplateDatabase;
  const parsedInput = await validateClassTemplateInput({
    workspaceId: args.workspaceId,
    locationId: args.locationId,
    input: args.input,
    db,
  });

  if (parsedInput.status === "error") {
    return parsedInput;
  }

  const result = await db.classTemplate.updateMany({
    where: {
      id: args.templateId,
      workspaceId: args.workspaceId,
    },
    data: {
      programId: parsedInput.value.programId,
      roomId: parsedInput.value.roomId,
      coachWorkspaceUserId: parsedInput.value.coachWorkspaceUserId,
      title: parsedInput.value.title,
      weekday: parsedInput.value.weekday,
      startTimeMinutes: parsedInput.value.startTimeMinutes,
      endTimeMinutes: parsedInput.value.endTimeMinutes,
      capacityOverride: parsedInput.value.capacityOverride,
      bookingCutoffMinutes: parsedInput.value.bookingCutoffMinutes,
      cancellationCutoffMinutes: parsedInput.value.cancellationCutoffMinutes,
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Class template not found.",
    };
  }

  return {
    status: "updated",
    templateId: args.templateId,
  };
}

export async function archiveClassTemplate(args: {
  templateId: string;
  workspaceId: string;
  db?: ClassTemplateDatabase;
}): Promise<ClassTemplateMutationResult> {
  const db = args.db ?? classTemplateDatabase;
  const result = await db.classTemplate.updateMany({
    where: {
      id: args.templateId,
      workspaceId: args.workspaceId,
    },
    data: {
      archivedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Class template not found.",
    };
  }

  return {
    status: "archived",
    templateId: args.templateId,
  };
}
