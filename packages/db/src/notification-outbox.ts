export interface NotificationJobRecord {
  id: string;
  workspaceId: string;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  body: string;
  attempts: number;
}

export interface NotificationOutboxDatabase {
  notificationJob: {
    create(args: {
      data: {
        workspaceId: string;
        announcementId?: string | null;
        templateKind:
          | "TRIAL_CONFIRMATION"
          | "BOOKING_CONFIRMATION"
          | "CLASS_REMINDER"
          | "FAILED_PAYMENT"
          | "ANNOUNCEMENT"
          | "PAYMENT_METHOD_UPDATE_REQUEST";
        recipientEmail: string;
        recipientName?: string | null;
        subject: string;
        body: string;
        status: "PENDING";
        nextAttemptAt: Date;
      };
      select: {
        id: true;
      };
    }): Promise<{ id: string }>;
    findMany(args: {
      where: {
        workspaceId: string;
        status: "PENDING";
        nextAttemptAt: {
          lte: Date;
        };
      };
      orderBy: {
        createdAt: "asc";
      };
      take: number;
      select: {
        id: true;
        workspaceId: true;
        recipientEmail: true;
        recipientName: true;
        subject: true;
        body: true;
        attempts: true;
      };
    }): Promise<NotificationJobRecord[]>;
    updateMany(args: {
      where: {
        id: string;
        workspaceId: string;
        status?: "PENDING" | "SENDING";
      };
      data: {
        status?: "SENDING" | "SENT" | "FAILED";
        attempts?: {
          increment: number;
        };
        sentAt?: Date;
        lastError?: string | null;
        providerMessageId?: string | null;
        nextAttemptAt?: Date | null;
      };
    }): Promise<{ count: number }>;
  };
}

export interface EnqueueNotificationInput {
  workspaceId: string;
  announcementId?: string | null;
  templateKind:
    | "TRIAL_CONFIRMATION"
    | "BOOKING_CONFIRMATION"
    | "CLASS_REMINDER"
    | "FAILED_PAYMENT"
    | "ANNOUNCEMENT"
    | "PAYMENT_METHOD_UPDATE_REQUEST";
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  body: string;
}

export interface NotificationDeliveryAdapter {
  send(job: NotificationJobRecord): Promise<{
    status: "sent";
    providerMessageId?: string | null;
  }>;
}

export function createDevelopmentNotificationAdapter(): NotificationDeliveryAdapter {
  return {
    async send(job) {
      return {
        status: "sent",
        providerMessageId: `dev:${job.id}`,
      };
    },
  };
}

export async function enqueueNotificationJob(args: {
  db: NotificationOutboxDatabase;
  input: EnqueueNotificationInput;
  now?: Date;
}): Promise<{ status: "queued"; notificationJobId: string }> {
  const now = args.now ?? new Date();
  const record = await args.db.notificationJob.create({
    data: {
      workspaceId: args.input.workspaceId,
      announcementId: args.input.announcementId ?? null,
      templateKind: args.input.templateKind,
      recipientEmail: args.input.recipientEmail.trim().toLowerCase(),
      recipientName: args.input.recipientName?.trim() || null,
      subject: args.input.subject.trim(),
      body: args.input.body,
      status: "PENDING",
      nextAttemptAt: now,
    },
    select: {
      id: true,
    },
  });

  return {
    status: "queued",
    notificationJobId: record.id,
  };
}

export async function processNotificationOutbox(args: {
  db: NotificationOutboxDatabase;
  workspaceId: string;
  adapter: NotificationDeliveryAdapter;
  now?: Date;
  limit?: number;
}): Promise<{
  sentCount: number;
  failedCount: number;
}> {
  const now = args.now ?? new Date();
  const jobs = await args.db.notificationJob.findMany({
    where: {
      workspaceId: args.workspaceId,
      status: "PENDING",
      nextAttemptAt: {
        lte: now,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: args.limit ?? 25,
    select: {
      id: true,
      workspaceId: true,
      recipientEmail: true,
      recipientName: true,
      subject: true,
      body: true,
      attempts: true,
    },
  });

  let sentCount = 0;
  let failedCount = 0;

  for (const job of jobs) {
    const claimed = await args.db.notificationJob.updateMany({
      where: {
        id: job.id,
        workspaceId: args.workspaceId,
        status: "PENDING",
      },
      data: {
        status: "SENDING",
        attempts: {
          increment: 1,
        },
      },
    });

    if (claimed.count === 0) {
      continue;
    }

    try {
      const result = await args.adapter.send(job);

      await args.db.notificationJob.updateMany({
        where: {
          id: job.id,
          workspaceId: args.workspaceId,
          status: "SENDING",
        },
        data: {
          status: "SENT",
          sentAt: now,
          lastError: null,
          providerMessageId: result.providerMessageId ?? null,
          nextAttemptAt: null,
        },
      });
      sentCount += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Email delivery failed.";
      const nextAttemptAt = new Date(
        now.getTime() + Math.min(job.attempts + 1, 6) * 5 * 60 * 1000,
      );

      await args.db.notificationJob.updateMany({
        where: {
          id: job.id,
          workspaceId: args.workspaceId,
          status: "SENDING",
        },
        data: {
          status: "FAILED",
          lastError: message,
          nextAttemptAt,
        },
      });
      failedCount += 1;
    }
  }

  return {
    sentCount,
    failedCount,
  };
}
