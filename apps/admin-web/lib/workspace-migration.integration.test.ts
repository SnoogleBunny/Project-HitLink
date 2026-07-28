/* eslint-disable turbo/no-undeclared-env-vars -- disposable PostgreSQL test URL is opt-in and never used by application runtime */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@flowstate/db";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;

integrationDescribe("migration readiness PostgreSQL integration", () => {
  let prisma: PrismaClient;
  let getMigrationDashboard: (typeof import("./workspace-migration"))["getMigrationDashboard"];
  let markMigrationOperationallyReady: (typeof import("./workspace-migration"))["markMigrationOperationallyReady"];
  const ownerId = "readiness-integration-owner";
  const workspaceIds: [string, string, string, string, string, string] = [
    "readiness_blocked_workspace",
    "readiness_success_workspace",
    "readiness_rollback_workspace",
    "readiness_dashboard_counts_workspace",
    "readiness_zero_import_workspace",
    "readiness_channel_unavailable_workspace",
  ];

  async function createCompletedReconciliation(
    workspaceId: string,
    importJobId: string,
  ) {
    await prisma.importJob.create({
      data: {
        id: importJobId,
        workspaceId,
        name: "Completed member migration",
        status: "COMPLETED",
        completedAt: new Date("2026-07-25T00:00:00.000Z"),
      },
    });
    await prisma.reconciliationReport.create({
      data: {
        workspaceId,
        importJobId,
        summary: { imported: 1, skipped: 0 },
      },
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL =
      "corrections@example.test";
    ({ prisma } = await import("@flowstate/db"));
    ({ getMigrationDashboard, markMigrationOperationallyReady } =
      await import("./workspace-migration"));
    await prisma.workspace.deleteMany({
      where: {
        id: {
          in: workspaceIds,
        },
      },
    });
    await prisma.user.upsert({
      where: { id: ownerId },
      update: {},
      create: {
        id: ownerId,
        email: "readiness-integration-owner@example.test",
      },
    });
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({
      where: {
        id: {
          in: workspaceIds,
        },
      },
    });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
    delete process.env.FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL;
  });

  it("returns exact mixed-severity totals with a deterministic ten-issue preview", async () => {
    const workspaceId = workspaceIds[3];
    const importJobId = "readiness_dashboard_counts_job";
    const createdAt = new Date("2026-07-26T12:00:00.000Z");
    const issues = [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `dashboard_error_${index + 1}`,
        severity: "ERROR" as const,
        message: `Error ${index + 1}`,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `dashboard_warning_${index + 1}`,
        severity: "WARNING" as const,
        message: `Warning ${index + 1}`,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `dashboard_info_${index + 1}`,
        severity: "INFO" as const,
        message: `Info ${index + 1}`,
      })),
    ];

    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Dashboard counts integration",
        status: "SETUP_INCOMPLETE",
      },
    });
    await prisma.importJob.create({
      data: {
        id: importJobId,
        workspaceId,
        name: "Mixed validation issues",
        status: "VALIDATED",
      },
    });
    await prisma.validationIssue.createMany({
      data: issues.map((issue) => ({
        ...issue,
        workspaceId,
        importJobId,
        code: "DASHBOARD_COUNT_TEST",
        createdAt,
      })),
    });

    const dashboard = await getMigrationDashboard({ workspaceId });
    const [job] = dashboard.importJobs;

    expect(job?.issueCounts).toEqual({
      INFO: 4,
      WARNING: 4,
      ERROR: 5,
    });
    expect(job?.validationIssues).toHaveLength(10);
    expect(job?.validationIssues.map((issue) => issue.id)).toEqual([
      "dashboard_error_1",
      "dashboard_error_2",
      "dashboard_error_3",
      "dashboard_error_4",
      "dashboard_error_5",
      "dashboard_warning_1",
      "dashboard_warning_2",
      "dashboard_warning_3",
      "dashboard_warning_4",
      "dashboard_info_1",
    ]);
  });

  it("leaves PostgreSQL state unchanged when reconciliation is unresolved", async () => {
    await prisma.workspace.create({
      data: {
        id: workspaceIds[0],
        name: "Blocked readiness integration",
        status: "SETUP_INCOMPLETE",
        location: {
          create: { name: "Main gym", timezone: "America/Los_Angeles" },
        },
        migration: {
          create: {
            stage: "GO_LIVE_SCHEDULED",
            goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedByUserId: ownerId,
            nextOwnerAction: "Review the handoff",
            flowstateResponsibility: "Validate the import",
          },
        },
        importJobs: {
          create: {
            name: "Unresolved member import",
            status: "VALIDATED",
          },
        },
      },
    });
    await createCompletedReconciliation(
      workspaceIds[0],
      "readiness_blocked_completed_job",
    );

    await expect(
      markMigrationOperationallyReady({
        workspaceId: workspaceIds[0],
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration",
        },
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Complete migration reconciliation before activation.",
    });

    const blockedWorkspace = await prisma.workspace.findUniqueOrThrow({
      where: {
        id: workspaceIds[0],
      },
      include: {
        migration: true,
      },
    });
    expect(blockedWorkspace.status).toBe("SETUP_INCOMPLETE");
    expect(blockedWorkspace.migration).toMatchObject({
      stage: "GO_LIVE_SCHEDULED",
      operationallyReadyAt: null,
      operationallyReadyByUserId: null,
    });
  });

  it("leaves PostgreSQL state unchanged when no completed import has reconciliation evidence", async () => {
    const workspaceId = workspaceIds[4];
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Zero-import readiness integration",
        status: "SETUP_INCOMPLETE",
        location: {
          create: { name: "Main gym", timezone: "America/Los_Angeles" },
        },
        migration: {
          create: {
            stage: "GO_LIVE_SCHEDULED",
            goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedByUserId: ownerId,
            nextOwnerAction: "Review the handoff",
            flowstateResponsibility: "Validate the import",
          },
        },
      },
    });

    await expect(
      markMigrationOperationallyReady({
        workspaceId,
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration",
        },
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Complete at least one migration import with reconciliation evidence before activation.",
    });

    const blockedWorkspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { migration: true },
    });
    expect(blockedWorkspace.status).toBe("SETUP_INCOMPLETE");
    expect(blockedWorkspace.migration).toMatchObject({
      stage: "GO_LIVE_SCHEDULED",
      operationallyReadyAt: null,
      operationallyReadyByUserId: null,
    });
  });

  it("leaves PostgreSQL state unchanged when the correction channel is unavailable", async () => {
    const workspaceId = workspaceIds[5];
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Unavailable correction channel integration",
        status: "SETUP_INCOMPLETE",
        location: {
          create: { name: "Main gym", timezone: "America/Los_Angeles" },
        },
        migration: {
          create: {
            stage: "GO_LIVE_SCHEDULED",
            goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedByUserId: ownerId,
            nextOwnerAction: "Review the handoff",
            flowstateResponsibility: "Validate the import",
          },
        },
      },
    });
    await createCompletedReconciliation(
      workspaceId,
      "readiness_channel_unavailable_completed_job",
    );

    delete process.env.FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL;
    try {
      await expect(
        markMigrationOperationallyReady({
          workspaceId,
          actor: {
            type: "FLOWSTATE_OPERATOR",
            actorId: "operator_integration",
          },
        }),
      ).resolves.toEqual({
        status: "error",
        reason: "correction-channel-unavailable",
        message:
          "The migration correction channel is unavailable. Activation was not recorded.",
      });
    } finally {
      process.env.FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL =
        "corrections@example.test";
    }

    const blockedWorkspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { migration: true },
    });
    expect(blockedWorkspace.status).toBe("SETUP_INCOMPLETE");
    expect(blockedWorkspace.migration).toMatchObject({
      stage: "GO_LIVE_SCHEDULED",
      operationallyReadyAt: null,
      operationallyReadyByUserId: null,
    });
  });

  it("activates atomically and treats a repeated completion as a no-op", async () => {
    await prisma.workspace.create({
      data: {
        id: workspaceIds[1],
        name: "Successful readiness integration",
        status: "SETUP_INCOMPLETE",
        location: {
          create: { name: "Main gym", timezone: "America/Los_Angeles" },
        },
        migration: {
          create: {
            stage: "GO_LIVE_SCHEDULED",
            goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedByUserId: ownerId,
            nextOwnerAction: "Review the handoff",
            flowstateResponsibility: "Validate the import",
          },
        },
        importJobs: {
          create: {
            id: "readiness_audited_cancelled_job",
            name: "Audited cancellation",
            status: "CANCELLED",
            cancelledAt: new Date("2026-07-25T00:05:00.000Z"),
            cancelledByOperatorId: "operator_integration",
            cancellationReason: "Cancellation reviewed before activation",
          },
        },
      },
    });
    await createCompletedReconciliation(
      workspaceIds[1],
      "readiness_completed_job",
    );

    await expect(
      markMigrationOperationallyReady({
        workspaceId: workspaceIds[1],
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration",
        },
      }),
    ).resolves.toEqual({ status: "ok" });

    const firstCompletion = await prisma.workspace.findUniqueOrThrow({
      where: {
        id: workspaceIds[1],
      },
      include: {
        migration: true,
      },
    });
    expect(firstCompletion.status).toBe("ACTIVE");
    expect(firstCompletion.migration).toMatchObject({
      stage: "COMPLETE",
      operationallyReadyByUserId: "operator_integration",
    });
    expect(firstCompletion.migration?.operationallyReadyAt).toBeInstanceOf(
      Date,
    );

    delete process.env.FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL;
    try {
      await expect(
        markMigrationOperationallyReady({
          workspaceId: workspaceIds[1],
          actor: {
            type: "FLOWSTATE_OPERATOR",
            actorId: "operator_integration_retry",
          },
        }),
      ).resolves.toEqual({ status: "ok" });
    } finally {
      process.env.FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL =
        "corrections@example.test";
    }

    const repeatedCompletion =
      await prisma.workspaceMigration.findUniqueOrThrow({
        where: {
          workspaceId: workspaceIds[1],
        },
      });
    expect(repeatedCompletion.operationallyReadyAt).toEqual(
      firstCompletion.migration?.operationallyReadyAt,
    );
    expect(repeatedCompletion.operationallyReadyByUserId).toBe(
      "operator_integration",
    );
  });

  it("rolls back the migration write when workspace activation throws", async () => {
    await prisma.workspace.create({
      data: {
        id: workspaceIds[2],
        name: "Rollback readiness integration",
        status: "SETUP_INCOMPLETE",
        location: {
          create: { name: "Main gym", timezone: "America/Los_Angeles" },
        },
        migration: {
          create: {
            stage: "GO_LIVE_SCHEDULED",
            goLiveScheduledFor: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedAt: new Date("2026-07-25T00:00:00.000Z"),
            ownerReviewAcknowledgedByUserId: ownerId,
            nextOwnerAction: "Review the handoff",
            flowstateResponsibility: "Validate the import",
          },
        },
      },
    });
    await createCompletedReconciliation(
      workspaceIds[2],
      "readiness_rollback_completed_job",
    );

    const faultInjectingDb = {
      $transaction: (
        callback: (tx: unknown) => Promise<unknown>,
        options: unknown,
      ) =>
        prisma.$transaction(
          (tx) =>
            callback({
              workspaceMigration: tx.workspaceMigration,
              validationIssue: tx.validationIssue,
              importJob: tx.importJob,
              workspace: {
                updateMany: () =>
                  Promise.reject(new Error("injected workspace failure")),
              },
            }),
          options as never,
        ),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: workspaceIds[2],
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration",
        },
        db: faultInjectingDb as never,
      }),
    ).rejects.toThrow("injected workspace failure");

    const rolledBackWorkspace = await prisma.workspace.findUniqueOrThrow({
      where: {
        id: workspaceIds[2],
      },
      include: {
        migration: true,
      },
    });
    expect(rolledBackWorkspace.status).toBe("SETUP_INCOMPLETE");
    expect(rolledBackWorkspace.migration).toMatchObject({
      stage: "GO_LIVE_SCHEDULED",
      operationallyReadyAt: null,
      operationallyReadyByUserId: null,
    });
  });
});
