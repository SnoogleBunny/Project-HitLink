import { describe, expect, it, vi } from "vitest";
import { FormRequirementError } from "@flowstate/db";
import { consumedErrorFixtures } from "./test-support/consumed-error-fixtures";
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
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    workspaceUser: { findFirst: vi.fn().mockResolvedValue({ id: "workspace_user_1", userId: "owner_1", role: "OWNER" }) },
    formDocument: {
      findFirst: vi.fn().mockImplementation(async () => ({ id: "document_1", currentVersionId: "version_1", versions: [{ versionNumber: state.latestVersionNumber }] })),
      create: vi.fn().mockResolvedValue({
        id: "document_1",
      }),
      update: vi.fn().mockResolvedValue({
        id: "document_1",
      }),
    },
    formVersion: {
      create: vi.fn().mockImplementation(async ({ data }) => { state.latestVersionNumber = data.versionNumber; return { id: `version_${data.versionNumber}` }; }),
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

  db.formVersion.create = tx.formVersion.create;
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

  it("uploads a draft version without switching the requirement or cancelling accepted requests", async () => {
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
    expect(db.formDocument.update).not.toHaveBeenCalled();
    expect(state.openRequests).toEqual([
      {
        id: "request_old",
        formVersionId: "version_1",
        status: "OPEN",
      },
    ]);
  });

  it("requires previewed publication before changing requirement contexts", async () => {
    const { db, state } = createMockDb();
    await expect(setRequiredFormAssignment({ workspaceId: "workspace_1", formDocumentId: "document_1", requirementTarget: "TRIAL", isActive: false, db })).rejects.toThrow("Preview and publish");
    expect(state.assignments[0]?.isActive).toBe(true);
    expect(state.openRequests[0]?.status).toBe("OPEN");
    expect(db.requiredFormAssignment.update).not.toHaveBeenCalled();
  });
});

describe("form actual-consumer error projection", () => {
  const input = { fileName: "waiver.pdf", mimeType: "application/pdf", fileSizeBytes: 8, fileData: new Uint8Array(Buffer.from("%PDF-1.7")) };
  const commands = [
    ["document", (db: AdminFormsTestDb) => createFormDocumentWithInitialVersion({ workspaceId: "workspace_1", uploadedByWorkspaceUserId: "workspace_user_1", input: { ...input, name: "Waiver", formType: "WAIVER" }, db })],
    ["version", (db: AdminFormsTestDb) => createFormVersion({ workspaceId: "workspace_1", uploadedByWorkspaceUserId: "workspace_user_1", input: { ...input, formDocumentId: "document_1" }, db })],
  ] as const;

  for (const [commandName, command] of commands) {
    it.each(consumedErrorFixtures(new FormRequirementError("Owned policy failure")))(`${commandName} rethrows $label unchanged without evaluating getters or proxy traps`, async (fixture) => {
      const { db, tx } = createMockDb();
      tx.workspaceUser.findFirst.mockRejectedValueOnce(fixture.error);
      let caught: unknown;
      try { await command(db); } catch (error) { caught = error; }
      expect(caught === fixture.error).toBe(true);
      expect(fixture.reads()).toBe(0);
      expect(tx.formDocument.create).not.toHaveBeenCalled();
      expect(tx.formVersion.create).not.toHaveBeenCalled();
    });

    it(`${commandName} retains the actual missing-owner domain message`, async () => {
      const { db, tx } = createMockDb();
      tx.workspaceUser.findFirst.mockResolvedValueOnce(null);
      await expect(command(db)).resolves.toEqual({ status: "error", message: "Active owner membership not found." });
      expect(tx.formDocument.create).not.toHaveBeenCalled();
      expect(tx.formVersion.create).not.toHaveBeenCalled();
    });
  }
});
