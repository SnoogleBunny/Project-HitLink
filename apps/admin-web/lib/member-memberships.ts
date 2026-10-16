import {
  dateOnlyStringToUtcDate,
  prisma,
  resolveRequiredFormStatusesForMember,
  toDateOnlyString,
  type MembershipLifecyclePolicy,
  type BillingRecordStatus,
  type BillingStateStatus,
  type MemberMembershipStatus,
} from "@flowstate/db";
import {
  stripeBillingGateway,
  type StripeBillingGateway,
} from "./stripe-billing";

interface BillingMemberRecord {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
}

interface BillingPlanRecord {
  lifecyclePolicy?: MembershipLifecyclePolicy | null;
  weeklyClassLimit?: number | null;
  monthlyClassLimit?: number | null;
  allowanceCountingMode?: "ATTENDANCE" | "RESERVATION";
  lateCancellationConsumesClass?: boolean;
  noShowConsumesClass?: boolean;
  termsVersion?: number;
  cancellationPolicyReference?: string | null;
  freezePolicyReference?: string | null;
  programRestrictions?: Array<{ programId: string }>;
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
  location?: {
    findUnique(
      args: Record<string, unknown>,
    ): Promise<{ timezone: string } | null>;
  };
  member: {
    findFirst(
      args: Record<string, unknown>,
    ): Promise<BillingMemberRecord | null>;
  };
  membershipPlan: {
    findMany(args: Record<string, unknown>): Promise<BillingPlanRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<BillingPlanRecord | null>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  memberMembership: {
    findFirst(
      args: Record<string, unknown>,
    ): Promise<
      BillingMembershipRecord | { stripeCustomerId: string | null } | null
    >;
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  membershipBillingState: {
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  workspaceStripeSettings: {
    findUnique(
      args: Record<string, unknown>,
    ): Promise<WorkspaceStripeSettingsRecord | null>;
  };
  billingRecord: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findMany(
      args: Record<string, unknown>,
    ): Promise<BillingRecordSummaryRecord[]>;
  };
}

export interface MembershipAssignmentInput {
  acceptedTermsConfirmed?: boolean;
  expectedTermsVersion?: string;
  acceptedByWorkspaceUserId?: string;
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
      status:
        | "assigned"
        | "assigned_pending_billing"
        | "cancelled"
        | "frozen"
        | "unfrozen";
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

function parseDateOnly(value: string | undefined): Date | null | "invalid" {
  const dateString = cleanNullable(value);

  if (!dateString) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return "invalid";
  }

  const parsed = dateOnlyStringToUtcDate(dateString);

  if (
    Number.isNaN(parsed.getTime()) ||
    toDateOnlyString(parsed) !== dateString
  ) {
    return "invalid";
  }

  return parsed;
}

function isStripeReady(
  settings: WorkspaceStripeSettingsRecord | null,
): settings is WorkspaceStripeSettingsRecord & {
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
          weeklyClassLimit: true,
          monthlyClassLimit: true,
          allowanceCountingMode: true,
          lateCancellationConsumesClass: true,
          noShowConsumesClass: true,
          termsVersion: true,
          cancellationPolicyReference: true,
          freezePolicyReference: true,
          programRestrictions: { select: { programId: true } },
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
  resolveActivationForms?: typeof resolveRequiredFormStatusesForMember;
  now?: Date;
}): Promise<MembershipMutationResult> {
  // Retired endpoint: stale owner forms must not create a subscription or grant unpaid access.
  void args;
  return {
    status: "error",
    message:
      "Memberships now start through verified enrollment. Give the member a current enrollment link so they can accept the terms, sign forms and pay from their own account.",
  };
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
    status === "FROZEN"
      ? "FROZEN"
      : (membership.billingState?.status ?? "ACTIVE");

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
