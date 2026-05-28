import { describe, expect, it, vi } from "vitest";
import {
  FORM_PDF_MAX_SIZE_BYTES,
  getPortalSignatureRequestForMember,
  recordLocalFormSignature,
  resolveRequiredFormStatusesForMember,
  validatePdfUpload,
  type FormsDatabase,
} from "@flowstate/db";

function createBaseMember() {
  return {
    id: "member_1",
    workspaceId: "workspace_1",
    userId: null,
    fullName: "Jordan Lee",
    email: "jordan@example.com",
    status: "TRIAL" as "TRIAL" | "ACTIVE" | "OVERDUE" | "FROZEN" | "CANCELLED" | "WAITLISTED",
    familyLinks: [] as Array<{
      guardian: {
        id: string;
        fullName: string;
        email: string | null;
      };
    }>,
  };
}

function createAssignment(args?: {
  requirementTarget?: "TRIAL" | "MEMBER" | "GUARDIAN" | "MEMBERSHIP_ACTIVATION";
  formDocumentId?: string;
  currentVersionId?: string;
  currentVersionNumber?: number;
  formName?: string;
}) {
  return {
    id: "assignment_1",
    requirementTarget: args?.requirementTarget ?? "MEMBER",
    formDocument: {
      id: args?.formDocumentId ?? "document_1",
      name: args?.formName ?? "Membership Agreement",
      formType: "MEMBERSHIP_AGREEMENT" as const,
      description: null,
      currentVersionId: args?.currentVersionId ?? "version_current",
      currentVersion: {
        id: args?.currentVersionId ?? "version_current",
        versionNumber: args?.currentVersionNumber ?? 2,
        createdAt: new Date("2026-04-10T12:00:00.000Z"),
      },
    },
  };
}

function createFormsDb(args?: {
  member?: ReturnType<typeof createBaseMember>;
  assignments?: ReturnType<typeof createAssignment>[];
  openRequests?: Array<Record<string, unknown>>;
  signedDocuments?: Array<Record<string, unknown>>;
}) {
  const state = {
    member: args?.member ?? createBaseMember(),
    assignments: args?.assignments ?? [createAssignment()],
    openRequests: [...(args?.openRequests ?? [])],
    signedDocuments: [...(args?.signedDocuments ?? [])],
  };

  const signatureRequestUpdateMany = vi.fn(async ({ where, data }) => {
    let count = 0;

    for (const request of state.openRequests) {
      const matchesIdList =
        !where?.id?.in || where.id.in.includes(request.id as string);
      const matchesIdNot =
        !where?.id?.not || where.id.not !== request.id;
      const matchesWorkspace =
        !where?.workspaceId || where.workspaceId === request.workspaceId;
      const matchesMember =
        !where?.memberId || where.memberId === request.memberId;
      const matchesVersion =
        !where?.formVersionId || where.formVersionId === request.formVersionId;
      const matchesGuardian =
        !where?.guardianId || where.guardianId === request.guardianId;
      const matchesSigner =
        !where?.signerKind || where.signerKind === request.signerKind;
      const matchesStatus = !where?.status || where.status === request.status;
      const matchesAccessMethod =
        !where?.accessMethod || where.accessMethod === request.accessMethod;
      const expiresAt = request.expiresAt as Date | null;
      const matchesExpiry =
        !where?.expiresAt?.lt ||
        (expiresAt !== null && expiresAt < where.expiresAt.lt);

      if (
        matchesIdList &&
        matchesIdNot &&
        matchesWorkspace &&
        matchesMember &&
        matchesVersion &&
        matchesGuardian &&
        matchesSigner &&
        matchesStatus &&
        matchesAccessMethod &&
        matchesExpiry
      ) {
        Object.assign(request, data);
        count += 1;
      }
    }

    return {
      count,
    };
  });

  const db = {
    member: {
      findFirst: vi.fn().mockImplementation(async () => state.member),
    },
    requiredFormAssignment: {
      findMany: vi.fn().mockImplementation(async () => state.assignments),
    },
    signatureRequest: {
      updateMany: signatureRequestUpdateMany,
      findMany: vi.fn().mockImplementation(async () => state.openRequests),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const created = {
          id: `request_${state.openRequests.length + 1}`,
          formVersionId: data.formVersionId,
          memberId: data.memberId,
          guardianId: data.guardianId ?? null,
          signerKind: data.signerKind,
          accessMethod: data.accessMethod,
          status: "OPEN",
          expiresAt: data.expiresAt ?? null,
          completedAt: null,
          workspaceId: data.workspaceId,
        };

        state.openRequests.push(created);

        return created;
      }),
      update: vi.fn().mockResolvedValue({
        id: "request_1",
      }),
      findFirst: vi.fn(),
    },
    signedDocument: {
      findMany: vi.fn().mockImplementation(async () => state.signedDocuments),
      findFirst: vi.fn(),
    },
    formDocument: {
      findFirst: vi.fn().mockResolvedValue({
        currentVersionId: "version_current",
      }),
    },
    $transaction: vi.fn(),
  };

  return {
    state,
    db: db as unknown as FormsDatabase,
    signatureRequestUpdateMany,
  };
}

describe("forms domain helpers", () => {
  it("validates PDF uploads with a hard 10 MB size cap", () => {
    expect(
      validatePdfUpload({
        fileName: "waiver.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: pdfHeaderBytes().length,
        fileData: pdfHeaderBytes(),
      }),
    ).toMatchObject({
      status: "ok",
      normalizedMimeType: "application/pdf",
    });

    expect(
      validatePdfUpload({
        fileName: "waiver.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: FORM_PDF_MAX_SIZE_BYTES + 1,
        fileData: pdfHeaderBytes(),
      }),
    ).toEqual({
      status: "error",
      message: "PDFs must be 10 MB or smaller.",
    });
  });

  it("marks an older signature as superseded when the current version changes", async () => {
    const member = createBaseMember();
    member.status = "ACTIVE";
    const { db } = createFormsDb({
      member,
      signedDocuments: [
        {
          id: "signed_1",
          formVersionId: "version_old",
          signerKind: "MEMBER",
          guardianId: null,
          signerNameSnapshot: "Jordan Lee",
          signerEmailSnapshot: "jordan@example.com",
          signedAt: new Date("2026-04-01T10:00:00.000Z"),
          formVersion: {
            id: "version_old",
            versionNumber: 1,
            formDocumentId: "document_1",
            formDocument: {
              id: "document_1",
              name: "Membership Agreement",
              formType: "MEMBERSHIP_AGREEMENT",
            },
          },
          guardian: null,
        },
      ],
    });

    const result = await resolveRequiredFormStatusesForMember({
      workspaceId: "workspace_1",
      memberId: "member_1",
      targets: ["MEMBER"],
      db,
    });

    expect(result.items).toMatchObject([
      {
        formName: "Membership Agreement",
        status: "SUPERSEDED",
      },
    ]);
  });

  it("creates a guardian magic-link request and reports pending status", async () => {
    process.env.FORMS_MAGIC_LINK_SECRET = "test-secret";

    const member = createBaseMember();
    member.familyLinks = [
      {
        guardian: {
          id: "guardian_1",
          fullName: "Alex Lee",
          email: "alex@example.com",
        },
      },
    ];
    const { db, state } = createFormsDb({
      member,
      assignments: [
        createAssignment({
          requirementTarget: "GUARDIAN",
          formName: "Child Waiver",
        }),
      ],
    });

    const result = await resolveRequiredFormStatusesForMember({
      workspaceId: "workspace_1",
      memberId: "member_1",
      targets: ["GUARDIAN"],
      db,
      now: new Date("2026-04-10T12:00:00.000Z"),
    });

    expect(state.openRequests).toHaveLength(1);
    expect(result.items).toMatchObject([
      {
        formName: "Child Waiver",
        status: "PENDING",
        openRequests: [
          {
            guardianId: "guardian_1",
            guardianName: "Alex Lee",
          },
        ],
      },
    ]);
  });

  it("records the first guardian signature and cancels sibling open requests", async () => {
    const now = new Date("2026-04-10T13:00:00.000Z");
    const tx = {
      signedDocument: {
        create: vi.fn().mockResolvedValue({
          id: "signed_1",
        }),
      },
      signatureRequest: {
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
      },
    };
    const db = {
      signatureRequest: {
        updateMany: vi.fn().mockResolvedValue({
          count: 0,
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: "request_1",
          workspaceId: "workspace_1",
          formVersionId: "version_current",
          memberId: "member_1",
          guardianId: "guardian_1",
          signerKind: "GUARDIAN",
          accessMethod: "MAGIC_LINK",
          status: "OPEN",
          tokenHash: "hash",
          expiresAt: new Date("2026-04-17T13:00:00.000Z"),
          viewedAt: null,
          completedAt: null,
          member: {
            id: "member_1",
            fullName: "Jordan Lee",
            email: "jordan@example.com",
            workspaceId: "workspace_1",
            userId: null,
          },
          guardian: {
            id: "guardian_1",
            fullName: "Alex Lee",
            email: "alex@example.com",
          },
          formVersion: {
            id: "version_current",
            versionNumber: 2,
            fileName: "guardian-waiver.pdf",
            mimeType: "application/pdf",
            fileData: pdfHeaderBytes(),
            createdAt: now,
            formDocument: {
              id: "document_1",
              name: "Guardian Waiver",
              description: null,
              formType: "CHILD_GUARDIAN_WAIVER",
              currentVersionId: "version_current",
              assignments: [
                {
                  id: "assignment_1",
                  requirementTarget: "GUARDIAN",
                  isActive: true,
                },
              ],
            },
          },
          signedDocument: null,
        }),
      },
      signedDocument: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    } as unknown as FormsDatabase;

    const result = await recordLocalFormSignature({
      workspaceId: "workspace_1",
      memberId: "member_1",
      requestId: "request_1",
      signerName: "Alex Lee",
      signerEmail: "alex@example.com",
      db,
      now,
    });

    expect(result).toEqual({
      status: "signed",
      signedDocumentId: "signed_1",
    });
    expect(tx.signedDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guardianId: "guardian_1",
          signerKind: "GUARDIAN",
          signerNameSnapshot: "Alex Lee",
        }),
      }),
    );
    expect(tx.signatureRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberId: "member_1",
          formVersionId: "version_current",
          signerKind: "GUARDIAN",
        }),
        data: {
          status: "CANCELLED",
        },
      }),
    );
  });

  it("returns portal signing data only for the owning member", async () => {
    const now = new Date("2026-04-10T14:00:00.000Z");
    const db = {
      signatureRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: "request_1",
          workspaceId: "workspace_1",
          formVersionId: "version_current",
          memberId: "member_1",
          guardianId: null,
          signerKind: "MEMBER",
          accessMethod: "PORTAL",
          status: "OPEN",
          tokenHash: null,
          expiresAt: null,
          viewedAt: null,
          completedAt: null,
          member: {
            id: "member_1",
            fullName: "Jordan Lee",
            email: "jordan@example.com",
            workspaceId: "workspace_1",
            userId: "user_1",
          },
          guardian: null,
          formVersion: {
            id: "version_current",
            versionNumber: 2,
            fileName: "membership-agreement.pdf",
            mimeType: "application/pdf",
            fileData: pdfHeaderBytes(),
            createdAt: now,
            formDocument: {
              id: "document_1",
              name: "Membership Agreement",
              description: null,
              formType: "MEMBERSHIP_AGREEMENT",
              currentVersionId: "version_current",
              assignments: [
                {
                  id: "assignment_1",
                  requirementTarget: "MEMBER",
                  isActive: true,
                },
              ],
            },
          },
          signedDocument: null,
        }),
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
      },
    } as unknown as FormsDatabase;

    await expect(
      getPortalSignatureRequestForMember({
        workspaceId: "workspace_1",
        memberId: "member_1",
        requestId: "request_1",
        db,
        now,
      }),
    ).resolves.toMatchObject({
      requestId: "request_1",
      memberId: "member_1",
      accessMethod: "PORTAL",
    });

    await expect(
      getPortalSignatureRequestForMember({
        workspaceId: "workspace_1",
        memberId: "member_2",
        requestId: "request_1",
        db,
        now,
      }),
    ).resolves.toBeNull();
  });
});

function pdfHeaderBytes(): Uint8Array {
  return new TextEncoder().encode("%PDF-1.7 mock");
}
