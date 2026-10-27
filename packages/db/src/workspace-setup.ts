import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
// Setup mail contains a single-use link; rejected query input must not be logged.
const globalSetup = globalThis as typeof globalThis & {
  workspaceSetupPrisma?: PrismaClient;
};
const prisma =
  globalSetup.workspaceSetupPrisma ?? new PrismaClient({ log: [] });
globalSetup.workspaceSetupPrisma = prisma;
import { lockClassSchedule } from "./class-occurrences.js";
import {
  canonicalWorkspaceTimezone,
  timezoneAtInstant,
} from "./workspace-timezones.js";

export type WorkspaceServiceMode = "MARTIAL_ARTS" | "COACHING" | "HYBRID";
export class WorkspaceSetupError extends Error {}
type Actor = { workspaceId: string; userId: string };
type Options = { db?: PrismaClient; now?: Date };
type Tx = Prisma.TransactionClient;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const emailHash = (value: string) => hash(value.trim().toLowerCase());
const freshFor = 15 * 60_000;
const fail = (message: string): never => {
  throw new WorkspaceSetupError(message);
};
export const setupCurrencies = [
  "cad",
  "usd",
  "gbp",
  "eur",
  "aud",
  "nzd",
  "jpy",
  "krw",
] as const;
export function validateNewBusinessRegionalSettings(input: {
  timezone: string;
  currency: string;
  locale: string;
  serviceMode: string;
  contactEmail: string;
}) {
  const timezone = canonicalWorkspaceTimezone(input.timezone);
  if (!timezone) fail("Choose a valid named business timezone.");
  const currency = input.currency.trim().toLowerCase();
  if (!setupCurrencies.includes(currency as (typeof setupCurrencies)[number]))
    fail("Choose a supported business currency.");
  let locale: string;
  try {
    locale = Intl.getCanonicalLocales(input.locale.trim())[0] ?? "";
    if (!locale || !Intl.DateTimeFormat.supportedLocalesOf([locale]).length)
      throw Error();
  } catch {
    fail("Choose a supported date and number locale, such as en-CA.");
  }
  if (!["MARTIAL_ARTS", "COACHING", "HYBRID"].includes(input.serviceMode))
    fail("Choose the services this business will offer.");
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
    contactEmail.length > 254
  )
    fail("Enter a valid business contact email.");
  return {
    timezone: timezone!,
    currency,
    locale: locale!,
    serviceMode: input.serviceMode as WorkspaceServiceMode,
    contactEmail,
  };
}
async function ownedSetup(tx: Tx, actor: Actor) {
  await tx.$queryRawUnsafe(
    "SELECT id FROM users WHERE id = $1 FOR SHARE",
    actor.userId,
  );
  await tx.$queryRawUnsafe(
    'SELECT id FROM workspace_users WHERE "workspaceId" = $1 ORDER BY id FOR SHARE',
    actor.workspaceId,
  );
  const [owner, user, workspace] = await Promise.all([
    tx.workspaceUser.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        role: "OWNER",
        isActive: true,
      },
      select: { id: true },
    }),
    tx.user.findUnique({
      where: { id: actor.userId },
      select: { email: true },
    }),
    tx.workspace.findUnique({
      where: { id: actor.workspaceId },
      include: {
        setup: true,
        setupActivation: true,
        migration: { select: { id: true } },
        location: true,
        settings: true,
      },
    }),
  ]);
  if (
    !owner ||
    !user ||
    !workspace?.setup ||
    workspace.setup.ownerUserId !== actor.userId ||
    workspace.status === "DISABLED"
  )
    fail("Only this business's active setup owner can continue.");
  if (workspace!.migration)
    fail("Use the reviewed migration workflow for this business.");
  return {
    workspace: workspace!,
    setup: workspace!.setup!,
    owner: owner!,
    user: user!,
  };
}
function isFresh(
  setup: { ownerVerifiedAt: Date | null; verifiedEmailHash: string | null },
  email: string,
  now: Date,
) {
  return (
    !!setup.ownerVerifiedAt &&
    +setup.ownerVerifiedAt <= +now &&
    +now - +setup.ownerVerifiedAt <= freshFor &&
    setup.verifiedEmailHash === emailHash(email)
  );
}
export async function getWorkspaceSetup(actor: Actor, options: Options = {}) {
  const now = options.now ?? new Date();
  return (options.db ?? prisma).$transaction(async (tx) => {
    const { workspace, setup, user } = await ownedSetup(tx, actor);
    return {
      workspaceName: workspace.name,
      ownerEmail: user.email,
      serviceMode: setup.serviceMode,
      version: setup.version,
      ownerVerified: isFresh(setup, user.email, now),
      activation: workspace.setupActivation
        ? {
            activatedAt: workspace.setupActivation.activatedAt.toISOString(),
            snapshotHash: workspace.setupActivation.snapshotHash,
          }
        : null,
    };
  });
}
/** Only the configured portal origin is supplied by the authenticated action. */
export async function requestWorkspaceSetupVerification(
  actor: Actor,
  origin: string,
  options: Options = {},
) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return fail("The owner portal address is not configured.");
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    fail("The owner portal address is not configured safely.");
  const now = options.now ?? new Date();
  return (options.db ?? prisma).$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const { workspace, setup, user } = await ownedSetup(tx, actor);
    if (workspace.setupActivation || workspace.status !== "SETUP_INCOMPLETE")
      fail("This business has already completed setup.");
    const recent = await tx.notificationJob.count({
      where: {
        workspaceId: actor.workspaceId,
        context: { path: ["kind"], equals: "WORKSPACE_SETUP" },
        createdAt: { gt: new Date(+now - freshFor) },
      },
    });
    if (
      recent >= 3 ||
      (setup.verificationRequestedAt &&
        +now - +setup.verificationRequestedAt < 60_000)
    )
      fail("Wait before requesting another verification link.");
    const token = randomBytes(32).toString("base64url"),
      verificationHash = hash(token),
      expiresAt = new Date(+now + 30 * 60_000);
    await tx.notificationJob.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        context: { path: ["kind"], equals: "WORKSPACE_SETUP" },
        status: { in: ["PENDING", "SENDING"] },
      },
      data: {
        status: "CANCELLED",
        body: "",
        nextAttemptAt: null,
        lastError: "A newer setup link replaced this message.",
      },
    });
    const updated = await tx.workspaceSetup.update({
      where: { id: setup.id },
      data: {
        version: { increment: 1 },
        verificationHash,
        verificationEmailHash: emailHash(user.email),
        verificationRequestedAt: now,
        verificationExpiresAt: expiresAt,
        ownerVerifiedAt: null,
        verifiedEmailHash: null,
      },
    });
    const link = new URL("/dashboard/setup/verify", url.origin);
    link.hash = new URLSearchParams({ token }).toString();
    await tx.notificationJob.create({
      data: {
        workspaceId: actor.workspaceId,
        templateKind: "ANNOUNCEMENT",
        dedupeKey: `workspace-setup:${setup.id}:${updated.version}`,
        expiresAt,
        recipientEmail: user.email,
        subject: "Verify your new business setup",
        body: `Open this single-use link while signed in to the owner portal:\n${link.href}\nThe link expires in 30 minutes. Verification alone does not activate the business or enable payments.`,
        context: {
          kind: "WORKSPACE_SETUP",
          setupId: setup.id,
          verificationHash,
          issuedAt: now.toISOString(),
        },
        nextAttemptAt: now,
        createdAt: now,
      },
    });
    return {
      message:
        "A verification email has been requested for your account. Delivery depends on the configured email service.",
    };
  });
}
export async function verifyWorkspaceSetupOwner(
  actor: Actor,
  token: string,
  options: Options = {},
) {
  const now = options.now ?? new Date();
  if (!/^[\w-]{43}$/.test(token))
    fail(
      "This setup verification link is invalid or expired. Request a new link.",
    );
  return (options.db ?? prisma).$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    const { workspace, setup, user } = await ownedSetup(tx, actor);
    const supplied = Buffer.from(hash(token)),
      expected = Buffer.from(setup.verificationHash ?? "");
    if (
      workspace.setupActivation ||
      workspace.status !== "SETUP_INCOMPLETE" ||
      !setup.verificationExpiresAt ||
      setup.verificationExpiresAt <= now ||
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied) ||
      setup.verificationEmailHash !== emailHash(user.email)
    )
      fail(
        "This setup verification link is invalid or expired. Request a new link.",
      );
    await tx.workspaceSetup.update({
      where: { id: setup.id },
      data: {
        verificationHash: null,
        verificationExpiresAt: null,
        ownerVerifiedAt: now,
        verifiedEmailHash: emailHash(user.email),
        version: { increment: 1 },
      },
    });
    await tx.notificationJob.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        context: { path: ["kind"], equals: "WORKSPACE_SETUP" },
      },
      data: { body: "" },
    });
    return { verified: true };
  });
}
export interface WorkspaceSetupReview {
  version: number;
  snapshotHash: string;
  ok: boolean;
  errors: string[];
  snapshot: {
    businessName: string;
    businessType: string | null;
    serviceMode: string;
    timezone: string;
    currency: string;
    locale: string;
    contactEmail: string | null;
    address: string[];
    ownerUserIds: string[];
    onlinePaymentsReady: boolean;
    configuredPrograms: number;
    configuredRooms: number;
    configuredCoachingTemplates: number;
  };
}
async function inspect(
  tx: Tx,
  actor: Actor,
  now: Date,
): Promise<WorkspaceSetupReview> {
  // Block new dependent configuration while binding the reviewed snapshot.
  // Catalog updates/deactivation also conflict with these row locks. No service
  // is created or required just to satisfy an empty-business setup checklist.
  await tx.$queryRawUnsafe(
    "SELECT id FROM workspaces WHERE id = $1 FOR UPDATE",
    actor.workspaceId,
  );
  await tx.$queryRawUnsafe(
    'SELECT id FROM locations WHERE "workspaceId" = $1 FOR UPDATE',
    actor.workspaceId,
  );
  await tx.$queryRawUnsafe(
    'SELECT id FROM programs WHERE "workspaceId" = $1 ORDER BY id FOR SHARE',
    actor.workspaceId,
  );
  await tx.$queryRawUnsafe(
    'SELECT id FROM coaching_programs WHERE "workspaceId" = $1 ORDER BY id FOR SHARE',
    actor.workspaceId,
  );
  await tx.$queryRawUnsafe(
    'SELECT r.id FROM rooms r JOIN locations l ON l.id = r."locationId" WHERE l."workspaceId" = $1 ORDER BY r.id FOR SHARE OF r',
    actor.workspaceId,
  );
  const { workspace, setup, user } = await ownedSetup(tx, actor);
  if (workspace.setupActivation || workspace.status !== "SETUP_INCOMPLETE")
    fail("This business has already completed setup.");
  const [owners, imports, programs, rooms, coaching, stripe, timezoneHistory] =
    await Promise.all([
      tx.workspaceUser.findMany({
        where: {
          workspaceId: actor.workspaceId,
          role: "OWNER",
          isActive: true,
        },
        select: { userId: true },
        orderBy: { userId: "asc" },
      }),
      tx.importJob.count({ where: { workspaceId: actor.workspaceId } }),
      tx.program.count({
        where: { workspaceId: actor.workspaceId, archivedAt: null },
      }),
      tx.room.count({
        where: {
          location: { workspaceId: actor.workspaceId },
          archivedAt: null,
          isActive: true,
        },
      }),
      tx.coachingProgram.count({
        where: { workspaceId: actor.workspaceId, archivedAt: null },
      }),
      tx.workspaceStripeSettings.findUnique({
        where: { workspaceId: actor.workspaceId },
        select: {
          stripeAccountId: true,
          connectionStatus: true,
          chargesEnabled: true,
        },
      }),
      tx.workspaceTimezoneRevision.findMany({
        where: { workspaceId: actor.workspaceId },
        orderBy: { version: "asc" },
      }),
    ]);
  const errors: string[] = [];
  if (!isFresh(setup, user.email, now))
    errors.push(
      "Verify your owner account email within 15 minutes of activation.",
    );
  if (imports)
    errors.push(
      "Source import records require the separate reviewed migration workflow.",
    );
  if (!workspace.name.trim() || workspace.name.length > 120)
    errors.push("Enter the business identity before activation.");
  const location = workspace.location,
    settings = workspace.settings;
  const timezone = timezoneAtInstant(
    location?.timezone ?? "",
    timezoneHistory,
    now,
  );
  try {
    validateNewBusinessRegionalSettings({
      timezone,
      currency: settings?.currency ?? "",
      locale: settings?.locale ?? "",
      serviceMode: setup.serviceMode,
      contactEmail: settings?.contactEmail ?? "",
    });
  } catch (error) {
    errors.push(
      error instanceof WorkspaceSetupError
        ? error.message
        : "Review business settings.",
    );
  }
  const snapshot = {
    businessName: workspace.name,
    businessType: workspace.businessType,
    serviceMode: setup.serviceMode,
    timezone,
    currency: settings?.currency ?? "",
    locale: settings?.locale ?? "",
    contactEmail: settings?.contactEmail ?? null,
    address: [
      location?.addressLine1,
      location?.addressLine2,
      location?.city,
      location?.region,
      location?.postalCode,
      location?.countryCode,
    ].filter((value): value is string => !!value),
    ownerUserIds: owners.map((owner) => owner.userId),
    onlinePaymentsReady:
      !!stripe?.stripeAccountId &&
      stripe.connectionStatus === "ACTIVE" &&
      stripe.chargesEnabled,
    configuredPrograms: programs,
    configuredRooms: rooms,
    configuredCoachingTemplates: coaching,
  };
  const snapshotHash = hash(
    JSON.stringify({
      workspaceId: actor.workspaceId,
      setupId: setup.id,
      version: setup.version,
      verifiedEmailHash: setup.verifiedEmailHash,
      ownerVerifiedAt: setup.ownerVerifiedAt?.toISOString(),
      identityVersion: settings?.identityVersion,
      timezoneHistory: timezoneHistory.map((revision) => ({
        id: revision.id,
        version: revision.version,
        timezone: revision.timezone,
        effectiveAt: revision.effectiveAt.toISOString(),
      })),
      snapshot,
    }),
  );
  return {
    version: setup.version,
    snapshotHash,
    ok: !errors.length,
    errors,
    snapshot,
  };
}
export async function previewWorkspaceSetup(
  actor: Actor,
  options: Options = {},
) {
  return (options.db ?? prisma).$transaction(
    async (tx) => {
      await lockClassSchedule(tx, actor.workspaceId);
      return inspect(tx, actor, options.now ?? new Date());
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
export async function activateNewBusiness(
  actor: Actor,
  input: { version: number; snapshotHash: string; confirmed: boolean },
  options: Options = {},
) {
  if (!input.confirmed)
    fail("Confirm the exact reviewed business setup before activating.");
  const now = options.now ?? new Date();
  return (options.db ?? prisma).$transaction(
    async (tx) => {
      await lockClassSchedule(tx, actor.workspaceId);
      const { workspace, setup } = await ownedSetup(tx, actor);
      if (workspace.setupActivation) {
        const prior = workspace.setupActivation;
        if (
          workspace.status === "ACTIVE" &&
          prior.ownerUserId === actor.userId &&
          prior.snapshotHash === input.snapshotHash &&
          prior.setupVersion === input.version
        )
          return prior;
        return fail(
          "Setup has already been activated from different reviewed details.",
        );
      }
      const review = await inspect(tx, actor, now);
      if (!review.ok) fail(review.errors.join(" "));
      if (
        review.version !== input.version ||
        review.snapshotHash !== input.snapshotHash
      )
        fail(
          "Business setup changed. Review a fresh snapshot before activating.",
        );
      const receipt = await tx.workspaceSetupActivation.create({
        data: {
          workspaceId: actor.workspaceId,
          setupId: setup.id,
          ownerUserId: actor.userId,
          setupVersion: setup.version,
          serviceMode: setup.serviceMode,
          verifiedEmailHash: setup.verifiedEmailHash!,
          ownerVerifiedAt: setup.ownerVerifiedAt!,
          snapshotHash: review.snapshotHash,
          snapshot: review.snapshot as Prisma.InputJsonValue,
          acceptedAt: now,
          activatedAt: now,
        },
      });
      await tx.workspace.update({
        where: { id: actor.workspaceId },
        data: { status: "ACTIVE" },
      });
      await tx.workspaceDataEvent.create({
        data: {
          workspaceId: actor.workspaceId,
          actorUserId: actor.userId,
          kind: "NEW_BUSINESS_ACTIVATED",
          metadata: {
            activationId: receipt.id,
            snapshotHash: receipt.snapshotHash,
            setupVersion: receipt.setupVersion,
            serviceMode: receipt.serviceMode,
          },
        },
      });
      return receipt;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
