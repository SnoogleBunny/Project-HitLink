import type { EmailTemplateKind, Prisma, PrismaClient } from "@prisma/client";
import { isWorkspaceMigrationReady } from "./workspace-readiness.js";
export interface NotificationJobRecord {
  id: string;
  workspaceId: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  body: string;
  attempts: number;
  context?: Prisma.JsonValue | null;
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
  shouldSend?: (job: NotificationJobRecord) => Promise<boolean>;
}): Promise<{ sentCount: number; failedCount: number; skippedCount: number }> {
  const now = args.now ?? new Date();
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
    include: { migration: true },
  });
  const m = workspace?.migration;
  if (
    !workspace ||
    !isWorkspaceMigrationReady({
      workspaceStatus: workspace.status,
      migrationStage: m?.stage,
      ownerReviewAcknowledgedAt: m?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId: m?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: m?.operationallyReadyAt,
      operationallyReadyByUserId: m?.operationallyReadyByUserId,
    })
  )
    return { sentCount: 0, failedCount: 0, skippedCount: 0 };
  // Reclaim expired leases. A provider-accepted message uses the same external key on retry.
  await args.db.notificationJob.updateMany({
    where: {
      workspaceId: args.workspaceId,
      status: { in: ["PENDING", "FAILED"] },
      expiresAt: { lte: now },
    },
    data: {
      status: "CANCELLED",
      nextAttemptAt: null,
      lastError: "This message expired before delivery.",
    },
  });
  await args.db.notificationJob.updateMany({
    where: {
      workspaceId: args.workspaceId,
      status: "SENDING",
      attempts: { gte: 6 },
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
      workspaceId: args.workspaceId,
      status: "SENDING",
      attempts: { lt: 6 },
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
      workspaceId: args.workspaceId,
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: 6 },
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
      context: true,
    },
  });
  let sentCount = 0,
    failedCount = 0,
    skippedCount = 0;
  for (const job of jobs) {
    const attemptNow = args.now ?? new Date();
    const claimed = await args.db.notificationJob.updateMany({
      where: {
        id: job.id,
        workspaceId: args.workspaceId,
        attempts: job.attempts,
        status: { in: ["PENDING", "FAILED"] },
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
      if (args.shouldSend && !(await args.shouldSend(job))) {
        await args.db.notificationJob.updateMany({
          where: fence,
          data: {
            status: "CANCELLED",
            nextAttemptAt: null,
            lastError: "This message was superseded before delivery.",
          },
        });
        skippedCount++;
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
        job.attempts + 1 >= 6;
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
  return { sentCount, failedCount, skippedCount };
}
