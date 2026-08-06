import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInitialMigrationData,
  classifyMigrationSchedule,
  getMigrationDashboard,
  getOwnerReviewPresentation,
  isWorkspaceMigrationReady,
  markMigrationOperationallyReady,
  projectOwnerMigrationResults,
  runMigrationImport,
  uploadAndStageMigrationCsv,
} from "./workspace-migration";

type UploadDb = NonNullable<
  Parameters<typeof uploadAndStageMigrationCsv>[0]["db"]
>;
type DashboardDb = NonNullable<
  Parameters<typeof getMigrationDashboard>[0]["db"]
>;
type ImportDb = NonNullable<Parameters<typeof runMigrationImport>[0]["db"]>;

function csvBytes(content: string): Uint8Array {
  return new Uint8Array(Buffer.from(content, "utf-8"));
}

describe("workspace migration helpers", () => {
  beforeEach(() => {
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "corrections@example.test",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sanitizes initial intake and keeps new workspaces pre-operational", () => {
    expect(
      buildInitialMigrationData({
        currentSoftware: "  Zen Planner  ",
        targetGoLiveDate: "2026-06-15",
        memberCountEstimate: "125",
        dataScope: ["Members and contact details", "Not supported"],
      }),
    ).toMatchObject({
      currentSoftware: "Zen Planner",
      targetGoLiveDate: new Date("2026-06-15T00:00:00.000Z"),
      memberCountEstimate: 125,
      dataScope: ["Members and contact details"],
      stage: "INTAKE_RECEIVED",
    });

    expect(
      isWorkspaceMigrationReady({
        workspaceStatus: "SETUP_INCOMPLETE",
        migrationStage: "INTAKE_RECEIVED",
        ownerReviewAcknowledgedAt: null,
        ownerReviewAcknowledgedByUserId: null,
        operationallyReadyAt: null,
        operationallyReadyByUserId: null,
      }),
    ).toBe(false);
  });

  it.each([
    ["inactive workspace", { workspaceStatus: "SETUP_INCOMPLETE" }],
    ["incomplete stage", { migrationStage: "GO_LIVE_SCHEDULED" }],
    ["missing owner review time", { ownerReviewAcknowledgedAt: null }],
    ["missing owner review actor", { ownerReviewAcknowledgedByUserId: null }],
    ["blank owner review actor", { ownerReviewAcknowledgedByUserId: "   " }],
    ["missing readiness time", { operationallyReadyAt: null }],
    ["missing readiness actor", { operationallyReadyByUserId: null }],
    ["blank readiness actor", { operationallyReadyByUserId: "   " }],
  ])("fails closed for %s", (_label, override) => {
    expect(
      isWorkspaceMigrationReady({
        workspaceStatus: "ACTIVE",
        migrationStage: "COMPLETE",
        ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
        ownerReviewAcknowledgedByUserId: "owner_1",
        operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
        operationallyReadyByUserId: "flowstate_operator_1",
        ...override,
      }),
    ).toBe(false);
  });

  it("requires one coherent completed migration tuple for normal operations", () => {
    expect(
      isWorkspaceMigrationReady({
        workspaceStatus: "ACTIVE",
        migrationStage: "COMPLETE",
        ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
        ownerReviewAcknowledgedByUserId: "owner_1",
        operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
        operationallyReadyByUserId: "flowstate_operator_1",
      }),
    ).toBe(true);
  });

  it("aggregates completed migration reports into owner-safe result totals", () => {
    expect(
      projectOwnerMigrationResults({
        migrationStage: "REVIEW_READY",
        attempts: [
          {
            status: "COMPLETED",
            reconciliationReports: [
              { summary: { created: 2, updated: 1, skipped: 3 } },
            ],
          },
          {
            status: "COMPLETED",
            reconciliationReports: [
              {
                summary: {
                  created: 4,
                  updated: 5,
                  skipped: 6,
                  recordKind: "MEMBER",
                },
              },
            ],
          },
        ],
      }),
    ).toEqual({
      status: "ready",
      recordsAdded: 6,
      recordsUpdated: 6,
      recordsNotImported: 9,
      earlierIncompleteAttemptCount: 0,
    });
  });

  it("excludes failed and cancelled attempts from totals and collapses their count", () => {
    expect(
      projectOwnerMigrationResults({
        migrationStage: "GO_LIVE_SCHEDULED",
        attempts: [
          {
            status: "COMPLETED",
            reconciliationReports: [
              { summary: { created: 1, updated: 2, skipped: 3 } },
            ],
          },
          {
            status: "FAILED",
            reconciliationReports: [
              { summary: { created: 100, updated: 100, skipped: 100 } },
            ],
          },
          {
            status: "CANCELLED",
            reconciliationReports: [
              { summary: { created: 200, updated: 200, skipped: 200 } },
            ],
          },
        ],
      }),
    ).toEqual({
      status: "ready",
      recordsAdded: 1,
      recordsUpdated: 2,
      recordsNotImported: 3,
      earlierIncompleteAttemptCount: 2,
    });
  });

  it.each([
    ["negative", { created: -1, updated: 0, skipped: 0 }],
    ["fractional", { created: 0, updated: 0.5, skipped: 0 }],
    ["string", { created: 0, updated: 0, skipped: "1" }],
    ["missing", { created: 0, updated: 0 }],
    ["null", null],
    ["array", [0, 0, 0]],
    [
      "unsafe integer",
      { created: Number.MAX_SAFE_INTEGER + 1, updated: 0, skipped: 0 },
    ],
  ])(
    "fails owner results closed for a %s completed report",
    (_label, summary) => {
      expect(
        projectOwnerMigrationResults({
          migrationStage: "REVIEW_READY",
          attempts: [
            {
              status: "COMPLETED",
              reconciliationReports: [{ summary }],
            },
          ],
        }),
      ).toEqual({ status: "needs-flowstate-review" });
    },
  );

  it("fails owner results closed when valid report totals overflow", () => {
    expect(
      projectOwnerMigrationResults({
        migrationStage: "REVIEW_READY",
        attempts: [
          {
            status: "COMPLETED",
            reconciliationReports: [
              {
                summary: {
                  created: Number.MAX_SAFE_INTEGER,
                  updated: 0,
                  skipped: 0,
                },
              },
            ],
          },
          {
            status: "COMPLETED",
            reconciliationReports: [
              { summary: { created: 1, updated: 0, skipped: 0 } },
            ],
          },
        ],
      }),
    ).toEqual({ status: "needs-flowstate-review" });
  });

  it.each([
    ["no attempts", []],
    [
      "a completed attempt without a report",
      [{ status: "COMPLETED" as const, reconciliationReports: [] }],
    ],
  ])(
    "reports no recorded results for a completed handoff with %s",
    (_label, attempts) => {
      expect(
        projectOwnerMigrationResults({
          migrationStage: "COMPLETE",
          attempts,
        }),
      ).toEqual({ status: "no-results-recorded" });
    },
  );

  it("keeps a current unresolved attempt in progress before evaluating history", () => {
    expect(
      projectOwnerMigrationResults({
        migrationStage: "REVIEW_READY",
        attempts: [
          {
            status: "COMPLETED",
            reconciliationReports: [
              { summary: { created: -1, updated: 0, skipped: 0 } },
            ],
          },
          {
            status: "IMPORTING",
            reconciliationReports: [],
          },
          {
            status: "FAILED",
            reconciliationReports: [],
          },
        ],
      }),
    ).toEqual({ status: "results-in-progress" });
  });

  it("fails completed reports closed when no reviewed migration snapshot exists", () => {
    expect(
      projectOwnerMigrationResults({
        migrationStage: null,
        attempts: [
          {
            status: "COMPLETED",
            reconciliationReports: [
              { summary: { created: 1, updated: 0, skipped: 0 } },
            ],
          },
        ],
      }),
    ).toEqual({ status: "needs-flowstate-review" });
  });

  it.each([
    {
      timezone: "America/Los_Angeles",
      scheduledFor: new Date("2026-11-01T00:00:00.000Z"),
      beforeMidnight: new Date("2026-11-02T07:59:59.999Z"),
      afterMidnight: new Date("2026-11-02T08:00:00.000Z"),
    },
    {
      timezone: "Pacific/Auckland",
      scheduledFor: new Date("2026-09-27T00:00:00.000Z"),
      beforeMidnight: new Date("2026-09-27T10:59:59.999Z"),
      afterMidnight: new Date("2026-09-27T11:00:00.000Z"),
    },
  ])(
    "keeps a date-only schedule current for its full local DST day in $timezone",
    ({ timezone, scheduledFor, beforeMidnight, afterMidnight }) => {
      expect(
        classifyMigrationSchedule({
          goLiveScheduledFor: scheduledFor,
          launchTimezone: timezone,
          now: beforeMidnight,
        }),
      ).toMatchObject({ status: "current" });
      expect(
        classifyMigrationSchedule({
          goLiveScheduledFor: scheduledFor,
          launchTimezone: timezone,
          now: afterMidnight,
        }),
      ).toEqual({ status: "invalid", reason: "schedule-passed" });
    },
  );

  it("offers owner acknowledgment only after go-live is scheduled and checks are clear", () => {
    expect(
      getOwnerReviewPresentation({
        migration: {
          stage: "GO_LIVE_SCHEDULED",
          workspaceStatus: "SETUP_INCOMPLETE",
          goLiveScheduledFor: new Date("2026-07-27T00:00:00.000Z"),
          launchTimezone: "America/Los_Angeles",
          ownerReviewAcknowledgedAt: null,
          ownerReviewAcknowledgedByUserId: null,
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
        },
        now: new Date("2026-07-28T06:59:59.999Z"),
        blockingValidationIssueCount: 0,
        unresolvedJobCount: 0,
      }),
    ).toEqual({ status: "eligible" });
  });

  it("presents migration blockers instead of a guaranteed failing action", () => {
    expect(
      getOwnerReviewPresentation({
        migration: {
          stage: "GO_LIVE_SCHEDULED",
          workspaceStatus: "SETUP_INCOMPLETE",
          goLiveScheduledFor: new Date("2026-07-27T00:00:00.000Z"),
          launchTimezone: "America/Los_Angeles",
          ownerReviewAcknowledgedAt: null,
          ownerReviewAcknowledgedByUserId: null,
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
        },
        now: new Date("2026-07-28T06:59:59.999Z"),
        blockingValidationIssueCount: 2,
        unresolvedJobCount: 1,
      }),
    ).toEqual({
      status: "blocked",
      blockingValidationIssueCount: 2,
      unresolvedJobCount: 1,
    });
  });

  it.each([
    {
      label: "missing schedule",
      goLiveScheduledFor: null,
      launchTimezone: "America/Los_Angeles",
      reason: "schedule-missing",
    },
    {
      label: "invalid launch timezone",
      goLiveScheduledFor: new Date("2026-07-27T00:00:00.000Z"),
      launchTimezone: "Not/A_Timezone",
      reason: "launch-timezone-invalid",
    },
    {
      label: "passed schedule",
      goLiveScheduledFor: new Date("2026-07-26T00:00:00.000Z"),
      launchTimezone: "America/Los_Angeles",
      reason: "schedule-passed",
    },
  ])(
    "fails owner acknowledgment presentation closed for $label",
    (scenario) => {
      expect(
        getOwnerReviewPresentation({
          migration: {
            stage: "GO_LIVE_SCHEDULED",
            workspaceStatus: "SETUP_INCOMPLETE",
            goLiveScheduledFor: scenario.goLiveScheduledFor,
            launchTimezone: scenario.launchTimezone,
            ownerReviewAcknowledgedAt: null,
            ownerReviewAcknowledgedByUserId: null,
            operationallyReadyAt: null,
            operationallyReadyByUserId: null,
          },
          now: new Date("2026-07-28T06:59:59.999Z"),
          blockingValidationIssueCount: 0,
          unresolvedJobCount: 0,
        }),
      ).toEqual({ status: "unavailable", reason: scenario.reason });
    },
  );

  it("keeps acknowledgment unavailable before Flowstate schedules go-live", () => {
    expect(
      getOwnerReviewPresentation({
        migration: {
          stage: "REVIEW_READY",
          workspaceStatus: "SETUP_INCOMPLETE",
          ownerReviewAcknowledgedAt: null,
          ownerReviewAcknowledgedByUserId: null,
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
        },
        blockingValidationIssueCount: 0,
        unresolvedJobCount: 0,
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("shows the locked acknowledged state before activation", () => {
    expect(
      getOwnerReviewPresentation({
        migration: {
          stage: "GO_LIVE_SCHEDULED",
          workspaceStatus: "SETUP_INCOMPLETE",
          goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
          launchTimezone: "America/Los_Angeles",
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
        },
        now: new Date("2026-07-29T12:00:00.000Z"),
        blockingValidationIssueCount: 0,
        unresolvedJobCount: 0,
      }),
    ).toEqual({ status: "acknowledged" });
  });

  it("keeps the locked acknowledged state visible after activation", () => {
    expect(
      getOwnerReviewPresentation({
        migration: {
          stage: "COMPLETE",
          workspaceStatus: "ACTIVE",
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: new Date("2026-07-25T00:05:00.000Z"),
          operationallyReadyByUserId: "flowstate_operator_1",
        },
        blockingValidationIssueCount: 0,
        unresolvedJobCount: 0,
      }),
    ).toEqual({ status: "acknowledged" });
  });

  it("fails closed for incomplete completed migration tuples", () => {
    expect(
      getOwnerReviewPresentation({
        migration: {
          stage: "COMPLETE",
          workspaceStatus: "ACTIVE",
          ownerReviewAcknowledgedAt: null,
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: new Date("2026-07-25T00:05:00.000Z"),
          operationallyReadyByUserId: "flowstate_operator_1",
        },
        blockingValidationIssueCount: 0,
        unresolvedJobCount: 0,
      }),
    ).toEqual({ status: "unavailable" });

    expect(
      getOwnerReviewPresentation({
        migration: {
          stage: "COMPLETE",
          workspaceStatus: "ACTIVE",
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: new Date("2026-07-25T00:05:00.000Z"),
          operationallyReadyByUserId: "   ",
        },
        blockingValidationIssueCount: 0,
        unresolvedJobCount: 0,
      }),
    ).toEqual({ status: "unavailable" });
  });

  it("queries every migration attempt so owner totals are not truncated by the job preview", async () => {
    const attempts = Array.from({ length: 9 }, (_, index) => ({
      id: `job_${index + 1}`,
      status: "COMPLETED" as const,
      sourceFiles: [],
      validationIssues: [],
      stagingRecords: [],
      reconciliationReports: [
        { summary: { created: 1, updated: 0, skipped: 0 } },
      ],
    }));
    const db = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "REVIEW_READY",
          goLiveScheduledFor: null,
          ownerReviewAcknowledgedAt: null,
          ownerReviewAcknowledgedByUserId: null,
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: {
            status: "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
      },
      importJob: {
        findMany: vi.fn((query: { select?: unknown }) =>
          Promise.resolve(query.select ? attempts : attempts.slice(0, 8)),
        ),
        count: vi.fn().mockResolvedValue(0),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
      },
    };

    const dashboard = await getMigrationDashboard({
      workspaceId: "workspace_1",
      db: db as unknown as DashboardDb,
    });

    expect(dashboard.migrationResults).toEqual({
      status: "ready",
      recordsAdded: 9,
      recordsUpdated: 0,
      recordsNotImported: 0,
      earlierIncompleteAttemptCount: 0,
    });
    expect(dashboard.importJobs).toHaveLength(8);
    expect(db.importJob.findMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace_1" },
      select: {
        status: true,
        reconciliationReports: {
          select: { summary: true },
          orderBy: { generatedAt: "desc" },
          take: 1,
        },
      },
    });
  });

  it("projects the canonical completed demo evidence into the exact owner-safe shape", async () => {
    const canonicalAttempt = {
      id: "canonical_demo_job",
      status: "COMPLETED" as const,
      sourceFiles: [],
      validationIssues: [],
      stagingRecords: [],
      reconciliationReports: [
        {
          summary: {
            created: 1,
            updated: 0,
            skipped: 0,
            recordKind: "MEMBER",
          },
        },
      ],
    };
    const db = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "COMPLETE",
          goLiveScheduledFor: new Date("2026-05-30T00:00:00.000Z"),
          ownerReviewAcknowledgedAt: new Date("2026-05-30T12:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "demo-user-owner",
          operationallyReadyAt: new Date("2026-05-30T12:05:00.000Z"),
          operationallyReadyByUserId: "demo-flowstate-operator",
          workspace: {
            status: "ACTIVE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
      },
      importJob: {
        findMany: vi.fn().mockResolvedValue([canonicalAttempt]),
        count: vi.fn().mockResolvedValue(0),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
      },
    };

    const dashboard = await getMigrationDashboard({
      workspaceId: "demo-workspace",
      db: db as unknown as DashboardDb,
    });

    expect(dashboard.migrationResults).toEqual({
      status: "ready",
      recordsAdded: 1,
      recordsUpdated: 0,
      recordsNotImported: 0,
      earlierIncompleteAttemptCount: 0,
    });
    expect(Object.keys(dashboard.migrationResults).sort()).toEqual([
      "earlierIncompleteAttemptCount",
      "recordsAdded",
      "recordsNotImported",
      "recordsUpdated",
      "status",
    ]);
  });

  it.each([
    {
      label: "excluded failed and cancelled history",
      stage: "REVIEW_READY" as const,
      attempts: [
        {
          status: "COMPLETED" as const,
          reconciliationReports: [
            { summary: { created: 1, updated: 2, skipped: 3 } },
          ],
        },
        { status: "FAILED" as const, reconciliationReports: [] },
        { status: "CANCELLED" as const, reconciliationReports: [] },
      ],
      expected: {
        status: "ready",
        recordsAdded: 1,
        recordsUpdated: 2,
        recordsNotImported: 3,
        earlierIncompleteAttemptCount: 2,
      },
    },
    {
      label: "a malformed completed report",
      stage: "REVIEW_READY" as const,
      attempts: [
        {
          status: "COMPLETED" as const,
          reconciliationReports: [
            { summary: { created: 1, updated: -1, skipped: 0 } },
          ],
        },
      ],
      expected: { status: "needs-flowstate-review" },
    },
    {
      label: "a completed handoff without a recorded report",
      stage: "COMPLETE" as const,
      attempts: [{ status: "COMPLETED" as const, reconciliationReports: [] }],
      expected: { status: "no-results-recorded" },
    },
    {
      label: "a current unresolved attempt before malformed history",
      stage: "REVIEW_READY" as const,
      attempts: [
        {
          status: "COMPLETED" as const,
          reconciliationReports: [
            { summary: { created: -1, updated: 0, skipped: 0 } },
          ],
        },
        { status: "IMPORTING" as const, reconciliationReports: [] },
      ],
      expected: { status: "results-in-progress" },
    },
  ])("projects $label through the dashboard query", async (scenario) => {
    const previewAttempts = scenario.attempts.map((attempt, index) => ({
      id: `job_${index + 1}`,
      ...attempt,
      sourceFiles: [],
      validationIssues: [],
      stagingRecords: [],
    }));
    const isComplete = scenario.stage === "COMPLETE";
    const db = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: scenario.stage,
          goLiveScheduledFor: null,
          ownerReviewAcknowledgedAt: isComplete
            ? new Date("2026-05-30T12:00:00.000Z")
            : null,
          ownerReviewAcknowledgedByUserId: isComplete ? "owner_1" : null,
          operationallyReadyAt: isComplete
            ? new Date("2026-05-30T12:05:00.000Z")
            : null,
          operationallyReadyByUserId: isComplete ? "operator_1" : null,
          workspace: {
            status: isComplete ? "ACTIVE" : "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
      },
      importJob: {
        findMany: vi.fn((query: { select?: unknown }) =>
          Promise.resolve(query.select ? scenario.attempts : previewAttempts),
        ),
        count: vi.fn().mockResolvedValue(0),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
      },
    };

    const dashboard = await getMigrationDashboard({
      workspaceId: "workspace_1",
      db: db as unknown as DashboardDb,
    });

    expect(dashboard.migrationResults).toEqual(scenario.expected);
  });

  it("reports exact mixed-severity totals while keeping the issue preview bounded and deterministic", async () => {
    const createdAt = new Date("2026-07-26T12:00:00.000Z");
    const issues = [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `error_${index + 1}`,
        severity: "ERROR" as const,
        message: `Error ${index + 1}`,
        createdAt,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `warning_${index + 1}`,
        severity: "WARNING" as const,
        message: `Warning ${index + 1}`,
        createdAt,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `info_${index + 1}`,
        severity: "INFO" as const,
        message: `Info ${index + 1}`,
        createdAt,
      })),
    ];
    const preview = issues.slice(0, 10);
    const db = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      importJob: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "job_1",
            sourceFiles: [],
            validationIssues: preview,
            stagingRecords: [],
            reconciliationReports: [],
          },
        ]),
        count: vi.fn().mockResolvedValue(0),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([
          {
            importJobId: "job_1",
            severity: "ERROR",
            _count: { _all: 5 },
          },
          {
            importJobId: "job_1",
            severity: "WARNING",
            _count: { _all: 4 },
          },
          {
            importJobId: "job_1",
            severity: "INFO",
            _count: { _all: 4 },
          },
        ]),
      },
    };

    const dashboard = await getMigrationDashboard({
      workspaceId: "workspace_1",
      db: db as unknown as DashboardDb,
    });
    const [job] = dashboard.importJobs;

    expect(job?.issueCounts).toEqual({
      INFO: 4,
      WARNING: 4,
      ERROR: 5,
    });
    expect(job?.validationIssues).toHaveLength(10);
    expect(job?.validationIssues.map((issue) => issue.id)).toEqual(
      preview.map((issue) => issue.id),
    );
    expect(db.importJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          validationIssues: {
            orderBy: [
              { severity: "desc" },
              { createdAt: "desc" },
              { id: "asc" },
            ],
            take: 10,
          },
        }),
      }),
    );
    expect(db.validationIssue.groupBy).toHaveBeenCalledWith({
      by: ["importJobId", "severity"],
      where: {
        workspaceId: "workspace_1",
        importJobId: { in: ["job_1"] },
      },
      _count: { _all: true },
    });
  });

  it("stores uploaded member CSV content and stages ready core import rows", async () => {
    const tx = {
      importJob: {
        create: vi.fn().mockResolvedValue({
          id: "job_1",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      importSourceFile: {
        create: vi.fn().mockResolvedValue({
          id: "source_1",
        }),
      },
      stagingRecord: {
        create: vi.fn().mockResolvedValue({
          id: "staging_1",
        }),
      },
      validationIssue: {
        create: vi.fn().mockResolvedValue({}),
      },
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "MIGRATION_IN_PROGRESS",
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const csv =
      "id,name,email,parent_name\nm_1,Ada Lovelace,ada@example.com,Ann Parent\n";

    const result = await uploadAndStageMigrationCsv({
      workspaceId: "workspace_1",
      actor: {
        type: "FLOWSTATE_OPERATOR",
        actorId: "operator_1",
      },
      input: {
        recordKind: "MEMBER",
        fileName: "members.csv",
        mimeType: "text/csv",
        fileSizeBytes: csv.length,
        fileData: csvBytes(csv),
      },
      db: db as unknown as UploadDb,
    });

    expect(result).toEqual({
      status: "ok",
      message: "Staged 1 row with 0 blocking issues.",
    });
    expect(tx.importSourceFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rawContent: csv,
        fileName: "members.csv",
      }),
      select: {
        id: true,
      },
    });
    expect(tx.stagingRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordKind: "MEMBER",
        sourceRowNumber: 2,
        externalId: "m_1",
        isReadyForImport: true,
        mappedData: expect.objectContaining({
          fullName: "Ada Lovelace",
          guardianFullName: "Ann Parent",
        }),
      }),
      select: {
        id: true,
      },
    });
    expect(tx.validationIssue.create).not.toHaveBeenCalled();
    expect(tx.workspaceMigration.update).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
      },
      data: expect.objectContaining({
        stage: "MIGRATION_IN_PROGRESS",
      }),
    });
  });

  it("keeps historical records staged for review instead of production import", async () => {
    const db = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "MIGRATION_IN_PROGRESS",
          ownerReviewAcknowledgedAt: null,
        }),
      },
      importJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: "job_1",
          status: "VALIDATED",
          validationIssues: [],
          stagingRecords: [
            {
              id: "staging_1",
              recordKind: "BILLING_HISTORY",
              externalId: "bill_1",
              mappedData: {},
            },
          ],
        }),
      },
    };

    await expect(
      runMigrationImport({
        workspaceId: "workspace_1",
        locationId: "location_1",
        importJobId: "job_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        db: Object.assign(db, {
          $transaction: vi.fn((callback) => callback(db)),
        }) as unknown as ImportDb,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "This import job is staged for review only.",
    });
  });

  it("rolls back earlier imported rows when a later row fails", async () => {
    const initialState = {
      job: {
        status: "VALIDATED",
        startedAt: null as Date | null,
        completedAt: null as Date | null,
        failedAt: null as Date | null,
        failureMessage: null as string | null,
      },
      migrationStage: "MIGRATION_IN_PROGRESS",
      members: [] as string[],
      identities: [] as string[],
      importedStagingRecords: [] as string[],
      reconciliationReports: 0,
    };
    const state = structuredClone(initialState);
    let memberCreateCount = 0;
    const stagingRecords = [
      {
        id: "staging_1",
        recordKind: "MEMBER" as const,
        sourceRowNumber: 2,
        externalId: "member_1",
        mappedData: { fullName: "First Member" },
      },
      {
        id: "staging_2",
        recordKind: "MEMBER" as const,
        sourceRowNumber: 3,
        externalId: "member_2",
        mappedData: { fullName: "Second Member" },
      },
    ];
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "MIGRATION_IN_PROGRESS",
          ownerReviewAcknowledgedAt: null,
        }),
        update: vi.fn(async ({ data }) => {
          state.migrationStage = data.stage;
          return {};
        }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: "location_1" }),
      },
      importJob: {
        findFirst: vi.fn(async () => ({
          id: "job_1",
          status: state.job.status,
          validationIssues: [],
          stagingRecords,
        })),
        updateMany: vi.fn(async () => {
          if (state.job.status !== "VALIDATED") {
            return { count: 0 };
          }

          state.job.status = "IMPORTING";
          state.job.startedAt = new Date("2026-07-27T00:00:00.000Z");
          return { count: 1 };
        }),
        update: vi.fn(async ({ data }) => {
          Object.assign(state.job, data);
          return {};
        }),
      },
      migrationImportedRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(async ({ create }) => {
          state.identities.push(create.externalId);
          return {};
        }),
      },
      member: {
        create: vi.fn(async ({ data }) => {
          memberCreateCount += 1;

          if (memberCreateCount === 2) {
            throw new Error("injected second-row failure");
          }

          state.members.push(data.fullName);
          return { id: "imported_member_1" };
        }),
        updateMany: vi.fn(),
      },
      stagingRecord: {
        update: vi.fn(async ({ where }) => {
          state.importedStagingRecords.push(where.id);
          return {};
        }),
      },
      reconciliationReport: {
        create: vi.fn(async () => {
          state.reconciliationReports += 1;
          return {};
        }),
      },
    };
    const db = Object.assign(tx, {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => {
        const before = structuredClone(state);

        try {
          return await callback(tx);
        } catch (error) {
          Object.assign(state, before);
          throw error;
        }
      }),
    });

    await expect(
      runMigrationImport({
        workspaceId: "workspace_1",
        locationId: "location_1",
        importJobId: "job_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        db: db as unknown as ImportDb,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "The import failed. Check the source data and retry.",
    });

    expect(state).toEqual(initialState);
  });

  it("rejects a migration location owned by another workspace before claiming the job", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "MIGRATION_IN_PROGRESS",
          ownerReviewAcknowledgedAt: null,
        }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      importJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: "job_1",
          status: "VALIDATED",
          validationIssues: [],
          stagingRecords: [
            {
              id: "staging_1",
              recordKind: "SCHEDULE_TEMPLATE",
              sourceRowNumber: 2,
              externalId: "schedule_1",
              mappedData: {
                programName: "Muay Thai",
                roomName: "Main Mat",
                weekday: "MONDAY",
              },
            },
          ],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const db = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      runMigrationImport({
        workspaceId: "workspace_1",
        locationId: "location_from_workspace_2",
        importJobId: "job_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        db: db as unknown as ImportDb,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "The selected migration location does not belong to this workspace.",
    });

    expect(tx.location.findFirst).toHaveBeenCalledWith({
      where: {
        id: "location_from_workspace_2",
        workspaceId: "workspace_1",
      },
      select: { id: true },
    });
    expect(tx.importJob.updateMany).not.toHaveBeenCalled();
  });

  it("rejects workspace owners without starting a readiness transaction", async () => {
    const db = {
      $transaction: vi.fn(),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "WORKSPACE_USER",
          actorId: "owner_1",
          role: "OWNER",
        },
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Only an authorized Flowstate operator can activate daily operations.",
    });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an operator capability without an audit identity", async () => {
    const db = {
      $transaction: vi.fn(),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "   ",
        },
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "The Flowstate operator audit identity is required.",
    });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses activation before writes when the correction channel is invalid", async () => {
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "one@example.test;two@example.test",
    );
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: {
            status: "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
        updateMany: vi.fn(),
      },
      workspace: { updateMany: vi.fn() },
      validationIssue: { count: vi.fn() },
      importJob: { count: vi.fn() },
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: { type: "FLOWSTATE_OPERATOR", actorId: "operator_1" },
        db: { $transaction: vi.fn((callback) => callback(tx)) } as never,
      }),
    ).resolves.toEqual({
      status: "error",
      reason: "correction-channel-unavailable",
      message:
        "The migration correction channel is unavailable. Activation was not recorded.",
    });

    expect(tx.validationIssue.count).not.toHaveBeenCalled();
    expect(tx.importJob.count).not.toHaveBeenCalled();
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
    expect(tx.workspace.updateMany).not.toHaveBeenCalled();
  });

  it("keeps pre-approved migrations inactive", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "REVIEW_READY",
          ownerReviewAcknowledgedAt: null,
          ownerReviewAcknowledgedByUserId: null,
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: { status: "SETUP_INCOMPLETE" },
        }),
        update: vi.fn(),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          status: "SETUP_INCOMPLETE",
        }),
        update: vi.fn(),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
      },
      importJob: {
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Migration activation requires the approved go-live stage.",
    });

    expect(tx.workspaceMigration.update).not.toHaveBeenCalled();
    expect(tx.workspace.update).not.toHaveBeenCalled();
  });

  it("keeps migrations with blocking validation errors inactive", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: {
            status: "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
        update: vi.fn(),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          status: "SETUP_INCOMPLETE",
        }),
        update: vi.fn(),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(1),
      },
      importJob: {
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Resolve blocking migration validation issues before activation.",
    });

    expect(tx.workspaceMigration.update).not.toHaveBeenCalled();
    expect(tx.workspace.update).not.toHaveBeenCalled();
  });

  it("keeps zero-import migrations inactive without reconciliation evidence", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: {
            status: "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      workspace: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
      },
      importJob: {
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Complete at least one migration import with reconciliation evidence before activation.",
    });

    expect(tx.importJob.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        status: "COMPLETED",
        reconciliationReports: {
          some: { workspaceId: "workspace_1" },
        },
      },
    });
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
    expect(tx.workspace.updateMany).not.toHaveBeenCalled();
  });

  it("keeps migrations with unresolved reconciliation work inactive", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: {
            status: "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
        update: vi.fn(),
      },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          status: "SETUP_INCOMPLETE",
        }),
        update: vi.fn(),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
      },
      importJob: {
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Complete migration reconciliation before activation.",
    });

    expect(tx.workspaceMigration.update).not.toHaveBeenCalled();
    expect(tx.workspace.update).not.toHaveBeenCalled();
  });

  it("treats repeated activation of an operational migration as a no-op", async () => {
    vi.stubEnv("FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL", "");
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "COMPLETE",
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: new Date("2026-07-25T00:00:00.000Z"),
          operationallyReadyByUserId: "operator_1",
          workspace: { status: "ACTIVE" },
        }),
        update: vi.fn(),
      },
      workspace: {
        update: vi.fn(),
      },
      validationIssue: {
        count: vi.fn(),
      },
      importJob: {
        count: vi.fn(),
      },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_2",
        },
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "ok",
    });

    expect(tx.validationIssue.count).not.toHaveBeenCalled();
    expect(tx.importJob.count).not.toHaveBeenCalled();
    expect(tx.workspaceMigration.update).not.toHaveBeenCalled();
    expect(tx.workspace.update).not.toHaveBeenCalled();
  });

  it("rejects completed rows without owner review as incoherent", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "COMPLETE",
          ownerReviewAcknowledgedAt: null,
          ownerReviewAcknowledgedByUserId: null,
          operationallyReadyAt: new Date("2026-07-25T00:00:00.000Z"),
          operationallyReadyByUserId: "operator_1",
          workspace: { status: "ACTIVE" },
        }),
        updateMany: vi.fn(),
      },
      workspace: { updateMany: vi.fn() },
      validationIssue: { count: vi.fn() },
      importJob: { count: vi.fn() },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_2",
        },
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Migration completion state is inconsistent.",
    });

    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
    expect(tx.workspace.updateMany).not.toHaveBeenCalled();
  });

  it("blocks activation when the schedule predates the owner acknowledgment day", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          goLiveScheduledFor: new Date("2026-07-26T00:00:00.000Z"),
          ownerReviewAcknowledgedAt: new Date("2026-07-27T18:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: {
            status: "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      workspace: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      validationIssue: { count: vi.fn() },
      importJob: { count: vi.fn() },
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: { type: "FLOWSTATE_OPERATOR", actorId: "operator_1" },
        now: new Date("2026-07-30T12:00:00.000Z"),
        db: { $transaction: vi.fn((callback) => callback(tx)) } as never,
      }),
    ).resolves.toEqual({
      status: "error",
      reason: "schedule-passed",
      message:
        "The scheduled go-live date was already past when owner review was acknowledged.",
    });

    expect(tx.validationIssue.count).not.toHaveBeenCalled();
    expect(tx.importJob.count).not.toHaveBeenCalled();
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
    expect(tx.workspace.updateMany).not.toHaveBeenCalled();
  });

  it("persists bounded completion copy during a reconciled late activation", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          goLiveScheduledFor: new Date("2026-07-27T00:00:00.000Z"),
          ownerReviewAcknowledgedAt: new Date("2026-07-27T18:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: {
            status: "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      workspace: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
      },
      importJob: {
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        now,
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "ok",
    });

    expect(tx.importJob.count).toHaveBeenNthCalledWith(1, {
      where: {
        workspaceId: "workspace_1",
        status: "COMPLETED",
        reconciliationReports: {
          some: { workspaceId: "workspace_1" },
        },
      },
    });
    expect(tx.importJob.count).toHaveBeenNthCalledWith(2, {
      where: {
        workspaceId: "workspace_1",
        NOT: {
          OR: [
            {
              status: "COMPLETED",
              reconciliationReports: {
                some: { workspaceId: "workspace_1" },
              },
            },
            {
              status: "CANCELLED",
              cancelledAt: { not: null },
              cancelledByOperatorId: { not: null },
              cancellationReason: { not: null },
            },
          ],
        },
      },
    });
    expect(tx.workspaceMigration.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: "workspace_1",
        stage: "GO_LIVE_SCHEDULED",
      }),
      data: expect.objectContaining({
        stage: "COMPLETE",
        operationallyReadyAt: now,
        operationallyReadyByUserId: "operator_1",
        nextOwnerAction:
          "No further owner review is pending. Daily operations are active.",
        flowstateResponsibility:
          "Flowstate completed the reviewed handoff and recorded the workspace as ready for daily operations.",
        expectedNextMilestone: "Daily operations are active in Flowstate.",
      }),
    });
    const persistedCompletionCopy = JSON.stringify(
      tx.workspaceMigration.updateMany.mock.calls[0]?.[0]?.data,
    );
    expect(persistedCompletionCopy).not.toContain(
      "Your migration handoff is complete. Daily operations are active, and no further owner review is pending.",
    );
    expect(persistedCompletionCopy).not.toContain(
      "Flowstate completed the reviewed handoff and remains available for migration amendments and launch support.",
    );
    expect(persistedCompletionCopy).not.toContain("migration amendments");
    expect(persistedCompletionCopy).not.toContain("launch support");
    expect(tx.workspace.updateMany).toHaveBeenCalledWith({
      where: {
        id: "workspace_1",
        status: "SETUP_INCOMPLETE",
      },
      data: {
        status: "ACTIVE",
      },
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("rolls back migration completion when workspace activation fails", async () => {
    const state = {
      migrationStage: "GO_LIVE_SCHEDULED",
      workspaceStatus: "SETUP_INCOMPLETE",
    };
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
          workspace: {
            status: "SETUP_INCOMPLETE",
            location: { timezone: "America/Los_Angeles" },
          },
        }),
        updateMany: vi.fn().mockImplementation(() => {
          state.migrationStage = "COMPLETE";
          return Promise.resolve({ count: 1 });
        }),
      },
      workspace: {
        updateMany: vi
          .fn()
          .mockRejectedValue(new Error("workspace update failed")),
      },
      validationIssue: {
        count: vi.fn().mockResolvedValue(0),
      },
      importJob: {
        count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      },
    };
    const db = {
      $transaction: vi.fn(async (callback) => {
        const before = { ...state };

        try {
          return await callback(tx);
        } catch (error) {
          Object.assign(state, before);
          throw error;
        }
      }),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_1",
        },
        db: db as never,
      }),
    ).rejects.toThrow("workspace update failed");

    expect(state).toEqual({
      migrationStage: "GO_LIVE_SCHEDULED",
      workspaceStatus: "SETUP_INCOMPLETE",
    });
  });
});
