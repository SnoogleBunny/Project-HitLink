import {
  Prisma,
  prisma,
  lockClassSchedule,
  lockStaffAuthorityTx,
} from "@flowstate/db";
import { readMemberArchiveImpact } from "./member-archive-impact";

export class MemberArchiveError extends Error {}

async function retryArchiveTransaction<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 3
      )
        throw error;
    }
  }
}

export function validateArchiveChange(input: {
  expectedVersion: number;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
    throw new MemberArchiveError(
      "Reload this member before changing archive status.",
    );
  if (reason.length < 5 || reason.length > 500)
    throw new MemberArchiveError("Give a reason using 5 to 500 characters.");
  return reason;
}

export async function getMemberArchive(
  actor: { workspaceId: string; userId: string },
  memberId: string,
  now = new Date(),
) {
  return retryArchiveTransaction(() =>
    prisma.$transaction(
      async (db) => {
        await lockStaffAuthorityTx(db, actor);
        if (
          !(await db.workspaceUser.findFirst({
            where: {
              ...actor,
              role: "OWNER",
              isActive: true,
              workspace: { status: { not: "DISABLED" } },
            },
            select: { id: true },
          }))
        )
          throw new MemberArchiveError(
            "Only an active owner can archive members.",
          );
        const member = await db.member.findFirst({
          where: { id: memberId, workspaceId: actor.workspaceId },
          select: { archivedAt: true, archiveVersion: true },
        });
        return member
          ? {
              ...member,
              impact: await readMemberArchiveImpact(
                db,
                { workspaceId: actor.workspaceId, memberId },
                now,
              ),
            }
          : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    ),
  );
}

export async function changeMemberArchive(
  actor: { workspaceId: string; userId: string },
  input: {
    memberId: string;
    expectedVersion: number;
    archived: boolean;
    reason: string;
    expectedImpactHash?: string;
    retainBalancesAndUnits?: boolean;
  },
  now = new Date(),
) {
  const reason = validateArchiveChange(input);
  return retryArchiveTransaction(() =>
    prisma.$transaction(
      async (db) => {
        await lockClassSchedule(db, actor.workspaceId);
        await lockStaffAuthorityTx(db, actor);
        if (
          !(await db.workspaceUser.findFirst({
            where: {
              ...actor,
              role: "OWNER",
              isActive: true,
              workspace: { status: { not: "DISABLED" } },
            },
            select: { id: true },
          }))
        )
          throw new MemberArchiveError(
            "Only an active owner can archive members.",
          );
        const member = await db.member.findFirst({
          where: { id: input.memberId, workspaceId: actor.workspaceId },
          select: { id: true, archivedAt: true, archiveVersion: true },
        });
        if (!member) throw new MemberArchiveError("Member not found.");
        if (member.archiveVersion !== input.expectedVersion)
          throw new MemberArchiveError(
            "Archive status changed. Reload this member before continuing.",
          );
        if (Boolean(member.archivedAt) === input.archived)
          return { version: member.archiveVersion };
        let disposition: Awaited<
          ReturnType<typeof readMemberArchiveImpact>
        > | null = null;
        if (input.archived) {
          disposition = await readMemberArchiveImpact(
            db,
            { workspaceId: actor.workspaceId, memberId: member.id },
            now,
          );
          if (input.expectedImpactHash !== disposition.hash)
            throw new MemberArchiveError(
              "The archive preview changed. Reload this member and review the current services and balances.",
            );
          if (!input.retainBalancesAndUnits)
            throw new MemberArchiveError(
              "Confirm that all debts, credits and unused units remain recorded for this member.",
            );
          if (Object.values(disposition.blockers).some(Boolean))
            throw new MemberArchiveError(
              "Resolve this member’s active memberships, future bookings, waitlists, coaching and pending purchases before archiving. Archiving cannot cancel services or stop billing.",
            );
        }
        await db.member.update({
          where: { id: member.id },
          data: {
            archivedAt: input.archived ? now : null,
            archiveVersion: { increment: 1 },
          },
        });
        await db.workspaceDataEvent.create({
          data: {
            workspaceId: actor.workspaceId,
            actorUserId: actor.userId,
            kind: input.archived ? "MEMBER_ARCHIVED" : "MEMBER_REACTIVATED",
            metadata: {
              memberId: member.id,
              reason,
              disposition,
              before: { archivedAt: member.archivedAt?.toISOString() ?? null },
              after: { archivedAt: input.archived ? now.toISOString() : null },
              version: member.archiveVersion + 1,
            },
          },
        });
        return { version: member.archiveVersion + 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
