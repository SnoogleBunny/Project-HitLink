import { shouldDeliverNotification } from "./notification-context.js";
import {
  finalizeClassBookingNoticeForDelivery,
  prepareClassBookingNoticeForDelivery,
  prepareLegacyVerifiedTrialNoticeForDelivery,
} from "./class-booking-notifications.js";
import type {
  EmailTemplateKind,
  NotificationJobStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { isWorkspaceOperationallyReady } from "./workspace-readiness.js";
export interface NotificationJobRecord {
  id: string;
  workspaceId: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  body: string;
  attempts: number;
  classNoticeDeliveryStartedAt?: Date | null;
  attemptLimit?: number;
  context?: Prisma.JsonValue | null;
  templateKind?: EmailTemplateKind;
  dedupeKey?: string | null;
  status?: NotificationJobStatus;
  providerMessageId?: string | null;
  sentAt?: Date | null;
}
const legacyTrialReviewMessage =
  "A legacy trial delivery attempt needs review. Check the original provider request before sending again.";
/** Broad historical envelope only. Malformed bindings must fail the scoped upgrade, never fall back to generic delivery. */
export function isLegacyVerifiedTrialNoticeEnvelope(
  job: NotificationJobRecord,
): boolean {
  return (
    job.templateKind === "ANNOUNCEMENT" &&
    job.dedupeKey?.startsWith("verified-trial:") === true &&
    (job.context as Prisma.JsonObject | null)?.kind === "CLASS_BOOKING"
  );
}
function isClassServiceNotice(job: NotificationJobRecord): boolean {
  const context = job.context as Prisma.JsonObject | null;
  return (
    context?.kind === "CLASS_SERVICE_NOTICE" &&
    ["CONFIRMATION", "REMINDER"].includes(String(context.notice))
  );
}
function classNoticeDeliveryStarted(job: NotificationJobRecord): boolean {
  return isClassServiceNotice(job) && job.classNoticeDeliveryStartedAt != null;
}
export type NotificationOutboxDatabase = Pick<
  PrismaClient,
  "notificationJob" | "workspace"
>;
export interface EnqueueNotificationInput {
  workspaceId: string;
  announcementId?: string | null;
  templateKind: EmailTemplateKind;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  body: string;
  dedupeKey?: string;
  expiresAt?: Date;
  context?: Prisma.InputJsonValue;
}
export interface NotificationDeliveryAdapter {
  simulated?: boolean;
  send(
    job: NotificationJobRecord,
  ): Promise<{ status: "sent"; providerMessageId?: string | null }>;
}
/** Available for isolated tests only. Workers never accept a simulated delivery receipt. */
export function createDevelopmentNotificationAdapter(): NotificationDeliveryAdapter {
  return {
    simulated: true,
    async send(job) {
      return { status: "sent", providerMessageId: `dev:${job.id}` };
    },
  };
}
export async function enqueueNotificationJob(args: {
  db: NotificationOutboxDatabase;
  input: EnqueueNotificationInput;
  now?: Date;
}): Promise<{ status: "queued"; notificationJobId: string }> {
  const data = {
    ...args.input,
    recipientEmail: args.input.recipientEmail.trim().toLowerCase(),
    recipientName: args.input.recipientName?.trim() || null,
    subject: args.input.subject.trim(),
    status: "PENDING" as const,
    nextAttemptAt: args.now ?? new Date(),
  };
  let job: { id: string };
  if (args.input.dedupeKey) {
    await args.db.notificationJob.createMany({
      data: [data],
      skipDuplicates: true,
    });
    const saved = await args.db.notificationJob.findUniqueOrThrow({
      where: {
        workspaceId_dedupeKey: {
          workspaceId: args.input.workspaceId,
          dedupeKey: args.input.dedupeKey,
        },
      },
    });
    if (
      saved.recipientEmail !== data.recipientEmail ||
      saved.subject !== data.subject ||
      saved.body !== data.body
    )
      throw new NotificationDeliveryError(
        "This notification request changed. Review its original message.",
        false,
      );
    job = saved;
  } else
    job = await args.db.notificationJob.create({ data, select: { id: true } });
  return { status: "queued", notificationJobId: job.id };
}
export class NotificationDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}
/** One request ID is retained across network failures. The provider may deliver more than once after its idempotency window. */
export function createEmailNotificationAdapter(args: {
  apiKey: string;
  from: string;
  fetcher?: typeof fetch;
}): NotificationDeliveryAdapter {
  if (!args.apiKey || !args.from || /[\r\n]/.test(args.from))
    throw new NotificationDeliveryError(
      "Email delivery is not configured.",
      false,
    );
  return {
    async send(job) {
      const response = await (args.fetcher ?? fetch)(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${args.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `hitlink-notification/${job.id}`,
          },
          body: JSON.stringify({
            from: args.from,
            to: [job.recipientEmail],
            subject: job.subject,
            text: job.body,
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!response.ok)
        throw new NotificationDeliveryError(
          "The email provider did not accept this message.",
          response.status === 429 ||
            response.status >= 500 ||
            response.status === 408,
        );
      const result = (await response.json()) as { id?: unknown };
      if (typeof result.id !== "string" || !result.id)
        throw new NotificationDeliveryError(
          "The email provider returned no delivery receipt.",
        );
      return { status: "sent", providerMessageId: result.id };
    },
  };
}
/** Attempts fence abandoned workers: a late receipt cannot settle a newer worker's claim. */
export async function processNotificationOutbox(args: {
  db: NotificationOutboxDatabase;
  workspaceId: string;
  adapter: NotificationDeliveryAdapter;
  now?: Date;
  limit?: number;
  allowSimulated?: boolean;
  mode?: "account-setup";
  shouldSend?: (job: NotificationJobRecord) => Promise<boolean>;
}): Promise<{ sentCount: number; failedCount: number; skippedCount: number }> {
  const now = args.now ?? new Date();
  const accountSetupOnly = args.mode === "account-setup";
  const scope = accountSetupOnly
    ? {
        OR: [
          { context: { path: ["kind"], equals: "STAFF_INVITE" } },
          { context: { path: ["kind"], equals: "WORKSPACE_SETUP" } },
        ],
      }
    : {};
  if (accountSetupOnly && !args.shouldSend)
    throw new NotificationDeliveryError(
      "Current invitation verification is required.",
      false,
    );
  if (
    args.adapter.simulated &&
    (!args.allowSimulated || process.env.NODE_ENV === "production")
  )
    throw new NotificationDeliveryError(
      "Simulated email delivery is disabled for this worker.",
      false,
    );
  const workspace = await args.db.workspace.findUnique({
    where: { id: args.workspaceId },
    include: { migration: true, setupActivation: true },
  });
  const m = workspace?.migration;
  if (
    !workspace ||
    workspace.status === "DISABLED" ||
    (!accountSetupOnly &&
      !isWorkspaceOperationallyReady({
        workspaceStatus: workspace.status,
        setupActivation: workspace.setupActivation,
        migrationStage: m?.stage,
        ownerReviewAcknowledgedAt: m?.ownerReviewAcknowledgedAt,
        ownerReviewAcknowledgedByUserId: m?.ownerReviewAcknowledgedByUserId,
        operationallyReadyAt: m?.operationallyReadyAt,
        operationallyReadyByUserId: m?.operationallyReadyByUserId,
      }))
  )
    return { sentCount: 0, failedCount: 0, skippedCount: 0 };
  // A new NULL boundary column says nothing about pre-upgrade provider attempts.
  // Preserve uncertain old bytes/key before generic expiry/lease recovery can reopen them.
  if (!accountSetupOnly)
    await args.db.notificationJob.updateMany({
      where: {
        workspaceId: args.workspaceId,
        templateKind: "ANNOUNCEMENT",
        dedupeKey: { startsWith: "verified-trial:" },
        context: { path: ["kind"], equals: "CLASS_BOOKING" },
        status: { in: ["PENDING", "FAILED", "SENDING"] },
        AND: [
          {
            OR: [
              { status: "FAILED" },
              // Another worker may own a fresh SENDING claim. Leave its live lease alone.
              {
                status: "SENDING",
                OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
              },
              {
                status: "PENDING",
                OR: [
                  { attempts: { gt: 0 } },
                  { providerMessageId: { not: null } },
                  { sentAt: { not: null } },
                  { classNoticeDeliveryStartedAt: { not: null } },
                ],
              },
            ],
          },
          // Positive NULL-safe complement of an already established terminal review fence.
          {
            OR: [
              { status: { not: "FAILED" } },
              { nextAttemptAt: { not: null } },
              { lastError: null },
              { lastError: { not: legacyTrialReviewMessage } },
            ],
          },
        ],
      },
      data: {
        status: "FAILED",
        nextAttemptAt: null,
        lastError: legacyTrialReviewMessage,
      },
    });
  // Reclaim expired leases. A provider-accepted message uses the same external key on retry.
  await args.db.notificationJob.updateMany({
    where: {
      ...(accountSetupOnly ? { AND: [scope] } : {}),
      workspaceId: args.workspaceId,
      status: { in: ["PENDING", "FAILED"] },
      classNoticeDeliveryStartedAt: null,
      expiresAt: { lte: now },
      // Only the positive historical sweep above writes this terminal review fence.
      // Do not negate its nullable dedupe/JSON envelope: SQL UNKNOWN would strand unrelated expiry.
      OR: [
        { status: "PENDING" },
        { nextAttemptAt: { not: null } },
        { lastError: null },
        { lastError: { not: legacyTrialReviewMessage } },
      ],
    },
    data: {
      status: "CANCELLED",
      nextAttemptAt: null,
      lastError: "This message expired before delivery.",
    },
  });
  if (!accountSetupOnly)
    await args.db.notificationJob.updateMany({
      where: {
        workspaceId: args.workspaceId,
        status: { in: ["PENDING", "FAILED"] },
        classNoticeDeliveryStartedAt: { not: null },
        nextAttemptAt: { not: null },
        expiresAt: { lte: now },
        AND: [
          { context: { path: ["kind"], equals: "CLASS_SERVICE_NOTICE" } },
          {
            OR: [
              { context: { path: ["notice"], equals: "REMINDER" } },
              { context: { path: ["notice"], equals: "CONFIRMATION" } },
            ],
          },
        ],
      },
      data: {
        status: "FAILED",
        nextAttemptAt: null,
        lastError:
          "A prior class notice delivery attempt needs review. Check the original provider request before sending again.",
      },
    });
  await args.db.notificationJob.updateMany({
    where: {
      ...(accountSetupOnly ? { AND: [scope] } : {}),
      workspaceId: args.workspaceId,
      status: "SENDING",
      attempts: { gte: args.db.notificationJob.fields.attemptLimit },
      nextAttemptAt: { lte: now },
    },
    data: {
      status: "FAILED",
      nextAttemptAt: null,
      lastError:
        "Delivery confirmation was interrupted. Check the original provider request before sending again.",
    },
  });
  await args.db.notificationJob.updateMany({
    where: {
      ...(accountSetupOnly ? { AND: [scope] } : {}),
      workspaceId: args.workspaceId,
      status: "SENDING",
      attempts: { lt: args.db.notificationJob.fields.attemptLimit },
      nextAttemptAt: { lte: now },
    },
    data: {
      status: "FAILED",
      nextAttemptAt: now,
      lastError:
        "Delivery confirmation was interrupted. Retrying the same message.",
    },
  });
  const jobs = await args.db.notificationJob.findMany({
    where: {
      ...(accountSetupOnly ? { AND: [scope] } : {}),
      workspaceId: args.workspaceId,
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: args.db.notificationJob.fields.attemptLimit },
      nextAttemptAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, args.limit ?? 25)),
    select: {
      id: true,
      workspaceId: true,
      recipientEmail: true,
      recipientName: true,
      subject: true,
      body: true,
      attempts: true,
      classNoticeDeliveryStartedAt: true,
      attemptLimit: true,
      context: true,
      templateKind: true,
      dedupeKey: true,
      status: true,
      providerMessageId: true,
      sentAt: true,
    },
  });
  let sentCount = 0,
    failedCount = 0,
    skippedCount = 0;
  for (const selectedJob of jobs) {
    let job = selectedJob;
    const attemptNow = args.now ?? new Date();
    const claimed = await args.db.notificationJob.updateMany({
      where: {
        id: job.id,
        workspaceId: args.workspaceId,
        attempts: job.attempts,
        attemptLimit: job.attemptLimit,
        status: isLegacyVerifiedTrialNoticeEnvelope(job)
          ? "PENDING"
          : { in: ["PENDING", "FAILED"] },
        ...(isLegacyVerifiedTrialNoticeEnvelope(job)
          ? {
              templateKind: "ANNOUNCEMENT" as const,
              dedupeKey: job.dedupeKey,
              providerMessageId: null,
              sentAt: null,
              classNoticeDeliveryStartedAt: null,
            }
          : {}),
        nextAttemptAt: { lte: attemptNow },
        OR: [{ expiresAt: null }, { expiresAt: { gt: attemptNow } }],
      },
      data: {
        status: "SENDING",
        attempts: { increment: 1 },
        nextAttemptAt: new Date(attemptNow.getTime() + 5 * 60_000),
      },
    });
    if (!claimed.count) {
      skippedCount++;
      continue;
    }
    const fence = {
      id: job.id,
      workspaceId: args.workspaceId,
      status: "SENDING" as const,
      attempts: job.attempts + 1,
    };
    try {
      const legacyTrial = isLegacyVerifiedTrialNoticeEnvelope(job);
      const prepared = legacyTrial
        ? await prepareLegacyVerifiedTrialNoticeForDelivery(
            job,
            args.db as PrismaClient,
            args.now,
          )
        : isClassServiceNotice(job)
          ? await prepareClassBookingNoticeForDelivery(
              job,
              args.db as PrismaClient,
              args.now,
            )
          : job;
      if (prepared) job = { ...job, ...prepared };
      const classNotice = isClassServiceNotice(job);
      let deliverable =
        !!prepared && (args.shouldSend ? await args.shouldSend(job) : true);
      if (deliverable && classNotice) {
        const boundary = await finalizeClassBookingNoticeForDelivery(
          job,
          args.db as PrismaClient,
          args.now,
        );
        deliverable = !!boundary;
        if (boundary) job = { ...job, ...boundary };
      }
      if (!deliverable) {
        await args.db.notificationJob.updateMany({
          where: fence,
          data: {
            status: classNoticeDeliveryStarted(job) ? "FAILED" : "CANCELLED",
            nextAttemptAt: null,
            lastError: classNoticeDeliveryStarted(job)
              ? "A prior class notice delivery attempt needs review. Check the original provider request before sending again."
              : "This message was superseded before delivery.",
          },
        });
        if (classNoticeDeliveryStarted(job)) failedCount++;
        else skippedCount++;
        continue;
      }
      const result = await args.adapter.send({
        ...job,
        attempts: job.attempts + 1,
      });
      if (!result.providerMessageId)
        throw new NotificationDeliveryError(
          "The email provider returned no delivery receipt.",
        );
      const committed = await args.db.notificationJob.updateMany({
        where: fence,
        data: {
          status: "SENT",
          sentAt: args.now ?? new Date(),
          lastError: null,
          providerMessageId: result.providerMessageId,
          nextAttemptAt: null,
        },
      });
      sentCount += committed.count;
    } catch (error) {
      const terminal =
        (error instanceof NotificationDeliveryError && !error.retryable) ||
        job.attempts + 1 >= job.attemptLimit;
      const committed = await args.db.notificationJob.updateMany({
        where: fence,
        data: {
          status: "FAILED",
          lastError: terminal
            ? "Email delivery needs review."
            : "Email delivery is pending. The worker will retry the same message.",
          nextAttemptAt: terminal
            ? null
            : new Date(
                attemptNow.getTime() + Math.min(60, 2 ** job.attempts) * 60_000,
              ),
        },
      });
      failedCount += committed.count;
    }
  }
  // Bearer setup URLs are needed only while delivery may still be retried.
  await args.db.notificationJob.updateMany({
    where: {
      workspaceId: args.workspaceId,
      AND: [
        {
          OR: [
            { context: { path: ["kind"], equals: "STAFF_INVITE" } },
            { context: { path: ["kind"], equals: "WORKSPACE_SETUP" } },
          ],
        },
      ],
      OR: [
        { status: { in: ["SENT", "CANCELLED"] } },
        { status: "FAILED", nextAttemptAt: null },
      ],
    },
    data: { body: "" },
  });
  return { sentCount, failedCount, skippedCount };
}

/** Only identity/setup mail can run before the operational workspace activation gate. */
export async function processAccountSetupNotificationOutbox(args: {
  db: PrismaClient;
  adapter: NotificationDeliveryAdapter;
  now?: Date;
  limit?: number;
}) {
  const now = args.now ?? new Date();
  const workspaces = await args.db.notificationJob.findMany({
    where: {
      status: { in: ["PENDING", "FAILED", "SENDING"] },
      nextAttemptAt: { lte: now },
      workspace: { status: { not: "DISABLED" } },
      OR: [
        { context: { path: ["kind"], equals: "STAFF_INVITE" } },
        { context: { path: ["kind"], equals: "WORKSPACE_SETUP" } },
      ],
    },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
    take: Math.min(20, Math.max(1, args.limit ?? 5)),
    orderBy: { workspaceId: "asc" },
  });
  const results = [];
  for (const workspace of workspaces)
    results.push(
      await processNotificationOutbox({
        db: args.db,
        workspaceId: workspace.workspaceId,
        adapter: args.adapter,
        now,
        limit: 5,
        mode: "account-setup",
        shouldSend: (job) => shouldDeliverNotification(job, args.db, now),
      }),
    );
  return results;
}
