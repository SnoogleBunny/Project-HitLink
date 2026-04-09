import {
  dateOnlyStringToUtcDate,
  prisma,
  toDateOnlyString,
  type BillingRecordStatus,
  type BillingStateStatus,
  type MemberMembershipStatus,
} from "@hitlink/db";
import {
  stripeBillingGateway,
  type StripeBillingGateway,
  type StripeSubscriptionLinkResult,
} from "./stripe-billing";

interface BillingMemberRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
}

interface BillingPlanRecord {
  id: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  currency: string;
  archivedAt: Date | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
}

interface BillingStateRecord {
  id: string;
  status: BillingStateStatus;
  nextBillingDate: Date | null;
  latestInvoiceId: string | null;
  latestPaymentIntentId: string | null;
  latestSubscriptionId: string | null;
  lastPaymentStatus: BillingRecordStatus | null;
  lastPaymentAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  failedAt: Date | null;
  gracePeriodEndsAt: Date | null;
  paymentUpdateRequestedAt: Date | null;
  retryRequestedAt: Date | null;
}

interface BillingMembershipRecord {
  id: string;
  workspaceId: string;
  memberId: string;
  membershipPlanId: string;
  status: MemberMembershipStatus;
  startedAt: Date;
  endedAt: Date | null;
  nextBillingDate: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelRequestedAt: Date | null;
  frozenFrom: Date | null;
  frozenUntil: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentMembershipSlot: string | null;
  membershipPlan: BillingPlanRecord;
  billingState: BillingStateRecord | null;
}

interface BillingRecordSummaryRecord {
  id: string;
  type: string;
  status: string;
  amountCents: number | null;
  currency: string | null;
  occurredAt: Date;
  failureCode: string | null;
  failureMessage: string | null;
  stripeInvoiceId: string | null;
  stripeSubscriptionId: string | null;
}

interface WorkspaceStripeSettingsRecord {
  stripeAccountId: string | null;
  connectionStatus: string;
  chargesEnabled: boolean;
  failedPaymentGracePeriodDays: number;
}

interface MemberMembershipDatabase {
  member: {
    findFirst(args: Record<string, unknown>): Promise<BillingMemberRecord | null>;
  };
  membershipPlan: {
    findMany(args: Record<string, unknown>): Promise<BillingPlanRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<BillingPlanRecord | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<BillingMembershipRecord | { stripeCustomerId: string | null } | null>;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  membershipBillingState: {
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  workspaceStripeSettings: {
    findUnique(args: Record<string, unknown>): Promise<WorkspaceStripeSettingsRecord | null>;
  };
  billingRecord: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findMany(args: Record<string, unknown>): Promise<BillingRecordSummaryRecord[]>;
  };
}

export interface MembershipAssignmentInput {
  memberId: string;
  membershipPlanId: string;
  nextBillingDate?: string;
}

export interface MembershipFreezeInput {
  memberMembershipId: string;
  frozenFrom?: string;
  frozenUntil?: string;
}

export interface MemberBillingProfile {
  member: BillingMemberRecord;
  currentMembership: BillingMembershipRecord | null;
  availablePlans: BillingPlanRecord[];
  billingRecords: BillingRecordSummaryRecord[];
}

type MembershipMutationResult =
  | {
      status: "assigned" | "assigned_pending_billing" | "cancelled" | "frozen" | "unfrozen";
      memberMembershipId: string;
      message?: string;
    }
  | {
      status: "error";
      message: string;
    };

const memberMembershipDatabase = prisma as unknown as MemberMembershipDatabase;

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function isCurrentMembershipUniqueConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    code?: string;
    meta?: {
      target?: string[];
    };
  };

  return (
    maybeError.code === "P2002" &&
    Array.isArray(maybeError.meta?.target) &&
    maybeError.meta.target.includes("workspaceId") &&
    maybeError.meta.target.includes("memberId") &&
    maybeError.meta.target.includes("currentMembershipSlot")
  );
}

function parseDateOnly(
  value: string | undefined,
): Date | null | "invalid" {
  const dateString = cleanNullable(value);

  if (!dateString) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return "invalid";
  }

  const parsed = dateOnlyStringToUtcDate(dateString);

  if (Number.isNaN(parsed.getTime()) || toDateOnlyString(parsed) !== dateString) {
    return "invalid";
  }

  return parsed;
}

function mapStripeLinkToMembershipStatus(
  value: StripeSubscriptionLinkResult["status"],
): MemberMembershipStatus {
  if (value === "active") {
    return "ACTIVE";
  }

  if (value === "past_due") {
    return "PAST_DUE";
  }

  return "PENDING_PAYMENT_METHOD";
}

function mapStripeLinkToBillingStatus(
  value: StripeSubscriptionLinkResult["status"],
): BillingStateStatus {
  if (value === "active") {
    return "ACTIVE";
  }

  if (value === "past_due") {
    return "PAST_DUE";
  }

  if (value === "action_required") {
    return "ACTION_REQUIRED";
  }

  return "PENDING_PAYMENT_METHOD";
}

function mapStripeLinkToRecordStatus(
  value: StripeSubscriptionLinkResult["status"],
): BillingRecordStatus {
  if (value === "active") {
    return "SUCCEEDED";
  }

  if (value === "action_required") {
    return "ACTION_REQUIRED";
  }

  if (value === "past_due") {
    return "FAILED";
  }

  return "PENDING";
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

async function getCurrentMembership(args: {
  workspaceId: string;
  memberId: string;
  db: MemberMembershipDatabase;
}): Promise<BillingMembershipRecord | null> {
  return (await args.db.memberMembership.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      currentMembershipSlot: "CURRENT",
    },
    include: {
      membershipPlan: true,
      billingState: true,
    },
  })) as BillingMembershipRecord | null;
}

async function getMembershipById(args: {
  workspaceId: string;
  memberMembershipId: string;
  db: MemberMembershipDatabase;
}): Promise<BillingMembershipRecord | null> {
  return (await args.db.memberMembership.findFirst({
    where: {
      id: args.memberMembershipId,
      workspaceId: args.workspaceId,
      currentMembershipSlot: "CURRENT",
    },
    include: {
      membershipPlan: true,
      billingState: true,
    },
  })) as BillingMembershipRecord | null;
}

async function createBillingRecord(args: {
  db: MemberMembershipDatabase;
  workspaceId: string;
  memberId: string;
  memberMembershipId: string;
  type:
    | "MEMBERSHIP_ASSIGNED"
    | "MEMBERSHIP_CANCELLED"
    | "MEMBERSHIP_FROZEN"
    | "MEMBERSHIP_UNFROZEN"
    | "SUBSCRIPTION_CREATED";
  status: BillingRecordStatus;
  amountCents?: number | null;
  currency?: string | null;
  stripeInvoiceId?: string | null;
  stripeSubscriptionId?: string | null;
  failureMessage?: string | null;
}): Promise<void> {
  await args.db.billingRecord.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      memberMembershipId: args.memberMembershipId,
      type: args.type,
      status: args.status,
      amountCents: args.amountCents ?? null,
      currency: args.currency ?? null,
      stripeInvoiceId: args.stripeInvoiceId ?? null,
      stripeSubscriptionId: args.stripeSubscriptionId ?? null,
      failureMessage: args.failureMessage ?? null,
    },
    select: {
      id: true,
    },
  });
}

export async function getMemberBillingProfile(args: {
  workspaceId: string;
  memberId: string;
  db?: MemberMembershipDatabase;
}): Promise<MemberBillingProfile | null> {
  const db = args.db ?? memberMembershipDatabase;
  const [member, availablePlans, currentMembership, billingRecords] =
    await Promise.all([
      db.member.findFirst({
        where: {
          id: args.memberId,
          workspaceId: args.workspaceId,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
        },
      }),
      db.membershipPlan.findMany({
        where: {
          workspaceId: args.workspaceId,
          archivedAt: null,
        },
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          name: true,
          description: true,
          monthlyPriceCents: true,
          currency: true,
          archivedAt: true,
          stripeProductId: true,
          stripePriceId: true,
        },
      }),
      getCurrentMembership({
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        db,
      }),
      db.billingRecord.findMany({
        where: {
          workspaceId: args.workspaceId,
          memberId: args.memberId,
        },
        orderBy: {
          occurredAt: "desc",
        },
        take: 20,
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
          stripeSubscriptionId: true,
        },
      }),
    ]);

  if (!member) {
    return null;
  }

  return {
    member,
    availablePlans,
    currentMembership,
    billingRecords,
  };
}

export async function assignMembershipToMember(args: {
  workspaceId: string;
  input: MembershipAssignmentInput;
  db?: MemberMembershipDatabase;
  stripe?: StripeBillingGateway;
  now?: Date;
}): Promise<MembershipMutationResult> {
  const db = args.db ?? memberMembershipDatabase;
  const stripe = args.stripe ?? stripeBillingGateway;
  const memberId = args.input.memberId.trim();
  const membershipPlanId = args.input.membershipPlanId.trim();
  const nextBillingDate = parseDateOnly(args.input.nextBillingDate);

  if (!memberId) {
    return {
      status: "error",
      message: "Choose a member.",
    };
  }

  if (!membershipPlanId) {
    return {
      status: "error",
      message: "Choose a membership plan.",
    };
  }

  if (nextBillingDate === "invalid") {
    return {
      status: "error",
      message: "Enter a valid next billing date.",
    };
  }

  const [member, plan, currentMembership, settings] = await Promise.all([
    db.member.findFirst({
      where: {
        id: memberId,
        workspaceId: args.workspaceId,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
      },
    }),
    db.membershipPlan.findFirst({
      where: {
        id: membershipPlanId,
        workspaceId: args.workspaceId,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        monthlyPriceCents: true,
        currency: true,
        archivedAt: true,
        stripeProductId: true,
        stripePriceId: true,
      },
    }),
    getCurrentMembership({
      workspaceId: args.workspaceId,
      memberId,
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
        failedPaymentGracePeriodDays: true,
      },
    }),
  ]);

  if (!member) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  if (!plan) {
    return {
      status: "error",
      message: "Choose an active membership plan in this workspace.",
    };
  }

  if (currentMembership) {
    return {
      status: "error",
      message: "This member already has a current membership.",
    };
  }

  const stripeReady = isStripeReady(settings);
  const initialFailureMessage = stripeReady
    ? null
    : "Stripe is not connected or ready for charges yet.";

  try {
    const membership = await db.memberMembership.create({
      data: {
        workspaceId: args.workspaceId,
        memberId,
        membershipPlanId,
        status: "PENDING_PAYMENT_METHOD",
        nextBillingDate,
        currentMembershipSlot: "CURRENT",
        billingState: {
          create: {
            workspaceId: args.workspaceId,
            memberId,
            status: "PENDING_PAYMENT_METHOD",
            nextBillingDate,
            failureMessage: initialFailureMessage,
          },
        },
      },
      select: {
        id: true,
      },
    });

    await createBillingRecord({
      db,
      workspaceId: args.workspaceId,
      memberId,
      memberMembershipId: membership.id,
      type: "MEMBERSHIP_ASSIGNED",
      status: "INFO",
      amountCents: plan.monthlyPriceCents,
      currency: plan.currency,
      failureMessage: initialFailureMessage,
    });

    if (!stripeReady) {
      return {
        status: "assigned_pending_billing",
        memberMembershipId: membership.id,
        message: initialFailureMessage ?? undefined,
      };
    }

    try {
      const previousCustomer = (await db.memberMembership.findFirst({
        where: {
          workspaceId: args.workspaceId,
          memberId,
          stripeCustomerId: {
            not: null,
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          stripeCustomerId: true,
        },
      })) as { stripeCustomerId: string | null } | null;
      const customer = await stripe.ensureCustomer({
        stripeAccountId: settings.stripeAccountId,
        existingStripeCustomerId: previousCustomer?.stripeCustomerId,
        workspaceId: args.workspaceId,
        memberId,
        fullName: member.fullName,
        email: member.email,
        phone: member.phone,
      });
      const price = await stripe.ensureMembershipPlanPrice({
        stripeAccountId: settings.stripeAccountId,
        workspaceId: args.workspaceId,
        membershipPlanId,
        name: plan.name,
        monthlyPriceCents: plan.monthlyPriceCents,
        currency: plan.currency,
        stripeProductId: plan.stripeProductId,
        stripePriceId: plan.stripePriceId,
      });

      await db.membershipPlan.updateMany({
        where: {
          id: membershipPlanId,
          workspaceId: args.workspaceId,
        },
        data: {
          stripeProductId: price.stripeProductId,
          stripePriceId: price.stripePriceId,
        },
      });

      const subscription = await stripe.createSubscription({
        stripeAccountId: settings.stripeAccountId,
        workspaceId: args.workspaceId,
        memberId,
        memberMembershipId: membership.id,
        stripeCustomerId: customer.stripeCustomerId,
        stripePriceId: price.stripePriceId,
      });
      const billingStatus = mapStripeLinkToBillingStatus(subscription.status);

      await db.memberMembership.updateMany({
        where: {
          id: membership.id,
          workspaceId: args.workspaceId,
        },
        data: {
          status: mapStripeLinkToMembershipStatus(subscription.status),
          stripeCustomerId: customer.stripeCustomerId,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          nextBillingDate: subscription.nextBillingDate ?? nextBillingDate,
        },
      });
      await db.membershipBillingState.updateMany({
        where: {
          memberMembershipId: membership.id,
          workspaceId: args.workspaceId,
        },
        data: {
          status: billingStatus,
          nextBillingDate: subscription.nextBillingDate ?? nextBillingDate,
          latestInvoiceId: subscription.latestInvoiceId,
          latestPaymentIntentId: subscription.latestPaymentIntentId,
          latestSubscriptionId: subscription.stripeSubscriptionId,
          failureCode: subscription.failureCode ?? null,
          failureMessage: subscription.failureMessage ?? null,
        },
      });
      await createBillingRecord({
        db,
        workspaceId: args.workspaceId,
        memberId,
        memberMembershipId: membership.id,
        type: "SUBSCRIPTION_CREATED",
        status: mapStripeLinkToRecordStatus(subscription.status),
        amountCents: plan.monthlyPriceCents,
        currency: plan.currency,
        stripeInvoiceId: subscription.latestInvoiceId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        failureMessage: subscription.failureMessage,
      });

      return {
        status:
          subscription.status === "active"
            ? "assigned"
            : "assigned_pending_billing",
        memberMembershipId: membership.id,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Stripe subscription setup needs attention.";
      await db.membershipBillingState.updateMany({
        where: {
          memberMembershipId: membership.id,
          workspaceId: args.workspaceId,
        },
        data: {
          status: "PENDING_PAYMENT_METHOD",
          failureMessage: message,
        },
      });

      return {
        status: "assigned_pending_billing",
        memberMembershipId: membership.id,
        message,
      };
    }
  } catch (error) {
    if (isCurrentMembershipUniqueConstraint(error)) {
      return {
        status: "error",
        message: "This member already has a current membership.",
      };
    }

    throw error;
  }
}

export async function cancelMembershipAtPeriodEnd(args: {
  workspaceId: string;
  memberMembershipId: string;
  db?: MemberMembershipDatabase;
  stripe?: StripeBillingGateway;
  now?: Date;
}): Promise<MembershipMutationResult> {
  const db = args.db ?? memberMembershipDatabase;
  const stripe = args.stripe ?? stripeBillingGateway;
  const now = args.now ?? new Date();
  const membership = await getMembershipById({
    workspaceId: args.workspaceId,
    memberMembershipId: args.memberMembershipId,
    db,
  });

  if (!membership) {
    return {
      status: "error",
      message: "Current membership not found.",
    };
  }

  const settings = await db.workspaceStripeSettings.findUnique({
    where: {
      workspaceId: args.workspaceId,
    },
    select: {
      stripeAccountId: true,
      connectionStatus: true,
      chargesEnabled: true,
      failedPaymentGracePeriodDays: true,
    },
  });

  if (membership.stripeSubscriptionId && isStripeReady(settings)) {
    await stripe.cancelSubscriptionAtPeriodEnd({
      stripeAccountId: settings.stripeAccountId,
      stripeSubscriptionId: membership.stripeSubscriptionId,
    });
  }

  const result = await db.memberMembership.updateMany({
    where: {
      id: membership.id,
      workspaceId: args.workspaceId,
      currentMembershipSlot: "CURRENT",
    },
    data: {
      cancelAtPeriodEnd: true,
      cancelRequestedAt: now,
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Current membership not found.",
    };
  }

  await createBillingRecord({
    db,
    workspaceId: args.workspaceId,
    memberId: membership.memberId,
    memberMembershipId: membership.id,
    type: "MEMBERSHIP_CANCELLED",
    status: "INFO",
    stripeSubscriptionId: membership.stripeSubscriptionId,
  });

  return {
    status: "cancelled",
    memberMembershipId: membership.id,
  };
}

export async function freezeMemberMembership(args: {
  workspaceId: string;
  input: MembershipFreezeInput;
  db?: MemberMembershipDatabase;
  now?: Date;
}): Promise<MembershipMutationResult> {
  const db = args.db ?? memberMembershipDatabase;
  const now = args.now ?? new Date();
  const todayString = toDateOnlyString(now);
  const frozenFrom = parseDateOnly(args.input.frozenFrom ?? todayString);
  const frozenUntil = parseDateOnly(args.input.frozenUntil);

  if (frozenFrom === "invalid" || frozenUntil === "invalid") {
    return {
      status: "error",
      message: "Enter valid freeze dates.",
    };
  }

  if (frozenUntil && frozenFrom && frozenUntil <= frozenFrom) {
    return {
      status: "error",
      message: "Freeze end date must be after the start date.",
    };
  }

  const membership = await getMembershipById({
    workspaceId: args.workspaceId,
    memberMembershipId: args.input.memberMembershipId.trim(),
    db,
  });

  if (!membership) {
    return {
      status: "error",
      message: "Current membership not found.",
    };
  }

  const status: MemberMembershipStatus =
    frozenFrom && toDateOnlyString(frozenFrom) <= todayString
      ? "FROZEN"
      : membership.status;
  const billingStatus: BillingStateStatus =
    status === "FROZEN" ? "FROZEN" : membership.billingState?.status ?? "ACTIVE";

  await db.memberMembership.updateMany({
    where: {
      id: membership.id,
      workspaceId: args.workspaceId,
      currentMembershipSlot: "CURRENT",
    },
    data: {
      status,
      frozenFrom,
      frozenUntil,
    },
  });
  await db.membershipBillingState.updateMany({
    where: {
      memberMembershipId: membership.id,
      workspaceId: args.workspaceId,
    },
    data: {
      status: billingStatus,
    },
  });
  await createBillingRecord({
    db,
    workspaceId: args.workspaceId,
    memberId: membership.memberId,
    memberMembershipId: membership.id,
    type: "MEMBERSHIP_FROZEN",
    status: "INFO",
  });

  return {
    status: "frozen",
    memberMembershipId: membership.id,
  };
}

export async function clearMemberMembershipFreeze(args: {
  workspaceId: string;
  memberMembershipId: string;
  db?: MemberMembershipDatabase;
}): Promise<MembershipMutationResult> {
  const db = args.db ?? memberMembershipDatabase;
  const membership = await getMembershipById({
    workspaceId: args.workspaceId,
    memberMembershipId: args.memberMembershipId,
    db,
  });

  if (!membership) {
    return {
      status: "error",
      message: "Current membership not found.",
    };
  }

  await db.memberMembership.updateMany({
    where: {
      id: membership.id,
      workspaceId: args.workspaceId,
      currentMembershipSlot: "CURRENT",
    },
    data: {
      status: "ACTIVE",
      frozenFrom: null,
      frozenUntil: null,
    },
  });
  await db.membershipBillingState.updateMany({
    where: {
      memberMembershipId: membership.id,
      workspaceId: args.workspaceId,
    },
    data: {
      status: "ACTIVE",
    },
  });
  await createBillingRecord({
    db,
    workspaceId: args.workspaceId,
    memberId: membership.memberId,
    memberMembershipId: membership.id,
    type: "MEMBERSHIP_UNFROZEN",
    status: "INFO",
  });

  return {
    status: "unfrozen",
    memberMembershipId: membership.id,
  };
}

export function formatMembershipStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

