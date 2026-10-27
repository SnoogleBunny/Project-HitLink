import { Prisma } from "@prisma/client";
import { lockClassSchedule } from "./class-occurrences.js";
import { lockStaffAuthorityTx, normalizeAuthoritySerializationError } from "./staff-access.js";
import { isWorkspaceOperationallyReady } from "./workspace-readiness.js";

/** Supplied by an authenticated server command; never by a submitted product form. */
export interface MemberCommandActor {
  readonly userId: string;
  readonly sessionId: string;
}

export class MemberBookingAuthorityError extends Error {
  constructor() {
    super("Your booking access changed. Sign in again or ask the gym to review this participant’s permissions.");
  }
}

const deny = (): never => { throw new MemberBookingAuthorityError(); };

/**
 * All identity locks precede state decisions. Current-session expiry is evaluated
 * after every possible row wait and reread, with application time rather than the
 * transaction-start clock. The optional clock is for deterministic tests only.
 */
export async function requireCurrentMemberBookingAuthorityTx(
  tx: Prisma.TransactionClient,
  input: {
    workspaceId: string;
    memberId: string;
    actor: MemberCommandActor;
    permission?: "book" | "pay";
    authorizationClock?: () => Date;
  },
) {
  if (!input.workspaceId || !input.memberId || !input.actor?.userId || !input.actor.sessionId) return deny();
  const { workspaceId, memberId, actor } = input;
  await lockClassSchedule(tx, workspaceId);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))::text`;
  await lockStaffAuthorityTx(tx, { workspaceId, userId: actor.userId });
  try {
    await tx.$queryRaw`SELECT id FROM workspace_migrations WHERE "workspaceId"=${workspaceId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM workspace_setup_activations WHERE "workspaceId"=${workspaceId} FOR SHARE`;
    // No account-security advisory or User row lock: session deletion itself is
    // ordered by this exact row lock. Session creation remains a separate command.
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${actor.sessionId} AND "userId"=${actor.userId} FOR SHARE`;
    const accountSelector = await tx.member.findFirst({ where: { workspaceId, userId: actor.userId }, select: { id: true } });
    if (!accountSelector) return deny();
    const memberIds = [...new Set([accountSelector.id, memberId])].sort();
    await tx.$queryRaw`SELECT id FROM members WHERE "workspaceId"=${workspaceId} AND id IN (${Prisma.join(memberIds)}) ORDER BY id FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM member_portal_grants WHERE "workspaceId"=${workspaceId} AND "userId"=${actor.userId} AND "memberId"=${memberId} ORDER BY id FOR SHARE`;
    const grantSelector = await tx.memberPortalGrant.findUnique({ where: { workspaceId_userId_memberId: { workspaceId, userId: actor.userId, memberId } }, select: { guardianId: true } });
    if (grantSelector) {
      await tx.$queryRaw`SELECT id FROM guardians WHERE "workspaceId"=${workspaceId} AND id=${grantSelector.guardianId} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM family_links WHERE "workspaceId"=${workspaceId} AND "guardianId"=${grantSelector.guardianId} AND "childMemberId"=${memberId} ORDER BY id FOR SHARE`;
    }

    // These reads occur AFTER their exact identity locks. Never authorize using a
    // candidate object fetched before a row lock could wait.
    const [workspace, membership, session, account, member, grant] = await Promise.all([
      tx.workspace.findUnique({ where: { id: workspaceId }, include: { location: { select: { id: true } }, migration: true, setupActivation: true } }),
      tx.workspaceUser.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actor.userId } } }),
      tx.authSession.findUnique({ where: { id: actor.sessionId }, select: { id: true, userId: true, expiresAt: true } }),
      tx.member.findFirst({ where: { id: accountSelector.id, workspaceId, userId: actor.userId }, select: { id: true } }),
      tx.member.findFirst({ where: { id: memberId, workspaceId }, select: { id: true, userId: true } }),
      tx.memberPortalGrant.findUnique({ where: { workspaceId_userId_memberId: { workspaceId, userId: actor.userId, memberId } }, include: { guardian: { include: { familyLinks: { where: { workspaceId, childMemberId: memberId } } } } } }),
    ]);
    // Deliberately last: a late grant/link/member wait must not preserve an older
    // session-validity instant. No database await follows this authorization time.
    const authorizedAt = (input.authorizationClock ?? (() => new Date()))();
    if (!Number.isFinite(+authorizedAt) || !session || session.userId !== actor.userId || session.expiresAt <= authorizedAt
      || !membership?.isActive || membership.role !== "CUSTOMER" || !account || !member || !workspace?.location
      || !isWorkspaceOperationallyReady({ workspaceStatus: workspace.status, setupActivation: workspace.setupActivation,
        migrationStage: workspace.migration?.stage, ownerReviewAcknowledgedAt: workspace.migration?.ownerReviewAcknowledgedAt,
        ownerReviewAcknowledgedByUserId: workspace.migration?.ownerReviewAcknowledgedByUserId,
        operationallyReadyAt: workspace.migration?.operationallyReadyAt, operationallyReadyByUserId: workspace.migration?.operationallyReadyByUserId })) return deny();
    const self = account.id === member.id && member.userId === actor.userId;
    if (!self && (!grant?.verifiedAt || grant.revokedAt || grant.guardian.workspaceId !== workspaceId
      || !grant.guardian.familyLinks.some(link => link.workspaceId === workspaceId && link.childMemberId === memberId && link.guardianId === grant.guardianId))) return deny();
    const canBook = self || grant!.canBook;
    const canPay = self || grant!.canPay;
    if ((input.permission ?? "book") === "book" ? !canBook : !canPay) return deny();
    return { actorUserId: actor.userId, accountMemberId: account.id, memberId, guardianId: self ? null : grant!.guardianId,
      grantId: self ? null : grant!.id, canBook, canPay };
  } catch (error) {
    throw normalizeAuthoritySerializationError(error);
  }
}
