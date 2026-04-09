import { prisma, type MembershipPlan } from "@hitlink/db";

const currencyPattern = /^[a-z]{3}$/;

interface ProgramRestrictionRecord {
  program: {
    id: string;
    name: string;
  };
}

interface MembershipPlanRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  currency: string;
  cancellationPolicyReference: string | null;
  freezePolicyReference: string | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  programRestrictions: ProgramRestrictionRecord[];
}

interface MembershipPlanDatabase {
  program: {
    findMany(args: Record<string, unknown>): Promise<Array<{ id: string; name: string }>>;
  };
  membershipPlan: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    findMany(args: Record<string, unknown>): Promise<MembershipPlanRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<MembershipPlanRecord | null>;
  };
}

export interface MembershipPlanFormInput {
  name: string;
  description?: string;
  monthlyPriceCents: string;
  currency?: string;
  cancellationPolicyReference?: string;
  freezePolicyReference?: string;
  programIds?: string[];
}

export interface MembershipPlanSummary {
  id: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  currency: string;
  cancellationPolicyReference: string | null;
  freezePolicyReference: string | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  programRestrictions: Array<{
    id: string;
    name: string;
  }>;
}

export interface MembershipPlanFormOptions {
  programs: Array<{
    id: string;
    name: string;
  }>;
}

type MembershipPlanMutationResult =
  | {
      status: "created" | "updated" | "archived";
      membershipPlanId: string;
    }
  | {
      status: "error";
      message: string;
    };

const membershipPlanDatabase = prisma as unknown as MembershipPlanDatabase;
const duplicatePlanNameMessage =
  "Membership plans in the same workspace must use unique names.";

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function parsePositiveInteger(value: string): number | "invalid" {
  const sanitizedValue = value.trim();

  if (!/^\d+$/.test(sanitizedValue)) {
    return "invalid";
  }

  const parsedValue = Number(sanitizedValue);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    return "invalid";
  }

  return parsedValue;
}

function normalizeProgramIds(value: string[] | undefined): string[] {
  const seenIds = new Set<string>();
  const programIds: string[] = [];

  for (const rawProgramId of value ?? []) {
    const programId = rawProgramId.trim();

    if (!programId || seenIds.has(programId)) {
      continue;
    }

    seenIds.add(programId);
    programIds.push(programId);
  }

  return programIds;
}

function sanitizeMembershipPlanInput(input: MembershipPlanFormInput) {
  return {
    name: input.name.trim(),
    description: cleanNullable(input.description),
    monthlyPriceCents: parsePositiveInteger(input.monthlyPriceCents),
    currency: (cleanNullable(input.currency) ?? "usd").toLowerCase(),
    cancellationPolicyReference: cleanNullable(
      input.cancellationPolicyReference,
    ),
    freezePolicyReference: cleanNullable(input.freezePolicyReference),
    programIds: normalizeProgramIds(input.programIds),
  };
}

function isPlanNameUniqueConstraint(error: unknown): boolean {
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
    maybeError.meta.target.includes("name")
  );
}

async function validateProgramRestrictions(args: {
  workspaceId: string;
  programIds: string[];
  db: MembershipPlanDatabase;
}): Promise<
  | {
      status: "ok";
    }
  | {
      status: "error";
      message: string;
    }
> {
  if (args.programIds.length === 0) {
    return {
      status: "ok",
    };
  }

  const programs = await args.db.program.findMany({
    where: {
      workspaceId: args.workspaceId,
      id: {
        in: args.programIds,
      },
      archivedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (programs.length !== args.programIds.length) {
    return {
      status: "error",
      message: "Choose only active programs in this workspace.",
    };
  }

  return {
    status: "ok",
  };
}

function validateSanitizedMembershipPlanInput(
  input: ReturnType<typeof sanitizeMembershipPlanInput>,
):
  | {
      status: "ok";
      value: {
        name: string;
        description: string | null;
        monthlyPriceCents: number;
        currency: string;
        cancellationPolicyReference: string | null;
        freezePolicyReference: string | null;
        programIds: string[];
      };
    }
  | {
      status: "error";
      message: string;
    } {
  if (!input.name) {
    return {
      status: "error",
      message: "Membership plan name is required.",
    };
  }

  if (input.monthlyPriceCents === "invalid") {
    return {
      status: "error",
      message: "Monthly price must be a positive whole number of cents.",
    };
  }

  if (!currencyPattern.test(input.currency)) {
    return {
      status: "error",
      message: "Currency must be a three-letter lowercase code.",
    };
  }

  return {
    status: "ok",
    value: {
      ...input,
      monthlyPriceCents: input.monthlyPriceCents,
    },
  };
}

function mapMembershipPlan(record: MembershipPlanRecord): MembershipPlanSummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    monthlyPriceCents: record.monthlyPriceCents,
    currency: record.currency,
    cancellationPolicyReference: record.cancellationPolicyReference,
    freezePolicyReference: record.freezePolicyReference,
    stripeProductId: record.stripeProductId,
    stripePriceId: record.stripePriceId,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    programRestrictions: record.programRestrictions.map((restriction) => ({
      id: restriction.program.id,
      name: restriction.program.name,
    })),
  };
}

function getPlanInclude() {
  return {
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
        createdAt: "asc",
      },
    },
  };
}

export async function getMembershipPlanFormOptions(args: {
  workspaceId: string;
  db?: MembershipPlanDatabase;
}): Promise<MembershipPlanFormOptions> {
  const db = args.db ?? membershipPlanDatabase;
  const programs = await db.program.findMany({
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
    },
  });

  return {
    programs,
  };
}

export async function listMembershipPlans(args: {
  workspaceId: string;
  db?: MembershipPlanDatabase;
}): Promise<{
  activePlans: MembershipPlanSummary[];
  archivedPlans: MembershipPlanSummary[];
}> {
  const db = args.db ?? membershipPlanDatabase;
  const [activeRecords, archivedRecords] = await Promise.all([
    db.membershipPlan.findMany({
      where: {
        workspaceId: args.workspaceId,
        archivedAt: null,
      },
      include: getPlanInclude(),
      orderBy: {
        name: "asc",
      },
    }),
    db.membershipPlan.findMany({
      where: {
        workspaceId: args.workspaceId,
        archivedAt: {
          not: null,
        },
      },
      include: getPlanInclude(),
      orderBy: {
        archivedAt: "desc",
      },
    }),
  ]);

  return {
    activePlans: activeRecords.map(mapMembershipPlan),
    archivedPlans: archivedRecords.map(mapMembershipPlan),
  };
}

export async function getMembershipPlanForEdit(args: {
  workspaceId: string;
  membershipPlanId: string;
  db?: MembershipPlanDatabase;
}): Promise<MembershipPlanSummary | null> {
  const db = args.db ?? membershipPlanDatabase;
  const plan = await db.membershipPlan.findFirst({
    where: {
      id: args.membershipPlanId,
      workspaceId: args.workspaceId,
    },
    include: getPlanInclude(),
  });

  return plan ? mapMembershipPlan(plan) : null;
}

export async function createMembershipPlan(args: {
  workspaceId: string;
  input: MembershipPlanFormInput;
  db?: MembershipPlanDatabase;
}): Promise<MembershipPlanMutationResult> {
  const db = args.db ?? membershipPlanDatabase;
  const input = validateSanitizedMembershipPlanInput(
    sanitizeMembershipPlanInput(args.input),
  );

  if (input.status === "error") {
    return input;
  }

  const programRestrictions = await validateProgramRestrictions({
    workspaceId: args.workspaceId,
    programIds: input.value.programIds,
    db,
  });

  if (programRestrictions.status === "error") {
    return programRestrictions;
  }

  try {
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId: args.workspaceId,
        name: input.value.name,
        description: input.value.description,
        monthlyPriceCents: input.value.monthlyPriceCents,
        currency: input.value.currency,
        cancellationPolicyReference:
          input.value.cancellationPolicyReference,
        freezePolicyReference: input.value.freezePolicyReference,
        programRestrictions: {
          create: input.value.programIds.map((programId) => ({
            workspaceId: args.workspaceId,
            programId,
          })),
        },
      },
      select: {
        id: true,
      },
    });

    return {
      status: "created",
      membershipPlanId: plan.id,
    };
  } catch (error) {
    if (isPlanNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: duplicatePlanNameMessage,
      };
    }

    throw error;
  }
}

export async function updateMembershipPlan(args: {
  workspaceId: string;
  membershipPlanId: string;
  input: MembershipPlanFormInput;
  db?: MembershipPlanDatabase;
}): Promise<MembershipPlanMutationResult> {
  const db = args.db ?? membershipPlanDatabase;
  const input = validateSanitizedMembershipPlanInput(
    sanitizeMembershipPlanInput(args.input),
  );

  if (input.status === "error") {
    return input;
  }

  const existingPlan = await db.membershipPlan.findFirst({
    where: {
      id: args.membershipPlanId,
      workspaceId: args.workspaceId,
    },
    include: getPlanInclude(),
  });

  if (!existingPlan) {
    return {
      status: "error",
      message: "Membership plan not found.",
    };
  }

  if (
    existingPlan.stripePriceId &&
    (existingPlan.monthlyPriceCents !== input.value.monthlyPriceCents ||
      existingPlan.currency !== input.value.currency)
  ) {
    return {
      status: "error",
      message:
        "Plans already synced to Stripe cannot change price or currency. Archive this plan and create a new one.",
    };
  }

  const programRestrictions = await validateProgramRestrictions({
    workspaceId: args.workspaceId,
    programIds: input.value.programIds,
    db,
  });

  if (programRestrictions.status === "error") {
    return programRestrictions;
  }

  try {
    const plan = await db.membershipPlan.update({
      where: {
        id: args.membershipPlanId,
      },
      data: {
        name: input.value.name,
        description: input.value.description,
        monthlyPriceCents: input.value.monthlyPriceCents,
        currency: input.value.currency,
        cancellationPolicyReference:
          input.value.cancellationPolicyReference,
        freezePolicyReference: input.value.freezePolicyReference,
        programRestrictions: {
          deleteMany: {},
          create: input.value.programIds.map((programId) => ({
            workspaceId: args.workspaceId,
            programId,
          })),
        },
      },
      select: {
        id: true,
      },
    });

    return {
      status: "updated",
      membershipPlanId: plan.id,
    };
  } catch (error) {
    if (isPlanNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: duplicatePlanNameMessage,
      };
    }

    throw error;
  }
}

export async function archiveMembershipPlan(args: {
  workspaceId: string;
  membershipPlanId: string;
  db?: MembershipPlanDatabase;
}): Promise<MembershipPlanMutationResult> {
  const db = args.db ?? membershipPlanDatabase;
  const result = await db.membershipPlan.updateMany({
    where: {
      id: args.membershipPlanId,
      workspaceId: args.workspaceId,
    },
    data: {
      archivedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Membership plan not found.",
    };
  }

  return {
    status: "archived",
    membershipPlanId: args.membershipPlanId,
  };
}

export function formatMembershipPlanPrice(
  plan: Pick<MembershipPlan, "monthlyPriceCents" | "currency">,
): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
  }).format(plan.monthlyPriceCents / 100);
}

