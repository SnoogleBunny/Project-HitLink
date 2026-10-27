import { createHash, randomBytes } from "node:crypto";
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "@flowstate/auth";
import {
  Prisma,
  PrismaClient,
  lockClassSchedule,
  requireActiveStaffAccessTx,
} from "@flowstate/db";
import {
  lockStaffAuthorityTx,
  normalizeAuthoritySerializationError,
} from "../../../packages/db/src/staff-access.js";

const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVALID_STAFF_INVITE_MESSAGE =
  "This invitation cannot be accepted. Ask the owner for a new invitation and use the invited account.";
const missingPendingInviteMessage = "That invite is no longer pending.";
// Rejected nested writes can contain the bearer delivery URL. Keep this client quiet.
const globalInvites = globalThis as typeof globalThis & {
  staffInvitePrisma?: PrismaClient;
};
const defaultDatabase =
  globalInvites.staffInvitePrisma ?? new PrismaClient({ log: [] });
globalInvites.staffInvitePrisma = defaultDatabase;
type Tx = Prisma.TransactionClient;
export class StaffInviteError extends Error {}
const fail = (message: string): never => {
  throw new StaffInviteError(message);
};
export const normalizeInviteEmail = (email: string) =>
  email.trim().toLowerCase();
export const hashStaffInviteToken = (token: string) =>
  `sha256:${createHash("sha256").update(token).digest("hex")}`;

export function staffInviteLink(origin: string, token: string): string {
  const url = new URL(origin);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password
  )
    return fail("Staff invitation delivery is not configured.");
  url.pathname = "/staff-invite";
  url.search = "";
  url.hash = new URLSearchParams({ token }).toString();
  return url.href;
}
interface MutationOptions {
  workspaceId: string;
  invitedByUserId: string;
  db?: PrismaClient;
  now?: Date;
}
interface InviteSnapshot {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
}
async function evidence(
  tx: Tx,
  args: {
    workspaceId: string;
    actorUserId: string | null;
    kind: string;
    before?: InviteSnapshot | null;
    after: InviteSnapshot;
    extra?: Prisma.InputJsonObject;
  },
) {
  const snapshot = (invite: InviteSnapshot) => ({
    status: invite.status,
    expiresAt: invite.expiresAt.toISOString(),
  });
  await tx.workspaceDataEvent.create({
    data: {
      workspaceId: args.workspaceId,
      actorUserId: args.actorUserId,
      kind: args.kind,
      metadata: {
        inviteId: args.after.id,
        email: args.after.email,
        role: args.after.role,
        before: args.before ? snapshot(args.before) : null,
        after: snapshot(args.after),
        ...args.extra,
      },
    },
  });
}
async function atomic<T>(
  db: PrismaClient,
  workspaceId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await lockClassSchedule(tx, workspaceId);
          return run(tx);
        },
        { isolationLevel: "Serializable", timeout: 20000 },
      );
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (["P2034", "P2002"].includes(error.code) ||
          (error.code === "P2010" &&
            ["40001", "40P01"].includes(String(error.meta?.code))));
      if (!retryable || attempt >= 2) throw error;
    }
  }
}
async function cancelDeliveries(tx: Tx, workspaceId: string, inviteId: string) {
  await tx.notificationJob.updateMany({
    where: {
      workspaceId,
      status: { in: ["PENDING", "FAILED", "SENDING"] },
      AND: [
        { context: { path: ["kind"], equals: "STAFF_INVITE" } },
        { context: { path: ["inviteId"], equals: inviteId } },
      ],
    },
    data: {
      status: "CANCELLED",
      body: "",
      nextAttemptAt: null,
      lastError: "This invitation is no longer current.",
    },
  });
}
async function expireTx(tx: Tx, args: MutationOptions, now: Date) {
  const expired = await tx.staffInvite.findMany({
    where: {
      workspaceId: args.workspaceId,
      role: "COACH",
      status: "PENDING",
      expiresAt: { lte: now },
    },
  });
  for (const before of expired) {
    const after = await tx.staffInvite.update({
      where: { id: before.id },
      data: { status: "EXPIRED" },
    });
    await cancelDeliveries(tx, args.workspaceId, before.id);
    await evidence(tx, {
      ...args,
      actorUserId: args.invitedByUserId,
      kind: "STAFF_INVITE_EXPIRED",
      before,
      after,
    });
  }
  return expired.length;
}
export async function expireStalePendingStaffInvites(
  args: MutationOptions,
): Promise<number> {
  return atomic(args.db ?? defaultDatabase, args.workspaceId, async (tx) => {
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.invitedByUserId,
      capability: "OWNER",
    });
    return expireTx(tx, args, args.now ?? new Date());
  });
}
export interface PendingCoachInvite {
  id: string;
  email: string;
  status: "PENDING";
  expiresAt: Date;
  createdAt: Date;
  invitedByDisplayName: string;
  invitedByEmail: string;
}
interface StaffInviteReadDatabase {
  staffInvite: {
    findMany(args: {
      where: {
        workspaceId: string;
        role: "COACH";
        status: "PENDING";
        expiresAt: { gt: Date };
      };
      include: { invitedByUser: { select: { fullName: true; email: true } } };
      orderBy: { createdAt: "desc" };
    }): Promise<
      Array<{
        id: string;
        email: string;
        expiresAt: Date;
        createdAt: Date;
        invitedByUser: { fullName: string | null; email: string };
      }>
    >;
  };
}
/** Read projection; callers supply their authorized workspace. Expiry mutation uses the owner command. */
export async function listPendingCoachInvites(args: {
  workspaceId: string;
  db?: StaffInviteReadDatabase;
  now?: Date;
}): Promise<PendingCoachInvite[]> {
  const db: StaffInviteReadDatabase = args.db ?? defaultDatabase;
  const invites = await db.staffInvite.findMany({
    where: {
      workspaceId: args.workspaceId,
      role: "COACH",
      status: "PENDING",
      expiresAt: { gt: args.now ?? new Date() },
    },
    include: { invitedByUser: { select: { fullName: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  return invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    status: "PENDING",
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    invitedByDisplayName:
      invite.invitedByUser.fullName?.trim() || invite.invitedByUser.email,
    invitedByEmail: invite.invitedByUser.email,
  }));
}
export async function listStaffInviteHistory(args: MutationOptions) {
  return atomic(args.db ?? defaultDatabase, args.workspaceId, async (tx) => {
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.invitedByUserId,
      capability: "OWNER",
    });
    return tx.workspaceDataEvent.findMany({
      where: {
        workspaceId: args.workspaceId,
        kind: { startsWith: "STAFF_INVITE_" },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });
}
async function deliver(
  tx: Tx,
  invite: InviteSnapshot & { workspaceId: string; token: string },
  rawToken: string,
  origin: string,
  now: Date,
) {
  await tx.notificationJob.create({
    data: {
      workspaceId: invite.workspaceId,
      templateKind: "ANNOUNCEMENT",
      recipientEmail: invite.email,
      subject: "Your HitLink coach invitation",
      body: `You have been invited to join a HitLink workspace as a coach. Open ${staffInviteLink(origin, rawToken)} and use this invited email address. The link expires in seven days. If you did not expect this invitation, ignore it.`,
      dedupeKey: `staff-invite:${invite.id}:${invite.token}`,
      expiresAt: invite.expiresAt,
      nextAttemptAt: now,
      context: {
        kind: "STAFF_INVITE",
        inviteId: invite.id,
        tokenHash: invite.token,
      },
    },
  });
}
export async function inviteCoachToWorkspace(
  args: MutationOptions & {
    email: string;
    inviteOrigin: string;
    tokenGenerator?: () => string;
  },
) {
  const email = normalizeInviteEmail(args.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return {
      status: "error" as const,
      message: "Enter a valid coach email address.",
    };
  const now = args.now ?? new Date();
  const rawToken =
    args.tokenGenerator?.() ?? randomBytes(32).toString("base64url");
  staffInviteLink(args.inviteOrigin, rawToken);
  return atomic(args.db ?? defaultDatabase, args.workspaceId, async (tx) => {
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.invitedByUserId,
      capability: "OWNER",
    });
    if (
      await tx.workspaceUser.count({
        where: { user: { email }, workspaceId: args.workspaceId },
      })
    )
      return {
        status: "error" as const,
        message:
          "This account already has workspace access. Manage its role on the staff page.",
      };
    await expireTx(tx, args, now);
    const before = await tx.staffInvite.findFirst({
      where: {
        workspaceId: args.workspaceId,
        email,
        role: "COACH",
        status: "PENDING",
      },
      orderBy: { createdAt: "desc" },
    });
    const data = {
      invitedByUserId: args.invitedByUserId,
      token: hashStaffInviteToken(rawToken),
      expiresAt: new Date(now.getTime() + STAFF_INVITE_TTL_MS),
    };
    const after = before
      ? await tx.staffInvite.update({ where: { id: before.id }, data })
      : await tx.staffInvite.create({
          data: {
            workspaceId: args.workspaceId,
            email,
            role: "COACH",
            ...data,
          },
        });
    if (before) await cancelDeliveries(tx, args.workspaceId, before.id);
    await deliver(tx, after, rawToken, args.inviteOrigin, now);
    await evidence(tx, {
      ...args,
      actorUserId: args.invitedByUserId,
      kind: before ? "STAFF_INVITE_ROTATED" : "STAFF_INVITE_CREATED",
      before,
      after,
    });
    return {
      status: before ? ("refreshed" as const) : ("created" as const),
      inviteId: after.id,
    };
  });
}
export async function resendPendingCoachInvite(
  args: MutationOptions & {
    inviteId: string;
    inviteOrigin: string;
    tokenGenerator?: () => string;
  },
) {
  const db = args.db ?? defaultDatabase;
  const now = args.now ?? new Date();
  const rawToken =
    args.tokenGenerator?.() ?? randomBytes(32).toString("base64url");
  staffInviteLink(args.inviteOrigin, rawToken);
  return atomic(db, args.workspaceId, async (tx) => {
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.invitedByUserId,
      capability: "OWNER",
    });
    await expireTx(tx, args, now);
    const before = await tx.staffInvite.findFirst({
      where: {
        id: args.inviteId,
        workspaceId: args.workspaceId,
        role: "COACH",
        status: "PENDING",
      },
    });
    if (!before)
      return { status: "error" as const, message: missingPendingInviteMessage };
    const after = await tx.staffInvite.update({
      where: { id: before.id },
      data: {
        invitedByUserId: args.invitedByUserId,
        token: hashStaffInviteToken(rawToken),
        expiresAt: new Date(now.getTime() + STAFF_INVITE_TTL_MS),
      },
    });
    await cancelDeliveries(tx, args.workspaceId, before.id);
    await deliver(tx, after, rawToken, args.inviteOrigin, now);
    await evidence(tx, {
      ...args,
      actorUserId: args.invitedByUserId,
      kind: "STAFF_INVITE_ROTATED",
      before,
      after,
    });
    return { status: "resent" as const, inviteId: after.id };
  });
}
export async function revokePendingCoachInvite(
  args: MutationOptions & { inviteId: string },
) {
  return atomic(args.db ?? defaultDatabase, args.workspaceId, async (tx) => {
    await requireActiveStaffAccessTx(tx, {
      workspaceId: args.workspaceId,
      userId: args.invitedByUserId,
      capability: "OWNER",
    });
    const now = args.now ?? new Date();
    await expireTx(tx, args, now);
    const before = await tx.staffInvite.findFirst({
      where: {
        id: args.inviteId,
        workspaceId: args.workspaceId,
        role: "COACH",
        status: "PENDING",
      },
    });
    if (!before)
      return { status: "error" as const, message: missingPendingInviteMessage };
    const after = await tx.staffInvite.update({
      where: { id: before.id },
      data: { status: "REVOKED", revokedAt: now },
    });
    await cancelDeliveries(tx, args.workspaceId, before.id);
    await evidence(tx, {
      ...args,
      actorUserId: args.invitedByUserId,
      kind: "STAFF_INVITE_REVOKED",
      before,
      after,
    });
    return { status: "revoked" as const, inviteId: after.id };
  });
}

/** Token possession is required before any account lookup. Existing passwords are verified again under the account lock. */
export async function acceptStaffInvite(args: {
  token: string;
  email: string;
  password: string;
  fullName: string;
  db?: PrismaClient;
  now?: Date;
}) {
  const db = args.db ?? defaultDatabase,
    now = args.now ?? new Date();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(args.token))
    return fail(INVALID_STAFF_INVITE_MESSAGE);
  const email = normalizeInviteEmail(args.email);
  const invite = await db.staffInvite.findUnique({
    where: { token: hashStaffInviteToken(args.token) },
  });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt <= now)
    return fail(INVALID_STAFF_INVITE_MESSAGE);
  const attempts = () =>
    db.workspaceDataEvent.count({
      where: {
        workspaceId: invite.workspaceId,
        kind: "STAFF_INVITE_ACCEPT_REJECTED",
        createdAt: { gt: new Date(now.getTime() - 15 * 60000) },
        metadata: { path: ["inviteId"], equals: invite.id },
      },
    });
  if ((await attempts()) >= 5) return fail(INVALID_STAFF_INVITE_MESSAGE);
  const account =
    email === normalizeInviteEmail(invite.email)
      ? await db.user.findUnique({ where: { email } })
      : null;
  let valid = email === normalizeInviteEmail(invite.email);
  let passwordHash: string | null = null;
  if (account)
    valid =
      valid && (await verifyPassword(args.password, account.passwordHash));
  else if (valid) {
    valid = validateNewPassword(args.password) === null;
    if (!args.fullName.trim() || args.fullName.trim().length > 160)
      valid = false;
    if (valid) passwordHash = await hashPassword(args.password);
  }
  const result = await atomic(db, invite.workspaceId, async (tx) => {
    // The initial invitation identifies lock keys only. A fixed Serializable
    // snapshot may predate the schedule wait, so lock inviter/workspace and the
    // exact invitation before trusting current role, status, expiry or token.
    await lockStaffAuthorityTx(tx, {
      workspaceId: invite.workspaceId,
      userId: invite.invitedByUserId,
    });
    try {
      await tx.$queryRaw`SELECT id FROM staff_invites WHERE id=${invite.id} AND "workspaceId"=${invite.workspaceId} FOR SHARE`;
    } catch (error) {
      throw normalizeAuthoritySerializationError(error);
    }
    const current = await tx.staffInvite.findFirst({
      where: {
        id: invite.id,
        workspaceId: invite.workspaceId,
        token: invite.token,
        status: "PENDING",
        expiresAt: { gt: now },
        workspace: { status: { not: "DISABLED" } },
      },
    });
    if (!current || current.invitedByUserId !== invite.invitedByUserId)
      return null;
    const recentFailures = await tx.workspaceDataEvent.count({
      where: {
        workspaceId: invite.workspaceId,
        kind: "STAFF_INVITE_ACCEPT_REJECTED",
        createdAt: { gt: new Date(now.getTime() - 15 * 60000) },
        metadata: { path: ["inviteId"], equals: invite.id },
      },
    });
    if (recentFailures >= 5) return null;
    if (!valid) {
      await evidence(tx, {
        workspaceId: invite.workspaceId,
        actorUserId: null,
        kind: "STAFF_INVITE_ACCEPT_REJECTED",
        before: current,
        after: current,
      });
      return null;
    }
    const inviter = await tx.workspaceUser.findFirst({
      where: {
        workspaceId: invite.workspaceId,
        userId: current.invitedByUserId,
        role: "OWNER",
        isActive: true,
      },
    });
    if (!inviter) return null;
    await tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))::text",
      `staff-invite-email:${email}`,
    );
    let user = await tx.user.findUnique({ where: { email } });
    if (account) {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `account-security:${account.id}`,
      );
      // Serializable snapshots may precede a reset that held the account lock.
      // Locking the row forces a retry instead of accepting that stale hash.
      await tx.$queryRawUnsafe(
        'SELECT "id" FROM "users" WHERE "id" = $1 FOR UPDATE',
        account.id,
      );
      user = await tx.user.findUnique({ where: { id: account.id } });
      if (
        !user ||
        user.email.toLowerCase() !== email ||
        user.passwordHash !== account.passwordHash
      )
        return null;
    } else if (user || !passwordHash) return null;
    if (user && (await tx.workspaceUser.count({ where: { userId: user.id } })))
      return null;
    user ??= await tx.user.create({
      data: { email, fullName: args.fullName.trim(), passwordHash },
    });
    const membership = await tx.workspaceUser.create({
      data: {
        workspaceId: invite.workspaceId,
        userId: user.id,
        role: "COACH",
        isActive: true,
      },
    });
    const revoked = await tx.authSession.deleteMany({
      where: { userId: user.id },
    });
    const after = await tx.staffInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: now },
    });
    await cancelDeliveries(tx, invite.workspaceId, invite.id);
    await evidence(tx, {
      workspaceId: invite.workspaceId,
      actorUserId: user.id,
      kind: "STAFF_INVITE_ACCEPTED",
      before: current,
      after,
      extra: {
        targetUserId: user.id,
        targetWorkspaceUserId: membership.id,
        invitedByUserId: current.invitedByUserId,
        revokedSessionCount: revoked.count,
      },
    });
    return {
      userId: user.id,
      workspaceId: invite.workspaceId,
      passwordHash: user.passwordHash,
    };
  });
  return result ?? fail(INVALID_STAFF_INVITE_MESSAGE);
}
