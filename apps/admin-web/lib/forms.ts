import { readDatabaseFailure, readOwnedErrorMessage, lockClassSchedule, requireActiveStaffAccessTx, FormRequirementError, listEffectiveFormAssignments } from "@flowstate/db";
import {
  FORM_PDF_MAX_SIZE_BYTES,
  prisma,
  validatePdfUpload,
  type FormType,
  type RequirementTarget,
} from "@flowstate/db";

export interface AdminFormDocumentListItem {
  id: string;
  name: string;
  formType: FormType;
  description: string | null;
  archivedAt: Date | null;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  currentVersionCreatedAt: Date | null;
  versionCount: number;
  activeRequirementTargets: RequirementTarget[];
}

export interface AdminFormVersionSummary {
  id: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  fileSha256: string;
  createdAt: Date;
  uploadedByWorkspaceUser: {
    id: string;
    user: {
      email: string;
      fullName: string | null;
    };
  };
}

export interface AdminFormDocumentDetail extends AdminFormDocumentListItem {
  versions: AdminFormVersionSummary[];
}

export interface CreateAdminFormDocumentInput {
  name: string;
  formType: FormType;
  description?: string;
  fileName: string;
  mimeType: string | null;
  fileData: Uint8Array<ArrayBufferLike>;
  fileSizeBytes: number;
}

export interface CreateAdminFormVersionInput {
  formDocumentId: string;
  fileName: string;
  mimeType: string | null;
  fileData: Uint8Array<ArrayBufferLike>;
  fileSizeBytes: number;
}

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function normalizeFormName(value: string): string {
  return value.trim();
}

function getDuplicateDocumentConstraintError(error: unknown): boolean {
  const failure = readDatabaseFailure(error);
  return Boolean(
    failure?.code === "P2002" &&
    failure.target?.includes("workspaceId") &&
    failure.target?.includes("name"),
  );
}

export function formatFormType(value: FormType): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatRequirementTarget(value: RequirementTarget): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function getMemberAppUrl(): string {
  return process.env.NEXT_PUBLIC_MEMBER_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
}

export function formatBytesAsMegabytes(value: number): string {
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listWorkspaceFormDocuments(args: {
  workspaceId: string;
  db?: typeof prisma;
}): Promise<AdminFormDocumentListItem[]> {
  const db = args.db ?? prisma;
  const documents = await db.formDocument.findMany({
    where: {
      workspaceId: args.workspaceId,
    },
    select: {
      id: true,
      name: true,
      formType: true,
      description: true,
      archivedAt: true,
      currentVersionId: true,
      currentVersion: {
        select: {
          versionNumber: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          versions: true,
        },
      },
      assignments: {
        where: {
          isActive: true,
        },
        select: {
          requirementTarget: true,
        },
        orderBy: {
          requirementTarget: "asc",
        },
      },
    },
    orderBy: [
      {
        archivedAt: "asc",
      },
      {
        name: "asc",
      },
    ],
  });

  const effective = await listEffectiveFormAssignments({ db, workspaceId: args.workspaceId, now: new Date() });
  return documents.map((document) => ({
    id: document.id,
    name: document.name,
    formType: document.formType,
    description: document.description,
    archivedAt: document.archivedAt,
    currentVersionId: effective.find(row => row.formDocument.id === document.id)?.formDocument.currentVersion.id ?? document.currentVersionId,
    currentVersionNumber: effective.find(row => row.formDocument.id === document.id)?.formDocument.currentVersion.versionNumber ?? document.currentVersion?.versionNumber ?? null,
    currentVersionCreatedAt: effective.find(row => row.formDocument.id === document.id)?.formDocument.currentVersion.createdAt ?? document.currentVersion?.createdAt ?? null,
    versionCount: document._count.versions,
    activeRequirementTargets: effective.filter(row => row.formDocument.id === document.id).map(row => row.requirementTarget),
  }));
}

export async function getFormDocumentDetail(args: {
  workspaceId: string;
  formDocumentId: string;
  db?: typeof prisma;
}): Promise<AdminFormDocumentDetail | null> {
  const db = args.db ?? prisma;
  const document = await db.formDocument.findFirst({
    where: {
      id: args.formDocumentId,
      workspaceId: args.workspaceId,
    },
    select: {
      id: true,
      name: true,
      formType: true,
      description: true,
      archivedAt: true,
      currentVersionId: true,
      currentVersion: {
        select: {
          versionNumber: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          versions: true,
        },
      },
      assignments: {
        where: {
          isActive: true,
        },
        select: {
          requirementTarget: true,
        },
        orderBy: {
          requirementTarget: "asc",
        },
      },
      versions: {
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          mimeType: true,
          fileSizeBytes: true,
          fileSha256: true,
          createdAt: true,
          uploadedByWorkspaceUser: {
            select: {
              id: true,
              user: {
                select: {
                  email: true,
                  fullName: true,
                },
              },
            },
          },
        },
        orderBy: {
          versionNumber: "desc",
        },
      },
    },
  });

  if (!document) {
    return null;
  }

  const effective = await listEffectiveFormAssignments({ db, workspaceId: args.workspaceId, now: new Date() });
  const current = effective.find(row => row.formDocument.id === document.id);
  return {
    id: document.id,
    name: document.name,
    formType: document.formType,
    description: document.description,
    archivedAt: document.archivedAt,
    currentVersionId: current?.formDocument.currentVersion.id ?? document.currentVersionId,
    currentVersionNumber: current?.formDocument.currentVersion.versionNumber ?? document.currentVersion?.versionNumber ?? null,
    currentVersionCreatedAt: current?.formDocument.currentVersion.createdAt ?? document.currentVersion?.createdAt ?? null,
    versionCount: document._count.versions,
    activeRequirementTargets: effective.filter(row => row.formDocument.id === document.id).map(row => row.requirementTarget),
    versions: document.versions,
  };
}

export async function getFormVersionFileForOwner(args: {
  workspaceId: string;
  formDocumentId: string;
  formVersionId: string;
  db?: typeof prisma;
}): Promise<{ fileName: string; mimeType: string; fileData: Uint8Array<ArrayBufferLike> } | null> {
  const db = args.db ?? prisma;
  const version = await db.formVersion.findFirst({
    where: {
      id: args.formVersionId,
      workspaceId: args.workspaceId,
      formDocumentId: args.formDocumentId,
    },
    select: {
      fileName: true,
      mimeType: true,
      fileData: true,
    },
  });

  return version ?? null;
}

export async function createFormDocumentWithInitialVersion(args: {
  workspaceId: string;
  uploadedByWorkspaceUserId: string;
  input: CreateAdminFormDocumentInput;
  db?: typeof prisma;
}):
  Promise<
    | {
        status: "created";
        formDocumentId: string;
      }
    | {
        status: "error";
        message: string;
      }
  > {
  const name = normalizeFormName(args.input.name);

  if (!name) {
    return {
      status: "error",
      message: "Form name is required.",
    };
  }

  const validation = validatePdfUpload({
    fileName: args.input.fileName,
    mimeType: args.input.mimeType,
    fileData: args.input.fileData,
    fileSizeBytes: args.input.fileSizeBytes,
  });

  if (validation.status === "error") {
    return validation;
  }

  try {
    const db = args.db ?? prisma;
    const createdDocument = await db.$transaction(async (tx) => {
      await lockClassSchedule(tx, args.workspaceId);
      const actor = await tx.workspaceUser.findFirst({ where: { id: args.uploadedByWorkspaceUserId, workspaceId: args.workspaceId }, select: { userId: true } });
      if (!actor) throw new FormRequirementError("Active owner membership not found.");
      await requireActiveStaffAccessTx(tx, { workspaceId: args.workspaceId, userId: actor.userId, capability: "OWNER" });
      const document = await tx.formDocument.create({
        data: {
          workspaceId: args.workspaceId,
          name,
          formType: args.input.formType,
          description: cleanNullable(args.input.description),
        },
        select: {
          id: true,
        },
      });
      const version = await tx.formVersion.create({
        data: {
          workspaceId: args.workspaceId,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: args.input.fileName.trim(),
          mimeType: validation.normalizedMimeType,
          fileSizeBytes: args.input.fileSizeBytes,
          fileSha256: validation.sha256,
          fileData: Buffer.from(args.input.fileData),
          uploadedByWorkspaceUserId: args.uploadedByWorkspaceUserId,
        },
        select: {
          id: true,
        },
      });

      await tx.formDocument.update({
        where: {
          id: document.id,
        },
        data: {
          currentVersionId: version.id,
        },
      });

      return document;
    });

    return {
      status: "created",
      formDocumentId: createdDocument.id,
    };
  } catch (error) {
    const message = readOwnedErrorMessage(error, FormRequirementError.prototype);
    if (message !== null) return { status: "error", message };
    if (getDuplicateDocumentConstraintError(error)) {
      return {
        status: "error",
        message: "A form with that name already exists.",
      };
    }

    throw error;
  }
}

export async function createFormVersion(args: {
  workspaceId: string; uploadedByWorkspaceUserId: string; input: CreateAdminFormVersionInput; db?: typeof prisma;
}): Promise<{ status: "created"; formDocumentId: string; formVersionId: string } | { status: "error"; message: string }> {
  const validation = validatePdfUpload(args.input);
  if (validation.status === "error") return validation;
  const db = args.db ?? prisma;
  try {
    return await db.$transaction(async tx => {
      await lockClassSchedule(tx, args.workspaceId);
      const actor = await tx.workspaceUser.findFirst({ where: { id: args.uploadedByWorkspaceUserId, workspaceId: args.workspaceId }, select: { userId: true } });
      if (!actor) throw new FormRequirementError("Active owner membership not found.");
      await requireActiveStaffAccessTx(tx, { workspaceId: args.workspaceId, userId: actor.userId, capability: "OWNER" });
      await tx.$queryRaw`SELECT id FROM form_documents WHERE id=${args.input.formDocumentId} AND "workspaceId"=${args.workspaceId} FOR UPDATE`;
      const document = await tx.formDocument.findFirst({ where: { id: args.input.formDocumentId, workspaceId: args.workspaceId, archivedAt: null }, include: { versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } } });
      if (!document) throw new FormRequirementError("Form document not found.");
      const version = await tx.formVersion.create({ data: { workspaceId: args.workspaceId, formDocumentId: document.id, versionNumber: (document.versions[0]?.versionNumber ?? 0) + 1, fileName: args.input.fileName.trim(), mimeType: validation.normalizedMimeType, fileSizeBytes: args.input.fileSizeBytes, fileSha256: validation.sha256, fileData: Buffer.from(args.input.fileData), uploadedByWorkspaceUserId: args.uploadedByWorkspaceUserId } });
      return { status: "created" as const, formDocumentId: document.id, formVersionId: version.id };
    });
  } catch (error) {
    const message = readOwnedErrorMessage(error, FormRequirementError.prototype);
    if (message !== null) return { status: "error", message };
    throw error;
  }
}

export async function setRequiredFormAssignment(_args: { workspaceId: string; formDocumentId: string; requirementTarget: RequirementTarget; isActive: boolean; db?: typeof prisma }): Promise<void> {
  void _args;
  throw new FormRequirementError("Preview and publish the requirement's timing, affected people and recovery before changing contexts.");
}

export function getPdfSizeCapLabel(): string {
  return `${formatBytesAsMegabytes(FORM_PDF_MAX_SIZE_BYTES)} max`;
}
