import type {
  Prisma,
  PrismaClient,
  RequirementTarget,
  FormType,
} from "@prisma/client";
import {
  parseRequirementTerms,
  selectServiceRevision,
  type LegacyBaseline,
  type RequirementRevision,
} from "./form-requirements-policy.js";

export interface EffectiveFormAssignment {
  id: string;
  requirementTarget: RequirementTarget;
  requirementRevisionId: string | null;
  acceptanceCycleKey: string;
  revisionHash: string | null;
  effectiveAt: Date | null;
  publishedAt: Date | null;
  consentValidUntil: Date | null;
  upcoming: boolean;
  formDocument: {
    id: string;
    name: string;
    formType: FormType;
    description: string | null;
    currentVersionId: string;
    currentVersion: { id: string; versionNumber: number; createdAt: Date };
  };
}

/** Effective requirements derive from immutable revisions; the old pointer is only a frozen legacy baseline. */
export async function listEffectiveFormAssignments(args: {
  db: Prisma.TransactionClient | PrismaClient;
  workspaceId: string;
  targets?: RequirementTarget[];
  now: Date;
  serviceAt?: Date;
  includeUpcoming?: boolean;
}): Promise<EffectiveFormAssignment[]> {
  const documents = await args.db.formDocument.findMany({
    where: { workspaceId: args.workspaceId },
    include: {
      assignments: true,
      versions: { select: { id: true, versionNumber: true, createdAt: true } },
      requirementRevisions: { orderBy: { version: "asc" } },
    },
    orderBy: { id: "asc" },
  });
  const result: EffectiveFormAssignment[] = [];
  const serviceAt = args.serviceAt ?? args.now;
  for (const document of documents) {
    const revisions: RequirementRevision[] = document.requirementRevisions.map(
      (row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        formDocumentId: row.formDocumentId,
        formVersionId: row.formVersionId,
        fileSha256: row.fileSha256,
        version: row.version,
        terms: parseRequirementTerms(row.terms),
        publishedAt: row.publishedAt.toISOString(),
        actorUserId: row.actorUserId,
        reason: row.reason,
        previousRevisionHash: row.previousRevisionHash,
        previewHash: row.previewHash,
        baseline: row.legacyBaseline as unknown as LegacyBaseline | null,
        revisionHash: row.revisionHash,
      }),
    );
    const selected = selectServiceRevision(
      revisions,
      args.workspaceId,
      document.id,
      serviceAt.toISOString(),
    );
    const rows: Array<RequirementRevision | null> = [selected];
    if (args.includeUpcoming && !args.serviceAt) {
      const future = revisions.filter(
        (row) => row.terms.effectiveAt > args.now.toISOString(),
      );
      // A scheduled correction at the same instant supersedes the earlier proposal;
      // the audit remains, but its superseded cycle is not presented for signing.
      for (const row of future)
        if (
          !future.some(
            (next) =>
              next.terms.effectiveAt === row.terms.effectiveAt &&
              next.version > row.version,
          )
        )
          rows.push(row);
    }
    for (const revision of rows) {
      const baseline = revisions[0]?.baseline;
      const versionId =
        revision?.formVersionId ??
        baseline?.formVersionId ??
        document.currentVersionId;
      const version = document.versions.find((row) => row.id === versionId);
      if (!version || (!revision && !baseline && document.archivedAt)) continue;
      const targets =
        revision?.terms.targets ??
        baseline?.targets ??
        document.assignments
          .filter((row) => row.isActive)
          .map((row) => row.requirementTarget);
      for (const target of targets) {
        if (args.targets?.length && !args.targets.includes(target)) continue;
        const cycle = revision?.id ?? "legacy";
        const id = revision
          ? `${revision.id}:${target}`
          : (document.assignments.find(
              (row) => row.requirementTarget === target,
            )?.id ?? `${document.id}:legacy:${target}`);
        if (result.some((row) => row.id === id)) continue;
        result.push({
          id,
          requirementTarget: target,
          requirementRevisionId: revision?.id ?? null,
          acceptanceCycleKey: cycle,
          revisionHash: revision?.revisionHash ?? null,
          effectiveAt: revision ? new Date(revision.terms.effectiveAt) : null,
          publishedAt: revision ? new Date(revision.publishedAt) : null,
          consentValidUntil: revision?.terms.consentValidUntil
            ? new Date(revision.terms.consentValidUntil)
            : null,
          upcoming:
            !!revision && new Date(revision.terms.effectiveAt) > args.now,
          formDocument: {
            id: document.id,
            name: document.name,
            formType: document.formType,
            description: document.description,
            currentVersionId: version.id,
            currentVersion: version,
          },
        });
      }
    }
  }
  return result;
}

export async function signableFormBinding(args: {
  db: Prisma.TransactionClient | PrismaClient;
  workspaceId: string;
  memberId: string;
  formVersionId: string;
  requirementRevisionId: string | null;
  acceptanceCycleKey: string;
  now: Date;
}) {
  const bindings = await listEffectiveFormAssignments({
    ...args,
    includeUpcoming: true,
  });
  return bindings.filter(
    (row) =>
      row.formDocument.currentVersion.id === args.formVersionId &&
      row.requirementRevisionId === args.requirementRevisionId &&
      row.acceptanceCycleKey === args.acceptanceCycleKey &&
      (!row.consentValidUntil || row.consentValidUntil > args.now),
  );
}
