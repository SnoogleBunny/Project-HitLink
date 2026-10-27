import { fixtureSchedulingRevision } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import { describe, expect, it, vi } from "vitest";
import {
  buildTrialBookingDateOptions,
  findTrialBookingDateOption,
  listTrialBookingOptions,
} from "./trial-booking";

type TrialBookingTestDb = NonNullable<
  Parameters<typeof listTrialBookingOptions>[0]["db"]
>;

function buildTemplateForDates(args?: {
  bookingCutoffMinutes?: number;
  weekday?: "SUNDAY" | "TUESDAY";
  startTimeMinutes?: number;
  endTimeMinutes?: number;
}) {
  return {
    id: "template_1",
    displayTitle: "Muay Thai Fundamentals",
    weekday: args?.weekday ?? ("TUESDAY" as const),
    startTimeMinutes: args?.startTimeMinutes ?? 18 * 60,
    endTimeMinutes: args?.endTimeMinutes ?? 19 * 60,
    bookingCutoffMinutes: args?.bookingCutoffMinutes ?? 0,
    capacityOverride: null,
    roomCapacity: null,
    programName: "Muay Thai",
    roomName: "Main Mat",
    coachDisplayName: "Casey Coach",
  };
}

function buildTemplateRecord(args?: {
  bookingCutoffMinutes?: number;
  capacityOverride?: number | null;
  roomCapacity?: number | null;
}) {
  return {
    id: "template_1",
    title: null,
    weekday: "TUESDAY" as const,
    startTimeMinutes: 18 * 60,
    endTimeMinutes: 19 * 60,
    bookingCutoffMinutes: args?.bookingCutoffMinutes ?? 0,
    capacityOverride: args?.capacityOverride ?? null,
    program: {
      name: "Muay Thai Fundamentals",
    },
    room: {
      name: "Main Mat",
      capacity: args?.roomCapacity ?? null,
    },
    coachWorkspaceUser: {
      user: {
        fullName: "Casey Coach",
        email: "coach@example.com",
      },
    },
  };
}

function createMockDb(): TrialBookingTestDb {
  const db = {
    workspaceSchedulingPolicyRevision: { findFirst: vi.fn().mockResolvedValue(fixtureSchedulingRevision()) },
    workspace: {
      findFirst: vi.fn().mockResolvedValue({
        id: "workspace_1",
        name: "Flowstate Gym",
        status: "ACTIVE",
        location: {
          id: "location_1",
          timezone: "America/Vancouver",
        },
      }),
    },
    classTemplate: {
      findMany: vi.fn().mockResolvedValue([buildTemplateRecord()]),
    },
  };
  return db;
}

describe("trial booking date helpers", () => {
  it.each([
    {
      boundary: "immediately before",
      now: "2026-04-07T23:59:59.999Z",
      expectedFirstDate: "2026-04-07",
    },
    {
      boundary: "at",
      now: "2026-04-08T00:00:00.000Z",
      expectedFirstDate: "2026-04-14",
    },
    {
      boundary: "immediately after",
      now: "2026-04-08T00:00:00.001Z",
      expectedFirstDate: "2026-04-14",
    },
  ])(
    "$boundary the workspace-local booking cutoff offers the correct first occurrence",
    ({ now, expectedFirstDate }) => {
      const result = buildTrialBookingDateOptions({
        templates: [
          buildTemplateForDates({
            bookingCutoffMinutes: 60,
          }),
        ],
        timezone: "America/Vancouver",
        now: new Date(now),
      });

      expect(result[0]?.dateOptions[0]?.scheduledForDate).toBe(
        expectedFirstDate,
      );
      expect(result[0]?.dateOptions).toHaveLength(4);
    },
  );

  it("generates the next 4 upcoming dates for a template", () => {
    const result = buildTrialBookingDateOptions({
      templates: [buildTemplateForDates()],
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:30:00.000Z"),
    });

    expect(
      result[0]?.dateOptions.map((option) => option.scheduledForDate),
    ).toEqual(["2026-04-07", "2026-04-14", "2026-04-21", "2026-04-28"]);
  });

  it("uses the workspace-local date for today/future options", () => {
    const result = buildTrialBookingDateOptions({
      templates: [buildTemplateForDates()],
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:45:00.000Z"),
    });

    expect(result[0]?.dateOptions[0]?.scheduledForDate).toBe("2026-04-07");
  });

  it.each([
    {
      boundary: "immediately before",
      now: "2026-03-08T08:59:59.999Z",
      expectedFirstDate: "2026-03-08",
    },
    {
      boundary: "at",
      now: "2026-03-08T09:00:00.000Z",
      expectedFirstDate: "2026-03-15",
    },
  ])(
    "$boundary the cutoff remains correct across Vancouver's daylight-saving boundary",
    ({ now, expectedFirstDate }) => {
      const result = buildTrialBookingDateOptions({
        templates: [
          buildTemplateForDates({
            weekday: "SUNDAY",
            startTimeMinutes: 3 * 60,
            endTimeMinutes: 4 * 60,
            bookingCutoffMinutes: 60,
          }),
        ],
        timezone: "America/Vancouver",
        now: new Date(now),
      });

      expect(result[0]?.dateOptions[0]?.scheduledForDate).toBe(
        expectedFirstDate,
      );
    },
  );

  it("validates selected dates against generated options", () => {
    const options = buildTrialBookingDateOptions({
      templates: [buildTemplateForDates()],
      timezone: "America/Vancouver",
      now: new Date("2026-04-08T00:30:00.000Z"),
    });

    expect(
      findTrialBookingDateOption({
        options,
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-14",
      }),
    ).toMatchObject({
      template: {
        id: "template_1",
      },
      dateOption: {
        scheduledForDate: "2026-04-14",
      },
    });
    expect(
      findTrialBookingDateOption({
        options,
        classTemplateId: "template_1",
        scheduledForDate: "2026-04-15",
      }),
    ).toBeNull();
  });
});

describe("trial booking helpers", () => {
  it("offers no public trial dates until class rules are confirmed", async () => {
    const db = createMockDb(); db.workspaceSchedulingPolicyRevision!.findFirst = vi.fn().mockResolvedValue(null);
    expect(await listTrialBookingOptions({ workspaceId: "workspace_1", db, now: new Date("2026-04-01T12:00:00Z") })).toMatchObject({ status: "no-eligible-dates" });
  });

  it("uses the published gym's locale for trial labels without changing trial dates", async () => {
    const db = createMockDb();
    const args = {
      workspaceId: "workspace_1",
      db,
      now: new Date("2026-04-07T16:00:00Z"),
    };
    const baseline = await listTrialBookingOptions(args);
    db.workspace.findFirst = vi
      .fn()
      .mockResolvedValue({
        id: "workspace_1",
        name: "Fictional gym",
        status: "ACTIVE",
        settings: { locale: "de-DE" },
        location: { id: "location_1", timezone: "America/Vancouver" },
      });
    const localized = await listTrialBookingOptions(args);
    if (baseline?.status !== "available" || localized?.status !== "available")
      throw new Error("Expected eligible trial dates");
    expect(localized.templates[0]?.dateOptions[0]?.label).toContain(
      "Dienstag, 07.04.2026 at 18:00",
    );
    expect(
      localized.templates[0]?.dateOptions.map(
        ({ scheduledForDate, classTemplateId }) => ({
          scheduledForDate,
          classTemplateId,
        }),
      ),
    ).toEqual(
      baseline.templates[0]?.dateOptions.map(
        ({ scheduledForDate, classTemplateId }) => ({
          scheduledForDate,
          classTemplateId,
        }),
      ),
    );
  });
  it("uses the dated coach, time and capacity rather than the recurring defaults", async () => {
    const db = createMockDb();
    const original = buildTemplateRecord();
    db.classTemplate.findMany = vi.fn().mockResolvedValue([
      {
        ...original,
        classInstances: [
          {
            ...original,
            id: "dated",
            scheduledForDate: new Date("2026-04-07T00:00:00Z"),
            status: "ACTIVE",
            isScheduleOverride: true,
            coachAssignmentMode: "ASSIGNED",
            coachWorkspaceUserId: "substitute",
            coachWorkspaceUser: {
              user: {
                fullName: "Substitute Coach",
                email: "sub@example.test",
              },
            },
            startTimeMinutes: 19 * 60,
            endTimeMinutes: 20 * 60,
            capacityOverride: 5,
          },
        ],
      },
    ]);
    const options = await listTrialBookingOptions({
      workspaceId: "workspace_1",
      db,
      now: new Date("2026-04-07T16:00:00Z"),
    });
    expect(options?.status).toBe("available");
    if (options?.status !== "available") throw new Error("Expected dates");
    const selected = findTrialBookingDateOption({
      options: options.templates,
      classTemplateId: "template_1",
      scheduledForDate: "2026-04-07",
    });
    expect(selected?.template).toMatchObject({
      startTimeMinutes: 19 * 60,
      capacityOverride: 5,
      coachDisplayName: "Substitute Coach",
    });
    expect(
      options.templates[0]?.dateOptions[1]?.details?.coachDisplayName,
    ).toBe("Casey Coach");
  });

  it("excludes an inactive effective room", async () => {
    const db = createMockDb();
    const original = buildTemplateRecord();
    db.classTemplate.findMany = vi
      .fn()
      .mockResolvedValue([
        { ...original, room: { ...original.room, isActive: false } },
      ]);
    const options = await listTrialBookingOptions({
      workspaceId: "workspace_1",
      db,
      now: new Date("2026-04-07T16:00:00Z"),
    });
    expect(options?.status).toBe("no-eligible-dates");
  });
  it("lists eligible trial booking options from active templates", async () => {
    const db = createMockDb();

    const result = await listTrialBookingOptions({
      workspaceId: "workspace_1",
      now: new Date("2026-04-08T00:30:00.000Z"),
      db,
    });

    expect(db.classTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace_1",
          archivedAt: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      status: "available",
    });
    expect(
      result?.status === "available" ? result.templates[0] : null,
    ).toMatchObject({
      id: "template_1",
      displayTitle: "Muay Thai Fundamentals",
      dateOptions: expect.arrayContaining([
        expect.objectContaining({
          scheduledForDate: "2026-04-07",
        }),
      ]),
    });
  });

  it("projects active templates with zero eligible dates as an explicit unavailable state", async () => {
    const db = createMockDb();
    db.classTemplate.findMany = vi
      .fn()
      .mockResolvedValue([
        buildTemplateRecord({ bookingCutoffMinutes: 43 * 24 * 60 }),
      ]);

    const result = await listTrialBookingOptions({
      workspaceId: "workspace_1",
      now: new Date("2026-04-08T00:30:00.000Z"),
      db,
    });

    expect(result).toEqual({
      status: "no-eligible-dates",
      workspaceId: "workspace_1",
      workspaceName: "Flowstate Gym",
      timezone: "America/Vancouver",
      activeTemplateCount: 1,
    });
  });
});
