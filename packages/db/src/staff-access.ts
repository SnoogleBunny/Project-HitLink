import { readDatabaseFailure } from "./database-failure.js";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";

type Tx = Prisma.TransactionClient;
export type StaffAccessActor = { workspaceId: string; userId: string };
export type StaffRole = "OWNER" | "COACH";
export class StaffAccessError extends Error {}
const fail = (message: string): never => {
  throw new StaffAccessError(message);
};

/** Preserve unrelated errors; raw row-lock serialization maps to the existing full-Tx retry code. */
export function normalizeAuthoritySerializationError(error: unknown): unknown {
  const failure = readDatabaseFailure(error);
  if (
    failure?.code === "P2010" &&
    failure.sqlState === "40001" &&
    failure.clientVersion
  )
    return new Prisma.PrismaClientKnownRequestError(
      "Authority changed while this transaction was waiting. Retry the complete operation.",
      { code: "P2034", clientVersion: failure.clientVersion },
    );
  return error;
}

/** Lock identity rows before reading their mutable authority, without filtering revoked state. */
export async function lockStaffAuthorityTx(
  db: Tx,
  actor: StaffAccessActor,
): Promise<void> {
  try {
    await db.$queryRaw`
      SELECT "id" FROM "workspaces" WHERE "id" = ${actor.workspaceId} FOR SHARE
    `;
    await db.$queryRaw`
      SELECT "id" FROM "workspace_users"
      WHERE "workspaceId" = ${actor.workspaceId} AND "userId" = ${actor.userId}
      FOR SHARE
    `;
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
}

/** Call after lockClassSchedule for a mutation; never trust a cached role. */
export async function requireActiveStaffAccessTx(
  db: Tx,
  actor: StaffAccessActor & { capability?: "OWNER" | "OPERATIONS" },
) {
  await lockStaffAuthorityTx(db, actor);
  const staff = await db.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      isActive: true,
      role: actor.capability === "OWNER" ? "OWNER" : { in: ["OWNER", "COACH"] },
      workspace: { status: { not: "DISABLED" } },
    },
    select: { id: true, userId: true, role: true },
  });
  return (
    staff ??
    fail(
      "Your staff access changed. Sign in again or ask an active owner for help.",
    )
  );
}

export type StaffAccessChangeInput = {
  workspaceUserId: string;
  role: string;
  isActive: boolean;
  expectedUpdatedAt: string;
  reason: string;
  operationId: string;
};

export function validateStaffAccessChange(input: StaffAccessChangeInput) {
  const reason = input.reason.trim();
  if (!input.workspaceUserId || !["OWNER", "COACH"].includes(input.role))
    return fail(
      "Choose an existing owner or coach and a supported staff role.",
    );
  if (typeof input.isActive !== "boolean")
    return fail("Choose active or inactive staff access.");
  if (!/^[a-zA-Z0-9:_-]{16,150}$/.test(input.operationId))
    return fail("This request is invalid. Reload the staff page.");
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (!Number.isFinite(+expectedUpdatedAt))
    return fail("Reload the staff page before changing access.");
  if (reason.length < 5 || reason.length > 500)
    return fail(
      "Explain the access change in 5 to 500 characters. Keep private client information out of this record.",
    );
  return { ...input, role: input.role as StaffRole, reason, expectedUpdatedAt };
}

async function revokeCoachingAssignments(
  tx: Tx,
  actor: StaffAccessActor,
  targetId: string,
  operationId: string,
  now: Date,
) {
  const enrollments = await tx.coachingEnrollment.findMany({
    where: {
      workspaceId: actor.workspaceId,
      closedAt: null,
      OR: [
        { currentCoachWorkspaceUserId: targetId },
        { proposedCoachWorkspaceUserId: targetId },
      ],
    },
    include: {
      member: { select: { userId: true, user: { select: { email: true } } } },
    },
  });
  await tx.coachingAvailability.updateMany({
    where: {
      workspaceId: actor.workspaceId,
      coachWorkspaceUserId: targetId,
      withdrawnAt: null,
    },
    data: { withdrawnAt: now },
  });
  for (const enrollment of enrollments) {
    const removedAcceptedCoach =
      enrollment.currentCoachWorkspaceUserId === targetId;
    await tx.coachingAssignment.updateMany({
      where: {
        enrollmentId: enrollment.id,
        coachWorkspaceUserId: targetId,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    await tx.coachingEnrollment.update({
      where: { id: enrollment.id },
      data: removedAcceptedCoach
        ? {
            currentCoachWorkspaceUserId: null,
            proposedCoachWorkspaceUserId: null,
            historyFromDate: null,
            status: "AWAITING_REPLACEMENT",
            version: { increment: 1 },
          }
        : {
            proposedCoachWorkspaceUserId: null,
            version: { increment: 1 },
          },
    });
    await tx.coachingEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        enrollmentId: enrollment.id,
        actorUserId: actor.userId,
        operationId: `staff-access:${operationId}:${enrollment.id}`,
        inputHash: createHash("sha256")
          .update(`${operationId}:${targetId}`)
          .digest("hex"),
        kind: "staffAccessRevoked",
        resultId: enrollment.id,
        metadata: {
          previousCoachId: targetId,
          appointmentsRetainedForOwnerReview: true,
        },
      },
    });
    const recipient = enrollment.member.user;
    if (
      recipient &&
      enrollment.member.userId &&
      (await tx.workspaceUser.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          userId: enrollment.member.userId,
          role: "CUSTOMER",
          isActive: true,
        },
        select: { id: true },
      }))
    )
      await tx.notificationJob.create({
        data: {
          workspaceId: actor.workspaceId,
          templateKind: "ANNOUNCEMENT",
          recipientEmail: recipient.email,
          subject: "Your coaching assignment needs review",
          body: removedAcceptedCoach
            ? "Your coach's access has ended. Sign in to your HitLink member portal to review your program and contact the gym about replacement or service recovery. Existing appointment commitments need an owner review."
            : "A proposed coach is no longer available. Sign in to your HitLink member portal to review your current program and contact the gym about the proposed assignment.",
          dedupeKey: `staff-access:${operationId}:${enrollment.id}`,
          context: { kind: "COACHING_UPDATE", enrollmentId: enrollment.id },
          status: "PENDING",
          nextAttemptAt: now,
        },
      });
  }
  return enrollments.map((item) => item.id);
}

/** Role changes never postpone revocation for a handoff, payment or delivery review. */
export async function changeStaffAccess(
  actor: StaffAccessActor,
  raw: StaffAccessChangeInput,
  options: { db?: PrismaClient; now?: Date } = {},
) {
  const input = validateStaffAccessChange(raw),
    now = options.now ?? new Date();
  const inputHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const db = options.db ?? prisma;
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await lockClassSchedule(tx, actor.workspaceId);
          const owner = await requireActiveStaffAccessTx(tx, {
            ...actor,
            capability: "OWNER",
          });
          const prior = await tx.workspaceDataEvent.findFirst({
            where: {
              workspaceId: actor.workspaceId,
              kind: "STAFF_ACCESS_CHANGED",
              metadata: { path: ["operationId"], equals: input.operationId },
            },
          });
          if (prior) {
            const evidence = prior.metadata as {
              inputHash?: string;
              revokedSessionCount?: number;
            };
            if (
              prior.actorUserId !== actor.userId ||
              evidence.inputHash !== inputHash
            )
              return fail(
                "This request was already used for a different staff change. Reload the page.",
              );
            return {
              id: prior.id,
              replayed: true,
              revokedSessionCount: evidence.revokedSessionCount ?? 0,
            };
          }
          const target = await tx.workspaceUser.findFirst({
            where: {
              id: input.workspaceUserId,
              workspaceId: actor.workspaceId,
              role: { in: ["OWNER", "COACH"] },
            },
          });
          if (!target) return fail("Staff member not found in this gym.");
          if (+target.updatedAt !== +input.expectedUpdatedAt)
            return fail(
              "This staff record changed. Reload and review its current access.",
            );
          if (target.role === input.role && target.isActive === input.isActive)
            return fail("Choose a change to the staff role or active access.");
          if (
            target.role === "OWNER" &&
            target.isActive &&
            (input.role !== "OWNER" || !input.isActive)
          ) {
            const activeOwners = await tx.workspaceUser.count({
              where: {
                workspaceId: actor.workspaceId,
                role: "OWNER",
                isActive: true,
              },
            });
            if (activeOwners <= 1)
              return fail(
                "Keep at least one active owner. Promote another active staff member before removing this owner's access.",
              );
          }
          // Share the password-reset/session creation lock so an old login cannot
          // create a session in the middle of this revocation.
          await tx.$queryRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtext($1))::text",
            `account-security:${target.userId}`,
          );
          const updated = await tx.workspaceUser.updateMany({
            where: {
              id: target.id,
              workspaceId: actor.workspaceId,
              updatedAt: input.expectedUpdatedAt,
            },
            data: {
              role: input.role,
              isActive: input.isActive,
              canManageProgress: false,
              canOverridePrerequisites: false,
            },
          });
          if (updated.count !== 1)
            return fail(
              "This staff record changed. Reload before trying again.",
            );
          const revoked = await tx.authSession.deleteMany({
            where: { userId: target.userId },
          });
          const coachingReviewIds = !input.isActive
            ? await revokeCoachingAssignments(
                tx,
                actor,
                target.id,
                input.operationId,
                now,
              )
            : [];
          const event = await tx.workspaceDataEvent.create({
            data: {
              workspaceId: actor.workspaceId,
              actorUserId: actor.userId,
              kind: "STAFF_ACCESS_CHANGED",
              metadata: {
                operationId: input.operationId,
                inputHash,
                targetWorkspaceUserId: target.id,
                targetUserId: target.userId,
                actorWorkspaceUserId: owner.id,
                before: {
                  role: target.role,
                  isActive: target.isActive,
                  canManageProgress: target.canManageProgress,
                  canOverridePrerequisites: target.canOverridePrerequisites,
                },
                after: {
                  role: input.role,
                  isActive: input.isActive,
                  canManageProgress: false,
                  canOverridePrerequisites: false,
                },
                reason: input.reason,
                revokedSessionCount: revoked.count,
                coachingReviewIds,
              },
              createdAt: now,
            },
          });
          return {
            id: event.id,
            replayed: false,
            revokedSessionCount: revoked.count,
          };
        },
        { isolationLevel: "Serializable", timeout: 20000 },
      );
    } catch (error) {
      if (
        readDatabaseFailure(error)?.code !== "P2034" ||
        attempt >= 2
      )
        throw error;
    }
  }
}

export async function getStaffAccess(
  actor: StaffAccessActor,
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    await requireActiveStaffAccessTx(tx, { ...actor, capability: "OWNER" });
    const [staff, events] = await Promise.all([
      tx.workspaceUser.findMany({
        where: {
          workspaceId: actor.workspaceId,
          role: { in: ["OWNER", "COACH"] },
        },
        select: {
          id: true,
          userId: true,
          role: true,
          isActive: true,
          updatedAt: true,
          user: { select: { fullName: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      tx.workspaceDataEvent.findMany({
        where: { workspaceId: actor.workspaceId, kind: "STAFF_ACCESS_CHANGED" },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);
    return { staff, events };
  });
}
