import { createHash, randomBytes, randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  Prisma,
  PrismaClient,
  type NotificationDeliveryAdapter,
} from "@flowstate/db";
import { hashPassword } from "./password.js";

// Rejected nested writes can contain the queued bearer URL in Prisma's error
// details. Recovery uses a quiet client so that URL cannot enter shared logs.
const globalRecovery = globalThis as typeof globalThis & {
  accountRecoveryPrisma?: PrismaClient;
};
const prisma =
  globalRecovery.accountRecoveryPrisma ?? new PrismaClient({ log: [] });
globalRecovery.accountRecoveryPrisma = prisma;

export type AccountPortal = "admin" | "member";
export const PASSWORD_RESET_REQUESTED_MESSAGE =
  "If an account matches this address, a reset email has been requested. Check your inbox or contact your gym for help.";
export const INVALID_PASSWORD_RESET_MESSAGE =
  "This reset link is invalid or expired. Request a new link.";
const expiryMs = 30 * 60_000;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const emailKey = (value: string) => value.trim().toLowerCase();
export class AccountSecurityError extends Error {}

export function validateNewPassword(password: string): string | null {
  if ([...password].length < 12)
    return "Use at least 12 characters for your password.";
  if (Buffer.byteLength(password, "utf8") > 72)
    return "Use a password of 72 bytes or fewer; accented characters and emoji can use more than one byte.";
  return null;
}

export function passwordResetLink(resetOrigin: string, token: string) {
  let origin: URL;
  try {
    origin = new URL(resetOrigin);
  } catch {
    throw new AccountSecurityError(
      "Password recovery is temporarily unavailable. Try again later.",
    );
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    origin.hostname,
  );
  if (
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && local))
  )
    throw new AccountSecurityError(
      "Password recovery is temporarily unavailable. Try again later.",
    );
  const url = new URL("/reset-password", origin.origin);
  // Fragments never enter HTTP access logs or referrer headers. Only the reset
  // form submits the bearer token, and GET/prefetch never consumes it.
  url.hash = new URLSearchParams({ token }).toString();
  return url.href;
}

async function transaction<T>(
  db: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: "Serializable",
        timeout: 20_000,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 2
      )
        throw error;
    }
  }
}

export async function requestPasswordReset(args: {
  email: string;
  portal: AccountPortal;
  resetOrigin: string;
  db?: PrismaClient;
  now?: Date;
}) {
  const started = Date.now(),
    responseFloor = 350 + randomInt(0, 101);
  const email = emailKey(args.email),
    now = args.now ?? new Date();
  const token = randomBytes(32).toString("base64url"),
    tokenHash = hash(token),
    emailHash = hash(email);
  const link = passwordResetLink(args.resetOrigin, token);
  try {
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { message: PASSWORD_RESET_REQUESTED_MESSAGE };
    await transaction(args.db ?? prisma, async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `password-recovery:${emailHash}`,
      );
      const requests = await tx.accountSecurityEvent.findMany({
        where: {
          emailHash,
          kind: "PASSWORD_RESET_REQUESTED",
          createdAt: { gt: new Date(now.getTime() - 15 * 60_000) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      if (
        requests.length >= 3 ||
        (requests[0] &&
          now.getTime() - requests[0].createdAt.getTime() < 60_000)
      )
        return;
      const user = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      const event = await tx.accountSecurityEvent.create({
        data: {
          kind: "PASSWORD_RESET_REQUESTED",
          emailHash,
          userId: user?.id,
          portal: args.portal,
          createdAt: now,
        },
      });
      if (!user) return;
      await tx.passwordResetChallenge.updateMany({
        where: { userId: user.id, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      await tx.authRecoveryDelivery.updateMany({
        where: {
          challenge: { userId: user.id },
          status: { in: ["PENDING", "SENDING"] },
        },
        data: {
          status: "CANCELLED",
          failureCode: "SUPERSEDED",
          body: "",
          leaseExpiresAt: null,
        },
      });
      const expiresAt = new Date(now.getTime() + expiryMs);
      await tx.passwordResetChallenge.create({
        data: {
          id: event.id,
          userId: user.id,
          emailHash,
          tokenHash,
          portal: args.portal,
          expiresAt,
          createdAt: now,
          delivery: {
            create: {
              recipientEmail: email,
              expiresAt,
              nextAttemptAt: now,
              body: `A password reset was requested for your HitLink account.\n\n${link}\n\nThis link expires in 30 minutes and can be used once. Resetting your password signs out every device. If you did not request this, ignore this email.`,
            },
          },
        },
      });
    });
    return { message: PASSWORD_RESET_REQUESTED_MESSAGE };
  } finally {
    // Known, unknown and throttled accounts have the same public result and a
    // bounded shared timing floor rather than a fast account-existence path.
    await delay(Math.max(0, responseFloor - (Date.now() - started)));
  }
}

export async function resetPassword(args: {
  email: string;
  token: string;
  password: string;
  db?: PrismaClient;
  now?: Date;
}): Promise<{ status: "reset" } | { status: "invalid"; message: string }> {
  const invalid = validateNewPassword(args.password);
  if (invalid) return { status: "invalid", message: invalid };
  if (!/^[\w-]{43}$/.test(args.token))
    return { status: "invalid", message: INVALID_PASSWORD_RESET_MESSAGE };
  const tokenHash = hash(args.token),
    email = emailKey(args.email),
    now = args.now ?? new Date();
  const passwordHash = await hashPassword(args.password);
  return transaction(args.db ?? prisma, async (tx) => {
    const challenge = await tx.passwordResetChallenge.findUnique({
      where: { tokenHash },
      include: { user: { select: { email: true } } },
    });
    if (
      !challenge ||
      emailKey(challenge.user.email) !== email ||
      challenge.emailHash !== hash(email) ||
      challenge.consumedAt ||
      challenge.invalidatedAt ||
      challenge.expiresAt <= now
    )
      return { status: "invalid", message: INVALID_PASSWORD_RESET_MESSAGE };
    await tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))::text",
      `account-security:${challenge.userId}`,
    );
    const claimed = await tx.passwordResetChallenge.updateMany({
      where: {
        id: challenge.id,
        tokenHash,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1)
      return { status: "invalid", message: INVALID_PASSWORD_RESET_MESSAGE };
    await tx.user.update({
      where: { id: challenge.userId },
      data: { passwordHash },
    });
    const revoked = await tx.authSession.deleteMany({
      where: { userId: challenge.userId },
    });
    await tx.passwordResetChallenge.updateMany({
      where: {
        userId: challenge.userId,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: now },
    });
    await tx.authRecoveryDelivery.updateMany({
      where: {
        challenge: { userId: challenge.userId },
        status: { in: ["PENDING", "SENDING"] },
      },
      data: {
        status: "CANCELLED",
        failureCode: "SUPERSEDED",
        body: "",
        leaseExpiresAt: null,
      },
    });
    await tx.accountSecurityEvent.create({
      data: {
        kind: "PASSWORD_RESET_COMPLETED",
        userId: challenge.userId,
        portal: challenge.portal,
        challengeId: challenge.id,
        revokedSessionCount: revoked.count,
        createdAt: now,
      },
    });
    return { status: "reset" };
  });
}

export async function revokeAllAccountSessions(args: {
  userId: string;
  portal: AccountPortal;
  db?: PrismaClient;
  now?: Date;
}) {
  if (!args.userId)
    throw new AccountSecurityError("Sign in before changing account security.");
  return transaction(args.db ?? prisma, async (tx) => {
    await tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))::text",
      `account-security:${args.userId}`,
    );
    if (
      !(await tx.user.findUnique({
        where: { id: args.userId },
        select: { id: true },
      }))
    )
      throw new AccountSecurityError(
        "Sign in before changing account security.",
      );
    const revoked = await tx.authSession.deleteMany({
      where: { userId: args.userId },
    });
    await tx.accountSecurityEvent.create({
      data: {
        kind: "ALL_SESSIONS_REVOKED",
        userId: args.userId,
        portal: args.portal,
        revokedSessionCount: revoked.count,
        createdAt: args.now ?? new Date(),
      },
    });
    return { revokedSessionCount: revoked.count };
  });
}

export async function processPasswordRecoveryOutbox(args: {
  adapter: NotificationDeliveryAdapter;
  db?: PrismaClient;
  now?: Date;
  limit?: number;
  allowSimulated?: boolean;
}) {
  if (
    args.adapter.simulated &&
    (!args.allowSimulated || process.env.NODE_ENV === "production")
  )
    throw new AccountSecurityError(
      "Simulated email delivery is disabled for this worker.",
    );
  const db = args.db ?? prisma,
    now = args.now ?? new Date();
  const result = { sentCount: 0, failedCount: 0, skippedCount: 0 };
  await db.authRecoveryDelivery.updateMany({
    where: { status: { in: ["PENDING", "SENDING"] }, expiresAt: { lte: now } },
    data: {
      status: "CANCELLED",
      failureCode: "EXPIRED",
      body: "",
      leaseExpiresAt: null,
    },
  });
  await db.authRecoveryDelivery.updateMany({
    where: {
      status: "SENDING",
      leaseExpiresAt: { lte: now },
      attempts: { gte: 5 },
    },
    data: {
      status: "FAILED",
      failureCode: "ATTEMPTS_EXHAUSTED",
      body: "",
      leaseExpiresAt: null,
    },
  });
  const eligible = {
    expiresAt: { gt: now },
    attempts: { lt: 5 },
    OR: [
      { status: "PENDING", nextAttemptAt: { lte: now } },
      { status: "SENDING", leaseExpiresAt: { lte: now } },
    ],
  };
  const jobs = await db.authRecoveryDelivery.findMany({
    where: eligible,
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(50, args.limit ?? 5)),
  });
  for (const job of jobs) {
    const claimed = await db.authRecoveryDelivery.updateMany({
      where: { id: job.id, ...eligible },
      data: {
        status: "SENDING",
        attempts: { increment: 1 },
        leaseVersion: { increment: 1 },
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      },
    });
    if (!claimed.count) continue;
    const current = await db.authRecoveryDelivery.findUniqueOrThrow({
      where: { id: job.id },
      include: {
        challenge: { include: { user: { select: { email: true } } } },
      },
    });
    const fence = {
      id: current.id,
      status: "SENDING",
      leaseVersion: current.leaseVersion,
    };
    const challenge = current.challenge;
    if (
      challenge.consumedAt ||
      challenge.invalidatedAt ||
      challenge.expiresAt <= now ||
      emailKey(challenge.user.email) !== current.recipientEmail
    ) {
      await db.authRecoveryDelivery.updateMany({
        where: fence,
        data: {
          status: "CANCELLED",
          failureCode: "SUPERSEDED",
          body: "",
          leaseExpiresAt: null,
        },
      });
      result.skippedCount++;
      continue;
    }
    try {
      const receipt = await args.adapter.send({
        id: current.id,
        workspaceId: "account-security",
        recipientEmail: current.recipientEmail,
        recipientName: null,
        subject: "Reset your HitLink password",
        body: current.body,
        attempts: current.attempts,
      });
      if (!receipt.providerMessageId)
        throw new AccountSecurityError(
          "The email provider returned no delivery receipt.",
        );
      const settled = await db.authRecoveryDelivery.updateMany({
        where: fence,
        data: {
          status: "SENT",
          sentAt: now,
          body: "",
          providerMessageId: receipt.providerMessageId,
          failureCode: null,
          leaseExpiresAt: null,
        },
      });
      if (settled.count) result.sentCount++;
    } catch {
      const exhausted = current.attempts >= 5;
      await db.authRecoveryDelivery.updateMany({
        where: fence,
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          failureCode: exhausted ? "ATTEMPTS_EXHAUSTED" : "DELIVERY_RETRY",
          ...(exhausted ? { body: "" } : {}),
          leaseExpiresAt: null,
          nextAttemptAt: new Date(
            now.getTime() +
              Math.min(15 * 60_000, 30_000 * 2 ** (current.attempts - 1)),
          ),
        },
      });
      result.failedCount++;
    }
  }
  return result;
}
