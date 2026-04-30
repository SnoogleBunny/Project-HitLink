import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type {
  FormSignerKind,
  FormType,
  MemberStatus,
  RequirementTarget,
  SignatureAccessMethod,
  SignatureRequestStatus,
} from "@prisma/client";
import { prisma } from "./client.js";

export type FormsDatabase = typeof prisma;

export const FORM_PDF_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const MAGIC_LINK_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const pdfHeader = "%PDF-";

type RequiredFormState =
  | "SIGNED"
  | "PENDING"
  | "MISSING"
  | "SUPERSEDED";

interface MemberContextRecord {
  id: string;
  workspaceId: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  status: MemberStatus;
  familyLinks: Array<{
    guardian: {
      id: string;
      fullName: string;
      email: string | null;
    };
  }>;
}

interface ActiveAssignmentRecord {
  id: string;
  requirementTarget: RequirementTarget;
  formDocument: {
    id: string;
    name: string;
    formType: FormType;
    description: string | null;
    currentVersionId: string | null;
    currentVersion: {
      id: string;
      versionNumber: number;
      createdAt: Date;
    } | null;
  };
}

interface OpenRequestRecord {
  id: string;
  formVersionId: string;
  memberId: string;
  guardianId: string | null;
  signerKind: FormSignerKind;
  accessMethod: SignatureAccessMethod;
  status: SignatureRequestStatus;
  expiresAt: Date | null;
  completedAt: Date | null;
}

interface SignedDocumentRecord {
  id: string;
  formVersionId: string;
  signerKind: FormSignerKind;
  guardianId: string | null;
  signerNameSnapshot: string;
  signerEmailSnapshot: string | null;
  signedAt: Date;
  formVersion: {
    id: string;
    versionNumber: number;
    formDocumentId: string;
    formDocument: {
      id: string;
      name: string;
      formType: FormType;
    };
  };
  guardian: {
    id: string;
    fullName: string;
  } | null;
}

interface SignatureRequestDetailRecord {
  id: string;
  workspaceId: string;
  formVersionId: string;
  memberId: string;
  guardianId: string | null;
  signerKind: FormSignerKind;
  accessMethod: SignatureAccessMethod;
  status: SignatureRequestStatus;
  tokenHash: string | null;
  expiresAt: Date | null;
  viewedAt: Date | null;
  completedAt: Date | null;
  member: {
    id: string;
    fullName: string;
    email: string | null;
    workspaceId: string;
    userId: string | null;
  };
  guardian: {
    id: string;
    fullName: string;
    email: string | null;
  } | null;
  formVersion: {
    id: string;
    versionNumber: number;
    fileName: string;
    mimeType: string;
    fileData: Uint8Array;
    createdAt: Date;
    formDocument: {
      id: string;
      name: string;
      description: string | null;
      formType: FormType;
      currentVersionId: string | null;
      assignments: Array<{
        id: string;
        requirementTarget: RequirementTarget;
        isActive: boolean;
      }>;
    };
  };
  signedDocument: {
    id: string;
    signedAt: Date;
    signerNameSnapshot: string;
    guardianId: string | null;
  } | null;
}

export interface PdfUploadValidationInput {
  fileName: string;
  mimeType: string | null;
  fileSizeBytes: number;
  fileData: Uint8Array;
}

export type PdfUploadValidationResult =
  | {
      status: "ok";
      normalizedMimeType: "application/pdf";
      sha256: string;
    }
  | {
      status: "error";
      message: string;
    };

export interface ActionableFormRequest {
  requestId: string;
  accessMethod: SignatureAccessMethod;
  signerKind: FormSignerKind;
  guardianId: string | null;
  guardianName: string | null;
  expiresAt: Date | null;
}

export interface RequiredFormStatusItem {
  assignmentId: string;
  requirementTarget: RequirementTarget;
  formDocumentId: string;
  formName: string;
  formType: FormType;
  description: string | null;
  signerKind: FormSignerKind;
  currentVersionId: string;
  currentVersionNumber: number;
  currentVersionCreatedAt: Date;
  status: RequiredFormState;
  signedAt: Date | null;
  signedDocumentId: string | null;
  signedByName: string | null;
  openRequests: ActionableFormRequest[];
}

export interface SignedFormHistoryItem {
  signedDocumentId: string;
  formDocumentId: string;
  formName: string;
  formType: FormType;
  versionId: string;
  versionNumber: number;
  signerKind: FormSignerKind;
  guardianId: string | null;
  guardianName: string | null;
  signerNameSnapshot: string;
  signerEmailSnapshot: string | null;
  signedAt: Date;
}

export interface ResolvedRequiredFormStatusResult {
  items: RequiredFormStatusItem[];
  history: SignedFormHistoryItem[];
}

export interface IssuedMagicLinkRequest {
  requestId: string;
  token: string;
  formDocumentId: string;
  formName: string;
  formType: FormType;
  versionId: string;
  versionNumber: number;
  signerKind: FormSignerKind;
  guardianId: string | null;
  guardianName: string | null;
  expiresAt: Date;
}

export interface SignatureRequestPageData {
  requestId: string;
  workspaceId: string;
  formDocumentId: string;
  formName: string;
  formType: FormType;
  description: string | null;
  versionId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  fileData: Uint8Array;
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  guardianId: string | null;
  guardianName: string | null;
  guardianEmail: string | null;
  signerKind: FormSignerKind;
  accessMethod: SignatureAccessMethod;
  status: SignatureRequestStatus;
  viewedAt: Date | null;
  completedAt: Date | null;
  signedDocumentId: string | null;
  signedAt: Date | null;
  signedByName: string | null;
}

export type RecordLocalFormSignatureResult =
  | {
      status: "signed";
      signedDocumentId: string;
    }
  | {
      status: "already_signed";
      signedDocumentId: string;
    }
  | {
      status: "error";
      message: string;
    };

function getFormsMagicLinkSecret(): string {
  const secret = process.env.FORMS_MAGIC_LINK_SECRET?.trim();

  if (!secret) {
    throw new Error("FORMS_MAGIC_LINK_SECRET is not configured.");
  }

  return secret;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashBytes(value: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function buildMagicLinkSignature(requestId: string): string {
  return createHmac("sha256", getFormsMagicLinkSecret())
    .update(requestId)
    .digest("base64url");
}

function parseMagicLinkToken(
  token: string,
): { requestId: string; signature: string } | null {
  const trimmed = token.trim();

  if (!trimmed) {
    return null;
  }

  const [requestId = "", signature = ""] = trimmed.split(".");

  if (!requestId || !signature) {
    return null;
  }

  return {
    requestId,
    signature,
  };
}

export function buildSignatureRequestToken(requestId: string): string {
  return `${requestId}.${buildMagicLinkSignature(requestId)}`;
}

export function buildMagicLinkPath(token: string): string {
  return `/sign/forms/${token}`;
}

export function validatePdfUpload(
  input: PdfUploadValidationInput,
): PdfUploadValidationResult {
  if (input.fileSizeBytes <= 0) {
    return {
      status: "error",
      message: "Upload a PDF file.",
    };
  }

  if (input.fileSizeBytes > FORM_PDF_MAX_SIZE_BYTES) {
    return {
      status: "error",
      message: "PDFs must be 10 MB or smaller.",
    };
  }

  if (input.mimeType && input.mimeType !== "application/pdf") {
    return {
      status: "error",
      message: "Only PDF uploads are supported.",
    };
  }

  const header = Buffer.from(input.fileData.slice(0, pdfHeader.length)).toString(
    "utf8",
  );

  if (header !== pdfHeader) {
    return {
      status: "error",
      message: "Only valid PDF uploads are supported.",
    };
  }

  return {
    status: "ok",
    normalizedMimeType: "application/pdf",
    sha256: hashBytes(input.fileData),
  };
}

function isRequirementTargetApplicable(args: {
  requirementTarget: RequirementTarget;
  memberStatus: MemberStatus;
  guardianCount: number;
}): boolean {
  if (args.requirementTarget === "TRIAL") {
    return args.memberStatus === "TRIAL";
  }

  if (args.requirementTarget === "MEMBER") {
    return args.memberStatus !== "TRIAL";
  }

  if (args.requirementTarget === "GUARDIAN") {
    return args.guardianCount > 0;
  }

  return true;
}

function getSignerKindForTarget(
  requirementTarget: RequirementTarget,
): FormSignerKind {
  return requirementTarget === "GUARDIAN" ? "GUARDIAN" : "MEMBER";
}

function getMemberContext(args: {
  workspaceId: string;
  memberId: string;
  db: FormsDatabase;
}) {
  return args.db.member.findFirst({
    where: {
      id: args.memberId,
      workspaceId: args.workspaceId,
    },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      fullName: true,
      email: true,
      status: true,
      familyLinks: {
        select: {
          guardian: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  }) as Promise<MemberContextRecord | null>;
}

function listActiveAssignments(args: {
  workspaceId: string;
  targets?: RequirementTarget[];
  db: FormsDatabase;
}) {
  return args.db.requiredFormAssignment.findMany({
    where: {
      workspaceId: args.workspaceId,
      isActive: true,
      ...(args.targets && args.targets.length > 0
        ? {
            requirementTarget: {
              in: args.targets,
            },
          }
        : {}),
      formDocument: {
        archivedAt: null,
        currentVersionId: {
          not: null,
        },
      },
    },
    select: {
      id: true,
      requirementTarget: true,
      formDocument: {
        select: {
          id: true,
          name: true,
          formType: true,
          description: true,
          currentVersionId: true,
          currentVersion: {
            select: {
              id: true,
              versionNumber: true,
              createdAt: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        requirementTarget: "asc",
      },
      {
        formDocument: {
          name: "asc",
        },
      },
    ],
  }) as Promise<ActiveAssignmentRecord[]>;
}

async function expireOpenMagicLinkRequests(args: {
  workspaceId: string;
  db: FormsDatabase;
  now: Date;
}): Promise<void> {
  await args.db.signatureRequest.updateMany({
    where: {
      workspaceId: args.workspaceId,
      status: "OPEN",
      accessMethod: "MAGIC_LINK",
      expiresAt: {
        lt: args.now,
      },
    },
    data: {
      status: "EXPIRED",
    },
  });
}

function listOpenRequests(args: {
  workspaceId: string;
  memberId: string;
  db: FormsDatabase;
}) {
  return args.db.signatureRequest.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      status: "OPEN",
    },
    select: {
      id: true,
      formVersionId: true,
      memberId: true,
      guardianId: true,
      signerKind: true,
      accessMethod: true,
      status: true,
      expiresAt: true,
      completedAt: true,
    },
  }) as Promise<OpenRequestRecord[]>;
}

function listSignedDocuments(args: {
  workspaceId: string;
  memberId: string;
  guardianIds: string[];
  db: FormsDatabase;
}) {
  return args.db.signedDocument.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      OR: [
        {
          signerKind: "MEMBER",
        },
        {
          signerKind: "GUARDIAN",
          guardianId: {
            in: args.guardianIds.length > 0 ? args.guardianIds : ["__no_guardian__"],
          },
        },
      ],
    },
    select: {
      id: true,
      formVersionId: true,
      signerKind: true,
      guardianId: true,
      signerNameSnapshot: true,
      signerEmailSnapshot: true,
      signedAt: true,
      formVersion: {
        select: {
          id: true,
          versionNumber: true,
          formDocumentId: true,
          formDocument: {
            select: {
              id: true,
              name: true,
              formType: true,
            },
          },
        },
      },
      guardian: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: [
      {
        signedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  }) as Promise<SignedDocumentRecord[]>;
}

async function createMagicLinkRequest(args: {
  workspaceId: string;
  formVersionId: string;
  memberId: string;
  guardianId: string | null;
  signerKind: FormSignerKind;
  expiresAt: Date;
  createdByWorkspaceUserId?: string;
  db: FormsDatabase;
}): Promise<OpenRequestRecord> {
  const created = await args.db.signatureRequest.create({
    data: {
      workspaceId: args.workspaceId,
      formVersionId: args.formVersionId,
      memberId: args.memberId,
      guardianId: args.guardianId,
      signerKind: args.signerKind,
      accessMethod: "MAGIC_LINK",
      expiresAt: args.expiresAt,
      createdByWorkspaceUserId: args.createdByWorkspaceUserId,
    },
    select: {
      id: true,
      formVersionId: true,
      memberId: true,
      guardianId: true,
      signerKind: true,
      accessMethod: true,
      status: true,
      expiresAt: true,
      completedAt: true,
    },
  });
  const token = buildSignatureRequestToken(created.id);

  await args.db.signatureRequest.update({
    where: {
      id: created.id,
    },
    data: {
      tokenHash: hashValue(token),
    },
  });

  return created;
}

async function createPortalRequest(args: {
  workspaceId: string;
  formVersionId: string;
  memberId: string;
  db: FormsDatabase;
}): Promise<OpenRequestRecord> {
  return args.db.signatureRequest.create({
    data: {
      workspaceId: args.workspaceId,
      formVersionId: args.formVersionId,
      memberId: args.memberId,
      guardianId: null,
      signerKind: "MEMBER",
      accessMethod: "PORTAL",
    },
    select: {
      id: true,
      formVersionId: true,
      memberId: true,
      guardianId: true,
      signerKind: true,
      accessMethod: true,
      status: true,
      expiresAt: true,
      completedAt: true,
    },
  });
}

export async function cancelObsoleteOpenRequestsForDocument(args: {
  workspaceId: string;
  formDocumentId: string;
  currentVersionId?: string | null;
  db?: FormsDatabase;
}): Promise<number> {
  const db = args.db ?? prisma;
  const currentVersionId =
    args.currentVersionId === undefined
      ? (
          await db.formDocument.findFirst({
            where: {
              id: args.formDocumentId,
              workspaceId: args.workspaceId,
            },
            select: {
              currentVersionId: true,
            },
          })
        )?.currentVersionId ?? null
      : args.currentVersionId;
  const openRequests = await db.signatureRequest.findMany({
    where: {
      workspaceId: args.workspaceId,
      status: "OPEN",
      formVersion: {
        formDocumentId: args.formDocumentId,
      },
    },
    select: {
      id: true,
      formVersionId: true,
    },
  });
  const idsToCancel = openRequests
    .filter((request) => request.formVersionId !== currentVersionId)
    .map((request) => request.id);

  if (idsToCancel.length === 0) {
    return 0;
  }

  const result = await db.signatureRequest.updateMany({
    where: {
      id: {
        in: idsToCancel,
      },
    },
    data: {
      status: "CANCELLED",
    },
  });

  return result.count;
}

async function ensureGuardianMagicLinkRequestsForMember(args: {
  workspaceId: string;
  member: MemberContextRecord;
  targets?: RequirementTarget[];
  db: FormsDatabase;
  now: Date;
}): Promise<void> {
  const applicableTargets = args.targets?.filter((target) => target === "GUARDIAN");

  if (args.member.familyLinks.length === 0 || applicableTargets?.length === 0) {
    return;
  }

  const guardianAssignments = (await listActiveAssignments({
    workspaceId: args.workspaceId,
    targets: ["GUARDIAN"],
    db: args.db,
  })).filter((assignment) =>
    isRequirementTargetApplicable({
      requirementTarget: assignment.requirementTarget,
      memberStatus: args.member.status,
      guardianCount: args.member.familyLinks.length,
    }),
  );
  const currentVersionIds = new Set(
    guardianAssignments
      .map((assignment) => assignment.formDocument.currentVersion?.id ?? null)
      .filter((value): value is string => Boolean(value)),
  );
  const currentSignedDocuments = await args.db.signedDocument.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.member.id,
      signerKind: "GUARDIAN",
      formVersionId: {
        in: Array.from(currentVersionIds),
      },
    },
    select: {
      id: true,
      formVersionId: true,
    },
  });
  const signedVersionIds = new Set(
    currentSignedDocuments.map((signedDocument) => signedDocument.formVersionId),
  );
  const openRequests = await listOpenRequests({
    workspaceId: args.workspaceId,
    memberId: args.member.id,
    db: args.db,
  });
  const activeGuardianKeys = new Set<string>();

  for (const assignment of guardianAssignments) {
    const currentVersionId = assignment.formDocument.currentVersion?.id;

    if (!currentVersionId || signedVersionIds.has(currentVersionId)) {
      continue;
    }

    for (const link of args.member.familyLinks) {
      activeGuardianKeys.add(`${currentVersionId}:${link.guardian.id}`);

      const existingOpen = openRequests.find(
        (request) =>
          request.formVersionId === currentVersionId &&
          request.signerKind === "GUARDIAN" &&
          request.guardianId === link.guardian.id &&
          request.accessMethod === "MAGIC_LINK" &&
          (!request.expiresAt || request.expiresAt > args.now),
      );

      if (existingOpen) {
        continue;
      }

      await createMagicLinkRequest({
        workspaceId: args.workspaceId,
        formVersionId: currentVersionId,
        memberId: args.member.id,
        guardianId: link.guardian.id,
        signerKind: "GUARDIAN",
        expiresAt: new Date(args.now.getTime() + MAGIC_LINK_EXPIRY_MS),
        db: args.db,
      });
    }
  }

  const guardianIds = new Set(args.member.familyLinks.map((link) => link.guardian.id));
  const staleOpenIds = openRequests
    .filter((request) => {
      if (
        request.signerKind !== "GUARDIAN" ||
        request.accessMethod !== "MAGIC_LINK" ||
        !request.guardianId
      ) {
        return false;
      }

      if (!guardianIds.has(request.guardianId)) {
        return true;
      }

      return !activeGuardianKeys.has(`${request.formVersionId}:${request.guardianId}`);
    })
    .map((request) => request.id);

  if (staleOpenIds.length > 0) {
    await args.db.signatureRequest.updateMany({
      where: {
        id: {
          in: staleOpenIds,
        },
      },
      data: {
        status: "CANCELLED",
      },
    });
  }
}

export async function ensureCurrentPortalRequestsForMember(args: {
  workspaceId: string;
  memberId: string;
  targets?: RequirementTarget[];
  db?: FormsDatabase;
  now?: Date;
}): Promise<void> {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  const member = await getMemberContext({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });

  if (!member?.userId) {
    return;
  }

  await expireOpenMagicLinkRequests({
    workspaceId: args.workspaceId,
    db,
    now,
  });

  const targets =
    args.targets && args.targets.length > 0
      ? args.targets
      : (["MEMBER", "MEMBERSHIP_ACTIVATION"] as RequirementTarget[]);
  const assignments = (await listActiveAssignments({
    workspaceId: args.workspaceId,
    targets,
    db,
  })).filter((assignment) =>
    isRequirementTargetApplicable({
      requirementTarget: assignment.requirementTarget,
      memberStatus: member.status,
      guardianCount: member.familyLinks.length,
    }),
  );
  const currentVersionIds = assignments
    .map((assignment) => assignment.formDocument.currentVersion?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const openRequests = await listOpenRequests({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });
  const currentSignedDocuments = await db.signedDocument.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      signerKind: "MEMBER",
      formVersionId: {
        in: currentVersionIds,
      },
    },
    select: {
      formVersionId: true,
    },
  });
  const signedVersionIds = new Set(
    currentSignedDocuments.map((signedDocument) => signedDocument.formVersionId),
  );

  for (const currentVersionId of currentVersionIds) {
    if (signedVersionIds.has(currentVersionId)) {
      continue;
    }

    const existingOpen = openRequests.find(
      (request) =>
        request.formVersionId === currentVersionId &&
        request.signerKind === "MEMBER" &&
        request.accessMethod === "PORTAL",
    );

    if (existingOpen) {
      continue;
    }

    await createPortalRequest({
      workspaceId: args.workspaceId,
      formVersionId: currentVersionId,
      memberId: args.memberId,
      db,
    });
  }

  const currentVersionIdSet = new Set(currentVersionIds);
  const staleRequestIds = openRequests
    .filter(
      (request) =>
        request.signerKind === "MEMBER" &&
        request.accessMethod === "PORTAL" &&
        !currentVersionIdSet.has(request.formVersionId),
    )
    .map((request) => request.id);

  if (staleRequestIds.length > 0) {
    await db.signatureRequest.updateMany({
      where: {
        id: {
          in: staleRequestIds,
        },
      },
      data: {
        status: "CANCELLED",
      },
    });
  }
}

export async function issueTrialMagicLinkRequests(args: {
  workspaceId: string;
  memberId: string;
  db?: FormsDatabase;
  now?: Date;
}): Promise<IssuedMagicLinkRequest[]> {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  const member = await getMemberContext({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });

  if (!member) {
    return [];
  }

  await expireOpenMagicLinkRequests({
    workspaceId: args.workspaceId,
    db,
    now,
  });

  const assignments = (await listActiveAssignments({
    workspaceId: args.workspaceId,
    targets: ["TRIAL", "GUARDIAN"],
    db,
  })).filter((assignment) =>
    isRequirementTargetApplicable({
      requirementTarget: assignment.requirementTarget,
      memberStatus: member.status,
      guardianCount: member.familyLinks.length,
    }),
  );
  const openRequests = await listOpenRequests({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });
  const currentVersionIds = assignments
    .map((assignment) => assignment.formDocument.currentVersion?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const signedDocuments = await db.signedDocument.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      formVersionId: {
        in: currentVersionIds,
      },
    },
    select: {
      formVersionId: true,
      signerKind: true,
    },
  });
  const signedKeys = new Set(
    signedDocuments.map(
      (signedDocument) => `${signedDocument.formVersionId}:${signedDocument.signerKind}`,
    ),
  );
  const issuedRequests: IssuedMagicLinkRequest[] = [];

  for (const assignment of assignments) {
    const currentVersion = assignment.formDocument.currentVersion;

    if (!currentVersion) {
      continue;
    }

    if (assignment.requirementTarget === "TRIAL") {
      if (signedKeys.has(`${currentVersion.id}:MEMBER`)) {
        continue;
      }

      let request = openRequests.find(
        (openRequest) =>
          openRequest.formVersionId === currentVersion.id &&
          openRequest.signerKind === "MEMBER" &&
          openRequest.accessMethod === "MAGIC_LINK" &&
          (!openRequest.expiresAt || openRequest.expiresAt > now),
      );

      if (!request) {
        request = await createMagicLinkRequest({
          workspaceId: args.workspaceId,
          formVersionId: currentVersion.id,
          memberId: member.id,
          guardianId: null,
          signerKind: "MEMBER",
          expiresAt: new Date(now.getTime() + MAGIC_LINK_EXPIRY_MS),
          db,
        });
      }

      issuedRequests.push({
        requestId: request.id,
        token: buildSignatureRequestToken(request.id),
        formDocumentId: assignment.formDocument.id,
        formName: assignment.formDocument.name,
        formType: assignment.formDocument.formType,
        versionId: currentVersion.id,
        versionNumber: currentVersion.versionNumber,
        signerKind: "MEMBER",
        guardianId: null,
        guardianName: null,
        expiresAt: request.expiresAt ?? new Date(now.getTime() + MAGIC_LINK_EXPIRY_MS),
      });

      continue;
    }

    if (assignment.requirementTarget !== "GUARDIAN") {
      continue;
    }

    if (signedKeys.has(`${currentVersion.id}:GUARDIAN`)) {
      continue;
    }

    for (const link of member.familyLinks) {
      let request = openRequests.find(
        (openRequest) =>
          openRequest.formVersionId === currentVersion.id &&
          openRequest.signerKind === "GUARDIAN" &&
          openRequest.guardianId === link.guardian.id &&
          openRequest.accessMethod === "MAGIC_LINK" &&
          (!openRequest.expiresAt || openRequest.expiresAt > now),
      );

      if (!request) {
        request = await createMagicLinkRequest({
          workspaceId: args.workspaceId,
          formVersionId: currentVersion.id,
          memberId: member.id,
          guardianId: link.guardian.id,
          signerKind: "GUARDIAN",
          expiresAt: new Date(now.getTime() + MAGIC_LINK_EXPIRY_MS),
          db,
        });
      }

      issuedRequests.push({
        requestId: request.id,
        token: buildSignatureRequestToken(request.id),
        formDocumentId: assignment.formDocument.id,
        formName: assignment.formDocument.name,
        formType: assignment.formDocument.formType,
        versionId: currentVersion.id,
        versionNumber: currentVersion.versionNumber,
        signerKind: "GUARDIAN",
        guardianId: link.guardian.id,
        guardianName: link.guardian.fullName,
        expiresAt: request.expiresAt ?? new Date(now.getTime() + MAGIC_LINK_EXPIRY_MS),
      });
    }
  }

  return issuedRequests;
}

export async function resolveRequiredFormStatusesForMember(args: {
  workspaceId: string;
  memberId: string;
  targets?: RequirementTarget[];
  db?: FormsDatabase;
  now?: Date;
}): Promise<ResolvedRequiredFormStatusResult> {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  const member = await getMemberContext({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });

  if (!member) {
    return {
      items: [],
      history: [],
    };
  }

  await expireOpenMagicLinkRequests({
    workspaceId: args.workspaceId,
    db,
    now,
  });
  await ensureCurrentPortalRequestsForMember({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    targets: args.targets,
    db,
    now,
  });
  await ensureGuardianMagicLinkRequestsForMember({
    workspaceId: args.workspaceId,
    member,
    targets: args.targets,
    db,
    now,
  });

  const assignments = (await listActiveAssignments({
    workspaceId: args.workspaceId,
    targets: args.targets,
    db,
  })).filter((assignment) =>
    isRequirementTargetApplicable({
      requirementTarget: assignment.requirementTarget,
      memberStatus: member.status,
      guardianCount: member.familyLinks.length,
    }),
  );
  const guardianIds = member.familyLinks.map((link) => link.guardian.id);
  const [openRequests, signedDocuments] = await Promise.all([
    listOpenRequests({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      db,
    }),
    listSignedDocuments({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      guardianIds,
      db,
    }),
  ]);

  const items = assignments.flatMap((assignment): RequiredFormStatusItem[] => {
    const currentVersion = assignment.formDocument.currentVersion;

    if (!currentVersion) {
      return [];
    }

    const signerKind = getSignerKindForTarget(assignment.requirementTarget);
    const currentSignedDocument = signedDocuments.find(
      (signedDocument) =>
        signedDocument.formVersionId === currentVersion.id &&
        signedDocument.signerKind === signerKind,
    );
    const supersededSignedDocument = signedDocuments.find(
      (signedDocument) =>
        signedDocument.formVersion.formDocumentId === assignment.formDocument.id &&
        signedDocument.formVersionId !== currentVersion.id &&
        signedDocument.signerKind === signerKind,
    );
    const actionableRequests = openRequests
      .filter(
        (request) =>
          request.formVersionId === currentVersion.id &&
          request.signerKind === signerKind &&
          (request.accessMethod === "PORTAL" ||
            !request.expiresAt ||
            request.expiresAt > now),
      )
      .map((request) => ({
        requestId: request.id,
        accessMethod: request.accessMethod,
        signerKind: request.signerKind,
        guardianId: request.guardianId,
        guardianName:
          request.guardianId
            ? member.familyLinks.find(
                (link) => link.guardian.id === request.guardianId,
              )?.guardian.fullName ?? null
            : null,
        expiresAt: request.expiresAt,
      }));
    const status: RequiredFormState = currentSignedDocument
      ? "SIGNED"
      : supersededSignedDocument
        ? "SUPERSEDED"
        : actionableRequests.length > 0
          ? "PENDING"
          : "MISSING";
    const resolvedSignedDocument = currentSignedDocument ?? supersededSignedDocument ?? null;

    return [
      {
        assignmentId: assignment.id,
        requirementTarget: assignment.requirementTarget,
        formDocumentId: assignment.formDocument.id,
        formName: assignment.formDocument.name,
        formType: assignment.formDocument.formType,
        description: assignment.formDocument.description,
        signerKind,
        currentVersionId: currentVersion.id,
        currentVersionNumber: currentVersion.versionNumber,
        currentVersionCreatedAt: currentVersion.createdAt,
        status,
        signedAt: currentSignedDocument?.signedAt ?? null,
        signedDocumentId: currentSignedDocument?.id ?? null,
        signedByName: resolvedSignedDocument?.signerNameSnapshot ?? null,
        openRequests: actionableRequests,
      },
    ];
  });

  return {
    items,
    history: signedDocuments.map((signedDocument) => ({
      signedDocumentId: signedDocument.id,
      formDocumentId: signedDocument.formVersion.formDocument.id,
      formName: signedDocument.formVersion.formDocument.name,
      formType: signedDocument.formVersion.formDocument.formType,
      versionId: signedDocument.formVersion.id,
      versionNumber: signedDocument.formVersion.versionNumber,
      signerKind: signedDocument.signerKind,
      guardianId: signedDocument.guardianId,
      guardianName: signedDocument.guardian?.fullName ?? null,
      signerNameSnapshot: signedDocument.signerNameSnapshot,
      signerEmailSnapshot: signedDocument.signerEmailSnapshot,
      signedAt: signedDocument.signedAt,
    })),
  };
}

function getSignatureRequestDetailById(args: {
  requestId: string;
  db: FormsDatabase;
}) {
  return args.db.signatureRequest.findFirst({
    where: {
      id: args.requestId,
    },
    select: {
      id: true,
      workspaceId: true,
      formVersionId: true,
      memberId: true,
      guardianId: true,
      signerKind: true,
      accessMethod: true,
      status: true,
      tokenHash: true,
      expiresAt: true,
      viewedAt: true,
      completedAt: true,
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          workspaceId: true,
          userId: true,
        },
      },
      guardian: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
      formVersion: {
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          mimeType: true,
          fileData: true,
          createdAt: true,
          formDocument: {
            select: {
              id: true,
              name: true,
              description: true,
              formType: true,
              currentVersionId: true,
              assignments: {
                where: {
                  isActive: true,
                },
                select: {
                  id: true,
                  requirementTarget: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
      signedDocument: {
        select: {
          id: true,
          signedAt: true,
          signerNameSnapshot: true,
          guardianId: true,
        },
      },
    },
  }) as Promise<SignatureRequestDetailRecord | null>;
}

async function markRequestViewed(args: {
  requestId: string;
  viewedAt: Date;
  db: FormsDatabase;
}): Promise<void> {
  await args.db.signatureRequest.updateMany({
    where: {
      id: args.requestId,
      viewedAt: null,
    },
    data: {
      viewedAt: args.viewedAt,
    },
  });
}

function mapSignatureRequestDetail(
  request: SignatureRequestDetailRecord,
): SignatureRequestPageData {
  return {
    requestId: request.id,
    workspaceId: request.workspaceId,
    formDocumentId: request.formVersion.formDocument.id,
    formName: request.formVersion.formDocument.name,
    formType: request.formVersion.formDocument.formType,
    description: request.formVersion.formDocument.description,
    versionId: request.formVersion.id,
    versionNumber: request.formVersion.versionNumber,
    fileName: request.formVersion.fileName,
    mimeType: request.formVersion.mimeType,
    fileData: request.formVersion.fileData,
    memberId: request.member.id,
    memberName: request.member.fullName,
    memberEmail: request.member.email,
    guardianId: request.guardian?.id ?? null,
    guardianName: request.guardian?.fullName ?? null,
    guardianEmail: request.guardian?.email ?? null,
    signerKind: request.signerKind,
    accessMethod: request.accessMethod,
    status: request.status,
    viewedAt: request.viewedAt,
    completedAt: request.completedAt,
    signedDocumentId: request.signedDocument?.id ?? null,
    signedAt: request.signedDocument?.signedAt ?? null,
    signedByName: request.signedDocument?.signerNameSnapshot ?? null,
  };
}

export async function getPortalSignatureRequestForMember(args: {
  workspaceId: string;
  memberId: string;
  requestId: string;
  db?: FormsDatabase;
  now?: Date;
}): Promise<SignatureRequestPageData | null> {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  const request = await getSignatureRequestDetailById({
    requestId: args.requestId,
    db,
  });

  if (
    !request ||
    request.workspaceId !== args.workspaceId ||
    request.memberId !== args.memberId ||
    request.accessMethod !== "PORTAL" ||
    request.signerKind !== "MEMBER"
  ) {
    return null;
  }

  await markRequestViewed({
    requestId: request.id,
    viewedAt: now,
    db,
  });

  return mapSignatureRequestDetail(request);
}

export async function getMagicLinkSignatureRequest(args: {
  token: string;
  db?: FormsDatabase;
  now?: Date;
}): Promise<SignatureRequestPageData | null> {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  const parsedToken = parseMagicLinkToken(args.token);

  if (!parsedToken) {
    return null;
  }

  const expectedSignature = buildMagicLinkSignature(parsedToken.requestId);

  if (!safeEqual(parsedToken.signature, expectedSignature)) {
    return null;
  }

  const request = await getSignatureRequestDetailById({
    requestId: parsedToken.requestId,
    db,
  });

  if (
    !request ||
    request.accessMethod !== "MAGIC_LINK" ||
    !request.tokenHash ||
    !safeEqual(request.tokenHash, hashValue(args.token))
  ) {
    return null;
  }

  if (request.status === "OPEN" && request.expiresAt && request.expiresAt <= now) {
    await db.signatureRequest.updateMany({
      where: {
        id: request.id,
        status: "OPEN",
      },
      data: {
        status: "EXPIRED",
      },
    });

    return {
      ...mapSignatureRequestDetail(request),
      status: "EXPIRED",
    };
  }

  await markRequestViewed({
    requestId: request.id,
    viewedAt: now,
    db,
  });

  return mapSignatureRequestDetail(request);
}

function isRequestStillSignable(request: SignatureRequestDetailRecord): boolean {
  if (request.status !== "OPEN") {
    return false;
  }

  if (
    request.formVersion.formDocument.currentVersionId !== request.formVersion.id ||
    request.formVersion.formDocument.assignments.length === 0
  ) {
    return false;
  }

  return true;
}

export async function recordLocalFormSignature(args: {
  requestId?: string;
  token?: string;
  workspaceId?: string;
  memberId?: string;
  signerName: string;
  signerEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  db?: FormsDatabase;
  now?: Date;
}): Promise<RecordLocalFormSignatureResult> {
  const db = args.db ?? prisma;
  const now = args.now ?? new Date();
  const signerName = args.signerName.trim();
  const signerEmail = args.signerEmail?.trim() || null;

  if (!signerName) {
    return {
      status: "error",
      message: "Enter the signer’s full legal name.",
    };
  }

  await expireOpenMagicLinkRequests({
    workspaceId: args.workspaceId ?? "",
    db,
    now,
  }).catch(() => undefined);

  const request =
    args.token
      ? await getMagicLinkSignatureRequest({
          token: args.token,
          db,
          now,
        }).then((result) =>
          result
            ? getSignatureRequestDetailById({
                requestId: result.requestId,
                db,
              })
            : null,
        )
      : args.requestId
        ? await getSignatureRequestDetailById({
            requestId: args.requestId,
            db,
          })
        : null;

  if (!request) {
    return {
      status: "error",
      message: "Signature request not found.",
    };
  }

  if (
    args.workspaceId &&
    (request.workspaceId !== args.workspaceId || request.memberId !== args.memberId)
  ) {
    return {
      status: "error",
      message: "Signature request not found.",
    };
  }

  if (!isRequestStillSignable(request)) {
    await db.signatureRequest.updateMany({
      where: {
        id: request.id,
        status: "OPEN",
      },
      data: {
        status: "CANCELLED",
      },
    });

    return {
      status: "error",
      message: "This signing link is no longer active.",
    };
  }

  if (request.expiresAt && request.expiresAt <= now) {
    await db.signatureRequest.updateMany({
      where: {
        id: request.id,
        status: "OPEN",
      },
      data: {
        status: "EXPIRED",
      },
    });

    return {
      status: "error",
      message: "This signing link has expired.",
    };
  }

  const existingSignedDocument = await db.signedDocument.findFirst({
    where: {
      workspaceId: request.workspaceId,
      formVersionId: request.formVersionId,
      memberId: request.memberId,
      signerKind: request.signerKind,
    },
    select: {
      id: true,
      guardianId: true,
    },
  });

  if (existingSignedDocument) {
    if (
      request.signerKind === "GUARDIAN" &&
      request.guardianId &&
      existingSignedDocument.guardianId !== request.guardianId
    ) {
      await db.signatureRequest.updateMany({
        where: {
          id: request.id,
          status: "OPEN",
        },
        data: {
          status: "CANCELLED",
        },
      });
    }

    return {
      status: "already_signed",
      signedDocumentId: existingSignedDocument.id,
    };
  }

  const created = await db.$transaction(async (tx) => {
    const signedDocument = await tx.signedDocument.create({
      data: {
        workspaceId: request.workspaceId,
        formVersionId: request.formVersionId,
        memberId: request.memberId,
        guardianId: request.guardianId,
        signerKind: request.signerKind,
        signedFromRequestId: request.id,
        signerNameSnapshot: signerName,
        signerEmailSnapshot: signerEmail,
        signatureMethod: "LOCAL_TYPED_NAME",
        providerReference: null,
        ipAddress: args.ipAddress?.trim() || null,
        userAgent: args.userAgent?.trim() || null,
        signedAt: now,
      },
      select: {
        id: true,
      },
    });

    await tx.signatureRequest.updateMany({
      where: {
        id: request.id,
        status: "OPEN",
      },
      data: {
        status: "COMPLETED",
        completedAt: now,
      },
    });

    if (request.signerKind === "GUARDIAN") {
      await tx.signatureRequest.updateMany({
        where: {
          workspaceId: request.workspaceId,
          memberId: request.memberId,
          formVersionId: request.formVersionId,
          signerKind: "GUARDIAN",
          status: "OPEN",
          id: {
            not: request.id,
          },
        },
        data: {
          status: "CANCELLED",
        },
      });
    }

    return signedDocument;
  });

  return {
    status: "signed",
    signedDocumentId: created.id,
  };
}
