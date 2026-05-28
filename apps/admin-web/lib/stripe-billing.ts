import {
  expireDropInBookingPayment,
  finalizeDropInBookingPayment,
  finalizePunchCardCheckoutPurchase,
  prisma,
  type BillingRecordStatus,
  type BillingRecordType,
  type BillingStateStatus,
  type MemberMembershipStatus,
  type StripeConnectionStatus,
  type StripeWebhookProcessingStatus,
} from "@flowstate/db";
import Stripe from "stripe";

export interface StripeAccountSummary {
  stripeAccountId: string;
  connectionStatus: StripeConnectionStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface StripePlanPriceResult {
  stripeProductId: string;
  stripePriceId: string;
}

export interface StripeSubscriptionLinkResult {
  stripeSubscriptionId: string | null;
  latestInvoiceId: string | null;
  latestPaymentIntentId: string | null;
  status: "active" | "pending_payment_method" | "past_due" | "action_required";
  nextBillingDate: Date | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface StripeRetryInvoiceResult {
  stripeInvoiceId: string;
  status: "succeeded" | "failed" | "action_required" | "pending";
  latestPaymentIntentId: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface StripeBillingGateway {
  createStandardAccount(args: {
    workspaceId: string;
    workspaceName: string;
  }): Promise<StripeAccountSummary>;
  createAccountLink(args: {
    stripeAccountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{
    url: string;
  }>;
  retrieveAccount(args: {
    stripeAccountId: string;
  }): Promise<StripeAccountSummary>;
  ensureCustomer(args: {
    stripeAccountId: string;
    existingStripeCustomerId?: string | null;
    workspaceId: string;
    memberId: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
  }): Promise<{
    stripeCustomerId: string;
  }>;
  ensureMembershipPlanPrice(args: {
    stripeAccountId: string;
    workspaceId: string;
    membershipPlanId: string;
    name: string;
    monthlyPriceCents: number;
    currency: string;
    stripeProductId?: string | null;
    stripePriceId?: string | null;
  }): Promise<StripePlanPriceResult>;
  createSubscription(args: {
    stripeAccountId: string;
    workspaceId: string;
    memberId: string;
    memberMembershipId: string;
    stripeCustomerId: string;
    stripePriceId: string;
  }): Promise<StripeSubscriptionLinkResult>;
  cancelSubscriptionAtPeriodEnd(args: {
    stripeAccountId: string;
    stripeSubscriptionId: string;
  }): Promise<void>;
  retryInvoicePayment(args: {
    stripeAccountId: string;
    stripeInvoiceId: string;
  }): Promise<StripeRetryInvoiceResult>;
  constructWebhookEvent(args: {
    payload: string | Buffer;
    signature: string;
    webhookSecret: string;
  }): Stripe.Event;
}

type StripeWebhookEventWithAccount = Stripe.Event & {
  account?: string;
};

interface StripeWebhookEventRecord {
  id: string;
  status: StripeWebhookProcessingStatus;
  receivedAt: Date;
  updatedAt: Date;
}

interface WorkspaceStripeSettingsRecord {
  workspaceId: string;
  stripeAccountId: string | null;
  failedPaymentGracePeriodDays: number;
}

interface WebhookMembershipRecord {
  id: string;
  workspaceId: string;
  memberId: string;
  stripeSubscriptionId: string | null;
  billingState: {
    id: string;
  } | null;
}

interface StripeWebhookDatabase {
  stripeWebhookEvent: {
    findUnique(args: Record<string, unknown>): Promise<StripeWebhookEventRecord | null>;
    create(args: Record<string, unknown>): Promise<StripeWebhookEventRecord>;
    update(args: Record<string, unknown>): Promise<StripeWebhookEventRecord>;
  };
  workspaceStripeSettings: {
    findFirst(args: Record<string, unknown>): Promise<WorkspaceStripeSettingsRecord | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<WebhookMembershipRecord | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  membershipBillingState: {
    upsert(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  billingRecord: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

export type StripeWebhookProcessingResult =
  | {
      status: "processed" | "duplicate" | "already_processing";
    }
  | {
      status: "error";
      message: string;
    };

const stripeWebhookDatabase = prisma as unknown as StripeWebhookDatabase;

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY);

  return stripeClient;
}

function timestampToDate(timestamp: number | null | undefined): Date | null {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp * 1000);
}

function addDaysToDate(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);

  return date;
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

function mapAccount(account: Stripe.Account): StripeAccountSummary {
  let connectionStatus: StripeConnectionStatus = "PENDING";

  if (account.charges_enabled && account.details_submitted) {
    connectionStatus = "ACTIVE";
  } else if (account.details_submitted) {
    connectionStatus = "RESTRICTED";
  }

  return {
    stripeAccountId: account.id,
    connectionStatus,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const currentPeriodEnd = (subscription as unknown as {
    current_period_end?: number | null;
  }).current_period_end;

  return timestampToDate(currentPeriodEnd);
}

function getSubscriptionLatestInvoiceId(subscription: Stripe.Subscription): string | null {
  return getStringId(
    (subscription as unknown as {
      latest_invoice?: unknown;
    }).latest_invoice,
  );
}

function getInvoicePaymentIntentId(invoice: Stripe.Invoice): string | null {
  return getStringId(
    (invoice as unknown as {
      payment_intent?: unknown;
    }).payment_intent,
  );
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const invoiceWithLegacySubscription = invoice as unknown as {
    subscription?: unknown;
    parent?: {
      subscription_details?: {
        subscription?: unknown;
      };
    };
  };

  return (
    getStringId(invoiceWithLegacySubscription.subscription) ??
    getStringId(invoiceWithLegacySubscription.parent?.subscription_details?.subscription)
  );
}

function getInvoiceFailure(invoice: Stripe.Invoice): {
  failureCode: string | null;
  failureMessage: string | null;
} {
  const invoiceWithPaymentIntent = invoice as unknown as {
    payment_intent?: {
      last_payment_error?: {
        code?: string | null;
        message?: string | null;
      } | null;
    } | null;
  };

  return {
    failureCode:
      invoiceWithPaymentIntent.payment_intent?.last_payment_error?.code ?? null,
    failureMessage:
      invoiceWithPaymentIntent.payment_intent?.last_payment_error?.message ??
      null,
  };
}

function mapSubscriptionStatus(
  subscription: Stripe.Subscription,
): StripeSubscriptionLinkResult["status"] {
  if (subscription.status === "active" || subscription.status === "trialing") {
    return "active";
  }

  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    return "past_due";
  }

  if (subscription.status === "incomplete_expired") {
    return "past_due";
  }

  return "pending_payment_method";
}

function mapSubscriptionToMembershipStatus(
  subscription: Stripe.Subscription,
): MemberMembershipStatus {
  const mappedStatus = mapSubscriptionStatus(subscription);

  if (mappedStatus === "active") {
    return "ACTIVE";
  }

  if (mappedStatus === "past_due") {
    return "PAST_DUE";
  }

  return "PENDING_PAYMENT_METHOD";
}

function mapSubscriptionToBillingStatus(
  subscription: Stripe.Subscription,
): BillingStateStatus {
  const mappedStatus = mapSubscriptionStatus(subscription);

  if (mappedStatus === "active") {
    return "ACTIVE";
  }

  if (mappedStatus === "past_due") {
    return "PAST_DUE";
  }

  return "PENDING_PAYMENT_METHOD";
}

function mapInvoiceStatusForRetry(invoice: Stripe.Invoice): StripeRetryInvoiceResult["status"] {
  if (invoice.status === "paid") {
    return "succeeded";
  }

  const paymentIntentStatus = (invoice as unknown as {
    payment_intent?: {
      status?: string;
    } | null;
  }).payment_intent?.status;

  if (paymentIntentStatus === "requires_action") {
    return "action_required";
  }

  if (invoice.status === "open" || invoice.status === "draft") {
    return "pending";
  }

  return "failed";
}

export const stripeBillingGateway: StripeBillingGateway = {
  async createStandardAccount(args) {
    const account = await getStripeClient().accounts.create({
      type: "standard",
      metadata: {
        workspaceId: args.workspaceId,
        workspaceName: args.workspaceName,
      },
    });

    return mapAccount(account);
  },

  async createAccountLink(args) {
    const accountLink = await getStripeClient().accountLinks.create({
      account: args.stripeAccountId,
      refresh_url: args.refreshUrl,
      return_url: args.returnUrl,
      type: "account_onboarding",
    });

    return {
      url: accountLink.url,
    };
  },

  async retrieveAccount(args) {
    const account = await getStripeClient().accounts.retrieve(args.stripeAccountId);

    return mapAccount(account);
  },

  async ensureCustomer(args) {
    if (args.existingStripeCustomerId) {
      return {
        stripeCustomerId: args.existingStripeCustomerId,
      };
    }

    const customer = await getStripeClient().customers.create(
      {
        name: args.fullName,
        email: args.email ?? undefined,
        phone: args.phone ?? undefined,
        metadata: {
          workspaceId: args.workspaceId,
          memberId: args.memberId,
        },
      },
      {
        stripeAccount: args.stripeAccountId,
      },
    );

    return {
      stripeCustomerId: customer.id,
    };
  },

  async ensureMembershipPlanPrice(args) {
    if (args.stripeProductId && args.stripePriceId) {
      return {
        stripeProductId: args.stripeProductId,
        stripePriceId: args.stripePriceId,
      };
    }

    const stripe = getStripeClient();
    const requestOptions = {
      stripeAccount: args.stripeAccountId,
    };
    const product =
      args.stripeProductId ??
      (
        await stripe.products.create(
          {
            name: args.name,
            metadata: {
              workspaceId: args.workspaceId,
              membershipPlanId: args.membershipPlanId,
            },
          },
          requestOptions,
        )
      ).id;
    const price = await stripe.prices.create(
      {
        currency: args.currency,
        product,
        recurring: {
          interval: "month",
        },
        unit_amount: args.monthlyPriceCents,
        metadata: {
          workspaceId: args.workspaceId,
          membershipPlanId: args.membershipPlanId,
        },
      },
      requestOptions,
    );

    return {
      stripeProductId: product,
      stripePriceId: price.id,
    };
  },

  async createSubscription(args) {
    const subscription = await getStripeClient().subscriptions.create(
      {
        customer: args.stripeCustomerId,
        items: [
          {
            price: args.stripePriceId,
          },
        ],
        metadata: {
          workspaceId: args.workspaceId,
          memberId: args.memberId,
          memberMembershipId: args.memberMembershipId,
        },
        payment_behavior: "default_incomplete",
      },
      {
        stripeAccount: args.stripeAccountId,
      },
    );

    return {
      stripeSubscriptionId: subscription.id,
      latestInvoiceId: getSubscriptionLatestInvoiceId(subscription),
      latestPaymentIntentId: null,
      status: mapSubscriptionStatus(subscription),
      nextBillingDate: getSubscriptionCurrentPeriodEnd(subscription),
    };
  },

  async cancelSubscriptionAtPeriodEnd(args) {
    await getStripeClient().subscriptions.update(
      args.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
      {
        stripeAccount: args.stripeAccountId,
      },
    );
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

    return {
      stripeInvoiceId: invoice.id ?? args.stripeInvoiceId,
      status: mapInvoiceStatusForRetry(invoice),
      latestPaymentIntentId: getInvoicePaymentIntentId(invoice),
      failureCode: failure.failureCode,
      failureMessage: failure.failureMessage,
    };
  },

  constructWebhookEvent(args) {
    return getStripeClient().webhooks.constructEvent(
      args.payload,
      args.signature,
      args.webhookSecret,
    );
  },
};

function getStripeEventAccountId(event: StripeWebhookEventWithAccount): string | null {
  if (event.account) {
    return event.account;
  }

  const object = event.data.object as {
    id?: string;
    object?: string;
  };

  if (object.object === "account") {
    return object.id ?? null;
  }

  return null;
}

async function claimStripeWebhookEvent(args: {
  event: StripeWebhookEventWithAccount;
  workspaceId: string | null;
  stripeAccountId: string | null;
  db: StripeWebhookDatabase;
  now: Date;
}): Promise<"claimed" | "duplicate" | "already_processing"> {
  const staleProcessingCutoff = new Date(args.now.getTime() - 10 * 60 * 1000);
  const existing = await args.db.stripeWebhookEvent.findUnique({
    where: {
      stripeEventId: args.event.id,
    },
    select: {
      id: true,
      status: true,
      receivedAt: true,
      updatedAt: true,
    },
  });

  if (!existing) {
    await args.db.stripeWebhookEvent.create({
      data: {
        stripeEventId: args.event.id,
        workspaceId: args.workspaceId,
        stripeAccountId: args.stripeAccountId,
        eventType: args.event.type,
        livemode: args.event.livemode,
        status: "PROCESSING",
        attemptCount: 1,
      },
      select: {
        id: true,
        status: true,
        receivedAt: true,
        updatedAt: true,
      },
    });

    return "claimed";
  }

  if (existing.status === "PROCESSED") {
    return "duplicate";
  }

  if (existing.status === "PROCESSING" && existing.updatedAt > staleProcessingCutoff) {
    return "already_processing";
  }

  await args.db.stripeWebhookEvent.update({
    where: {
      stripeEventId: args.event.id,
    },
    data: {
      workspaceId: args.workspaceId,
      stripeAccountId: args.stripeAccountId,
      eventType: args.event.type,
      livemode: args.event.livemode,
      status: "PROCESSING",
      lastError: null,
      attemptCount: {
        increment: 1,
      },
    },
    select: {
      id: true,
      status: true,
      receivedAt: true,
      updatedAt: true,
    },
  });

  return "claimed";
}

async function markStripeWebhookEvent(args: {
  stripeEventId: string;
  status: "PROCESSED" | "ERROR";
  db: StripeWebhookDatabase;
  errorMessage?: string;
}): Promise<void> {
  await args.db.stripeWebhookEvent.update({
    where: {
      stripeEventId: args.stripeEventId,
    },
    data: {
      status: args.status,
      processedAt: args.status === "PROCESSED" ? new Date() : null,
      lastError: args.errorMessage ?? null,
    },
    select: {
      id: true,
      status: true,
      receivedAt: true,
      updatedAt: true,
    },
  });
}

async function resolveWorkspaceForWebhook(args: {
  db: StripeWebhookDatabase;
  stripeAccountId: string | null;
}): Promise<WorkspaceStripeSettingsRecord | null> {
  if (!args.stripeAccountId) {
    return null;
  }

  return args.db.workspaceStripeSettings.findFirst({
    where: {
      stripeAccountId: args.stripeAccountId,
    },
    select: {
      workspaceId: true,
      stripeAccountId: true,
      failedPaymentGracePeriodDays: true,
    },
  });
}

async function createBillingRecord(args: {
  db: StripeWebhookDatabase;
  workspaceId: string;
  memberId?: string | null;
  memberMembershipId?: string | null;
  type: BillingRecordType;
  status: BillingRecordStatus;
  amountCents?: number | null;
  currency?: string | null;
  stripeEventId: string;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeSubscriptionId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}): Promise<void> {
  await args.db.billingRecord.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId ?? null,
      memberMembershipId: args.memberMembershipId ?? null,
      type: args.type,
      status: args.status,
      amountCents: args.amountCents ?? null,
      currency: args.currency ?? null,
      stripeEventId: args.stripeEventId,
      stripeInvoiceId: args.stripeInvoiceId ?? null,
      stripePaymentIntentId: args.stripePaymentIntentId ?? null,
      stripeSubscriptionId: args.stripeSubscriptionId ?? null,
      failureCode: args.failureCode ?? null,
      failureMessage: args.failureMessage ?? null,
    },
    select: {
      id: true,
    },
  });
}

async function handleAccountEvent(args: {
  event: StripeWebhookEventWithAccount;
  db: StripeWebhookDatabase;
  settings: WorkspaceStripeSettingsRecord | null;
}): Promise<void> {
  if (!args.settings?.stripeAccountId) {
    return;
  }

  if (args.event.type === "account.application.deauthorized") {
    await args.db.workspaceStripeSettings.updateMany({
      where: {
        stripeAccountId: args.settings.stripeAccountId,
      },
      data: {
        connectionStatus: "DISCONNECTED",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      },
    });

    await createBillingRecord({
      db: args.db,
      workspaceId: args.settings.workspaceId,
      type: "STRIPE_ACCOUNT_DISCONNECTED",
      status: "INFO",
      stripeEventId: args.event.id,
    });

    return;
  }

  if (args.event.type !== "account.updated") {
    return;
  }

  const account = args.event.data.object as Stripe.Account;
  const summary = mapAccount(account);
  await args.db.workspaceStripeSettings.updateMany({
    where: {
      stripeAccountId: summary.stripeAccountId,
    },
    data: {
      connectionStatus: summary.connectionStatus,
      chargesEnabled: summary.chargesEnabled,
      payoutsEnabled: summary.payoutsEnabled,
      detailsSubmitted: summary.detailsSubmitted,
    },
  });

  await createBillingRecord({
    db: args.db,
    workspaceId: args.settings.workspaceId,
    type: "STRIPE_ACCOUNT_UPDATED",
    status: "INFO",
    stripeEventId: args.event.id,
  });
}

async function findMembershipForSubscription(args: {
  db: StripeWebhookDatabase;
  workspaceId: string;
  stripeSubscriptionId: string | null;
}): Promise<WebhookMembershipRecord | null> {
  if (!args.stripeSubscriptionId) {
    return null;
  }

  return args.db.memberMembership.findFirst({
    where: {
      workspaceId: args.workspaceId,
      stripeSubscriptionId: args.stripeSubscriptionId,
    },
    include: {
      billingState: {
        select: {
          id: true,
        },
      },
    },
  });
}

async function handleSubscriptionEvent(args: {
  event: StripeWebhookEventWithAccount;
  db: StripeWebhookDatabase;
  settings: WorkspaceStripeSettingsRecord | null;
}): Promise<void> {
  if (!args.settings) {
    return;
  }

  const subscription = args.event.data.object as Stripe.Subscription;
  const membership = await findMembershipForSubscription({
    db: args.db,
    workspaceId: args.settings.workspaceId,
    stripeSubscriptionId: subscription.id,
  });

  if (!membership) {
    return;
  }

  if (args.event.type === "customer.subscription.deleted") {
    await args.db.memberMembership.updateMany({
      where: {
        id: membership.id,
        workspaceId: args.settings.workspaceId,
      },
      data: {
        status: "CANCELLED",
        endedAt: new Date(),
        currentMembershipSlot: null,
        cancelAtPeriodEnd: false,
      },
    });
    await args.db.membershipBillingState.updateMany({
      where: {
        memberMembershipId: membership.id,
        workspaceId: args.settings.workspaceId,
      },
      data: {
        status: "CANCELLED",
        latestSubscriptionId: subscription.id,
      },
    });
    await createBillingRecord({
      db: args.db,
      workspaceId: args.settings.workspaceId,
      memberId: membership.memberId,
      memberMembershipId: membership.id,
      type: "SUBSCRIPTION_UPDATED",
      status: "INFO",
      stripeEventId: args.event.id,
      stripeSubscriptionId: subscription.id,
    });

    return;
  }

  const nextBillingDate = getSubscriptionCurrentPeriodEnd(subscription);
  const billingStatus = mapSubscriptionToBillingStatus(subscription);
  await args.db.memberMembership.updateMany({
    where: {
      id: membership.id,
      workspaceId: args.settings.workspaceId,
    },
    data: {
      status: mapSubscriptionToMembershipStatus(subscription),
      nextBillingDate,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    },
  });
  await args.db.membershipBillingState.upsert({
    where: {
      memberMembershipId: membership.id,
    },
    update: {
      status: billingStatus,
      nextBillingDate,
      latestSubscriptionId: subscription.id,
    },
    create: {
      workspaceId: args.settings.workspaceId,
      memberId: membership.memberId,
      memberMembershipId: membership.id,
      status: billingStatus,
      nextBillingDate,
      latestSubscriptionId: subscription.id,
    },
    select: {
      id: true,
    },
  });
  await createBillingRecord({
    db: args.db,
    workspaceId: args.settings.workspaceId,
    memberId: membership.memberId,
    memberMembershipId: membership.id,
    type:
      args.event.type === "customer.subscription.created"
        ? "SUBSCRIPTION_CREATED"
        : "SUBSCRIPTION_UPDATED",
    status: "INFO",
    stripeEventId: args.event.id,
    stripeSubscriptionId: subscription.id,
  });
}

function getInvoiceEventState(args: {
  invoice: Stripe.Invoice;
  eventType: string;
  failedAt: Date;
  gracePeriodDays: number;
}): {
  billingStatus: BillingStateStatus;
  recordType: BillingRecordType;
  recordStatus: BillingRecordStatus;
  lastPaymentStatus: BillingRecordStatus;
  failedAt: Date | null;
  gracePeriodEndsAt: Date | null;
} {
  if (args.eventType === "invoice.paid") {
    return {
      billingStatus: "ACTIVE",
      recordType: "PAYMENT_SUCCEEDED",
      recordStatus: "SUCCEEDED",
      lastPaymentStatus: "SUCCEEDED",
      failedAt: null,
      gracePeriodEndsAt: null,
    };
  }

  if (args.eventType === "invoice.payment_action_required") {
    return {
      billingStatus: "ACTION_REQUIRED",
      recordType: "PAYMENT_ACTION_REQUIRED",
      recordStatus: "ACTION_REQUIRED",
      lastPaymentStatus: "ACTION_REQUIRED",
      failedAt: args.failedAt,
      gracePeriodEndsAt: addDaysToDate(args.failedAt, args.gracePeriodDays),
    };
  }

  return {
    billingStatus: "PAYMENT_FAILED",
    recordType: "PAYMENT_FAILED",
    recordStatus: "FAILED",
    lastPaymentStatus: "FAILED",
    failedAt: args.failedAt,
    gracePeriodEndsAt: addDaysToDate(args.failedAt, args.gracePeriodDays),
  };
}

async function handleInvoiceEvent(args: {
  event: StripeWebhookEventWithAccount;
  db: StripeWebhookDatabase;
  settings: WorkspaceStripeSettingsRecord | null;
}): Promise<void> {
  if (!args.settings) {
    return;
  }

  const invoice = args.event.data.object as Stripe.Invoice;
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);
  const membership = await findMembershipForSubscription({
    db: args.db,
    workspaceId: args.settings.workspaceId,
    stripeSubscriptionId,
  });

  if (!membership) {
    return;
  }

  const occurredAt = timestampToDate(invoice.status_transitions?.paid_at) ?? new Date();
  const paymentIntentId = getInvoicePaymentIntentId(invoice);
  const failure = getInvoiceFailure(invoice);
  const eventState = getInvoiceEventState({
    invoice,
    eventType: args.event.type,
    failedAt: occurredAt,
    gracePeriodDays: args.settings.failedPaymentGracePeriodDays,
  });

  await args.db.membershipBillingState.upsert({
    where: {
      memberMembershipId: membership.id,
    },
    update: {
      status: eventState.billingStatus,
      latestInvoiceId: invoice.id,
      latestPaymentIntentId: paymentIntentId,
      latestSubscriptionId: stripeSubscriptionId,
      lastPaymentStatus: eventState.lastPaymentStatus,
      lastPaymentAt:
        eventState.lastPaymentStatus === "SUCCEEDED" ? occurredAt : undefined,
      failureCode: eventState.failedAt ? failure.failureCode : null,
      failureMessage: eventState.failedAt ? failure.failureMessage : null,
      failedAt: eventState.failedAt,
      gracePeriodEndsAt: eventState.gracePeriodEndsAt,
    },
    create: {
      workspaceId: args.settings.workspaceId,
      memberId: membership.memberId,
      memberMembershipId: membership.id,
      status: eventState.billingStatus,
      latestInvoiceId: invoice.id,
      latestPaymentIntentId: paymentIntentId,
      latestSubscriptionId: stripeSubscriptionId,
      lastPaymentStatus: eventState.lastPaymentStatus,
      lastPaymentAt:
        eventState.lastPaymentStatus === "SUCCEEDED" ? occurredAt : null,
      failureCode: eventState.failedAt ? failure.failureCode : null,
      failureMessage: eventState.failedAt ? failure.failureMessage : null,
      failedAt: eventState.failedAt,
      gracePeriodEndsAt: eventState.gracePeriodEndsAt,
    },
    select: {
      id: true,
    },
  });

  if (eventState.billingStatus !== "ACTIVE") {
    await args.db.memberMembership.updateMany({
      where: {
        id: membership.id,
        workspaceId: args.settings.workspaceId,
      },
      data: {
        status:
          eventState.billingStatus === "ACTION_REQUIRED"
            ? "PENDING_PAYMENT_METHOD"
            : "PAST_DUE",
      },
    });
  } else {
    await args.db.memberMembership.updateMany({
      where: {
        id: membership.id,
        workspaceId: args.settings.workspaceId,
      },
      data: {
        status: "ACTIVE",
      },
    });
  }

  await createBillingRecord({
    db: args.db,
    workspaceId: args.settings.workspaceId,
    memberId: membership.memberId,
    memberMembershipId: membership.id,
    type: eventState.recordType,
    status: eventState.recordStatus,
    amountCents: invoice.amount_paid || invoice.amount_due || null,
    currency: invoice.currency ?? null,
    stripeEventId: args.event.id,
    stripeInvoiceId: invoice.id,
    stripePaymentIntentId: paymentIntentId,
    stripeSubscriptionId,
    failureCode: eventState.failedAt ? failure.failureCode : null,
    failureMessage: eventState.failedAt ? failure.failureMessage : null,
  });
}

function parsePositiveMetadataInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function handleCheckoutSessionEvent(args: {
  event: StripeWebhookEventWithAccount;
  db: StripeWebhookDatabase;
  settings: WorkspaceStripeSettingsRecord | null;
}): Promise<void> {
  if (!args.settings) {
    return;
  }

  const session = args.event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata ?? {};

  if (metadata.workspaceId !== args.settings.workspaceId) {
    return;
  }

  if (
    metadata.checkoutType === "drop_in_booking" &&
    metadata.bookingId &&
    metadata.memberId
  ) {
    if (args.event.type === "checkout.session.expired") {
      await expireDropInBookingPayment({
        workspaceId: args.settings.workspaceId,
        bookingId: metadata.bookingId,
        checkoutSessionId: session.id,
      });

      return;
    }

    const result = await finalizeDropInBookingPayment({
      workspaceId: args.settings.workspaceId,
      bookingId: metadata.bookingId,
      checkoutSessionId: session.id,
      paymentIntentId: getStringId(session.payment_intent),
      expiresAt: timestampToDate(session.expires_at),
    });

    if (result !== "booked" && result !== "already_booked") {
      return;
    }

    await createBillingRecord({
      db: args.db,
      workspaceId: args.settings.workspaceId,
      memberId: metadata.memberId,
      type: "DROP_IN_PURCHASED",
      status: "SUCCEEDED",
      amountCents: session.amount_total ?? null,
      currency: session.currency ?? null,
      stripeEventId: args.event.id,
      stripePaymentIntentId: getStringId(session.payment_intent),
    });

    return;
  }

  if (
    metadata.checkoutType === "punch_card_purchase" &&
    metadata.memberId &&
    metadata.punchCardProductId &&
    args.event.type === "checkout.session.completed"
  ) {
    const originalPunches = parsePositiveMetadataInteger(metadata.punchesIncluded);
    const priceCents = parsePositiveMetadataInteger(metadata.priceCents);
    const currency = metadata.currency?.trim().toLowerCase();

    if (!originalPunches || !priceCents || !currency) {
      return;
    }

    const result = await finalizePunchCardCheckoutPurchase({
      workspaceId: args.settings.workspaceId,
      memberId: metadata.memberId,
      punchCardProductId: metadata.punchCardProductId,
      originalPunches,
      priceCents,
      currency,
      checkoutSessionId: session.id,
      now: timestampToDate(session.created) ?? new Date(),
    });

    if (result.status !== "created") {
      return;
    }

    await createBillingRecord({
      db: args.db,
      workspaceId: args.settings.workspaceId,
      memberId: metadata.memberId,
      type: "PUNCH_CARD_PURCHASED",
      status: "SUCCEEDED",
      amountCents: priceCents,
      currency,
      stripeEventId: args.event.id,
      stripePaymentIntentId: getStringId(session.payment_intent),
    });
  }
}

async function processClaimedStripeWebhookEvent(args: {
  event: StripeWebhookEventWithAccount;
  db: StripeWebhookDatabase;
  settings: WorkspaceStripeSettingsRecord | null;
}): Promise<void> {
  switch (args.event.type) {
    case "account.updated":
    case "account.application.deauthorized":
      await handleAccountEvent(args);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionEvent(args);
      return;
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
    case "invoice.finalization_failed":
      await handleInvoiceEvent(args);
      return;
    case "checkout.session.completed":
    case "checkout.session.expired":
      await handleCheckoutSessionEvent(args);
      return;
    case "invoice.updated":
      return;
    default:
      return;
  }
}

export async function processStripeWebhookEvent(args: {
  event: StripeWebhookEventWithAccount;
  db?: StripeWebhookDatabase;
  now?: Date;
}): Promise<StripeWebhookProcessingResult> {
  const db = args.db ?? stripeWebhookDatabase;
  const now = args.now ?? new Date();
  const stripeAccountId = getStripeEventAccountId(args.event);
  const settings = await resolveWorkspaceForWebhook({
    db,
    stripeAccountId,
  });
  const claim = await claimStripeWebhookEvent({
    event: args.event,
    workspaceId: settings?.workspaceId ?? null,
    stripeAccountId,
    db,
    now,
  });

  if (claim === "duplicate") {
    return {
      status: "duplicate",
    };
  }

  if (claim === "already_processing") {
    return {
      status: "already_processing",
    };
  }

  try {
    await processClaimedStripeWebhookEvent({
      event: args.event,
      db,
      settings,
    });
    await markStripeWebhookEvent({
      stripeEventId: args.event.id,
      status: "PROCESSED",
      db,
    });

    return {
      status: "processed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await markStripeWebhookEvent({
      stripeEventId: args.event.id,
      status: "ERROR",
      db,
      errorMessage: message,
    });

    return {
      status: "error",
      message,
    };
  }
}
