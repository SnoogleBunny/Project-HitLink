import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { PrismaClient, type Prisma } from "@flowstate/db";

export const PUBLIC_AUTH_COOLDOWN_MESSAGE =
  "Too many attempts. Wait a little and try again.";
export const PUBLIC_AUTH_UNAVAILABLE_MESSAGE =
  "Account access is temporarily unavailable. Try again shortly.";
export class PublicAuthThrottleError extends Error {}
export type PublicAuthAction = "login" | "signup";
export type PublicAuthPortal = "admin" | "member";
const globalThrottle = globalThis as typeof globalThis & {
  publicAuthThrottlePrisma?: PrismaClient;
};
const defaultDatabase =
  globalThrottle.publicAuthThrottlePrisma ?? new PrismaClient({ log: [] });
globalThrottle.publicAuthThrottlePrisma = defaultDatabase;
const policies = {
  login: {
    accountLimit: 10,
    accountWindowMs: 15 * 60000,
    networkLimit: 120,
    networkWindowMs: 60000,
  },
  signup: {
    accountLimit: 3,
    accountWindowMs: 3600000,
    networkLimit: 30,
    networkWindowMs: 15 * 60000,
  },
} as const;
const ttlMs = 24 * 3600000;
interface HeaderReader {
  get(name: string): string | null;
}

/** Enable only behind an ingress that overwrites X-Real-IP and prevents direct app access.
 * Arbitrary Forwarded/X-Forwarded-For chains never establish an identity here.
 */
export function getPublicAuthNetworkIdentity(
  headers: HeaderReader,
  trustProxy = process.env.HITLINK_AUTH_TRUST_PROXY === "true",
): string {
  if (!trustProxy) return "unverified-network";
  const value = headers.get("x-real-ip")?.trim() ?? "";
  const version = isIP(value);
  if (version === 4) return `ipv4:${value}`;
  if (version === 6)
    return `ipv6:${new URL(`http://[${value}]`).hostname.toLowerCase()}`;
  return "unverified-network";
}
interface AttemptInput {
  email: string;
  action: PublicAuthAction;
  portal: PublicAuthPortal;
  networkIdentity: string;
}
interface ThrottleOptions {
  db?: PrismaClient;
  now?: Date;
  secret?: string;
}
function secretValue(explicit?: string) {
  const value = explicit ?? process.env.HITLINK_AUTH_THROTTLE_SECRET ?? "";
  if (Buffer.byteLength(value, "utf8") < 32)
    throw new PublicAuthThrottleError(PUBLIC_AUTH_UNAVAILABLE_MESSAGE);
  return value;
}
/** Pure presentation-free keys are shared across portals and contain no reversible identifier. */
export function buildPublicAuthThrottlePlan(
  input: AttemptInput,
  options: Pick<ThrottleOptions, "now" | "secret"> = {},
) {
  const secret = secretValue(options.secret),
    now = options.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  if (
    !email ||
    email.length > 320 ||
    !["admin", "member"].includes(input.portal) ||
    !["login", "signup"].includes(input.action) ||
    !Number.isFinite(+now)
  )
    throw new PublicAuthThrottleError(PUBLIC_AUTH_UNAVAILABLE_MESSAGE);
  const policy = policies[input.action];
  const key = (
    scope: string,
    identity: string,
    windowMs: number,
    limit: number,
  ) => {
    const starts = Math.floor(+now / windowMs) * windowMs;
    return {
      keyHash: createHmac("sha256", secret)
        .update(
          JSON.stringify([
            "public-auth-v1",
            input.action,
            scope,
            identity,
            starts,
          ]),
        )
        .digest("hex"),
      limit,
      windowEndsAt: new Date(starts + windowMs),
      expiresAt: new Date(starts + windowMs + ttlMs),
    };
  };
  return {
    network: key(
      "network",
      input.networkIdentity || "unverified-network",
      policy.networkWindowMs,
      policy.networkLimit,
    ),
    account: key("account", email, policy.accountWindowMs, policy.accountLimit),
  };
}
async function reserve(
  tx: Prisma.TransactionClient,
  bucket: ReturnType<typeof buildPublicAuthThrottlePlan>["account"],
  now: Date,
) {
  const saved = await tx.$queryRawUnsafe<Array<{ attempts: number }>>(
    `INSERT INTO "public_auth_throttle_buckets" ("keyHash", "attempts", "windowEndsAt", "expiresAt", "createdAt", "updatedAt")
     VALUES ($1, 1, $2, $3, $4, $4)
     ON CONFLICT ("keyHash") DO UPDATE SET "attempts" = "public_auth_throttle_buckets"."attempts" + 1, "updatedAt" = $4
     WHERE "public_auth_throttle_buckets"."attempts" < $5 RETURNING "attempts"`,
    bucket.keyHash,
    bucket.windowEndsAt,
    bucket.expiresAt,
    now,
    bucket.limit,
  );
  if (!saved.length)
    throw new PublicAuthThrottleError(PUBLIC_AUTH_COOLDOWN_MESSAGE);
}
/** Reserve network then account atomically, before account lookup or password work. */
export async function consumePublicAuthAttempt(
  input: AttemptInput,
  options: ThrottleOptions = {},
) {
  const now = options.now ?? new Date(),
    plan = buildPublicAuthThrottlePlan(input, { ...options, now });
  await (options.db ?? defaultDatabase).$transaction(async (tx) => {
    await reserve(tx, plan.network, now);
    await reserve(tx, plan.account, now);
  });
  return { accountKeyHash: plan.account.keyHash };
}
/** Successful authentication resets the account counter; network admission remains bounded. */
export async function clearSuccessfulPublicAuthLogin(
  attempt: { accountKeyHash: string },
  options: Pick<ThrottleOptions, "db"> = {},
) {
  if (!/^[a-f0-9]{64}$/.test(attempt.accountKeyHash)) return;
  await (options.db ?? defaultDatabase).$executeRawUnsafe(
    'DELETE FROM "public_auth_throttle_buckets" WHERE "keyHash" = $1',
    attempt.accountKeyHash,
  );
}
/** Includes abandoned windows and retired-secret keys; bounded and safe across worker instances. */
export async function cleanupPublicAuthThrottleBuckets(
  options: Pick<ThrottleOptions, "db" | "now"> & { limit?: number } = {},
) {
  const now = options.now ?? new Date(),
    limit = Math.min(1000, Math.max(1, Math.trunc(options.limit ?? 500)));
  const rows = await (options.db ?? defaultDatabase).$queryRawUnsafe<
    Array<{ keyHash: string }>
  >(
    `DELETE FROM "public_auth_throttle_buckets" WHERE "keyHash" IN
       (SELECT "keyHash" FROM "public_auth_throttle_buckets" WHERE "expiresAt" <= $1 ORDER BY "expiresAt", "keyHash" LIMIT $2 FOR UPDATE SKIP LOCKED)
     RETURNING "keyHash"`,
    now,
    limit,
  );
  return { deletedCount: rows.length };
}
