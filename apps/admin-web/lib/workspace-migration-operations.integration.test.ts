/* eslint-disable turbo/no-undeclared-env-vars -- disposable PostgreSQL test URL is opt-in and never used by application runtime */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@flowstate/db";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;

integrationDescribe("migration operations PostgreSQL integration", () => {
  let prisma: PrismaClient;
  let acknowledgeMigrationOwnerReview: (typeof import("./workspace-migration"))["acknowledgeMigrationOwnerReview"];
  let cancelMigrationImport: (typeof import("./workspace-migration"))["cancelMigrationImport"];
  let markMigrationOperationallyReady: (typeof import("./workspace-migration"))["markMigrationOperationallyReady"];
  let runMigrationImport: (typeof import("./workspace-migration"))["runMigrationImport"];
  let updateMigrationStage: (typeof import("./workspace-migration"))["updateMigrationStage"];
  let uploadAndStageMigrationCsv: (typeof import("./workspace-migration"))["uploadAndStageMigrationCsv"];

  const ownerId = "migration_operations_integration_owner";
  const constraintOwnerId = "migration_operations_constraint_owner";
  const scheduleOwnerId = "migration_operations_schedule_owner";
  const workspaceIds: [string, string, string, string, string, string] = [
    "migration_operations_activation_workspace",
    "migration_operations_cancellation_workspace",
    "migration_operations_constraint_workspace",
    "migration_operations_atomic_import_workspace",
    "migration_operations_schedule_workspace",
    "migration_operations_foreign_location_workspace",
  ];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL =
      "corrections@example.test";
    ({ prisma } = await import("@flowstate/db"));
    ({
      acknowledgeMigrationOwnerReview,
      cancelMigrationImport,
      markMigrationOperationallyReady,
      runMigrationImport,
      updateMigrationStage,
      uploadAndStageMigrationCsv,
    } = await import("./workspace-migration"));

    await prisma.workspace.deleteMany({
      where: { id: { in: workspaceIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, constraintOwnerId, scheduleOwnerId] } },
    });
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: "migration-operations-owner@example.test",
          fullName: "Migration Operations Owner",
        },
        {
          id: constraintOwnerId,
          email: "migration-constraint-owner@example.test",
          fullName: "Migration Constraint Owner",
        },
        {
          id: scheduleOwnerId,
          email: "migration-schedule-owner@example.test",
          fullName: "Migration Schedule Owner",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({
      where: { id: { in: workspaceIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, constraintOwnerId, scheduleOwnerId] } },
    });
    await prisma.$disconnect();
    delete process.env.FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL;
  });

  it("records owner review idempotently and serializes concurrent activation", async () => {
    await prisma.workspace.create({
      data: {
        id: workspaceIds[0],
        name: "Activation operations integration",
        status: "SETUP_INCOMPLETE",
        location: {
          create: { name: "Main gym", timezone: "America/Los_Angeles" },
        },
        migration: {
          create: {
            stage: "GO_LIVE_SCHEDULED",
            goLiveScheduledFor: new Date("2099-07-27T00:00:00.000Z"),
            nextOwnerAction: "Review the migration summary",
            flowstateResponsibility: "Finish readiness checks",
          },
        },
        workspaceUsers: {
          create: {
            userId: ownerId,
            role: "OWNER",
            isActive: true,
          },
        },
      },
    });
    const completedJob = await prisma.importJob.create({
      data: {
        workspaceId: workspaceIds[0],
        name: "Completed member migration",
        status: "COMPLETED",
        completedAt: new Date("2026-07-25T00:00:00.000Z"),
      },
      select: { id: true },
    });
    await prisma.reconciliationReport.create({
      data: {
        workspaceId: workspaceIds[0],
        importJobId: completedJob.id,
        summary: { imported: 1, skipped: 0 },
      },
    });

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: workspaceIds[0],
        userId: ownerId,
      }),
    ).resolves.toEqual({ status: "ok" });
    const firstAcknowledgment =
      await prisma.workspaceMigration.findUniqueOrThrow({
        where: { workspaceId: workspaceIds[0] },
      });

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: workspaceIds[0],
        userId: ownerId,
      }),
    ).resolves.toEqual({ status: "ok" });
    const repeatedAcknowledgment =
      await prisma.workspaceMigration.findUniqueOrThrow({
        where: { workspaceId: workspaceIds[0] },
      });
    expect(repeatedAcknowledgment.ownerReviewAcknowledgedAt).toEqual(
      firstAcknowledgment.ownerReviewAcknowledgedAt,
    );
    expect(repeatedAcknowledgment.ownerReviewAcknowledgedByUserId).toBe(
      ownerId,
    );

    await expect(
      updateMigrationStage({
        workspaceId: workspaceIds[0],
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "stage_after_owner_review",
        },
        input: { stage: "GO_LIVE_SCHEDULED" },
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Migration operations are frozen after owner review acknowledgment.",
    });
    await expect(
      uploadAndStageMigrationCsv({
        workspaceId: workspaceIds[0],
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "upload_after_owner_review",
        },
        input: {
          recordKind: "MEMBER",
          fileName: "post-review.csv",
          mimeType: "text/csv",
          fileSizeBytes: 72,
          fileData: new TextEncoder().encode(
            "external_id,full_name,email\npost_review,Post Review,post@example.com\n",
          ),
        },
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Migration operations are frozen after owner review acknowledgment.",
    });
    const frozenJob = await prisma.importJob.create({
      data: {
        workspaceId: workspaceIds[0],
        name: "Import claim after owner review",
        status: "VALIDATED",
      },
      select: { id: true },
    });
    await expect(
      runMigrationImport({
        workspaceId: workspaceIds[0],
        locationId: "unused_frozen_location",
        importJobId: frozenJob.id,
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "run_after_owner_review",
        },
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Migration operations are frozen after owner review acknowledgment.",
    });
    await expect(
      prisma.importJob.findUniqueOrThrow({ where: { id: frozenJob.id } }),
    ).resolves.toMatchObject({ status: "VALIDATED", startedAt: null });
    await prisma.importJob.delete({ where: { id: frozenJob.id } });

    await expect(
      Promise.all([
        markMigrationOperationallyReady({
          workspaceId: workspaceIds[0],
          actor: {
            type: "FLOWSTATE_OPERATOR",
            actorId: "operator_integration_a",
          },
        }),
        markMigrationOperationallyReady({
          workspaceId: workspaceIds[0],
          actor: {
            type: "FLOWSTATE_OPERATOR",
            actorId: "operator_integration_b",
          },
        }),
      ]),
    ).resolves.toEqual([{ status: "ok" }, { status: "ok" }]);

    await expect(
      updateMigrationStage({
        workspaceId: workspaceIds[0],
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "stage_after_activation",
        },
        input: { stage: "REVIEW_READY" },
      }),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      uploadAndStageMigrationCsv({
        workspaceId: workspaceIds[0],
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "upload_after_activation",
        },
        input: {
          recordKind: "MEMBER",
          fileName: "late-import.csv",
          mimeType: "text/csv",
          fileSizeBytes: 67,
          fileData: new TextEncoder().encode(
            "external_id,full_name,email\nlate_1,Late Import,late@example.com\n",
          ),
        },
      }),
    ).resolves.toMatchObject({ status: "error" });

    const activated = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceIds[0] },
      include: { migration: true },
    });
    expect(activated.status).toBe("ACTIVE");
    expect(activated.migration?.stage).toBe("COMPLETE");
    expect(activated.migration?.operationallyReadyByUserId).toMatch(
      /^operator_integration_[ab]$/,
    );
  });

  it("cancels a blocking mapped job idempotently without deleting staging evidence", async () => {
    const jobId = "migration_operations_cancellation_job";
    const stagingRecordId = "migration_operations_staging_record";
    const sideEffectJobId = "migration_operations_side_effect_job";
    const sideEffectStagingId = "migration_operations_side_effect_staging";

    await prisma.workspace.create({
      data: {
        id: workspaceIds[1],
        name: "Cancellation operations integration",
        status: "SETUP_INCOMPLETE",
        migration: {
          create: {
            stage: "EXPORTS_NEEDED",
            nextOwnerAction: "Replace invalid source data",
            flowstateResponsibility: "Validate corrected source data",
          },
        },
      },
    });
    await prisma.importJob.create({
      data: {
        id: jobId,
        workspaceId: workspaceIds[1],
        name: "Cancellation job",
        status: "MAPPED",
      },
    });
    await prisma.stagingRecord.create({
      data: {
        id: stagingRecordId,
        workspaceId: workspaceIds[1],
        importJobId: jobId,
        recordKind: "MEMBER",
        externalId: "member_external_1",
        rawData: { external_id: "member_external_1" },
        mappedData: { fullName: "Preserved Member" },
        isReadyForImport: true,
      },
    });
    await prisma.validationIssue.create({
      data: {
        id: "migration_operations_blocking_issue",
        workspaceId: workspaceIds[1],
        importJobId: jobId,
        stagingRecordId,
        severity: "ERROR",
        code: "INVALID_SOURCE_MAPPING",
        message: "The source record cannot be safely imported.",
      },
    });

    await expect(
      cancelMigrationImport({
        workspaceId: workspaceIds[1],
        importJobId: jobId,
        reason: "Source replaced by owner",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration",
        },
      }),
    ).resolves.toEqual({ status: "ok" });
    const firstCancellation = await prisma.importJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    await expect(
      cancelMigrationImport({
        workspaceId: workspaceIds[1],
        importJobId: jobId,
        reason: "A later reason must not replace the first",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration_retry",
        },
      }),
    ).resolves.toEqual({ status: "ok" });
    const repeatedCancellation = await prisma.importJob.findUniqueOrThrow({
      where: { id: jobId },
    });

    expect(repeatedCancellation).toMatchObject({
      status: "CANCELLED",
      cancelledByOperatorId: "operator_integration",
      cancellationReason: "Source replaced by owner",
    });
    expect(repeatedCancellation.cancelledAt).toEqual(
      firstCancellation.cancelledAt,
    );
    expect(repeatedCancellation.cancelledAt).toBeInstanceOf(Date);
    expect(
      await prisma.stagingRecord.count({ where: { importJobId: jobId } }),
    ).toBe(1);
    expect(
      await prisma.migrationImportedRecord.count({
        where: { importJobId: jobId },
      }),
    ).toBe(0);

    await prisma.importJob.create({
      data: {
        id: sideEffectJobId,
        workspaceId: workspaceIds[1],
        name: "Side-effectful cancellation job",
        status: "MAPPED",
      },
    });
    await prisma.stagingRecord.create({
      data: {
        id: sideEffectStagingId,
        workspaceId: workspaceIds[1],
        importJobId: sideEffectJobId,
        recordKind: "MEMBER",
        externalId: "side_effect_member",
        rawData: { external_id: "side_effect_member" },
        mappedData: { fullName: "Imported Member" },
        isReadyForImport: true,
        importedAt: new Date("2026-07-25T01:00:00.000Z"),
        importedModel: "Member",
        importedRecordId: "imported_member_1",
      },
    });
    await prisma.validationIssue.create({
      data: {
        workspaceId: workspaceIds[1],
        importJobId: sideEffectJobId,
        stagingRecordId: sideEffectStagingId,
        severity: "ERROR",
        code: "POST_IMPORT_ERROR",
        message: "This job has irreversible evidence.",
      },
    });
    await prisma.migrationImportedRecord.create({
      data: {
        id: "migration_operations_imported_record",
        workspaceId: workspaceIds[1],
        importJobId: sideEffectJobId,
        stagingRecordId: sideEffectStagingId,
        recordKind: "MEMBER",
        externalId: "side_effect_member",
        importedModel: "Member",
        importedRecordId: "imported_member_1",
      },
    });
    await prisma.reconciliationReport.create({
      data: {
        workspaceId: workspaceIds[1],
        importJobId: sideEffectJobId,
        summary: { imported: 1, skipped: 0 },
      },
    });

    await expect(
      cancelMigrationImport({
        workspaceId: workspaceIds[1],
        importJobId: sideEffectJobId,
        reason: "Must not erase irreversible evidence",
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration",
        },
      }),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      prisma.importJob.findUniqueOrThrow({ where: { id: sideEffectJobId } }),
    ).resolves.toMatchObject({
      status: "MAPPED",
      cancelledAt: null,
      cancelledByOperatorId: null,
      cancellationReason: null,
    });
    expect(
      await prisma.migrationImportedRecord.count({
        where: { importJobId: sideEffectJobId },
      }),
    ).toBe(1);
  });

  it("rolls back the claim and first operational row when the second row fails", async () => {
    const workspaceId = workspaceIds[3];
    const importJobId = "migration_operations_atomic_import_job";
    const stagingRecordIds = [
      "migration_operations_atomic_staging_1",
      "migration_operations_atomic_staging_2",
    ];

    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Atomic import operations integration",
        status: "SETUP_INCOMPLETE",
        migration: {
          create: {
            stage: "MIGRATION_IN_PROGRESS",
            nextOwnerAction: "Wait for import reconciliation",
            flowstateResponsibility: "Import the validated rows atomically",
          },
        },
      },
    });
    await prisma.importJob.create({
      data: {
        id: importJobId,
        workspaceId,
        name: "Atomic member import",
        status: "VALIDATED",
      },
    });
    await prisma.stagingRecord.createMany({
      data: [
        {
          id: stagingRecordIds[0],
          workspaceId,
          importJobId,
          recordKind: "MEMBER",
          sourceRowNumber: 2,
          externalId: "atomic_member_1",
          rawData: { external_id: "atomic_member_1" },
          mappedData: { fullName: "First Atomic Member", status: "ACTIVE" },
          isReadyForImport: true,
        },
        {
          id: stagingRecordIds[1],
          workspaceId,
          importJobId,
          recordKind: "MEMBER",
          sourceRowNumber: 3,
          externalId: "atomic_member_2",
          rawData: { external_id: "atomic_member_2" },
          mappedData: {
            fullName: "Invalid Second Atomic Member",
            status: "NOT_A_MEMBER_STATUS",
          },
          isReadyForImport: true,
        },
      ],
    });

    await expect(
      runMigrationImport({
        workspaceId,
        locationId: "unused_atomic_import_location",
        importJobId,
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration",
        },
      }),
    ).resolves.toEqual({
      status: "error",
      message: "The import failed. Check the source data and retry.",
    });

    await expect(
      prisma.importJob.findUniqueOrThrow({ where: { id: importJobId } }),
    ).resolves.toMatchObject({
      status: "VALIDATED",
      startedAt: null,
      completedAt: null,
      failedAt: null,
      failureMessage: null,
    });
    await expect(
      prisma.workspaceMigration.findUniqueOrThrow({
        where: { workspaceId },
      }),
    ).resolves.toMatchObject({ stage: "MIGRATION_IN_PROGRESS" });
    expect(await prisma.member.count({ where: { workspaceId } })).toBe(0);
    expect(
      await prisma.migrationImportedRecord.count({
        where: { workspaceId, importJobId },
      }),
    ).toBe(0);
    expect(
      await prisma.reconciliationReport.count({
        where: { workspaceId, importJobId },
      }),
    ).toBe(0);
    await expect(
      prisma.stagingRecord.findMany({
        where: { id: { in: stagingRecordIds } },
        orderBy: { sourceRowNumber: "asc" },
        select: {
          importedAt: true,
          importedModel: true,
          importedRecordId: true,
        },
      }),
    ).resolves.toEqual([
      { importedAt: null, importedModel: null, importedRecordId: null },
      { importedAt: null, importedModel: null, importedRecordId: null },
    ]);
  });

  it("rejects a cross-workspace schedule location before any import write", async () => {
    const workspaceId = workspaceIds[4];
    const foreignWorkspaceId = workspaceIds[5];
    const ownLocationId = "migration_operations_schedule_location";
    const foreignLocationId = "migration_operations_foreign_location";
    const importJobId = "migration_operations_cross_tenant_schedule_job";
    const stagingRecordId = "migration_operations_cross_tenant_staging";

    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Schedule import operations integration",
        status: "SETUP_INCOMPLETE",
        migration: {
          create: {
            stage: "MIGRATION_IN_PROGRESS",
            nextOwnerAction: "Wait for schedule reconciliation",
            flowstateResponsibility: "Import the validated schedule safely",
          },
        },
        location: {
          create: {
            id: ownLocationId,
            name: "Own Location",
            timezone: "UTC",
          },
        },
        workspaceUsers: {
          create: {
            userId: scheduleOwnerId,
            role: "OWNER",
            isActive: true,
          },
        },
      },
    });
    await prisma.workspace.create({
      data: {
        id: foreignWorkspaceId,
        name: "Foreign location operations integration",
        status: "SETUP_INCOMPLETE",
        location: {
          create: {
            id: foreignLocationId,
            name: "Foreign Location",
            timezone: "UTC",
          },
        },
      },
    });
    await prisma.importJob.create({
      data: {
        id: importJobId,
        workspaceId,
        name: "Cross-tenant schedule import",
        status: "VALIDATED",
      },
    });
    await prisma.stagingRecord.create({
      data: {
        id: stagingRecordId,
        workspaceId,
        importJobId,
        recordKind: "SCHEDULE_TEMPLATE",
        sourceRowNumber: 2,
        externalId: "cross_tenant_schedule_1",
        rawData: { external_id: "cross_tenant_schedule_1" },
        mappedData: {
          programName: "Muay Thai",
          roomName: "Main Mat",
          weekday: "MONDAY",
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
        },
        isReadyForImport: true,
      },
    });

    await expect(
      runMigrationImport({
        workspaceId,
        locationId: foreignLocationId,
        importJobId,
        actor: {
          type: "FLOWSTATE_OPERATOR",
          actorId: "operator_integration",
        },
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "The selected migration location does not belong to this workspace.",
    });

    await expect(
      prisma.importJob.findUniqueOrThrow({ where: { id: importJobId } }),
    ).resolves.toMatchObject({
      status: "VALIDATED",
      startedAt: null,
      completedAt: null,
      failedAt: null,
      failureMessage: null,
    });
    await expect(
      prisma.workspaceMigration.findUniqueOrThrow({
        where: { workspaceId },
      }),
    ).resolves.toMatchObject({ stage: "MIGRATION_IN_PROGRESS" });
    await expect(
      prisma.stagingRecord.findUniqueOrThrow({
        where: { id: stagingRecordId },
      }),
    ).resolves.toMatchObject({
      importedAt: null,
      importedModel: null,
      importedRecordId: null,
    });
    expect(await prisma.program.count({ where: { workspaceId } })).toBe(0);
    expect(
      await prisma.room.count({
        where: { locationId: { in: [ownLocationId, foreignLocationId] } },
      }),
    ).toBe(0);
    expect(await prisma.classTemplate.count({ where: { workspaceId } })).toBe(
      0,
    );
    expect(
      await prisma.migrationImportedRecord.count({
        where: { workspaceId, importJobId },
      }),
    ).toBe(0);
    expect(
      await prisma.reconciliationReport.count({
        where: { workspaceId, importJobId },
      }),
    ).toBe(0);
  });

  it("enforces acknowledgment identity, stage, and cancellation audit constraints", async () => {
    const jobId = "migration_operations_constraint_job";
    await prisma.workspace.create({
      data: {
        id: workspaceIds[2],
        name: "Migration constraint integration",
        status: "SETUP_INCOMPLETE",
        migration: {
          create: {
            stage: "REVIEW_READY",
            nextOwnerAction: "Review the migration summary",
            flowstateResponsibility: "Finish readiness checks",
          },
        },
        importJobs: {
          create: {
            id: jobId,
            name: "Constraint job",
            status: "DRAFT",
          },
        },
      },
    });

    await expect(
      prisma.workspaceMigration.update({
        where: { workspaceId: workspaceIds[2] },
        data: {
          ownerReviewAcknowledgedAt: new Date(),
          ownerReviewAcknowledgedByUserId: constraintOwnerId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.importJob.update({
        where: { id: jobId },
        data: { cancelledAt: new Date() },
      }),
    ).rejects.toThrow();

    await prisma.workspaceMigration.update({
      where: { workspaceId: workspaceIds[2] },
      data: {
        stage: "GO_LIVE_SCHEDULED",
        ownerReviewAcknowledgedAt: new Date(),
        ownerReviewAcknowledgedByUserId: constraintOwnerId,
      },
    });
    await expect(
      prisma.user.delete({ where: { id: constraintOwnerId } }),
    ).rejects.toThrow();
  });
});
