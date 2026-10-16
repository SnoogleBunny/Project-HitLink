import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import {
  buildMemberDataArtifact,
  MemberDataError,
  type MemberDataScope,
} from "./member-export-snapshot.js";
export {
  MemberDataError,
  type MemberDataScope,
} from "./member-export-snapshot.js";

export interface MemberDataActor {
  workspaceId: string;
  userId: string;
}
export interface MemberDataTarget {
  scope: MemberDataScope;
  targetId: string;
}
type Tx = Prisma.TransactionClient;
type Options = { db?: PrismaClient; now?: Date };
const hash = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function fail(): never {
  throw new MemberDataError(
    "These records are unavailable for this account. Ask the gym to review your access.",
  );
}
async function lock(db: Tx, workspaceId: string) {
  await lockClassSchedule(db, workspaceId);
  await db.$queryRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))::text",
    `family-access:${workspaceId}`,
  );
}
async function activeActor(db: Tx, actor: MemberDataActor) {
  const access = await db.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      isActive: true,
      role: { in: ["OWNER", "CUSTOMER"] },
      workspace: { status: { not: "DISABLED" } },
    },
  });
  if (!access) fail();
  return access;
}
function isMinor(date: Date | null, now: Date) {
  return (
    !!date &&
    new Date(
      Date.UTC(
        date.getUTCFullYear() + 18,
        date.getUTCMonth(),
        date.getUTCDate(),
      ),
    ) > now
  );
}
async function authorize(
  db: Tx,
  actor: MemberDataActor,
  target: MemberDataTarget,
  now: Date,
) {
  const access = await activeActor(db, actor);
  if (target.scope === "PAYER") {
    const payer = await db.financialAccount.findFirst({
      where: { id: target.targetId, workspaceId: actor.workspaceId },
      include: {
        member: {
          select: { id: true, workspaceId: true, userId: true, fullName: true },
        },
      },
    });
    if (
      !payer ||
      payer.member.workspaceId !== actor.workspaceId ||
      payer.member.userId !== payer.userId
    )
      fail();
    if (access.role !== "OWNER" && payer.userId !== actor.userId) fail();
    return { owner: access.role === "OWNER", name: payer.member.fullName };
  }
  if (target.scope !== "MEMBER") fail();
  const member = await db.member.findFirst({
    where: { id: target.targetId, workspaceId: actor.workspaceId },
    select: { id: true, userId: true, dateOfBirth: true, fullName: true },
  });
  if (!member) fail();
  if (access.role === "OWNER") return { owner: true, name: member.fullName };
  if (member.userId === actor.userId && !isMinor(member.dateOfBirth, now))
    return { owner: false, name: member.fullName };
  if (!isMinor(member.dateOfBirth, now)) fail();
  const grant = await db.memberPortalGrant.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      memberId: member.id,
      canSign: true,
      revokedAt: null,
      guardian: {
        workspaceId: actor.workspaceId,
        familyLinks: {
          some: { workspaceId: actor.workspaceId, childMemberId: member.id },
        },
      },
    },
  });
  if (!grant?.verifiedAt) fail();
  return { owner: false, name: member.fullName };
}
async function audit(
  db: Tx,
  actor: MemberDataActor,
  kind: string,
  metadata: unknown,
) {
  await db.workspaceDataEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      kind,
      metadata: json(metadata),
    },
  });
}
async function transaction<T>(db: PrismaClient, work: (tx: Tx) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 120000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 11
      )
        throw error;
      // Retry the whole authorization and snapshot transaction after PostgreSQL
      // rolls it back. Jitter avoids immediately colliding with another writer.
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(50 * 2 ** attempt, 1000) + Math.floor(Math.random() * 100),
        ),
      );
    }
  }
}
const summarySelect = {
  id: true,
  scope: true,
  targetId: true,
  state: true,
  sha256: true,
  byteCount: true,
  createdAt: true,
  expiresAt: true,
  downloadedAt: true,
  receiptConfirmedAt: true,
  failureMessage: true,
  resolverName: true,
  requestedByUserId: true,
} as const;

/** Options are derived from current authority, never from the member-picker cookie alone. */
export async function getMemberDataOptions(
  actor: MemberDataActor,
  selectedMemberId: string,
  options: Options = {},
) {
  return transaction(options.db ?? prisma, async (db) => {
    await lock(db, actor.workspaceId);
    const access = await activeActor(db, actor),
      now = options.now ?? new Date();
    const memberTarget: MemberDataTarget = {
      scope: "MEMBER",
      targetId: selectedMemberId,
    };
    let member: (MemberDataTarget & { name: string }) | null = null;
    try {
      const result = await authorize(db, actor, memberTarget, now);
      member = { ...memberTarget, name: result.name };
    } catch (error) {
      if (!(error instanceof MemberDataError)) throw error;
    }
    const account = await db.financialAccount.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        ...(access.role === "OWNER"
          ? { memberId: selectedMemberId }
          : { userId: actor.userId }),
      },
      select: { id: true },
    });
    let payer: (MemberDataTarget & { name: string }) | null = null;
    if (account) {
      const target: MemberDataTarget = { scope: "PAYER", targetId: account.id };
      const result = await authorize(db, actor, target, now);
      payer = { ...target, name: result.name };
    }
    return { member, payer };
  });
}
export async function listMemberDataExports(
  actor: MemberDataActor,
  target: MemberDataTarget,
  options: Options = {},
) {
  return transaction(options.db ?? prisma, async (db) => {
    await lock(db, actor.workspaceId);
    const now = options.now ?? new Date(),
      permission = await authorize(db, actor, target, now);
    const jobs = await db.memberDataExport.findMany({
      where: {
        workspaceId: actor.workspaceId,
        scope: target.scope,
        targetId: target.targetId,
        ...(permission.owner ? {} : { requestedByUserId: actor.userId }),
      },
      select: summarySelect,
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return jobs.map((job) => ({
      ...job,
      state: job.expiresAt <= now ? "EXPIRED" : job.state,
    }));
  });
}
export async function createMemberDataExport(
  actor: MemberDataActor,
  target: MemberDataTarget,
  requestId: string,
  options: Options = {},
) {
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      requestId,
    )
  )
    throw new MemberDataError(
      "Reload the records page before preparing an archive.",
    );
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  const claim = await transaction(db, async (tx) => {
    await lock(tx, actor.workspaceId);
    await authorize(tx, actor, target, now);
    const existing = await tx.memberDataExport.findUnique({
      where: { id: requestId },
      select: { ...summarySelect, workspaceId: true },
    });
    if (existing) {
      if (
        existing.workspaceId !== actor.workspaceId ||
        existing.requestedByUserId !== actor.userId ||
        existing.scope !== target.scope ||
        existing.targetId !== target.targetId
      )
        fail();
      return { created: false, job: existing };
    }
    const resolver = await tx.workspaceUser.findFirst({
      where: { workspaceId: actor.workspaceId, role: "OWNER", isActive: true },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!resolver)
      throw new MemberDataError(
        "The gym must name an active records contact before creating exports.",
      );
    const job = await tx.memberDataExport.create({
      data: {
        id: requestId,
        workspaceId: actor.workspaceId,
        requestedByUserId: actor.userId,
        scope: target.scope,
        targetId: target.targetId,
        resolverUserId: resolver.userId,
        resolverName: resolver.user.fullName?.trim() || resolver.user.email,
        expiresAt: new Date(now.getTime() + 24 * 3600000),
      },
      select: summarySelect,
    });
    await audit(tx, actor, "MEMBER_EXPORT_REQUESTED", {
      exportId: job.id,
      ...target,
      resolverUserId: resolver.userId,
    });
    return { created: true, job };
  });
  if (!claim.created) return claim.job;
  try {
    return await transaction(db, async (tx) => {
      await lock(tx, actor.workspaceId);
      await authorize(tx, actor, target, now);
      const job = await tx.memberDataExport.findFirst({
        where: {
          id: requestId,
          state: "BUILDING",
          workspaceId: actor.workspaceId,
          requestedByUserId: actor.userId,
        },
      });
      if (!job || job.expiresAt <= now)
        throw new MemberDataError(
          "This export request expired. Prepare a new archive.",
        );
      const artifact = await buildMemberDataArtifact(tx, {
        workspaceId: actor.workspaceId,
        ...target,
        exportedAt: now,
      });
      const saved = await tx.memberDataExport.update({
        where: { id: requestId },
        data: {
          state: "READY",
          artifact: artifact.bytes,
          sha256: artifact.sha256,
          byteCount: artifact.byteCount,
          manifest: json(artifact.manifest),
        },
        select: summarySelect,
      });
      await audit(tx, actor, "MEMBER_EXPORT_READY", {
        exportId: requestId,
        sha256: artifact.sha256,
        byteCount: artifact.byteCount,
      });
      return saved;
    });
  } catch (error) {
    const message =
      error instanceof MemberDataError
        ? error.message
        : "The archive could not be prepared. Ask the named records contact to resolve the failure, then prepare a new archive.";
    await db.memberDataExport.updateMany({
      where: {
        id: requestId,
        workspaceId: actor.workspaceId,
        state: "BUILDING",
      },
      data: { state: "FAILED", artifact: null, failureMessage: message },
    });
    await audit(db, actor, "MEMBER_EXPORT_FAILED", {
      exportId: requestId,
      ...(error instanceof Prisma.PrismaClientKnownRequestError
        ? { databaseErrorCode: error.code }
        : {}),
    });
    throw new MemberDataError(message);
  }
}
async function accessibleJob(
  db: Tx,
  actor: MemberDataActor,
  exportId: string,
  now: Date,
) {
  const job = await db.memberDataExport.findFirst({
    where: { id: exportId, workspaceId: actor.workspaceId },
  });
  if (!job || (job.scope !== "MEMBER" && job.scope !== "PAYER")) fail();
  const permission = await authorize(
    db,
    actor,
    { scope: job.scope, targetId: job.targetId },
    now,
  );
  if (!permission.owner && job.requestedByUserId !== actor.userId) fail();
  if (job.state !== "READY" || !job.artifact || job.expiresAt <= now)
    throw new MemberDataError(
      "This archive is unavailable or expired. Prepare a new archive.",
    );
  if (hash(job.artifact) !== job.sha256)
    throw new MemberDataError(
      "This archive failed its checksum check. Ask the records contact to resolve it before retrying.",
    );
  return job;
}
export async function downloadMemberDataExport(
  actor: MemberDataActor,
  exportId: string,
  options: Options = {},
) {
  return transaction(options.db ?? prisma, async (db) => {
    await lock(db, actor.workspaceId);
    const now = options.now ?? new Date(),
      job = await accessibleJob(db, actor, exportId, now);
    await db.memberDataExport.update({
      where: { id: job.id },
      data: { downloadedAt: now },
    });
    await audit(db, actor, "MEMBER_EXPORT_DOWNLOADED", {
      exportId: job.id,
      sha256: job.sha256,
    });
    return {
      bytes: job.artifact!,
      sha256: job.sha256!,
      filename: `hitlink-${job.scope.toLowerCase()}-${job.id}.json.gz`,
    };
  });
}
export async function confirmMemberDataExportReceipt(
  actor: MemberDataActor,
  exportId: string,
  checksum: string,
  options: Options = {},
) {
  return transaction(options.db ?? prisma, async (db) => {
    await lock(db, actor.workspaceId);
    const now = options.now ?? new Date(),
      job = await accessibleJob(db, actor, exportId, now);
    if (!job.downloadedAt || checksum.trim() !== job.sha256)
      throw new MemberDataError(
        "Download and verify this archive's SHA-256 before confirming receipt.",
      );
    if (!job.receiptConfirmedAt) {
      await db.memberDataExport.update({
        where: { id: job.id },
        data: {
          receiptConfirmedAt: now,
          receiptConfirmedByUserId: actor.userId,
        },
      });
      await audit(db, actor, "MEMBER_EXPORT_RECEIPT_CONFIRMED", {
        exportId,
        sha256: job.sha256,
      });
    }
  });
}
export async function expireMemberDataExports(options: Options = {}) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  const expired = await db.memberDataExport.updateMany({
    where: { expiresAt: { lte: now }, state: { not: "EXPIRED" } },
    data: { artifact: null, state: "EXPIRED" },
  });
  await db.memberDataExport.updateMany({
    where: {
      state: "BUILDING",
      createdAt: { lt: new Date(now.getTime() - 15 * 60000) },
    },
    data: {
      state: "FAILED",
      artifact: null,
      failureMessage:
        "This export was interrupted. Ask the named records contact to review it, then prepare a new archive.",
    },
  });
  return expired;
}
