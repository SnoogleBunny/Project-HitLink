import {
  type AttendanceState,
  type ClassBookingStatus,
  prisma,
  type MemberFormStatus,
  type MemberStatus,
  type Weekday,
} from "@hitlink/db";

export const MEMBER_STATUSES: MemberStatus[] = [
  "ACTIVE",
  "TRIAL",
  "OVERDUE",
  "FROZEN",
  "CANCELLED",
  "WAITLISTED",
];

export const MEMBER_FORM_STATUSES: MemberFormStatus[] = [
  "NOT_REQUESTED",
  "PENDING",
  "COMPLETE",
];

const maxTagCount = 10;
const maxNotesLength = 2_000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MemberFormInput {
  fullName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  status?: string;
  notes?: string;
  tags?: string;
  formStatus?: string;
}

export interface GuardianLinkFormInput {
  guardianId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  relationshipLabel?: string;
  isPrimary?: boolean;
  notes?: string;
}

interface GuardianSummaryRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes?: string | null;
}

interface FamilyLinkRecord {
  id: string;
  relationshipLabel: string | null;
  isPrimary: boolean;
  guardian: GuardianSummaryRecord;
}

interface ClassBookingRecord {
  id: string;
  scheduledForDate: Date;
  createdAt: Date;
  status: ClassBookingStatus;
  classTemplate: {
    id: string;
    title: string | null;
    weekday: Weekday;
    startTimeMinutes: number;
    program: {
      name: string;
    };
  };
}

interface AttendanceHistoryRecord {
  id: string;
  scheduledForDate: Date;
  state: AttendanceState;
  note: string | null;
  updatedAt: Date;
  classTemplate: {
    id: string;
    title: string | null;
    weekday: Weekday;
    startTimeMinutes: number;
    program: {
      name: string;
    };
  };
}

interface PortalUserRecord {
  id: string;
  email: string;
}

interface MemberListRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  status: MemberStatus;
  notes: string | null;
  tags: string[];
  formStatus: MemberFormStatus;
  createdAt: Date;
  updatedAt: Date;
  familyLinks: FamilyLinkRecord[];
  classBookings: ClassBookingRecord[];
}

interface MemberProfileRecord extends MemberListRecord {
  userId: string | null;
  user: PortalUserRecord | null;
  classBookings: ClassBookingRecord[];
  attendanceRecords: AttendanceHistoryRecord[];
}

interface MemberIdentityRecord {
  id: string;
  userId: string | null;
  user: PortalUserRecord | null;
}

interface MemberDatabase {
  member: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    findMany(args: Record<string, unknown>): Promise<MemberListRecord[]>;
    findFirst(
      args: Record<string, unknown>,
    ): Promise<MemberProfileRecord | MemberIdentityRecord | { id: string } | null>;
  };
  user: {
    findUnique(args: Record<string, unknown>): Promise<{ id: string } | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  guardian: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  familyLink: {
    count(args: Record<string, unknown>): Promise<number>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

export interface MemberTrialBookingSummary {
  id: string;
  scheduledForDate: Date;
  createdAt: Date;
  status: ClassBookingStatus;
  classTemplateId: string;
  classTitle: string;
  weekday: Weekday;
  startTimeMinutes: number;
}

export interface MemberAttendanceSummary {
  id: string;
  scheduledForDate: Date;
  state: AttendanceState;
  note: string | null;
  updatedAt: Date;
  classTemplateId: string;
  classTitle: string;
  weekday: Weekday;
  startTimeMinutes: number;
}

export interface MemberGuardianSummary {
  linkId: string;
  guardianId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  relationshipLabel: string | null;
  isPrimary: boolean;
}

export interface MemberListItem {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  status: MemberStatus;
  notes: string | null;
  tags: string[];
  formStatus: MemberFormStatus;
  createdAt: Date;
  updatedAt: Date;
  guardians: MemberGuardianSummary[];
  latestTrialBooking: MemberTrialBookingSummary | null;
}

export interface MemberPortalAccessSummary {
  userId: string;
  email: string;
}

export interface MemberProfile extends Omit<MemberListItem, "latestTrialBooking"> {
  trialBookings: MemberTrialBookingSummary[];
  attendanceRecords: MemberAttendanceSummary[];
  portalAccess: MemberPortalAccessSummary | null;
}

type MemberMutationResult =
  | {
      status: "created" | "updated";
      memberId: string;
    }
  | {
      status: "error";
      message: string;
    };

type GuardianLinkMutationResult =
  | {
      status: "created";
      familyLinkId: string;
    }
  | {
      status: "error";
      message: string;
    };

const memberDatabase = prisma as unknown as MemberDatabase;

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

function parseTags(value: string | undefined): string[] {
  const seenTags = new Set<string>();
  const tags: string[] = [];

  for (const rawTag of value?.split(",") ?? []) {
    const tag = rawTag.trim();
    const key = tag.toLowerCase();

    if (!tag || seenTags.has(key)) {
      continue;
    }

    seenTags.add(key);
    tags.push(tag);

    if (tags.length >= maxTagCount) {
      break;
    }
  }

  return tags;
}

function isMemberStatus(value: string): value is MemberStatus {
  return MEMBER_STATUSES.includes(value as MemberStatus);
}

function isMemberFormStatus(value: string): value is MemberFormStatus {
  return MEMBER_FORM_STATUSES.includes(value as MemberFormStatus);
}

function sanitizeMemberInput(input: MemberFormInput, now: Date) {
  const fullName = input.fullName.trim();
  const email = normalizeEmail(input.email);
  const phone = cleanNullable(input.phone);
  const dateOfBirth = parseDateOnly(input.dateOfBirth, now);
  const status = cleanNullable(input.status) ?? "TRIAL";
  const formStatus = cleanNullable(input.formStatus) ?? "NOT_REQUESTED";
  const notes = cleanNullable(input.notes);

  return {
    fullName,
    email,
    phone,
    dateOfBirth,
    status,
    notes,
    tags: parseTags(input.tags),
    formStatus,
  };
}

function validateSanitizedMemberInput(
  input: ReturnType<typeof sanitizeMemberInput>,
):
  | {
      status: "ok";
      value: {
        fullName: string;
        email: string | null;
        phone: string | null;
        dateOfBirth: Date | null;
        status: MemberStatus;
        notes: string | null;
        tags: string[];
        formStatus: MemberFormStatus;
      };
    }
  | {
      status: "error";
      message: string;
    } {
  if (!input.fullName) {
    return {
      status: "error",
      message: "Member full name is required.",
    };
  }

  if (input.email === "invalid") {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  if (input.dateOfBirth === "invalid") {
    return {
      status: "error",
      message: "Enter a valid date of birth that is not in the future.",
    };
  }

  if (!isMemberStatus(input.status)) {
    return {
      status: "error",
      message: "Select a valid member status.",
    };
  }

  if (!isMemberFormStatus(input.formStatus)) {
    return {
      status: "error",
      message: "Select a valid form status.",
    };
  }

  if (input.notes && input.notes.length > maxNotesLength) {
    return {
      status: "error",
      message: `Notes must be ${maxNotesLength} characters or fewer.`,
    };
  }

  return {
    status: "ok",
    value: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      status: input.status,
      notes: input.notes,
      tags: input.tags,
      formStatus: input.formStatus,
    },
  };
}

async function syncLinkedMemberUser(args: {
  db: MemberDatabase;
  member: MemberIdentityRecord;
  fullName: string;
  email: string | null;
}):
  Promise<
    | {
        status: "ok";
      }
    | {
        status: "error";
        message: string;
      }
  > {
  if (!args.member.userId) {
    return {
      status: "ok",
    };
  }

  if (!args.email) {
    return {
      status: "error",
      message: "Members with portal access must keep an email address.",
    };
  }

  const existingUser = await args.db.user.findUnique({
    where: {
      email: args.email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser && existingUser.id !== args.member.userId) {
    return {
      status: "error",
      message: "That email already belongs to another user.",
    };
  }

  const result = await args.db.user.updateMany({
    where: {
      id: args.member.userId,
    },
    data: {
      email: args.email,
      fullName: args.fullName,
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Member portal access is linked to a missing user.",
    };
  }

  return {
    status: "ok",
  };
}

function mapTrialBooking(
  booking: ClassBookingRecord,
): MemberTrialBookingSummary {
  return {
    id: booking.id,
    scheduledForDate: booking.scheduledForDate,
    createdAt: booking.createdAt,
    status: booking.status,
    classTemplateId: booking.classTemplate.id,
    classTitle: booking.classTemplate.title ?? booking.classTemplate.program.name,
    weekday: booking.classTemplate.weekday,
    startTimeMinutes: booking.classTemplate.startTimeMinutes,
  };
}

function mapAttendanceRecord(
  attendanceRecord: AttendanceHistoryRecord,
): MemberAttendanceSummary {
  return {
    id: attendanceRecord.id,
    scheduledForDate: attendanceRecord.scheduledForDate,
    state: attendanceRecord.state,
    note: attendanceRecord.note,
    updatedAt: attendanceRecord.updatedAt,
    classTemplateId: attendanceRecord.classTemplate.id,
    classTitle:
      attendanceRecord.classTemplate.title ??
      attendanceRecord.classTemplate.program.name,
    weekday: attendanceRecord.classTemplate.weekday,
    startTimeMinutes: attendanceRecord.classTemplate.startTimeMinutes,
  };
}

function mapGuardian(link: FamilyLinkRecord): MemberGuardianSummary {
  return {
    linkId: link.id,
    guardianId: link.guardian.id,
    fullName: link.guardian.fullName,
    email: link.guardian.email,
    phone: link.guardian.phone,
    notes: link.guardian.notes ?? null,
    relationshipLabel: link.relationshipLabel,
    isPrimary: link.isPrimary,
  };
}

function mapPortalAccess(
  user: PortalUserRecord | null | undefined,
): MemberPortalAccessSummary | null {
  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
  };
}

function mapMemberListItem(record: MemberListRecord): MemberListItem {
  const latestTrialBooking = record.classBookings[0] ?? null;

  return {
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    phone: record.phone,
    dateOfBirth: record.dateOfBirth,
    status: record.status,
    notes: record.notes,
    tags: record.tags,
    formStatus: record.formStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    guardians: record.familyLinks.map(mapGuardian),
    latestTrialBooking: latestTrialBooking
      ? mapTrialBooking(latestTrialBooking)
      : null,
  };
}

function getMemberInclude(args?: {
  trialTake?: number;
  includeAttendance?: boolean;
}) {
  return {
    familyLinks: {
      include: {
        guardian: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    },
    classBookings: {
      where: {
        bookingType: "TRIAL",
      },
      include: {
        classTemplate: {
          include: {
            program: {
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
      ...(args?.trialTake ? { take: args.trialTake } : {}),
    },
    ...(args?.includeAttendance
      ? {
          attendanceRecords: {
            include: {
              classTemplate: {
                include: {
                  program: {
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
                updatedAt: "desc",
              },
            ],
            take: 20,
          },
        }
      : {}),
  };
}

export async function listMembers(args: {
  workspaceId: string;
  query?: string;
  db?: MemberDatabase;
}): Promise<MemberListItem[]> {
  const db = args.db ?? memberDatabase;
  const query = args.query?.trim();
  const where: Record<string, unknown> = {
    workspaceId: args.workspaceId,
  };

  if (query) {
    where.OR = [
      {
        fullName: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: query,
        },
      },
      {
        phone: {
          contains: query,
          mode: "insensitive",
        },
      },
    ];
  }

  const members = await db.member.findMany({
    where,
    include: getMemberInclude({
      trialTake: 1,
    }),
    orderBy: {
      fullName: "asc",
    },
    take: 100,
  });

  return members.map(mapMemberListItem);
}

export async function getMemberProfile(args: {
  workspaceId: string;
  memberId: string;
  db?: MemberDatabase;
}): Promise<MemberProfile | null> {
  const db = args.db ?? memberDatabase;
  const member = (await db.member.findFirst({
    where: {
      id: args.memberId,
      workspaceId: args.workspaceId,
    },
    include: {
      ...getMemberInclude({
        includeAttendance: true,
      }),
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  })) as MemberProfileRecord | null;

  if (!member) {
    return null;
  }

  const listItem = mapMemberListItem(member);

  return {
    ...listItem,
    trialBookings: member.classBookings.map(mapTrialBooking),
    attendanceRecords: member.attendanceRecords.map(mapAttendanceRecord),
    portalAccess: mapPortalAccess(member.user),
  };
}

export async function createMember(args: {
  workspaceId: string;
  input: MemberFormInput;
  db?: MemberDatabase;
  now?: Date;
}): Promise<MemberMutationResult> {
  const db = args.db ?? memberDatabase;
  const input = validateSanitizedMemberInput(
    sanitizeMemberInput(args.input, args.now ?? new Date()),
  );

  if (input.status === "error") {
    return input;
  }

  const member = await db.member.create({
    data: {
      workspaceId: args.workspaceId,
      ...input.value,
    },
    select: {
      id: true,
    },
  });

  return {
    status: "created",
    memberId: member.id,
  };
}

export async function updateMember(args: {
  workspaceId: string;
  memberId: string;
  input: MemberFormInput;
  db?: MemberDatabase;
  now?: Date;
}): Promise<MemberMutationResult> {
  const db = args.db ?? memberDatabase;
  const input = validateSanitizedMemberInput(
    sanitizeMemberInput(args.input, args.now ?? new Date()),
  );

  if (input.status === "error") {
    return input;
  }

  const member = (await db.member.findFirst({
    where: {
      id: args.memberId,
      workspaceId: args.workspaceId,
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  })) as MemberIdentityRecord | null;

  if (!member) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  const userSyncResult = await syncLinkedMemberUser({
    db,
    member,
    fullName: input.value.fullName,
    email: input.value.email,
  });

  if (userSyncResult.status === "error") {
    return userSyncResult;
  }

  const result = await db.member.updateMany({
    where: {
      id: args.memberId,
      workspaceId: args.workspaceId,
    },
    data: input.value,
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  return {
    status: "updated",
    memberId: args.memberId,
  };
}

function sanitizeGuardianInput(input: GuardianLinkFormInput) {
  return {
    guardianId: cleanNullable(input.guardianId),
    fullName: cleanNullable(input.fullName),
    email: normalizeEmail(input.email),
    phone: cleanNullable(input.phone),
    relationshipLabel: cleanNullable(input.relationshipLabel),
    isPrimary: Boolean(input.isPrimary),
    notes: cleanNullable(input.notes),
  };
}

function isFamilyLinkUniqueConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: string;
    meta?: {
      target?: string[];
    };
  };

  return (
    maybeError.code === "P2002" &&
    Array.isArray(maybeError.meta?.target) &&
    maybeError.meta.target.includes("guardianId") &&
    maybeError.meta.target.includes("childMemberId")
  );
}

export async function addGuardianToMember(args: {
  workspaceId: string;
  memberId: string;
  input: GuardianLinkFormInput;
  db?: MemberDatabase;
}): Promise<GuardianLinkMutationResult> {
  const db = args.db ?? memberDatabase;
  const input = sanitizeGuardianInput(args.input);

  if (input.email === "invalid") {
    return {
      status: "error",
      message: "Enter a valid guardian email address.",
    };
  }

  if (!input.guardianId && !input.fullName) {
    return {
      status: "error",
      message: "Guardian full name is required.",
    };
  }

  const childMember = await db.member.findFirst({
    where: {
      id: args.memberId,
      workspaceId: args.workspaceId,
    },
    select: {
      id: true,
    },
  });

  if (!childMember) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  const currentGuardianCount = await db.familyLink.count({
    where: {
      workspaceId: args.workspaceId,
      childMemberId: args.memberId,
    },
  });

  if (currentGuardianCount >= 2) {
    return {
      status: "error",
      message: "A child member can have up to two guardians in this slice.",
    };
  }

  let guardianId = input.guardianId;

  if (guardianId) {
    const guardian = await db.guardian.findFirst({
      where: {
        id: guardianId,
        workspaceId: args.workspaceId,
      },
      select: {
        id: true,
      },
    });

    if (!guardian) {
      return {
        status: "error",
        message: "Guardian not found.",
      };
    }
  } else {
    const guardian = await db.guardian.create({
      data: {
        workspaceId: args.workspaceId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
      },
      select: {
        id: true,
      },
    });

    guardianId = guardian.id;
  }

  try {
    const link = await db.familyLink.create({
      data: {
        workspaceId: args.workspaceId,
        guardianId,
        childMemberId: args.memberId,
        relationshipLabel: input.relationshipLabel,
        isPrimary: input.isPrimary,
      },
      select: {
        id: true,
      },
    });

    return {
      status: "created",
      familyLinkId: link.id,
    };
  } catch (error) {
    if (isFamilyLinkUniqueConstraint(error)) {
      return {
        status: "error",
        message: "This guardian is already linked to the member.",
      };
    }

    throw error;
  }
}
