import {
  buildUpcomingOccurrenceDateOptions,
  addDays,
  evaluateClassSchedulingPolicy,
  readClassSchedulingPolicy,
  type SchedulingPolicyReader,
  type SchedulingPolicyRevision,
  classOccurrenceInclude,
  formatOccurrenceLabel,
  getOccurrenceStartsAt,
  getWorkspaceDateString,
  resolveClassOccurrence,
  resolveWorkspaceClockTimezone,
  prisma,
  type Weekday,
  type ClassOccurrenceTemplate,
} from "@flowstate/db";
import { resolveDisplayLocale } from "@flowstate/ui";

const trialDateOptionCount = 4;
const trialDateOptionMaxDayWindow = 42;

export interface TrialBookingTemplateForDates {
  id: string;
  displayTitle: string;
  weekday: Weekday;
  startTimeMinutes: number;
  endTimeMinutes: number;
  bookingCutoffMinutes: number;
  capacityOverride: number | null;
  roomCapacity: number | null;
  programName: string;
  roomName: string;
  coachDisplayName: string;
}

export interface TrialBookingDateOption {
  classTemplateId: string;
  scheduledForDate: string;
  startsAt: Date;
  label: string;
  details?: TrialBookingTemplateForDates;
}

export interface TrialBookingTemplateOption extends TrialBookingTemplateForDates {
  dateOptions: TrialBookingDateOption[];
}

interface TrialWorkspaceRecord {
  id: string;
  name: string;
  status: "ACTIVE" | "SETUP_INCOMPLETE" | "DISABLED";
  settings?: { locale?: string | null } | null;
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
  bookingCutoffMinutes: number;
  capacityOverride: number | null;
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
  } | null;
}

interface TrialBookingDatabase extends SchedulingPolicyReader {
  workspace: {
    findFirst(
      args: Record<string, unknown>,
    ): Promise<TrialWorkspaceRecord | null>;
  };
  classTemplate: {
    findMany(
      args: Record<string, unknown>,
    ): Promise<TrialClassTemplateRecord[]>;
  };
}

export type TrialBookingOptionsResult =
  | {
      status: "available";
      workspaceId: string;
      workspaceName: string;
      timezone: string;
      templates: TrialBookingTemplateOption[];
    }
  | {
      status: "no-eligible-dates";
      workspaceId: string;
      workspaceName: string;
      timezone: string;
      activeTemplateCount: number;
    };

const trialBookingDatabase = prisma as unknown as TrialBookingDatabase;

function mapClassTemplate(
  template: TrialClassTemplateRecord,
): TrialBookingTemplateForDates {
  const coachName = template.coachWorkspaceUser?.user.fullName?.trim();

  return {
    id: template.id,
    displayTitle: template.title ?? template.program.name,
    weekday: template.weekday,
    startTimeMinutes: template.startTimeMinutes,
    endTimeMinutes: template.endTimeMinutes,
    bookingCutoffMinutes: template.bookingCutoffMinutes,
    capacityOverride: template.capacityOverride,
    roomCapacity: template.room.capacity,
    programName: template.program.name,
    roomName: template.room.name,
    coachDisplayName:
      coachName ||
      template.coachWorkspaceUser?.user.email ||
      "Coach to be confirmed",
  };
}

export function buildTrialBookingDateOptions(args: {
  templates: TrialBookingTemplateForDates[];
  timezone: string;
  now: Date;
  occurrenceCount?: number;
}): TrialBookingTemplateOption[] {
  const occurrenceCount = args.occurrenceCount ?? trialDateOptionCount;

  return buildUpcomingOccurrenceDateOptions({
    templates: args.templates,
    timezone: args.timezone,
    now: args.now,
    occurrenceCount: trialDateOptionMaxDayWindow + 1,
    maxDayWindow: trialDateOptionMaxDayWindow,
  })
    .map(({ template, dateOptions }) => ({
      ...template,
      dateOptions: dateOptions
        .filter(
          (option) =>
            args.now.getTime() <
            option.startsAt.getTime() - template.bookingCutoffMinutes * 60_000,
        )
        .slice(0, occurrenceCount),
    }))
    .filter((template) => template.dateOptions.length > 0);
}

export function findTrialBookingDateOption(args: {
  options: TrialBookingTemplateOption[];
  classTemplateId: string;
  scheduledForDate: string;
}): {
  template: TrialBookingTemplateOption;
  dateOption: TrialBookingDateOption;
} | null {
  for (const template of args.options) {
    if (template.id !== args.classTemplateId) {
      continue;
    }

    const dateOption = template.dateOptions.find(
      (option) => option.scheduledForDate === args.scheduledForDate,
    );

    if (dateOption) {
      return {
        template: { ...template, ...dateOption.details },
        dateOption,
      };
    }
  }

  return null;
}

async function getTrialWorkspaceData(args: {
  workspaceId: string;
  db: TrialBookingDatabase;
}): Promise<{
  workspace: TrialWorkspaceRecord & {
    location: NonNullable<TrialWorkspaceRecord["location"]>;
  };
  templates: TrialBookingTemplateForDates[];
  rawTemplates: ClassOccurrenceTemplate[];
} | null> {
  const workspace = await args.db.workspace.findFirst({
    where: {
      id: args.workspaceId,
      status: "ACTIVE",
    },
    include: {
      location: true,
      settings: true,
    },
  });

  if (!workspace?.location) {
    return null;
  }

  const templateRecords = await args.db.classTemplate.findMany({
    where: {
      workspaceId: args.workspaceId,
      archivedAt: null,
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
  });

  return {
    workspace: {
      ...workspace,
      location: workspace.location,
    },
    templates: templateRecords.map(mapClassTemplate),
    rawTemplates: templateRecords.map((template) => ({
      ...template,
      workspaceId: args.workspaceId,
    })) as unknown as ClassOccurrenceTemplate[],
  };
}

function resolvedTrialOptions(
  data: NonNullable<Awaited<ReturnType<typeof getTrialWorkspaceData>>>,
  now: Date,
  revision: SchedulingPolicyRevision | null,
): TrialBookingTemplateOption[] {
  const locale = data.workspace.settings?.locale
    ? resolveDisplayLocale(data.workspace.settings.locale)
    : undefined;
  const today = getWorkspaceDateString(now, data.workspace.location.timezone);
  return data.rawTemplates.flatMap((template) => {
    const dateOptions: TrialBookingDateOption[] = [];
    for (
      let offset = 0;
      offset <= trialDateOptionMaxDayWindow &&
      dateOptions.length < trialDateOptionCount;
      offset++
    ) {
      const date = addDays(today, offset);
      const occurrence = resolveClassOccurrence({
        template,
        scheduledForDate: date,
      });
      if (
        !occurrence ||
        occurrence.status === "CANCELLED" ||
        occurrence.program.archivedAt ||
        occurrence.room.archivedAt ||
        occurrence.room.isActive === false
      )
        continue;
      const startsAt = getOccurrenceStartsAt({
        scheduledForDate: date,
        startTimeMinutes: occurrence.startTimeMinutes,
        timezone: occurrence.timezone ?? data.workspace.location.timezone,
      });
      if (!evaluateClassSchedulingPolicy({ revision, date, timezone: occurrence.timezone ?? data.workspace.location.timezone, startTimeMinutes: occurrence.startTimeMinutes, endTimeMinutes: occurrence.endTimeMinutes, bookingCutoffMinutes: occurrence.bookingCutoffMinutes, now }).allowed) continue;
      const details = mapClassTemplate(occurrence);
      dateOptions.push({
        classTemplateId: template.id,
        scheduledForDate: date,
        startsAt,
        details,
        label: `${formatOccurrenceLabel({ weekday: occurrence.weekday, dateString: date, startTimeMinutes: occurrence.startTimeMinutes, locale })} · ${occurrence.timezone ?? data.workspace.location.timezone} · ${details.coachDisplayName}`,
      });
    }
    return dateOptions[0]?.details
      ? [{ ...dateOptions[0].details, dateOptions }]
      : [];
  });
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

  const now = args.now ?? new Date();
  data.workspace.location.timezone = await resolveWorkspaceClockTimezone({
    workspaceId: args.workspaceId,
    baselineTimezone: data.workspace.location.timezone,
    now,
    db: db as never,
  });
  const templates = resolvedTrialOptions(data, now, await readClassSchedulingPolicy(db, args.workspaceId, now));

  if (templates.length === 0) {
    return {
      status: "no-eligible-dates",
      workspaceId: data.workspace.id,
      workspaceName: data.workspace.name,
      timezone: data.workspace.location.timezone,
      activeTemplateCount: data.templates.length,
    };
  }

  return {
    status: "available",
    workspaceId: data.workspace.id,
    workspaceName: data.workspace.name,
    timezone: data.workspace.location.timezone,
    templates,
  };
}
