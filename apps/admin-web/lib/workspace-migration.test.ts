import { describe, expect, it, vi } from "vitest";
import {
  buildInitialMigrationData,
  isWorkspaceMigrationReady,
  markMigrationOperationallyReady,
  runMigrationImport,
  uploadAndStageMigrationCsv,
} from "./workspace-migration";

type UploadDb = NonNullable<
  Parameters<typeof uploadAndStageMigrationCsv>[0]["db"]
>;
type ImportDb = NonNullable<Parameters<typeof runMigrationImport>[0]["db"]>;
type ReadyDb = NonNullable<
  Parameters<typeof markMigrationOperationallyReady>[0]["db"]
>;

function csvBytes(content: string): Uint8Array {
  return new Uint8Array(Buffer.from(content, "utf-8"));
}

describe("workspace migration helpers", () => {
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
        operationallyReadyAt: null,
      }),
    ).toBe(false);
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
      importJob: {
        findFirst: vi.fn().mockResolvedValue({
          id: "job_1",
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
        db: db as unknown as ImportDb,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "This import job is staged for review only.",
    });
  });

  it("marks the manual readiness gate complete and activates the workspace", async () => {
    const tx = {
      workspaceMigration: {
        update: vi.fn().mockResolvedValue({}),
      },
      workspace: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const db = {
      $transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      markMigrationOperationallyReady({
        workspaceId: "workspace_1",
        userId: "owner_1",
        db: db as unknown as ReadyDb,
      }),
    ).resolves.toEqual({
      status: "ok",
    });

    expect(tx.workspaceMigration.update).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
      },
      data: expect.objectContaining({
        stage: "COMPLETE",
        operationallyReadyByUserId: "owner_1",
        nextOwnerAction:
          "Your migration is ready for review. Flowstate has activated daily operations for launch readiness.",
        expectedNextMilestone:
          "Owner review and daily operations in Flowstate.",
      }),
    });
    expect(tx.workspace.update).toHaveBeenCalledWith({
      where: {
        id: "workspace_1",
      },
      data: {
        status: "ACTIVE",
      },
    });
  });
});
