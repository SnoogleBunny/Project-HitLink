import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acknowledgeMigrationOwnerReview,
  cancelMigrationImport,
  markMigrationOperationallyReady,
  runMigrationImport,
  updateMigrationStage,
  uploadAndStageMigrationCsv,
} from "./workspace-migration";

function serializableDb(tx: Record<string, unknown>) {
  return {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
}

function eligibleAcknowledgmentTx(
  overrides: {
    owner?: unknown;
    migration?: unknown;
    blockingIssues?: number;
    unresolvedJobs?: number;
    updateCount?: number;
  } = {},
) {
  return {
    workspaceUser: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.owner === undefined
            ? { id: "owner_membership" }
            : overrides.owner,
        ),
    },
    workspaceMigration: {
      findUnique: vi.fn().mockResolvedValue(
        overrides.migration === undefined
          ? {
              stage: "GO_LIVE_SCHEDULED",
              goLiveScheduledFor: new Date("2026-07-27T00:00:00.000Z"),
              ownerReviewAcknowledgedAt: null,
              ownerReviewAcknowledgedByUserId: null,
              operationallyReadyAt: null,
              operationallyReadyByUserId: null,
              workspace: {
                status: "SETUP_INCOMPLETE",
                location: { timezone: "America/Los_Angeles" },
              },
            }
          : overrides.migration,
      ),
      updateMany: vi.fn().mockResolvedValue({
        count: overrides.updateCount ?? 1,
      }),
    },
    validationIssue: {
      count: vi.fn().mockResolvedValue(overrides.blockingIssues ?? 0),
    },
    importJob: {
      count: vi.fn().mockResolvedValue(overrides.unresolvedJobs ?? 0),
    },
  };
}

function cancellableJob(overrides: Record<string, unknown> = {}) {
  return {
    status: "MAPPED",
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    cancelledByOperatorId: null,
    cancellationReason: null,
    ...overrides,
  };
}

function cancellationTx(
  job: Record<string, unknown> | null = cancellableJob(),
) {
  return {
    importJob: {
      findFirst: vi.fn().mockResolvedValue(job),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    validationIssue: { count: vi.fn().mockResolvedValue(1) },
    reconciliationReport: { count: vi.fn().mockResolvedValue(0) },
    stagingRecord: { count: vi.fn().mockResolvedValue(0) },
    migrationImportedRecord: { count: vi.fn().mockResolvedValue(0) },
    workspaceMigration: {
      findUnique: vi.fn().mockResolvedValue({
        ownerReviewAcknowledgedAt: null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const operator = {
  type: "FLOWSTATE_OPERATOR" as const,
  actorId: "operator_1",
};

const ownerActor = {
  type: "WORKSPACE_USER" as const,
  actorId: "owner_1",
  role: "OWNER" as const,
};

describe("migration owner review and internal operations", () => {
  beforeEach(() => {
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "corrections@example.test",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records eligible owner review without activating or changing stage", async () => {
    const tx = eligibleAcknowledgmentTx();
    const db = serializableDb(tx);
    const now = new Date("2026-07-28T06:59:59.999Z");

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: "workspace_1",
        userId: "owner_1",
        now,
        db: db as never,
      }),
    ).resolves.toEqual({ status: "ok" });

    expect(tx.workspaceUser.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        userId: "owner_1",
        role: "OWNER",
        isActive: true,
      },
      select: { id: true },
    });
    expect(tx.workspaceMigration.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: "workspace_1",
        stage: "GO_LIVE_SCHEDULED",
        ownerReviewAcknowledgedAt: null,
        ownerReviewAcknowledgedByUserId: null,
      }),
      data: {
        ownerReviewAcknowledgedAt: now,
        ownerReviewAcknowledgedByUserId: "owner_1",
      },
    });
    expect((tx as { workspace?: unknown }).workspace).toBeUndefined();
  });

  it("rejects an invalid correction channel before owner acknowledgment writes", async () => {
    vi.stubEnv(
      "FLOWSTATE_MIGRATION_CORRECTIONS_EMAIL",
      "one@example.test,two@example.test",
    );
    const tx = eligibleAcknowledgmentTx();

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: "workspace_1",
        userId: "owner_1",
        now: new Date("2026-07-28T06:59:59.999Z"),
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({
      status: "error",
      reason: "correction-channel-unavailable",
      message:
        "Migration correction channel is unavailable. Owner acknowledgment was not recorded.",
    });

    expect(tx.validationIssue.count).not.toHaveBeenCalled();
    expect(tx.importJob.count).not.toHaveBeenCalled();
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the first acknowledgment actor and timestamp on retries", async () => {
    const firstAt = new Date("2026-07-25T12:00:00.000Z");
    const tx = eligibleAcknowledgmentTx({
      migration: {
        stage: "GO_LIVE_SCHEDULED",
        goLiveScheduledFor: new Date("2026-07-27T00:00:00.000Z"),
        ownerReviewAcknowledgedAt: firstAt,
        ownerReviewAcknowledgedByUserId: "owner_1",
        operationallyReadyAt: null,
        operationallyReadyByUserId: null,
        workspace: {
          status: "SETUP_INCOMPLETE",
          location: { timezone: "America/Los_Angeles" },
        },
      },
    });

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: "workspace_1",
        userId: "owner_2",
        now: new Date("2026-07-30T12:00:00.000Z"),
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({ status: "ok" });

    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a submit after local midnight without writing", async () => {
    const tx = eligibleAcknowledgmentTx();

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: "workspace_1",
        userId: "owner_1",
        now: new Date("2026-07-28T07:00:00.000Z"),
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({
      status: "error",
      reason: "schedule-passed",
      message:
        "The scheduled go-live date has passed. Flowstate must confirm the schedule before owner review can be acknowledged.",
    });

    expect(tx.validationIssue.count).not.toHaveBeenCalled();
    expect(tx.importJob.count).not.toHaveBeenCalled();
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an idempotent acknowledgment when the persisted launch state is incoherent", async () => {
    const tx = eligibleAcknowledgmentTx({
      migration: {
        stage: "COMPLETE",
        ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
        ownerReviewAcknowledgedByUserId: "owner_1",
        operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
        operationallyReadyByUserId: "operator_1",
        workspace: { status: "ACTIVE" },
      },
    });

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: "workspace_1",
        userId: "owner_1",
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Migration review can only be acknowledged after Flowstate schedules go-live.",
    });
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it("rejects acknowledgment without an active owner membership", async () => {
    const tx = eligibleAcknowledgmentTx({ owner: null });

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: "workspace_1",
        userId: "coach_1",
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Only an active workspace owner can acknowledge migration review.",
    });
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it("rejects acknowledgment outside the approved go-live state", async () => {
    const tx = eligibleAcknowledgmentTx({
      migration: {
        stage: "REVIEW_READY",
        ownerReviewAcknowledgedAt: null,
        ownerReviewAcknowledgedByUserId: null,
        operationallyReadyAt: null,
        operationallyReadyByUserId: null,
        workspace: { status: "SETUP_INCOMPLETE" },
      },
    });

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: "workspace_1",
        userId: "owner_1",
        db: serializableDb(tx) as never,
      }),
    ).resolves.toMatchObject({ status: "error" });
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      blockingIssues: 1,
      unresolvedJobs: 0,
      message:
        "Resolve blocking migration validation issues before acknowledging review.",
    },
    {
      blockingIssues: 0,
      unresolvedJobs: 1,
      message: "Complete migration reconciliation before acknowledging review.",
    },
  ])("rejects owner review blockers without writing", async (scenario) => {
    const tx = eligibleAcknowledgmentTx(scenario);

    await expect(
      acknowledgeMigrationOwnerReview({
        workspaceId: "workspace_1",
        userId: "owner_1",
        now: new Date("2026-07-28T06:59:59.999Z"),
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({ status: "error", message: scenario.message });
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it("fails every internal migration control closed for a workspace owner", async () => {
    const db = {
      workspaceMigration: { findUnique: vi.fn() },
      importJob: { findFirst: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(),
    };

    await expect(
      uploadAndStageMigrationCsv({
        workspaceId: "workspace_1",
        actor: ownerActor,
        input: {
          recordKind: "MEMBER",
          fileName: "members.csv",
          mimeType: "text/csv",
          fileSizeBytes: 1,
          fileData: new Uint8Array([65]),
        },
        db: db as never,
      }),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      runMigrationImport({
        workspaceId: "workspace_1",
        locationId: "location_1",
        importJobId: "job_1",
        actor: ownerActor,
        db: db as never,
      }),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      updateMigrationStage({
        workspaceId: "workspace_1",
        actor: ownerActor,
        input: { stage: "REVIEW_READY" },
        db: db as never,
      }),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "Invalid export",
        actor: ownerActor,
        db: db as never,
      }),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        actor: ownerActor,
        db: db as never,
      }),
    ).resolves.toMatchObject({ status: "error" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("audits a blocking mapped-job cancellation before owner review", async () => {
    const tx = cancellationTx();

    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "  Invalid source mapping  ",
        actor: operator,
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({ status: "ok" });

    expect(tx.importJob.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "job_1",
        workspaceId: "workspace_1",
        status: "MAPPED",
        startedAt: null,
        completedAt: null,
        failedAt: null,
      }),
      data: {
        status: "CANCELLED",
        cancelledAt: expect.any(Date),
        cancelledByOperatorId: "operator_1",
        cancellationReason: "Invalid source mapping",
      },
    });
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it("adopts a side-effect-free legacy cancellation with a current audit", async () => {
    const tx = cancellationTx(cancellableJob({ status: "CANCELLED" }));

    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "Verified legacy invalid job",
        actor: operator,
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({ status: "ok" });
    expect(tx.importJob.updateMany).toHaveBeenCalled();
  });

  it("preserves the first cancellation audit on a duplicate", async () => {
    const tx = cancellationTx(
      cancellableJob({
        status: "CANCELLED",
        cancelledAt: new Date("2026-07-25T12:00:00.000Z"),
        cancelledByOperatorId: "operator_1",
        cancellationReason: "Original reason",
      }),
    );

    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "Replacement reason",
        actor: { ...operator, actorId: "operator_2" },
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({ status: "ok" });
    expect(tx.importJob.updateMany).not.toHaveBeenCalled();
  });

  it("requires a non-blank operator identity and cancellation reason", async () => {
    const db = serializableDb(cancellationTx());

    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "Valid reason",
        actor: { ...operator, actorId: "   " },
        db: db as never,
      }),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "   ",
        actor: operator,
        db: db as never,
      }),
    ).resolves.toMatchObject({ status: "error" });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a job owned by another workspace without writing", async () => {
    const tx = cancellationTx(null);

    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_from_another_workspace",
        reason: "Wrong tenant",
        actor: operator,
        db: serializableDb(tx) as never,
      }),
    ).resolves.toMatchObject({ status: "error" });

    expect(tx.importJob.updateMany).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "VALIDATED", "IMPORTING", "FAILED", "COMPLETED"])(
    "rejects cancellation for a %s job",
    async (status) => {
      const tx = cancellationTx(cancellableJob({ status }));

      await expect(
        cancelMigrationImport({
          workspaceId: "workspace_1",
          importJobId: "job_1",
          reason: "Unsafe cancellation",
          actor: operator,
          db: serializableDb(tx) as never,
        }),
      ).resolves.toMatchObject({ status: "error" });
      expect(tx.importJob.updateMany).not.toHaveBeenCalled();
    },
  );

  it("rejects cancellation without a blocking issue or with imported evidence", async () => {
    const noIssue = cancellationTx();
    noIssue.validationIssue.count.mockResolvedValue(0);
    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "No blocker",
        actor: operator,
        db: serializableDb(noIssue) as never,
      }),
    ).resolves.toMatchObject({ status: "error" });

    const imported = cancellationTx();
    imported.migrationImportedRecord.count.mockResolvedValue(1);
    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "Has side effects",
        actor: operator,
        db: serializableDb(imported) as never,
      }),
    ).resolves.toMatchObject({ status: "error" });
    expect(imported.importJob.updateMany).not.toHaveBeenCalled();
  });

  it("treats every imported staging marker as irreversible evidence", async () => {
    const tx = cancellationTx();

    await cancelMigrationImport({
      workspaceId: "workspace_1",
      importJobId: "job_1",
      reason: "Inspect imported evidence query",
      actor: operator,
      db: serializableDb(tx) as never,
    });

    expect(tx.stagingRecord.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        importJobId: "job_1",
        OR: [
          { importedAt: { not: null } },
          { importedModel: { not: null } },
          { importedRecordId: { not: null } },
        ],
      },
    });
  });

  it("freezes same-stage generic edits after owner acknowledgment", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
          ownerReviewAcknowledgedByUserId: "owner_1",
          operationallyReadyAt: null,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await expect(
      updateMigrationStage({
        workspaceId: "workspace_1",
        actor: operator,
        input: { stage: "GO_LIVE_SCHEDULED" },
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Migration operations are frozen after owner review acknowledgment.",
    });
    expect(tx.workspaceMigration.updateMany).not.toHaveBeenCalled();
  });

  it("checks the owner-review freeze inside the serialized import claim", async () => {
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
        }),
      },
      importJob: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    const db = {
      ...tx,
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      runMigrationImport({
        workspaceId: "workspace_1",
        locationId: "location_1",
        importJobId: "job_1",
        actor: operator,
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Migration operations are frozen after owner review acknowledgment.",
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(tx.importJob.findFirst).not.toHaveBeenCalled();
    expect(tx.importJob.updateMany).not.toHaveBeenCalled();
  });

  it("claims an eligible import through the same serialized review check", async () => {
    const job = {
      id: "job_1",
      status: "VALIDATED",
      validationIssues: [],
      stagingRecords: [{ recordKind: "MEMBER" }],
    };
    const tx = {
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          stage: "GO_LIVE_SCHEDULED",
          ownerReviewAcknowledgedAt: null,
        }),
      },
      importJob: {
        findFirst: vi.fn().mockResolvedValue(job),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const topLevelImportJob = {
      findFirst: vi.fn().mockResolvedValue(job),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    const db = {
      importJob: topLevelImportJob,
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    await expect(
      runMigrationImport({
        workspaceId: "workspace_1",
        locationId: "location_1",
        importJobId: "job_1",
        actor: operator,
        db: db as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "This import job is already running or no longer validated.",
    });

    expect(tx.importJob.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.importJob.updateMany).toHaveBeenCalledTimes(1);
    expect(topLevelImportJob.findFirst).not.toHaveBeenCalled();
    expect(topLevelImportJob.updateMany).not.toHaveBeenCalled();
  });

  it("freezes cancellation after owner review acknowledgment", async () => {
    const tx = {
      ...cancellationTx(),
      workspaceMigration: {
        findUnique: vi.fn().mockResolvedValue({
          ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
        }),
      },
    };

    await expect(
      cancelMigrationImport({
        workspaceId: "workspace_1",
        importJobId: "job_1",
        reason: "Must remain immutable",
        actor: operator,
        db: serializableDb(tx) as never,
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Migration operations are frozen after owner review acknowledgment.",
    });

    expect(tx.importJob.updateMany).not.toHaveBeenCalled();
  });
});
