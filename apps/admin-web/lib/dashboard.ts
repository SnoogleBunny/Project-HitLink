import { prisma } from "@flowstate/db";
import {
  formatBillingStateStatus,
  listFailedPaymentQueue,
} from "./failed-payments";
import {
  listPendingCoachInvites,
  type PendingCoachInvite,
} from "./staff-invites";
import { listTodayClasses, type TodayClassSummary } from "./rosters";

type RosterDatabase = NonNullable<Parameters<typeof listTodayClasses>[0]["db"]>;
type FailedPaymentDatabase = NonNullable<
  Parameters<typeof listFailedPaymentQueue>[0]["db"]
>;
type StaffInviteDatabase = NonNullable<
  Parameters<typeof listPendingCoachInvites>[0]["db"]
>;
type FailedPaymentQueueItem = Awaited<
  ReturnType<typeof listFailedPaymentQueue>
>[number];

interface DashboardCountDatabase {
  program: {
    count(args: Record<string, unknown>): Promise<number>;
  };
  room: {
    count(args: Record<string, unknown>): Promise<number>;
  };
  classTemplate: {
    count(args: Record<string, unknown>): Promise<number>;
  };
  membershipPlan: {
    count(args: Record<string, unknown>): Promise<number>;
  };
}

type DashboardDatabase = DashboardCountDatabase &
  RosterDatabase &
  FailedPaymentDatabase &
  StaffInviteDatabase;

export type DashboardStatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type DashboardAttentionCategory =
  | "billing"
  | "attendance"
  | "trials"
  | "capacity"
  | "invites";

export interface DashboardMetric {
  id: "classes" | "bookings" | "trials" | "attendance" | "billing";
  label: string;
  value: number;
  tone: DashboardStatusTone;
  description: string;
}

export interface DashboardAttentionSummaryItem {
  category: DashboardAttentionCategory;
  label: string;
  count: number;
  tone: DashboardStatusTone;
}

export interface DashboardAttentionItem {
  id: string;
  category: DashboardAttentionCategory;
  severity: Exclude<DashboardStatusTone, "neutral" | "info">;
  title: string;
  context: string;
  href: string;
  actionLabel: string;
  priority: number;
}

export interface DashboardSetupSnapshot {
  programCount: number;
  roomCount: number;
  templateCount: number;
  membershipPlanCount: number;
  pendingInviteCount: number;
}

export interface OwnerDashboardSummary {
  scheduledForDate: string | null;
  metrics: DashboardMetric[];
  attentionSummary: DashboardAttentionSummaryItem[];
  attentionItems: DashboardAttentionItem[];
  todayClasses: TodayClassSummary[];
  failedPayments: FailedPaymentQueueItem[];
  pendingInvites: PendingCoachInvite[];
  setup: DashboardSetupSnapshot;
}

const dashboardDatabase = prisma as unknown as DashboardDatabase;

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function formatBillingAttentionContext(item: FailedPaymentQueueItem): string {
  const status = formatBillingStateStatus(item.status);

  if (item.failedAt) {
    return [
      status,
      `Failed ${formatDate(item.failedAt)}`,
      item.gracePeriodEndsAt
        ? `Grace ends ${formatDate(item.gracePeriodEndsAt)}`
        : "No grace deadline set",
    ].join(" · ");
  }

  if (item.status === "PENDING_PAYMENT_METHOD") {
    return [
      "Payment method needs setup",
      item.nextBillingDate
        ? `Next billing ${formatDate(item.nextBillingDate)}`
        : "No next billing date set",
    ].join(" · ");
  }

  return [
    status,
    item.nextBillingDate
      ? `Next billing ${formatDate(item.nextBillingDate)}`
      : "Needs owner review",
  ].join(" · ");
}

function getRosterHref(scheduledClass: TodayClassSummary): string {
  return `/dashboard/schedule/${scheduledClass.id}/roster?date=${scheduledClass.scheduledForDate}`;
}

function getCapacityLeft(scheduledClass: TodayClassSummary): number | null {
  if (scheduledClass.effectiveCapacity === null) {
    return null;
  }

  return scheduledClass.effectiveCapacity - scheduledClass.rosterCount;
}

function isAtCapacityPressure(scheduledClass: TodayClassSummary): boolean {
  const capacityLeft = getCapacityLeft(scheduledClass);

  if (
    capacityLeft === null ||
    scheduledClass.effectiveCapacity === null ||
    scheduledClass.effectiveCapacity <= 0
  ) {
    return false;
  }

  return (
    capacityLeft <= 2 ||
    scheduledClass.rosterCount / scheduledClass.effectiveCapacity >= 0.9
  );
}

function buildBillingAttentionItems(
  failedPayments: FailedPaymentQueueItem[],
): DashboardAttentionItem[] {
  return failedPayments.map((item, index) => ({
    id: `billing-${item.id}`,
    category: "billing",
    severity: "danger",
    title: `Payment needs action: ${item.member.fullName}`,
    context: formatBillingAttentionContext(item),
    href: "/dashboard/billing",
    actionLabel: "Open billing",
    priority: 100 + index,
  }));
}

function buildAttendanceAttentionItems(
  todayClasses: TodayClassSummary[],
): DashboardAttentionItem[] {
  return todayClasses
    .filter(
      (scheduledClass) =>
        scheduledClass.rosterCount > scheduledClass.attendanceRecordedCount,
    )
    .map((scheduledClass, index) => {
      const attendanceLeft =
        scheduledClass.rosterCount - scheduledClass.attendanceRecordedCount;

      return {
        id: `attendance-${scheduledClass.id}`,
        category: "attendance",
        severity: "warning",
        title: `Attendance left: ${scheduledClass.displayTitle}`,
        context: `${attendanceLeft} of ${scheduledClass.rosterCount} still unrecorded · ${scheduledClass.timeLabel}`,
        href: getRosterHref(scheduledClass),
        actionLabel: "Open roster",
        priority: 200 + index,
      };
    });
}

function buildTrialAttentionItems(
  todayClasses: TodayClassSummary[],
): DashboardAttentionItem[] {
  return todayClasses
    .filter((scheduledClass) => scheduledClass.trialCount > 0)
    .map((scheduledClass, index) => ({
      id: `trial-${scheduledClass.id}`,
      category: "trials",
      severity: "success",
      title: `${scheduledClass.trialCount} trial${
        scheduledClass.trialCount === 1 ? "" : "s"
      }: ${scheduledClass.displayTitle}`,
      context: `${scheduledClass.timeLabel} · ${scheduledClass.roomName}`,
      href: getRosterHref(scheduledClass),
      actionLabel: "Open roster",
      priority: 300 + index,
    }));
}

function buildCapacityAttentionItems(
  todayClasses: TodayClassSummary[],
): DashboardAttentionItem[] {
  return todayClasses
    .filter(isAtCapacityPressure)
    .map((scheduledClass, index) => {
      const capacityLeft = getCapacityLeft(scheduledClass) ?? 0;
      const capacityLabel =
        capacityLeft <= 0
          ? "At capacity"
          : `${capacityLeft} spot${capacityLeft === 1 ? "" : "s"} left`;

      return {
        id: `capacity-${scheduledClass.id}`,
        category: "capacity",
        severity: "warning",
        title: `Capacity pressure: ${scheduledClass.displayTitle}`,
        context: `${capacityLabel} · ${scheduledClass.rosterCount} / ${scheduledClass.effectiveCapacity} booked`,
        href: getRosterHref(scheduledClass),
        actionLabel: "Open roster",
        priority: 400 + index,
      };
    });
}

function buildInviteAttentionItems(
  pendingInvites: PendingCoachInvite[],
): DashboardAttentionItem[] {
  return pendingInvites.map((invite, index) => ({
    id: `invite-${invite.id}`,
    category: "invites",
    severity: "warning",
    title: `Coach invite pending: ${invite.email}`,
    context: `Expires ${formatDate(invite.expiresAt)}`,
    href: "/dashboard/staff-invites",
    actionLabel: "Manage invite",
    priority: 500 + index,
  }));
}

function getAttentionTone(count: number): DashboardStatusTone {
  return count > 0 ? "warning" : "success";
}

export function buildDashboardAttention(args: {
  todayClasses: TodayClassSummary[];
  failedPayments: FailedPaymentQueueItem[];
  pendingInvites: PendingCoachInvite[];
}): {
  attentionSummary: DashboardAttentionSummaryItem[];
  attentionItems: DashboardAttentionItem[];
} {
  const attendanceCount = args.todayClasses.filter(
    (scheduledClass) =>
      scheduledClass.rosterCount > scheduledClass.attendanceRecordedCount,
  ).length;
  const trialCount = args.todayClasses.filter(
    (scheduledClass) => scheduledClass.trialCount > 0,
  ).length;
  const capacityCount = args.todayClasses.filter(isAtCapacityPressure).length;
  const inviteCount = args.pendingInvites.length;
  const billingCount = args.failedPayments.length;

  const attentionSummary: DashboardAttentionSummaryItem[] = [
    {
      category: "billing",
      label: "Billing",
      count: billingCount,
      tone: billingCount > 0 ? "danger" : "success",
    },
    {
      category: "attendance",
      label: "Attendance",
      count: attendanceCount,
      tone: getAttentionTone(attendanceCount),
    },
    {
      category: "trials",
      label: "Trials",
      count: trialCount,
      tone: trialCount > 0 ? "success" : "neutral",
    },
    {
      category: "capacity",
      label: "Capacity",
      count: capacityCount,
      tone: getAttentionTone(capacityCount),
    },
    {
      category: "invites",
      label: "Invites",
      count: inviteCount,
      tone: getAttentionTone(inviteCount),
    },
  ];
  const attentionItems = [
    ...buildBillingAttentionItems(args.failedPayments),
    ...buildAttendanceAttentionItems(args.todayClasses),
    ...buildTrialAttentionItems(args.todayClasses),
    ...buildCapacityAttentionItems(args.todayClasses),
    ...buildInviteAttentionItems(args.pendingInvites),
  ]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);

  return {
    attentionSummary,
    attentionItems,
  };
}

function buildDashboardMetrics(args: {
  todayClasses: TodayClassSummary[];
  failedPayments: FailedPaymentQueueItem[];
}): DashboardMetric[] {
  const bookedSpots = args.todayClasses.reduce(
    (total, scheduledClass) => total + scheduledClass.rosterCount,
    0,
  );
  const trialsToday = args.todayClasses.reduce(
    (total, scheduledClass) => total + scheduledClass.trialCount,
    0,
  );
  const attendanceLeft = args.todayClasses.reduce(
    (total, scheduledClass) =>
      total +
      Math.max(
        scheduledClass.rosterCount - scheduledClass.attendanceRecordedCount,
        0,
      ),
    0,
  );

  return [
    {
      id: "classes",
      label: "Classes today",
      value: args.todayClasses.length,
      tone: "neutral",
      description: "Scheduled class blocks",
    },
    {
      id: "bookings",
      label: "Booked spots",
      value: bookedSpots,
      tone: "neutral",
      description: "Rostered members and trials",
    },
    {
      id: "trials",
      label: "Trials",
      value: trialsToday,
      tone: trialsToday > 0 ? "success" : "neutral",
      description: "Conversion moments today",
    },
    {
      id: "attendance",
      label: "Attendance left",
      value: attendanceLeft,
      tone: attendanceLeft > 0 ? "warning" : "success",
      description: "Roster spots not yet recorded",
    },
    {
      id: "billing",
      label: "Failed payments",
      value: args.failedPayments.length,
      tone: args.failedPayments.length > 0 ? "danger" : "success",
      description: "Billing items needing action",
    },
  ];
}

export async function getOwnerDashboardSummary(args: {
  workspaceId: string;
  workspaceUserId: string;
  timezone: string;
  locationId: string;
  db?: DashboardDatabase;
  now?: Date;
}): Promise<OwnerDashboardSummary> {
  const db = args.db ?? dashboardDatabase;
  const [
    todayClasses,
    failedPayments,
    pendingInvites,
    programCount,
    roomCount,
    templateCount,
    membershipPlanCount,
  ] = await Promise.all([
    listTodayClasses({
      access: {
        workspaceId: args.workspaceId,
        workspaceUserId: args.workspaceUserId,
        role: "OWNER",
        timezone: args.timezone,
      },
      db,
      now: args.now,
    }),
    listFailedPaymentQueue({
      workspaceId: args.workspaceId,
      db,
    }),
    listPendingCoachInvites({
      workspaceId: args.workspaceId,
      db,
      now: args.now,
    }),
    db.program.count({
      where: {
        workspaceId: args.workspaceId,
        archivedAt: null,
      },
    }),
    db.room.count({
      where: {
        locationId: args.locationId,
        archivedAt: null,
      },
    }),
    db.classTemplate.count({
      where: {
        workspaceId: args.workspaceId,
        archivedAt: null,
      },
    }),
    db.membershipPlan.count({
      where: {
        workspaceId: args.workspaceId,
        archivedAt: null,
      },
    }),
  ]);
  const attention = buildDashboardAttention({
    todayClasses,
    failedPayments,
    pendingInvites,
  });

  return {
    scheduledForDate: todayClasses[0]?.scheduledForDate ?? null,
    metrics: buildDashboardMetrics({
      todayClasses,
      failedPayments,
    }),
    ...attention,
    todayClasses,
    failedPayments,
    pendingInvites,
    setup: {
      programCount,
      roomCount,
      templateCount,
      membershipPlanCount,
      pendingInviteCount: pendingInvites.length,
    },
  };
}
