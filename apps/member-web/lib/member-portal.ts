import {
  formatMinutesAsTime,
  getWorkspaceDateString,
  prisma,
  toDateOnlyString,
  type AttendanceState,
  type ClassBookingStatus,
  type Weekday,
} from "@flowstate/db";
import {
  getCurrentMemberMembershipContext,
  type CurrentMembershipRecord,
  type MemberMembershipDatabase,
} from "./member-membership";

interface DashboardBookingRecord {
  id: string;
  scheduledForDate: Date;
  status: ClassBookingStatus;
  classTemplate: {
    id: string;
    title: string | null;
    weekday: Weekday;
    startTimeMinutes: number;
    program: {
      name: string;
    };
    room: {
      name: string;
    };
  };
}

interface DashboardAttendanceRecord {
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
    room: {
      name: string;
    };
  };
}

interface MemberPortalDatabase extends MemberMembershipDatabase {
  classBooking: {
    findMany(args: Record<string, unknown>): Promise<DashboardBookingRecord[]>;
  };
  attendanceRecord: {
    findMany(args: Record<string, unknown>): Promise<DashboardAttendanceRecord[]>;
  };
}

export interface MemberDashboardBookingSummary {
  bookingId: string;
  scheduledForDate: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  timeLabel: string;
  status: ClassBookingStatus;
}

export interface MemberDashboardAttendanceSummary {
  attendanceRecordId: string;
  scheduledForDate: string;
  displayTitle: string;
  programName: string;
  roomName: string;
  timeLabel: string;
  state: AttendanceState;
  note: string | null;
}

export interface MemberMembershipSummary {
  currentMembership: CurrentMembershipRecord | null;
  allowedProgramNames: string[];
}

export interface MemberPortalDashboard {
  membership: MemberMembershipSummary;
  upcomingBookings: MemberDashboardBookingSummary[];
  recentAttendance: MemberDashboardAttendanceSummary[];
}

const memberPortalDatabase = prisma as unknown as MemberPortalDatabase;

function mapDashboardBooking(
  booking: DashboardBookingRecord,
): MemberDashboardBookingSummary {
  return {
    bookingId: booking.id,
    scheduledForDate: toDateOnlyString(booking.scheduledForDate),
    displayTitle: booking.classTemplate.title ?? booking.classTemplate.program.name,
    programName: booking.classTemplate.program.name,
    roomName: booking.classTemplate.room.name,
    timeLabel: formatMinutesAsTime(booking.classTemplate.startTimeMinutes),
    status: booking.status,
  };
}

function mapAttendanceRecord(
  attendanceRecord: DashboardAttendanceRecord,
): MemberDashboardAttendanceSummary {
  return {
    attendanceRecordId: attendanceRecord.id,
    scheduledForDate: toDateOnlyString(attendanceRecord.scheduledForDate),
    displayTitle:
      attendanceRecord.classTemplate.title ??
      attendanceRecord.classTemplate.program.name,
    programName: attendanceRecord.classTemplate.program.name,
    roomName: attendanceRecord.classTemplate.room.name,
    timeLabel: formatMinutesAsTime(
      attendanceRecord.classTemplate.startTimeMinutes,
    ),
    state: attendanceRecord.state,
    note: attendanceRecord.note,
  };
}

export async function getMemberMembershipSummary(args: {
  workspaceId: string;
  memberId: string;
  db?: MemberPortalDatabase;
}): Promise<MemberMembershipSummary> {
  const db = args.db ?? memberPortalDatabase;
  const currentMembership = await getCurrentMemberMembershipContext({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });

  return {
    currentMembership,
    allowedProgramNames:
      currentMembership?.membershipPlan.programRestrictions.map(
        (restriction) => restriction.program.name,
      ) ?? [],
  };
}

export async function getMemberPortalDashboard(args: {
  workspaceId: string;
  memberId: string;
  timezone: string;
  db?: MemberPortalDatabase;
  now?: Date;
}): Promise<MemberPortalDashboard> {
  const db = args.db ?? memberPortalDatabase;
  const now = args.now ?? new Date();
  const today = getWorkspaceDateString(now, args.timezone);
  const [membership, upcomingBookings, recentAttendance] = await Promise.all([
    getMemberMembershipSummary({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      db,
    }),
    db.classBooking.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        status: "BOOKED",
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
      orderBy: [
        {
          scheduledForDate: "asc",
        },
        {
          classTemplate: {
            startTimeMinutes: "asc",
          },
        },
      ],
      take: 5,
    }),
    db.attendanceRecord.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
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
          scheduledForDate: "desc",
        },
        {
          updatedAt: "desc",
        },
      ],
      take: 5,
    }),
  ]);

  return {
    membership,
    upcomingBookings: upcomingBookings.map(mapDashboardBooking),
    recentAttendance: recentAttendance.map(mapAttendanceRecord),
  };
}
