import { prisma, type Prisma } from "@flowstate/db";

export async function getFamilyPortalAccess(workspaceId: string, memberId: string) {
  const [accounts, links, grants] = await Promise.all([
    prisma.member.findMany({
      where: { workspaceId, userId: { not: null }, id: { not: memberId } },
      select: { id: true, userId: true, fullName: true, user: { select: { email: true } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.familyLink.findMany({ where: { workspaceId, childMemberId: memberId }, include: { guardian: true } }),
    prisma.memberPortalGrant.findMany({
      where: { workspaceId, memberId },
      include: { user: { select: { email: true, fullName: true } }, guardian: { select: { fullName: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { accounts, links, grants };
}

function snapshot(value: { userId: string; memberId: string; guardianId: string; canBook: boolean; canSign: boolean; canPay: boolean; version: number; revokedAt: Date | null }) {
  return {
    userId: value.userId, memberId: value.memberId, guardianId: value.guardianId,
    canBook: value.canBook, canSign: value.canSign, canPay: value.canPay,
    version: value.version, revokedAt: value.revokedAt?.toISOString() ?? null,
  } satisfies Prisma.InputJsonObject;
}

export async function changeFamilyPortalAccess(args: {
  workspaceId: string; actorWorkspaceUserId: string; memberId: string; userId: string;
  guardianId: string; expectedVersion: number; reason: string; revoke: boolean;
  canBook: boolean; canSign: boolean; canPay: boolean; identityAndAuthorityVerified: boolean;
}) {
  const reason = args.reason.trim();
  if (!reason || reason.length > 2000) return { error: "Add a verification or revocation note, up to 2,000 characters." };
  if (!args.revoke && !args.identityAndAuthorityVerified) return { error: "Verify the account holder's identity and authority for this family member first." };
  if (!Number.isSafeInteger(args.expectedVersion) || args.expectedVersion < 0) return { error: "Reload the current permissions before saving." };
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${args.workspaceId}`}))`;
    const [actor, account, link, existing] = await Promise.all([
      tx.workspaceUser.findFirst({ where: { id: args.actorWorkspaceUserId, workspaceId: args.workspaceId, role: "OWNER", isActive: true } }),
      tx.member.findFirst({ where: { workspaceId: args.workspaceId, userId: args.userId } }),
      tx.familyLink.findFirst({ where: { workspaceId: args.workspaceId, childMemberId: args.memberId, guardianId: args.guardianId, childMember: { workspaceId: args.workspaceId }, guardian: { workspaceId: args.workspaceId } } }),
      tx.memberPortalGrant.findUnique({ where: { workspaceId_userId_memberId: { workspaceId: args.workspaceId, userId: args.userId, memberId: args.memberId } } }),
    ]);
    if (!actor || !account || account.id === args.memberId || (!args.revoke && !link)) return { error: "Choose a linked guardian and an existing account in this gym." };
    if ((existing?.version ?? 0) !== args.expectedVersion) return { error: "These permissions changed. Reload and review them before saving." };
    if (args.revoke && !existing) return { error: "This account has no family access to revoke." };
    const permissions = {
      guardianId: args.guardianId, verifiedByWorkspaceUserId: actor.id, verificationNote: reason,
      canBook: args.canBook, canSign: args.canSign, canPay: args.canPay,
      verifiedAt: new Date(), revokedAt: null,
    };
    const grant = args.revoke
      ? await tx.memberPortalGrant.update({ where: { id: existing!.id }, data: { revokedAt: new Date(), version: { increment: 1 } } })
      : existing
        ? await tx.memberPortalGrant.update({ where: { id: existing.id }, data: { ...permissions, version: { increment: 1 } } })
        : await tx.memberPortalGrant.create({ data: { ...permissions, workspaceId: args.workspaceId, userId: args.userId, memberId: args.memberId } });
    await tx.portalAccessChange.create({ data: {
      workspaceId: args.workspaceId, grantId: grant.id, actorWorkspaceUserId: actor.id, reason,
      before: existing ? snapshot(existing) : {}, after: snapshot(grant),
    } });
    return { error: null };
  });
}
