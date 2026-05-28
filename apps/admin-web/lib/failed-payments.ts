import {
  prisma,
  type BillingRecordStatus,
  type BillingStateStatus,
} from "@flowstate/db";
import {
  stripeBillingGateway,
  type StripeBillingGateway,
} from "./stripe-billing";

const failedPaymentQueueStatuses: BillingStateStatus[] = [
  "PENDING_PAYMENT_METHOD",
  "PAST_DUE",
  "PAYMENT_FAILED",
  "ACTION_REQUIRED",
];

interface FailedPaymentQueueRecord {
  id: string;
  status: BillingStateStatus;
  nextBillingDate: Date | null;
  latestInvoiceId: string | null;
  latestPaymentIntentId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  failedAt: Date | null;
  gracePeriodEndsAt: Date | null;
  paymentUpdateRequestedAt: Date | null;
  retryRequestedAt: Date | null;
  member: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
  };
  memberMembership: {
    id: string;
    stripeSubscriptionId: string | null;
    membershipPlan: {
      name: string;
      monthlyPriceCents: number;
      currency: string;
    };
  };
}

interface WorkspaceStripeSettingsRecord {
  stripeAccountId: string | null;
  connectionStatus: string;
  chargesEnabled: boolean;
}

interface FailedPaymentDatabase {
  membershipBillingState: {
    findMany(args: Record<string, unknown>): Promise<FailedPaymentQueueRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<FailedPaymentQueueRecord | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  workspaceStripeSettings: {
    findUnique(args: Record<string, unknown>): Promise<WorkspaceStripeSettingsRecord | null>;
  };
  billingRecord: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

type FailedPaymentMutationResult =
  | {
      status: "updated" | "retried";
    }
  | {
      status: "error";
      message: string;
    };

const failedPaymentDatabase = prisma as unknown as FailedPaymentDatabase;

function isStripeReady(settings: WorkspaceStripeSettingsRecord | null): settings is WorkspaceStripeSettingsRecord & {
  stripeAccountId: string;
} {
  return Boolean(
    settings?.stripeAccountId &&
      settings.connectionStatus === "ACTIVE" &&
      settings.chargesEnabled,
  );
}

function mapRetryStatusToBillingStatus(
  status: "succeeded" | "failed" | "action_required" | "pending",
): BillingStateStatus {
  if (status === "succeeded") {
    return "ACTIVE";
  }

  if (status === "action_required") {
    return "ACTION_REQUIRED";
  }

  if (status === "pending") {
    return "PAST_DUE";
  }

  return "PAYMENT_FAILED";
}

function mapRetryStatusToRecordStatus(
  status: "succeeded" | "failed" | "action_required" | "pending",
): BillingRecordStatus {
  if (status === "succeeded") {
    return "SUCCEEDED";
  }

  if (status === "action_required") {
    return "ACTION_REQUIRED";
  }

  if (status === "pending") {
    return "PENDING";
  }

  return "FAILED";
}

async function createFailedPaymentRecord(args: {
  db: FailedPaymentDatabase;
  queueRecord: FailedPaymentQueueRecord;
  workspaceId: string;
  type: "PAYMENT_UPDATE_REQUESTED" | "RETRY_REQUESTED";
  status: BillingRecordStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
}): Promise<void> {
  await args.db.billingRecord.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.queueRecord.member.id,
      memberMembershipId: args.queueRecord.memberMembership.id,
      type: args.type,
      status: args.status,
      amountCents: args.queueRecord.memberMembership.membershipPlan.monthlyPriceCents,
      currency: args.queueRecord.memberMembership.membershipPlan.currency,
      stripeInvoiceId: args.queueRecord.latestInvoiceId,
      stripePaymentIntentId: args.queueRecord.latestPaymentIntentId,
      stripeSubscriptionId: args.queueRecord.memberMembership.stripeSubscriptionId,
      failureCode: args.failureCode ?? args.queueRecord.failureCode,
      failureMessage: args.failureMessage ?? args.queueRecord.failureMessage,
    },
    select: {
      id: true,
    },
  });
}

export async function listFailedPaymentQueue(args: {
  workspaceId: string;
  db?: FailedPaymentDatabase;
}): Promise<FailedPaymentQueueRecord[]> {
  const db = args.db ?? failedPaymentDatabase;

  return db.membershipBillingState.findMany({
    where: {
      workspaceId: args.workspaceId,
      status: {
        in: failedPaymentQueueStatuses,
      },
    },
    include: {
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
        },
      },
      memberMembership: {
        select: {
          id: true,
          stripeSubscriptionId: true,
          membershipPlan: {
            select: {
              name: true,
              monthlyPriceCents: true,
              currency: true,
            },
          },
        },
      },
    },
    orderBy: [
      {
        failedAt: "asc",
      },
      {
        updatedAt: "asc",
      },
    ],
  });
}

export async function markPaymentUpdateRequested(args: {
  workspaceId: string;
  membershipBillingStateId: string;
  db?: FailedPaymentDatabase;
  now?: Date;
}): Promise<FailedPaymentMutationResult> {
  const db = args.db ?? failedPaymentDatabase;
  const now = args.now ?? new Date();
  const queueRecord = await db.membershipBillingState.findFirst({
    where: {
      id: args.membershipBillingStateId,
      workspaceId: args.workspaceId,
      status: {
        in: failedPaymentQueueStatuses,
      },
    },
    include: {
      member: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
        },
      },
      memberMembership: {
        select: {
          id: true,
          stripeSubscriptionId: true,
          membershipPlan: {
            select: {
              name: true,
              monthlyPriceCents: true,
              currency: true,
            },
          },
        },
      },
    },
  });

  if (!queueRecord) {
    return {
      status: "error",
      message: "Failed payment item not found.",
    };
  }

  await db.membershipBillingState.updateMany({
    where: {
      id: args.membershipBillingStateId,
      workspaceId: args.workspaceId,
    },
    data: {
      paymentUpdateRequestedAt: now,
    },
  });
  await createFailedPaymentRecord({
    db,
    queueRecord,
    workspaceId: args.workspaceId,
    type: "PAYMENT_UPDATE_REQUESTED",
    status: "INFO",
  });

  return {
    status: "updated",
  };
}

export async function retryFailedPaymentNow(args: {
  workspaceId: string;
  membershipBillingStateId: string;
  db?: FailedPaymentDatabase;
  stripe?: StripeBillingGateway;
  now?: Date;
}): Promise<FailedPaymentMutationResult> {
  const db = args.db ?? failedPaymentDatabase;
  const stripe = args.stripe ?? stripeBillingGateway;
  const now = args.now ?? new Date();
  const [settings, queueRecord] = await Promise.all([
    db.workspaceStripeSettings.findUnique({
      where: {
        workspaceId: args.workspaceId,
      },
      select: {
        stripeAccountId: true,
        connectionStatus: true,
        chargesEnabled: true,
      },
    }),
    db.membershipBillingState.findFirst({
      where: {
        id: args.membershipBillingStateId,
        workspaceId: args.workspaceId,
        status: {
          in: failedPaymentQueueStatuses,
        },
      },
      include: {
        member: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
        memberMembership: {
          select: {
            id: true,
            stripeSubscriptionId: true,
            membershipPlan: {
              select: {
                name: true,
                monthlyPriceCents: true,
                currency: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!queueRecord) {
    return {
      status: "error",
      message: "Failed payment item not found.",
    };
  }

  if (!queueRecord.latestInvoiceId) {
    return {
      status: "error",
      message: "This billing item does not have an invoice to retry.",
    };
  }

  if (!isStripeReady(settings)) {
    return {
      status: "error",
      message: "Stripe is not connected or ready for charges.",
    };
  }

  const retry = await stripe.retryInvoicePayment({
    stripeAccountId: settings.stripeAccountId,
    stripeInvoiceId: queueRecord.latestInvoiceId,
  });
  await db.membershipBillingState.updateMany({
    where: {
      id: args.membershipBillingStateId,
      workspaceId: args.workspaceId,
    },
    data: {
      status: mapRetryStatusToBillingStatus(retry.status),
      latestInvoiceId: retry.stripeInvoiceId,
      latestPaymentIntentId: retry.latestPaymentIntentId,
      lastPaymentStatus: mapRetryStatusToRecordStatus(retry.status),
      lastPaymentAt: retry.status === "succeeded" ? now : null,
      retryRequestedAt: now,
      failureCode: retry.failureCode ?? null,
      failureMessage: retry.failureMessage ?? null,
      failedAt: retry.status === "succeeded" ? null : queueRecord.failedAt,
      gracePeriodEndsAt:
        retry.status === "succeeded" ? null : queueRecord.gracePeriodEndsAt,
    },
  });
  await createFailedPaymentRecord({
    db,
    queueRecord,
    workspaceId: args.workspaceId,
    type: "RETRY_REQUESTED",
    status: mapRetryStatusToRecordStatus(retry.status),
    failureCode: retry.failureCode,
    failureMessage: retry.failureMessage,
  });

  return {
    status: "retried",
  };
}

export function formatBillingStateStatus(status: BillingStateStatus | string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

