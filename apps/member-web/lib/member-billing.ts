import {
  prisma,
  type BillingRecordStatus,
  type BillingRecordType,
  type BillingStateStatus,
  type MemberMembershipStatus,
  type StripeConnectionStatus,
} from "@hitlink/db";
import Stripe from "stripe";
import {
  getCurrentMemberMembershipContext,
  type CurrentMembershipRecord,
  type MemberMembershipDatabase,
} from "./member-membership";

const actionableBillingStatuses: BillingStateStatus[] = [
  "PENDING_PAYMENT_METHOD",
  "PAST_DUE",
  "PAYMENT_FAILED",
  "ACTION_REQUIRED",
];

interface BillingRecordSummary {
  id: string;
  type: BillingRecordType;
  status: BillingRecordStatus;
  amountCents: number | null;
  currency: string | null;
  occurredAt: Date;
  failureCode: string | null;
  failureMessage: string | null;
  stripeInvoiceId: string | null;
}

interface WorkspaceStripeSettingsRecord {
  stripeAccountId: string | null;
  connectionStatus: StripeConnectionStatus;
  chargesEnabled: boolean;
}

interface MemberBillingDatabase extends MemberMembershipDatabase {
  workspaceStripeSettings: {
    findUnique(args: Record<string, unknown>): Promise<WorkspaceStripeSettingsRecord | null>;
  };
  membershipBillingState: {
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<CurrentMembershipRecord | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  billingRecord: {
    findMany(args: Record<string, unknown>): Promise<BillingRecordSummary[]>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

export interface MemberBillingSummary {
  currentMembership: CurrentMembershipRecord | null;
  recentRecords: BillingRecordSummary[];
  canUpdatePaymentMethod: boolean;
  canRetryPayment: boolean;
  readOnlyReason: string | null;
}

export interface MemberBillingStripeClient {
  createPaymentMethodUpdateSession(args: {
    stripeAccountId: string;
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<{
    url: string;
  }>;
  retryInvoicePayment(args: {
    stripeAccountId: string;
    stripeInvoiceId: string;
  }): Promise<{
    stripeInvoiceId: string;
    status: "succeeded" | "failed" | "action_required" | "pending";
    latestPaymentIntentId: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
  }>;
}

const memberBillingDatabase = prisma as unknown as MemberBillingDatabase;

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);

  return stripeClient;
}

function isStripeReady(settings: WorkspaceStripeSettingsRecord | null): settings is WorkspaceStripeSettingsRecord & {
  stripeAccountId: string;
} {
  return Boolean(
    settings?.stripeAccountId &&
      settings.connectionStatus === "ACTIVE" &&
      settings.chargesEnabled,
  );
}

function getStringId(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;

    return typeof id === "string" ? id : null;
  }

  return null;
}

function getInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  return getStringId(
    (invoice as unknown as {
      payment_intent?: unknown;
    }).payment_intent,
  );
}

function getInvoiceFailure(invoice: Stripe.Invoice): {
  failureCode: string | null;
  failureMessage: string | null;
} {
  const paymentIntent = (invoice as unknown as {
    payment_intent?: Stripe.PaymentIntent | null;
  }).payment_intent;

  return {
    failureCode: paymentIntent?.last_payment_error?.code ?? null,
    failureMessage: paymentIntent?.last_payment_error?.message ?? null,
  };
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

function mapRetryStatusToMemberMembershipStatus(
  status: "succeeded" | "failed" | "action_required" | "pending",
): MemberMembershipStatus {
  if (status === "succeeded") {
    return "ACTIVE";
  }

  if (status === "action_required") {
    return "PENDING_PAYMENT_METHOD";
  }

  return "PAST_DUE";
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

function getBillingReadOnlyReason(args: {
  settings: WorkspaceStripeSettingsRecord | null;
  membership: CurrentMembershipRecord | null;
}): string | null {
  if (!args.membership) {
    return "No current membership is linked to this portal account.";
  }

  if (!isStripeReady(args.settings)) {
    return "Online billing is not connected for this gym yet.";
  }

  if (
    !args.membership.stripeCustomerId ||
    !(
      args.membership.stripeSubscriptionId ||
      args.membership.billingState?.latestSubscriptionId
    )
  ) {
    return "Billing is not fully linked for this membership yet.";
  }

  return null;
}

export const memberBillingStripeClient: MemberBillingStripeClient = {
  async createPaymentMethodUpdateSession(args) {
    const session = await getStripeClient().billingPortal.sessions.create(
      {
        customer: args.stripeCustomerId,
        on_behalf_of: args.stripeAccountId,
        return_url: args.returnUrl,
        flow_data: {
          type: "payment_method_update",
          after_completion: {
            type: "redirect",
            redirect: {
              return_url: args.returnUrl,
            },
          },
        },
      },
      {
        stripeAccount: args.stripeAccountId,
      },
    );

    return {
      url: session.url,
    };
  },

  async retryInvoicePayment(args) {
    const invoice = await getStripeClient().invoices.pay(
      args.stripeInvoiceId,
      {},
      {
        stripeAccount: args.stripeAccountId,
      },
    );
    const failure = getInvoiceFailure(invoice);
    const invoiceWithPaidState = invoice as Stripe.Invoice & {
      paid?: boolean;
    };
    const status = invoiceWithPaidState.paid
      ? "succeeded"
      : invoice.status === "open"
        ? "pending"
        : invoice.status === "uncollectible"
          ? "failed"
          : failure.failureCode || failure.failureMessage
            ? "failed"
            : "action_required";

    return {
      stripeInvoiceId: invoice.id ?? args.stripeInvoiceId,
      status,
      latestPaymentIntentId: getInvoicePaymentIntentId(invoice),
      failureCode: failure.failureCode,
      failureMessage: failure.failureMessage,
    };
  },
};

async function createBillingRecord(args: {
  db: MemberBillingDatabase;
  workspaceId: string;
  memberId: string;
  memberMembershipId: string;
  type: "PAYMENT_UPDATE_REQUESTED" | "RETRY_REQUESTED";
  status: BillingRecordStatus;
  amountCents: number;
  currency: string;
  stripeInvoiceId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePaymentIntentId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}): Promise<void> {
  await args.db.billingRecord.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      memberMembershipId: args.memberMembershipId,
      type: args.type,
      status: args.status,
      amountCents: args.amountCents,
      currency: args.currency,
      stripeInvoiceId: args.stripeInvoiceId ?? null,
      stripeSubscriptionId: args.stripeSubscriptionId ?? null,
      stripePaymentIntentId: args.stripePaymentIntentId ?? null,
      failureCode: args.failureCode ?? null,
      failureMessage: args.failureMessage ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function getMemberBillingSummary(args: {
  workspaceId: string;
  memberId: string;
  db?: MemberBillingDatabase;
}): Promise<MemberBillingSummary> {
  const db = args.db ?? memberBillingDatabase;
  const [currentMembership, settings, recentRecords] = await Promise.all([
    getCurrentMemberMembershipContext({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      db,
    }),
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
    db.billingRecord.findMany({
      where: {
        workspaceId: args.workspaceId,
        memberId: args.memberId,
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        amountCents: true,
        currency: true,
        occurredAt: true,
        failureCode: true,
        failureMessage: true,
        stripeInvoiceId: true,
      },
    }),
  ]);

  const readOnlyReason = getBillingReadOnlyReason({
    settings,
    membership: currentMembership,
  });
  const billingState = currentMembership?.billingState;

  return {
    currentMembership,
    recentRecords,
    canUpdatePaymentMethod: !readOnlyReason,
    canRetryPayment: Boolean(
      !readOnlyReason &&
        billingState &&
        actionableBillingStatuses.includes(billingState.status) &&
        billingState.latestInvoiceId,
    ),
    readOnlyReason,
  };
}

export async function createMemberPaymentMethodUpdateSession(args: {
  workspaceId: string;
  memberId: string;
  returnUrl: string;
  db?: MemberBillingDatabase;
  stripe?: MemberBillingStripeClient;
  now?: Date;
}):
  Promise<
    | {
        status: "created";
        url: string;
      }
    | {
        status: "error";
        message: string;
      }
  > {
  const db = args.db ?? memberBillingDatabase;
  const stripe = args.stripe ?? memberBillingStripeClient;
  const now = args.now ?? new Date();
  const [membership, settings] = await Promise.all([
    getCurrentMemberMembershipContext({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      db,
    }),
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
  ]);

  const readOnlyReason = getBillingReadOnlyReason({
    settings,
    membership,
  });

  if (readOnlyReason || !membership || !isStripeReady(settings)) {
    return {
      status: "error",
      message: readOnlyReason ?? "Billing is not ready for self-service yet.",
    };
  }

  const session = await stripe.createPaymentMethodUpdateSession({
    stripeAccountId: settings.stripeAccountId,
    stripeCustomerId: membership.stripeCustomerId as string,
    returnUrl: args.returnUrl,
  });

  if (membership.billingState) {
    await db.membershipBillingState.updateMany({
      where: {
        id: membership.billingState.id,
        workspaceId: args.workspaceId,
      },
      data: {
        paymentUpdateRequestedAt: now,
      },
    });
  }

  await createBillingRecord({
    db,
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    memberMembershipId: membership.id,
    type: "PAYMENT_UPDATE_REQUESTED",
    status: "INFO",
    amountCents: membership.membershipPlan.monthlyPriceCents,
    currency: membership.membershipPlan.currency,
    stripeInvoiceId: membership.billingState?.latestInvoiceId ?? null,
    stripeSubscriptionId:
      membership.stripeSubscriptionId ??
      membership.billingState?.latestSubscriptionId ??
      null,
  });

  return {
    status: "created",
    url: session.url,
  };
}

export async function retryOwnFailedPayment(args: {
  workspaceId: string;
  memberId: string;
  db?: MemberBillingDatabase;
  stripe?: MemberBillingStripeClient;
  now?: Date;
}):
  Promise<
    | {
        status: "retried";
      }
    | {
        status: "error";
        message: string;
      }
  > {
  const db = args.db ?? memberBillingDatabase;
  const stripe = args.stripe ?? memberBillingStripeClient;
  const now = args.now ?? new Date();
  const [membership, settings] = await Promise.all([
    getCurrentMemberMembershipContext({
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      db,
    }),
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
  ]);

  const billingState = membership?.billingState;
  const readOnlyReason = getBillingReadOnlyReason({
    settings,
    membership,
  });

  if (!membership || !billingState || readOnlyReason || !isStripeReady(settings)) {
    return {
      status: "error",
      message: readOnlyReason ?? "Billing retry is not available yet.",
    };
  }

  if (!actionableBillingStatuses.includes(billingState.status)) {
    return {
      status: "error",
      message: "This billing state cannot be retried right now.",
    };
  }

  if (!billingState.latestInvoiceId) {
    return {
      status: "error",
      message: "No invoice is available to retry right now.",
    };
  }

  const retryResult = await stripe.retryInvoicePayment({
    stripeAccountId: settings.stripeAccountId,
    stripeInvoiceId: billingState.latestInvoiceId,
  });
  const billingStatus = mapRetryStatusToBillingStatus(retryResult.status);

  await db.membershipBillingState.updateMany({
    where: {
      id: billingState.id,
      workspaceId: args.workspaceId,
    },
    data: {
      status: billingStatus,
      latestInvoiceId: retryResult.stripeInvoiceId,
      latestPaymentIntentId: retryResult.latestPaymentIntentId,
      lastPaymentStatus: mapRetryStatusToRecordStatus(retryResult.status),
      lastPaymentAt: retryResult.status === "succeeded" ? now : null,
      failureCode:
        retryResult.status === "succeeded" ? null : retryResult.failureCode ?? null,
      failureMessage:
        retryResult.status === "succeeded"
          ? null
          : retryResult.failureMessage ?? null,
      failedAt: retryResult.status === "succeeded" ? null : now,
      retryRequestedAt: now,
    },
  });
  await db.memberMembership.updateMany({
    where: {
      id: membership.id,
      workspaceId: args.workspaceId,
    },
    data: {
      status: mapRetryStatusToMemberMembershipStatus(retryResult.status),
    },
  });
  await createBillingRecord({
    db,
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    memberMembershipId: membership.id,
    type: "RETRY_REQUESTED",
    status: mapRetryStatusToRecordStatus(retryResult.status),
    amountCents: membership.membershipPlan.monthlyPriceCents,
    currency: membership.membershipPlan.currency,
    stripeInvoiceId: retryResult.stripeInvoiceId,
    stripeSubscriptionId:
      membership.stripeSubscriptionId ??
      membership.billingState?.latestSubscriptionId ??
      null,
    stripePaymentIntentId: retryResult.latestPaymentIntentId,
    failureCode: retryResult.failureCode,
    failureMessage: retryResult.failureMessage,
  });

  return {
    status: "retried",
  };
}
