import {
  prisma,
  type BillingRecordStatus,
  type BillingStateStatus,
  type MemberMembershipStatus,
} from "@hitlink/db";

interface ProgramRestrictionRecord {
  programId: string;
  program: {
    id: string;
    name: string;
  };
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

export interface CurrentMembershipRecord {
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
  membershipPlan: {
    id: string;
    name: string;
    description: string | null;
    monthlyPriceCents: number;
    currency: string;
    programRestrictions: ProgramRestrictionRecord[];
  };
  billingState: BillingStateRecord | null;
}

export interface MemberMembershipDatabase {
  memberMembership: {
    findFirst(args: Record<string, unknown>): Promise<CurrentMembershipRecord | null>;
  };
}

export const selfBookingBlockedStatuses: MemberMembershipStatus[] = [
  "FROZEN",
  "CANCELLED",
  "ENDED",
];

const memberMembershipDatabase = prisma as unknown as MemberMembershipDatabase;

export async function getCurrentMemberMembershipContext(args: {
  workspaceId: string;
  memberId: string;
  db?: MemberMembershipDatabase;
}): Promise<CurrentMembershipRecord | null> {
  const db = args.db ?? memberMembershipDatabase;

  return db.memberMembership.findFirst({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      currentMembershipSlot: "CURRENT",
    },
    include: {
      membershipPlan: {
        include: {
          programRestrictions: {
            include: {
              program: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              program: {
                name: "asc",
              },
            },
          },
        },
      },
      billingState: true,
    },
  });
}

export function getAllowedProgramIdsForCurrentMembership(
  membership: CurrentMembershipRecord | null,
): string[] | null {
  if (!membership) {
    return [];
  }

  const restrictedProgramIds = membership.membershipPlan.programRestrictions.map(
    (restriction) => restriction.programId,
  );

  return restrictedProgramIds.length === 0 ? null : restrictedProgramIds;
}

export function canMemberSelfBook(
  membership: CurrentMembershipRecord | null,
): boolean {
  return Boolean(
    membership && !selfBookingBlockedStatuses.includes(membership.status),
  );
}
