import { describe, expect, it, vi } from "vitest";
import {
  createFormDocumentWithInitialVersion,
  createFormVersion,
  setRequiredFormAssignment,
} from "./forms";

type AdminFormsTestDb = NonNullable<
  Parameters<typeof createFormDocumentWithInitialVersion>[0]["db"]
>;

function createMockDb() {
  const state = {
    assignments: [
      {
        id: "assignment_1",
        workspaceId: "workspace_1",
        formDocumentId: "document_1",
        requirementTarget: "TRIAL",
        isActive: true,
      },
    ],
    openRequests: [
      {
        id: "request_old",
        formVersionId: "version_1",
        status: "OPEN",
      },
    ],
    latestVersionNumber: 1,
  };

  const tx = {
    formDocument: {
      create: vi.fn().mockResolvedValue({
        id: "document_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "document_1",
      }),
    },
    formVersion: {
      create: vi.fn().mockResolvedValue({
        id: "version_1",
      }),
    },
  };

  const db = {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
    formDocument: {
      findMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({
        id: "document_1",
        currentVersionId: "version_1",
        versions: [
          {
            versionNumber: state.latestVersionNumber,
          },
        ],
      }),
      update: vi.fn().mockResolvedValue({
        id: "document_1",
      }),
    },
    formVersion: {
      findFirst: vi.fn(),
      create: vi.fn().mockImplementation(async ({ data }) => {
        state.latestVersionNumber = data.versionNumber as number;

        return {
          id: `version_${data.versionNumber}`,
        };
      }),
    },
    requiredFormAssignment: {
      findFirst: vi.fn().mockImplementation(async ({ where }) =>
        state.assignments.find(
          (assignment) =>
            assignment.workspaceId === where.workspaceId &&
            assignment.formDocumentId === where.formDocumentId &&
            assignment.requirementTarget === where.requirementTarget,
        ) ?? null,
      ),
      create: vi.fn().mockImplementation(async ({ data }) => {
        state.assignments.push({
          id: `assignment_${state.assignments.length + 1}`,
          workspaceId: data.workspaceId,
          formDocumentId: data.formDocumentId,
          requirementTarget: data.requirementTarget,
          isActive: data.isActive,
        });

        return {
          id: `assignment_${state.assignments.length}`,
        };
      }),
      update: vi.fn().mockImplementation(async ({ where, data }) => {
        const assignment = state.assignments.find((item) => item.id === where.id);

        if (assignment) {
          assignment.isActive = data.isActive;
        }

        return {
          id: where.id,
        };
      }),
      count: vi.fn().mockImplementation(async ({ where }) =>
        state.assignments.filter(
          (assignment) =>
            assignment.workspaceId === where.workspaceId &&
            assignment.formDocumentId === where.formDocumentId &&
            assignment.isActive === where.isActive,
        ).length,
      ),
    },
    signatureRequest: {
      findMany: vi.fn().mockImplementation(async () => state.openRequests),
      updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
        let count = 0;

        for (const request of state.openRequests) {
          const matchesIdList =
            !where?.id?.in || where.id.in.includes(request.id as string);
          const matchesStatus = !where?.status || where.status === request.status;

          if (matchesIdList && matchesStatus) {
            Object.assign(request, data);
            count += 1;
          }
        }

        return { count };
      }),
    },
  };

  return {
    state,
    tx,
    db: db as unknown as AdminFormsTestDb,
  };
}

describe("admin forms helpers", () => {
  it("creates a form document with an initial PDF version", async () => {
    const { db, tx } = createMockDb();

    await expect(
      createFormDocumentWithInitialVersion({
        workspaceId: "workspace_1",
        uploadedByWorkspaceUserId: "workspace_user_1",
        input: {
          name: " Adult Waiver ",
          formType: "WAIVER",
          description: " Required before first class ",
          fileName: "adult-waiver.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 8,
          fileData: new Uint8Array(Buffer.from("%PDF-1.7")),
        },
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      formDocumentId: "document_1",
    });

    expect(tx.formDocument.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        name: "Adult Waiver",
        formType: "WAIVER",
        description: "Required before first class",
      },
      select: {
        id: true,
      },
    });
    expect(tx.formVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace_1",
          formDocumentId: "document_1",
          versionNumber: 1,
          uploadedByWorkspaceUserId: "workspace_user_1",
          fileName: "adult-waiver.pdf",
          mimeType: "application/pdf",
        }),
      }),
    );
    expect(tx.formDocument.update).toHaveBeenCalledWith({
      where: {
        id: "document_1",
      },
      data: {
        currentVersionId: "version_1",
      },
    });
  });

  it("creates a new current version and cancels stale open requests", async () => {
    const { db, state } = createMockDb();

    await expect(
      createFormVersion({
        workspaceId: "workspace_1",
        uploadedByWorkspaceUserId: "workspace_user_1",
        input: {
          formDocumentId: "document_1",
          fileName: "adult-waiver-v2.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 8,
          fileData: new Uint8Array(Buffer.from("%PDF-2.0")),
        },
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      formDocumentId: "document_1",
      formVersionId: "version_2",
    });

    expect(db.formVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          versionNumber: 2,
          uploadedByWorkspaceUserId: "workspace_user_1",
        }),
      }),
    );
    expect(db.formDocument.update).toHaveBeenCalledWith({
      where: {
        id: "document_1",
      },
      data: {
        currentVersionId: "version_2",
      },
    });
    expect(state.openRequests).toEqual([
      {
        id: "request_old",
        formVersionId: "version_1",
        status: "CANCELLED",
      },
    ]);
  });

  it("deactivates an assignment and cancels old open requests when nothing remains active", async () => {
    const { db, state } = createMockDb();

    await setRequiredFormAssignment({
      workspaceId: "workspace_1",
      formDocumentId: "document_1",
      requirementTarget: "TRIAL",
      isActive: false,
      db,
    });

    expect(db.requiredFormAssignment.update).toHaveBeenCalledWith({
      where: {
        id: "assignment_1",
      },
      data: {
        isActive: false,
      },
    });
    expect(state.openRequests).toEqual([
      {
        id: "request_old",
        formVersionId: "version_1",
        status: "CANCELLED",
      },
    ]);
  });
});
