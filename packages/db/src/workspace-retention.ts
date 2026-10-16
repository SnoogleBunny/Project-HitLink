import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { lockFinancialAccount } from "./financial-operations.js";
import { WorkspaceDataError } from "./workspace-data.js";
import {
  REVIEWED_RETENTION_SCHEMA,
  RetentionInventoryError,
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "./retention-inventory.js";

type Tx = Prisma.TransactionClient;
type Options = { db?: PrismaClient; now?: Date };
type Case = NonNullable<
  Awaited<ReturnType<Tx["workspaceRetentionCase"]["findUnique"]>>
>;
const fail = (message: string): never => {
  throw new WorkspaceDataError(message);
};
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (value: string, label: string) => {
  const result = value.trim();
  if (!result || result.length > 1000)
    fail(`${label} is required (up to 1,000 characters).`);
  return result;
};
async function locked<T>(
  workspaceId: string,
  work: (tx: Tx) => Promise<T>,
  options: Options,
) {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await (options.db ?? prisma).$transaction(
        async (tx) => {
          await lockClassSchedule(tx, workspaceId);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))`;
          await lockFinancialAccount(tx, workspaceId);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`retention:${workspaceId}`}))`;
          return work(tx);
        },
        { isolationLevel: "Serializable", timeout: 120000 },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt === 11
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(1000, 25 * 2 ** (attempt + 1)) +
            Math.floor(Math.random() * 100),
        ),
      );
    }
  }
  return fail(
    "The records changed repeatedly. Review the current case before trying again.",
  );
}
async function ownersForPlan(tx: Tx, workspaceId: string) {
  const plan = await tx.workspaceOffboarding.findUnique({
    where: { workspaceId },
    include: { exportJob: true },
  });
  if (!plan?.exportJob?.receiptConfirmedAt || !plan.exportJob.sha256)
    return fail("Verify an export and save the offboarding plan first.");
  let owners: string[];
  if (plan.accessRevokedAt) {
    const event = await tx.workspaceDataEvent.findFirst({
      where: { workspaceId, kind: "WORKSPACE_ACCESS_REVOKED" },
      orderBy: { createdAt: "desc" },
    });
    const metadata = event?.metadata as {
      approvedOwnerUserIds?: unknown;
      planId?: string;
      version?: number;
    } | null;
    if (
      metadata?.planId !== plan.id ||
      metadata.version !== plan.version ||
      !Array.isArray(metadata.approvedOwnerUserIds) ||
      !metadata.approvedOwnerUserIds.length ||
      !metadata.approvedOwnerUserIds.every((id) => typeof id === "string")
    )
      return fail(
        "The exit has no verified owner authorization record. Reconcile that record before preparing deletion.",
      );
    owners = metadata.approvedOwnerUserIds as string[];
  } else {
    owners = (
      await tx.workspaceUser.findMany({
        where: { workspaceId, role: "OWNER", isActive: true },
        select: { userId: true },
      })
    ).map((owner) => owner.userId);
  }
  if (!owners.length)
    return fail("A named owner must remain responsible for the records.");
  return { plan, owners: [...new Set(owners)].sort() };
}
async function event(
  tx: Tx,
  record: Case,
  actorUserId: string,
  kind: string,
  detail: unknown = {},
) {
  await tx.workspaceRetentionEvent.create({
    data: {
      caseId: record.id,
      version: record.version,
      actorUserId,
      kind,
      detail: json(detail),
    },
  });
}
async function getCase(
  tx: Tx,
  caseId: string,
  userId: string,
  verifyOwners = true,
) {
  const record = await tx.workspaceRetentionCase.findUnique({
    where: { id: caseId },
  });
  if (
    !record ||
    ![
      ...record.ownerUserIds,
      record.custodianUserId,
      record.backupCustodianUserId,
    ].includes(userId)
  )
    return fail("This records case is unavailable to this account.");
  if (verifyOwners && !record.executedAt) {
    const { owners } = await ownersForPlan(tx, record.workspaceId);
    if (
      record.ownerUserIds.includes(userId) &&
      !owners.includes(userId) &&
      record.custodianUserId !== userId &&
      record.backupCustodianUserId !== userId
    )
      return fail("This records case is unavailable to this account.");
  }
  return record;
}
function sameVersion(record: Case, version: number) {
  if (record.version !== version)
    fail("This records case changed. Reload and review the current version.");
}
async function approved(tx: Tx, record: Case) {
  const events = await tx.workspaceRetentionEvent.findMany({
    where: {
      caseId: record.id,
      version: record.version,
      kind: "OWNER_APPROVED",
    },
  });
  return record.ownerUserIds.every((id) =>
    events.some(
      (item) =>
        item.actorUserId === id &&
        (item.detail as { fingerprint?: string }).fingerprint ===
          record.planFingerprint,
    ),
  );
}
export async function saveWorkspaceRetentionCase(
  userId: string,
  input: {
    workspaceId: string;
    expectedVersion: number;
    custodianUserId: string;
    backupCustodianUserId: string;
    retentionAt: string;
    backupDeletionAfter: string;
    retentionBasis: string;
    holdResolutionEvidence?: string;
  },
  options: Options = {},
) {
  const now = options.now ?? new Date();
  return locked(
    input.workspaceId,
    async (tx) => {
      const { plan, owners } = await ownersForPlan(tx, input.workspaceId);
      if (!owners.includes(userId))
        return fail("Only an authorized owner can prepare this records case.");
      const prior = await tx.workspaceRetentionCase.findUnique({
        where: { workspaceId: input.workspaceId },
      });
      if ((prior?.version ?? 0) !== input.expectedVersion || prior?.executedAt)
        return fail("This records case changed or has already been executed.");
      const retentionAt = new Date(input.retentionAt),
        backupDeletionAfter = new Date(input.backupDeletionAfter);
      if (
        !Number.isFinite(+retentionAt) ||
        !Number.isFinite(+backupDeletionAfter) ||
        retentionAt < plan.retentionUntil ||
        backupDeletionAfter < retentionAt
      )
        return fail(
          "Database removal must be on or after the agreed retention date; backup removal must be no earlier.",
        );
      const custodians = [
        ...new Set([input.custodianUserId, input.backupCustodianUserId]),
      ];
      if (
        (await tx.user.count({ where: { id: { in: custodians } } })) !==
        custodians.length
      )
        return fail("Choose existing accounts for both records custodians.");
      const holdResolutionEvidence =
        input.holdResolutionEvidence?.trim() || null;
      if (
        (prior?.holdReason || plan.retentionHoldReason) &&
        !holdResolutionEvidence
      )
        return fail(
          "Record the evidence resolving the existing hold before requesting fresh owner approval.",
        );
      if (holdResolutionEvidence)
        text(holdResolutionEvidence, "Hold resolution evidence");
      const data = {
        offboardingPlanId: plan.id,
        offboardingPlanVersion: plan.version,
        ownerUserIds: owners,
        custodianUserId: input.custodianUserId,
        backupCustodianUserId: input.backupCustodianUserId,
        retentionAt,
        backupDeletionAfter,
        retentionBasis: text(input.retentionBasis, "Retention basis"),
        holdResolutionEvidence,
        holdReason: null,
        state: "REVIEW",
        exportChecksum: plan.exportJob!.sha256!,
        schemaFingerprint: REVIEWED_RETENTION_SCHEMA,
        authorizationFrozenAt: plan.accessRevokedAt,
        externalFileReceipt: Prisma.DbNull,
      };
      const planFingerprint = hash({
        ...data,
        workspaceId: input.workspaceId,
        priorVersion: prior?.version ?? 0,
      });
      const record = prior
        ? await tx.workspaceRetentionCase.update({
            where: { id: prior.id },
            data: { ...data, planFingerprint, version: { increment: 1 } },
          })
        : await tx.workspaceRetentionCase.create({
            data: {
              ...data,
              planFingerprint,
              workspaceId: input.workspaceId,
              requestedByUserId: userId,
            },
          });
      await event(tx, record, userId, "PLAN_SAVED", {
        fingerprint: planFingerprint,
        at: now,
      });
      return { id: record.id, version: record.version };
    },
    options,
  );
}
export async function approveWorkspaceRetentionCase(
  userId: string,
  caseId: string,
  version: number,
  options: Options = {},
) {
  const initial = await getCase(options.db ?? prisma, caseId, userId, false);
  return locked(
    initial.workspaceId,
    async (tx) => {
      const record = await getCase(tx, caseId, userId);
      sameVersion(record, version);
      const { plan, owners } = await ownersForPlan(tx, record.workspaceId);
      if (
        !owners.includes(userId) ||
        !record.ownerUserIds.includes(userId) ||
        record.executedAt ||
        record.holdReason ||
        plan.version !== record.offboardingPlanVersion ||
        hash(owners) !== hash(record.ownerUserIds)
      )
        return fail(
          "Update the records case and resolve holds before approving this version.",
        );
      await event(tx, record, userId, "OWNER_APPROVED", {
        fingerprint: record.planFingerprint,
      });
    },
    options,
  );
}
export async function holdWorkspaceRetentionCase(
  userId: string,
  caseId: string,
  version: number,
  reason: string,
  options: Options = {},
) {
  const initial = await getCase(options.db ?? prisma, caseId, userId, false);
  return locked(
    initial.workspaceId,
    async (tx) => {
      const record = await getCase(tx, caseId, userId);
      sameVersion(record, version);
      if (
        record.executedAt ||
        (!record.ownerUserIds.includes(userId) &&
          record.custodianUserId !== userId)
      )
        return fail(
          "Only a named owner or records custodian can hold database removal before it happens.",
        );
      await tx.workspaceRetentionCase.update({
        where: { id: caseId },
        data: { holdReason: text(reason, "Hold reason"), state: "HELD" },
      });
      await event(tx, record, userId, "HOLD_PLACED");
    },
    options,
  );
}
async function blockers(tx: Tx, record: Case, now: Date) {
  const { plan, owners } = await ownersForPlan(tx, record.workspaceId);
  const list: string[] = [];
  if (
    plan.id !== record.offboardingPlanId ||
    plan.version !== record.offboardingPlanVersion ||
    hash(owners) !== hash(record.ownerUserIds) ||
    plan.exportJob!.sha256 !== record.exportChecksum
  )
    list.push(
      "Update the records case to match the current exit plan, owners and verified export.",
    );
  if (record.schemaFingerprint !== REVIEWED_RETENTION_SCHEMA)
    list.push("The record inventory changed. Prepare a new case version.");
  if (
    record.holdReason ||
    (plan.retentionHoldReason && !record.holdResolutionEvidence)
  )
    list.push("Resolve the retention hold and obtain fresh owner approval.");
  if (!(await approved(tx, record)))
    list.push("Every named owner must approve this case version.");
  if (now < record.retentionAt || now < plan.retentionUntil)
    list.push("The agreed retention period has not ended.");
  const workspace = await tx.workspace.findUnique({
    where: { id: record.workspaceId },
  });
  if (!plan.accessRevokedAt || workspace?.status !== "DISABLED")
    list.push(
      "End gym access through the verified offboarding workflow first.",
    );
  if (
    await tx.coachingEnrollment.count({
      where: {
        workspaceId: record.workspaceId,
        OR: [
          { status: { not: "CLOSED" } },
          { settlementState: { notIn: ["NOT_REQUIRED", "SETTLED"] } },
          { retrievalUntil: { gt: now } },
        ],
      },
    })
  )
    list.push("Complete coaching settlements and promised retrieval windows.");
  if (
    await tx.coachingRecordIncident.count({
      where: { workspaceId: record.workspaceId, resolvedAt: null },
    })
  )
    list.push("Resolve open coaching record incidents before removal.");
  const financial = await Promise.all([
    tx.financialOperation.count({
      where: {
        workspaceId: record.workspaceId,
        status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
      },
    }),
    tx.financialReviewCase.count({
      where: { workspaceId: record.workspaceId, resolvedAt: null },
    }),
    tx.invoice.count({
      where: {
        workspaceId: record.workspaceId,
        status: { in: ["OPEN", "UNCOLLECTIBLE"] },
      },
    }),
    tx.refund.count({
      where: { workspaceId: record.workspaceId, status: "PENDING" },
    }),
  ]);
  if (financial.some(Boolean))
    list.push(
      "Resolve outstanding financial operations, balances and reviews.",
    );
  const running = await Promise.all([
    tx.notificationJob.count({
      where: { workspaceId: record.workspaceId, status: "SENDING" },
    }),
    tx.importJob.count({
      where: { workspaceId: record.workspaceId, status: "IMPORTING" },
    }),
    tx.workspaceDataExport.count({
      where: { workspaceId: record.workspaceId, state: "BUILDING" },
    }),
    tx.memberDataExport.count({
      where: { workspaceId: record.workspaceId, state: "BUILDING" },
    }),
    tx.coachingRecordExport.count({
      where: { workspaceId: record.workspaceId, status: "PREPARING" },
    }),
  ]);
  if (running.some(Boolean))
    list.push(
      "Wait for active delivery, import and export operations to finish or be reconciled.",
    );
  return list;
}
async function externalFiles(tx: Tx, workspaceId: string) {
  const objects = await tx.importSourceFile.findMany({
    where: { workspaceId, storageKey: { not: null } },
    select: { id: true, storageKey: true },
    orderBy: { id: "asc" },
  });
  return { objects, fingerprint: hash(objects) };
}
export async function getWorkspaceRetentionCase(
  userId: string,
  caseId: string,
  options: Options = {},
) {
  const initial = await getCase(options.db ?? prisma, caseId, userId, false);
  return locked(
    initial.workspaceId,
    async (tx) => {
      const record = await getCase(tx, caseId, userId);
      const approvals = await tx.workspaceRetentionEvent.findMany({
        where: { caseId, version: record.version, kind: "OWNER_APPROVED" },
        select: { actorUserId: true },
      });
      const currentBlockers = record.executedAt
        ? []
        : await blockers(tx, record, options.now ?? new Date());
      let inventory: {
        counts: Record<string, number>;
        fingerprint: string;
      } | null = null;
      let external: Awaited<ReturnType<typeof externalFiles>> | null = null;
      if (!record.executedAt && userId === record.custodianUserId) {
        try {
          const value = await inspectRetentionInventory(tx, record.workspaceId);
          inventory = { counts: value.counts, fingerprint: value.fingerprint };
        } catch (error) {
          // A failed SQL transaction must unwind so the outer transaction can
          // retry. Only a completed inventory review can become a UI blocker.
          if (!(error instanceof RetentionInventoryError)) throw error;
          currentBlockers.push(error.message);
        }
        external = await externalFiles(tx, record.workspaceId);
      }
      return {
        record,
        approvals: approvals.map((item) => item.actorUserId),
        blockers: currentBlockers,
        inventory,
        external,
      };
    },
    options,
  );
}
export async function recordExternalFileRemoval(
  userId: string,
  caseId: string,
  version: number,
  input: { inventoryHash: string; evidenceReference: string },
  options: Options = {},
) {
  const initial = await getCase(options.db ?? prisma, caseId, userId, false),
    now = options.now ?? new Date();
  return locked(
    initial.workspaceId,
    async (tx) => {
      const record = await getCase(tx, caseId, userId);
      sameVersion(record, version);
      if (record.custodianUserId !== userId || record.executedAt)
        return fail(
          "Only the named records custodian can verify these external files.",
        );
      const blocked = await blockers(tx, record, now);
      if (blocked.length) return fail(blocked.join(" "));
      const files = await externalFiles(tx, record.workspaceId);
      if (!files.objects.length || files.fingerprint !== input.inventoryHash)
        return fail("The external file inventory changed. Review it again.");
      await tx.workspaceRetentionCase.update({
        where: { id: caseId },
        data: {
          externalFileReceipt: {
            inventoryHash: files.fingerprint,
            count: files.objects.length,
            actorUserId: userId,
            verifiedAt: now.toISOString(),
            evidenceReference: text(
              input.evidenceReference,
              "External storage removal receipt",
            ),
            method: "NAMED_CUSTODIAN_ATTESTATION",
          },
        },
      });
      await event(tx, record, userId, "EXTERNAL_FILES_VERIFIED", {
        inventoryHash: files.fingerprint,
        count: files.objects.length,
      });
    },
    options,
  );
}
export async function executeWorkspaceRetention(
  userId: string,
  caseId: string,
  version: number,
  input: { confirmedWorkspaceId: string; inventoryHash: string },
  options: Options = {},
) {
  const initial = await getCase(options.db ?? prisma, caseId, userId, false),
    now = options.now ?? new Date();
  return locked(
    initial.workspaceId,
    async (tx) => {
      const record = await getCase(tx, caseId, userId);
      sameVersion(record, version);
      if (
        record.custodianUserId !== userId ||
        input.confirmedWorkspaceId !== record.workspaceId
      )
        return fail(
          "Only the named records custodian can remove this exact gym's records.",
        );
      if (record.executedAt) return record.receipt;
      const blocked = await blockers(tx, record, now);
      if (blocked.length) return fail(blocked.join(" "));
      const files = await externalFiles(tx, record.workspaceId);
      if (
        files.objects.length &&
        (record.externalFileReceipt as { inventoryHash?: string } | null)
          ?.inventoryHash !== files.fingerprint
      )
        return fail(
          "Verify removal of the exact external files with a storage receipt before removing their database references.",
        );
      const removed = await deleteReviewedWorkspaceRecords(
        tx,
        record.workspaceId,
        input.inventoryHash,
      );
      const receipt = json({
        ...removed,
        caseId,
        version,
        workspaceId: record.workspaceId,
        actorUserId: userId,
        removedAt: now,
        exportChecksum: record.exportChecksum,
        externalFileCount: files.objects.length,
        backups: "PENDING_SEPARATE_RECEIPT",
        retained:
          "Global sign-in accounts and sessions remain for other gyms. This minimal authorization and removal receipt is retained.",
      });
      await tx.workspaceRetentionCase.update({
        where: { id: caseId },
        data: {
          state: "BACKUPS_PENDING",
          executedAt: now,
          authorizationFrozenAt: record.authorizationFrozenAt ?? now,
          receipt,
        },
      });
      await event(tx, record, userId, "DATABASE_REMOVED", {
        inventoryHash: removed.inventoryHash,
        schemaHash: removed.schemaHash,
        at: now,
      });
      return receipt;
    },
    options,
  );
}
export async function recordWorkspaceBackupRemoval(
  userId: string,
  caseId: string,
  version: number,
  input: {
    confirmedWorkspaceId: string;
    evidenceReference: string;
    removedAt: string;
  },
  options: Options = {},
) {
  const initial = await getCase(options.db ?? prisma, caseId, userId, false),
    now = options.now ?? new Date();
  return locked(
    initial.workspaceId,
    async (tx) => {
      const record = await getCase(tx, caseId, userId);
      sameVersion(record, version);
      if (
        record.backupCustodianUserId !== userId ||
        input.confirmedWorkspaceId !== record.workspaceId ||
        !record.executedAt
      )
        return fail(
          "Only the named backup custodian can verify backup removal after database removal.",
        );
      if (record.backupReceipt) return record.backupReceipt;
      const removedAt = new Date(input.removedAt);
      if (
        !Number.isFinite(+removedAt) ||
        removedAt < record.backupDeletionAfter ||
        removedAt < record.executedAt ||
        removedAt > now
      )
        return fail(
          "The backup receipt must confirm completed removal on or after the agreed backup date.",
        );
      const receipt = json({
        workspaceId: record.workspaceId,
        caseId,
        version,
        actorUserId: userId,
        removedAt,
        recordedAt: now,
        evidenceReference: text(
          input.evidenceReference,
          "Backup provider removal receipt",
        ),
        method: "NAMED_CUSTODIAN_ATTESTATION",
      });
      await tx.workspaceRetentionCase.update({
        where: { id: caseId },
        data: { state: "COMPLETE", backupReceipt: receipt },
      });
      await event(tx, record, userId, "BACKUP_REMOVAL_VERIFIED", { at: now });
      return receipt;
    },
    options,
  );
}
