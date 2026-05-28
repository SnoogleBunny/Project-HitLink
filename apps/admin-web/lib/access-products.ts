import { prisma } from "@flowstate/db";

const currencyPattern = /^[a-z]{3}$/;

interface ProgramRestrictionRecord {
  program: {
    id: string;
    name: string;
  };
}

interface PunchCardProductRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  punchesIncluded: number;
  priceCents: number;
  currency: string;
  isEnabled: boolean;
  archivedAt: Date | null;
  restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  programRestrictions: ProgramRestrictionRecord[];
}

interface DropInProductRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isEnabled: boolean;
  archivedAt: Date | null;
  restrictionMode: "GENERAL" | "PROGRAM_RESTRICTED";
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  programRestrictions: ProgramRestrictionRecord[];
}

interface MemberPunchCardRecord {
  id: string;
  originalPunches: number;
  remainingPunches: number;
  status: "ACTIVE" | "DEPLETED" | "ARCHIVED";
  purchasePriceCents: number;
  purchaseCurrency: string;
  purchasedAt: Date;
  punchCardProduct: {
    id: string;
    name: string;
  };
}

interface AccessProductDatabase {
  program: {
    findMany(args: Record<string, unknown>): Promise<Array<{ id: string; name: string }>>;
  };
  punchCardProduct: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    findMany(args: Record<string, unknown>): Promise<PunchCardProductRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<PunchCardProductRecord | null>;
  };
  dropInProduct: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    update(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
    findMany(args: Record<string, unknown>): Promise<DropInProductRecord[]>;
    findFirst(args: Record<string, unknown>): Promise<DropInProductRecord | null>;
  };
  member: {
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  memberPunchCard: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    findMany(args: Record<string, unknown>): Promise<MemberPunchCardRecord[]>;
  };
  billingRecord: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
}

export interface AccessProductFormOptions {
  programs: Array<{
    id: string;
    name: string;
  }>;
}

export interface PunchCardProductFormInput {
  name: string;
  description?: string;
  punchesIncluded: string;
  priceCents: string;
  currency?: string;
  programIds?: string[];
}

export interface DropInProductFormInput {
  name: string;
  description?: string;
  priceCents: string;
  currency?: string;
  programIds?: string[];
}

export interface PunchCardProductSummary {
  id: string;
  name: string;
  description: string | null;
  punchesIncluded: number;
  priceCents: number;
  currency: string;
  isEnabled: boolean;
  archivedAt: Date | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  programRestrictions: Array<{
    id: string;
    name: string;
  }>;
}

export interface DropInProductSummary {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isEnabled: boolean;
  archivedAt: Date | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  programRestrictions: Array<{
    id: string;
    name: string;
  }>;
}

export interface MemberPunchCardBalanceSummary {
  id: string;
  name: string;
  originalPunches: number;
  remainingPunches: number;
  status: "ACTIVE" | "DEPLETED" | "ARCHIVED";
  purchasedAt: Date;
  purchasePriceCents: number;
  purchaseCurrency: string;
}

type AccessProductMutationResult =
  | {
      status:
        | "created"
        | "updated"
        | "archived"
        | "enabled"
        | "disabled"
        | "granted";
      recordId: string;
    }
  | {
      status: "error";
      message: string;
    };

const accessProductDatabase = prisma as unknown as AccessProductDatabase;

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function parsePositiveInteger(value: string): number | "invalid" {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return "invalid";
  }

  const parsed = Number(trimmed);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return "invalid";
  }

  return parsed;
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

function mapPunchCardProduct(
  record: PunchCardProductRecord,
): PunchCardProductSummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    punchesIncluded: record.punchesIncluded,
    priceCents: record.priceCents,
    currency: record.currency,
    isEnabled: record.isEnabled,
    archivedAt: record.archivedAt,
    stripeProductId: record.stripeProductId,
    stripePriceId: record.stripePriceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    programRestrictions: record.programRestrictions.map((restriction) => ({
      id: restriction.program.id,
      name: restriction.program.name,
    })),
  };
}

function mapDropInProduct(record: DropInProductRecord): DropInProductSummary {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    priceCents: record.priceCents,
    currency: record.currency,
    isEnabled: record.isEnabled,
    archivedAt: record.archivedAt,
    stripeProductId: record.stripeProductId,
    stripePriceId: record.stripePriceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    programRestrictions: record.programRestrictions.map((restriction) => ({
      id: restriction.program.id,
      name: restriction.program.name,
    })),
  };
}

function sanitizePunchCardProductInput(input: PunchCardProductFormInput) {
  return {
    name: input.name.trim(),
    description: cleanNullable(input.description),
    punchesIncluded: parsePositiveInteger(input.punchesIncluded),
    priceCents: parsePositiveInteger(input.priceCents),
    currency: (cleanNullable(input.currency) ?? "usd").toLowerCase(),
    programIds: normalizeProgramIds(input.programIds),
  };
}

function sanitizeDropInProductInput(input: DropInProductFormInput) {
  return {
    name: input.name.trim(),
    description: cleanNullable(input.description),
    priceCents: parsePositiveInteger(input.priceCents),
    currency: (cleanNullable(input.currency) ?? "usd").toLowerCase(),
    programIds: normalizeProgramIds(input.programIds),
  };
}

async function validateProgramRestrictions(args: {
  workspaceId: string;
  programIds: string[];
  db: AccessProductDatabase;
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

function isWorkspaceNameUniqueConstraint(error: unknown): boolean {
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

function validatePunchCardProductInput(
  input: ReturnType<typeof sanitizePunchCardProductInput>,
):
  | {
      status: "ok";
      value: {
        name: string;
        description: string | null;
        punchesIncluded: number;
        priceCents: number;
        currency: string;
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
      message: "Punch card name is required.",
    };
  }

  if (input.punchesIncluded === "invalid") {
    return {
      status: "error",
      message: "Included punches must be a positive whole number.",
    };
  }

  if (input.priceCents === "invalid") {
    return {
      status: "error",
      message: "Price must be a positive whole number of cents.",
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
      punchesIncluded: input.punchesIncluded,
      priceCents: input.priceCents,
    },
  };
}

function validateDropInProductInput(
  input: ReturnType<typeof sanitizeDropInProductInput>,
):
  | {
      status: "ok";
      value: {
        name: string;
        description: string | null;
        priceCents: number;
        currency: string;
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
      message: "Drop-in product name is required.",
    };
  }

  if (input.priceCents === "invalid") {
    return {
      status: "error",
      message: "Price must be a positive whole number of cents.",
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
      priceCents: input.priceCents,
    },
  };
}

export async function getAccessProductFormOptions(args: {
  workspaceId: string;
  db?: AccessProductDatabase;
}): Promise<AccessProductFormOptions> {
  const db = args.db ?? accessProductDatabase;
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

export async function listPunchCardProducts(args: {
  workspaceId: string;
  db?: AccessProductDatabase;
}): Promise<{
  activeProducts: PunchCardProductSummary[];
  archivedProducts: PunchCardProductSummary[];
}> {
  const db = args.db ?? accessProductDatabase;
  const records = await db.punchCardProduct.findMany({
    where: {
      workspaceId: args.workspaceId,
    },
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
    orderBy: [
      {
        archivedAt: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  return {
    activeProducts: records
      .filter((record) => record.archivedAt === null)
      .map(mapPunchCardProduct),
    archivedProducts: records
      .filter((record) => record.archivedAt !== null)
      .map(mapPunchCardProduct),
  };
}

export async function listDropInProducts(args: {
  workspaceId: string;
  db?: AccessProductDatabase;
}): Promise<{
  activeProducts: DropInProductSummary[];
  archivedProducts: DropInProductSummary[];
}> {
  const db = args.db ?? accessProductDatabase;
  const records = await db.dropInProduct.findMany({
    where: {
      workspaceId: args.workspaceId,
    },
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
    orderBy: [
      {
        archivedAt: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  return {
    activeProducts: records
      .filter((record) => record.archivedAt === null)
      .map(mapDropInProduct),
    archivedProducts: records
      .filter((record) => record.archivedAt !== null)
      .map(mapDropInProduct),
  };
}

export async function getPunchCardProduct(args: {
  workspaceId: string;
  punchCardProductId: string;
  db?: AccessProductDatabase;
}): Promise<PunchCardProductSummary | null> {
  const db = args.db ?? accessProductDatabase;
  const record = await db.punchCardProduct.findFirst({
    where: {
      id: args.punchCardProductId,
      workspaceId: args.workspaceId,
    },
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
  });

  return record ? mapPunchCardProduct(record) : null;
}

export async function getDropInProduct(args: {
  workspaceId: string;
  dropInProductId: string;
  db?: AccessProductDatabase;
}): Promise<DropInProductSummary | null> {
  const db = args.db ?? accessProductDatabase;
  const record = await db.dropInProduct.findFirst({
    where: {
      id: args.dropInProductId,
      workspaceId: args.workspaceId,
    },
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
  });

  return record ? mapDropInProduct(record) : null;
}

export async function createPunchCardProduct(args: {
  workspaceId: string;
  input: PunchCardProductFormInput;
  db?: AccessProductDatabase;
}): Promise<AccessProductMutationResult> {
  const db = args.db ?? accessProductDatabase;
  const input = validatePunchCardProductInput(
    sanitizePunchCardProductInput(args.input),
  );

  if (input.status === "error") {
    return input;
  }

  const restrictions = await validateProgramRestrictions({
    workspaceId: args.workspaceId,
    programIds: input.value.programIds,
    db,
  });

  if (restrictions.status === "error") {
    return restrictions;
  }

  try {
    const product = await db.punchCardProduct.create({
      data: {
        workspaceId: args.workspaceId,
        name: input.value.name,
        description: input.value.description,
        punchesIncluded: input.value.punchesIncluded,
        priceCents: input.value.priceCents,
        currency: input.value.currency,
        restrictionMode:
          input.value.programIds.length === 0 ? "GENERAL" : "PROGRAM_RESTRICTED",
        programRestrictions:
          input.value.programIds.length === 0
            ? undefined
            : {
                createMany: {
                  data: input.value.programIds.map((programId) => ({
                    workspaceId: args.workspaceId,
                    programId,
                  })),
                },
              },
      },
      select: {
        id: true,
      },
    });

    return {
      status: "created",
      recordId: product.id,
    };
  } catch (error) {
    if (isWorkspaceNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: "Punch card names in the same workspace must be unique.",
      };
    }

    throw error;
  }
}

export async function updatePunchCardProduct(args: {
  workspaceId: string;
  punchCardProductId: string;
  input: PunchCardProductFormInput;
  db?: AccessProductDatabase;
}): Promise<AccessProductMutationResult> {
  const db = args.db ?? accessProductDatabase;
  const existing = await db.punchCardProduct.findFirst({
    where: {
      id: args.punchCardProductId,
      workspaceId: args.workspaceId,
    },
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
      },
    },
  });

  if (!existing) {
    return {
      status: "error",
      message: "Punch card product not found.",
    };
  }

  const input = validatePunchCardProductInput(
    sanitizePunchCardProductInput(args.input),
  );

  if (input.status === "error") {
    return input;
  }

  const restrictions = await validateProgramRestrictions({
    workspaceId: args.workspaceId,
    programIds: input.value.programIds,
    db,
  });

  if (restrictions.status === "error") {
    return restrictions;
  }

  const priceLocked = Boolean(existing.stripePriceId);

  try {
    const product = await db.punchCardProduct.update({
      where: {
        id: args.punchCardProductId,
      },
      data: {
        name: input.value.name,
        description: input.value.description,
        punchesIncluded: priceLocked
          ? existing.punchesIncluded
          : input.value.punchesIncluded,
        priceCents: priceLocked ? existing.priceCents : input.value.priceCents,
        currency: priceLocked ? existing.currency : input.value.currency,
        restrictionMode:
          input.value.programIds.length === 0 ? "GENERAL" : "PROGRAM_RESTRICTED",
        programRestrictions: {
          deleteMany: {},
          createMany:
            input.value.programIds.length === 0
              ? undefined
              : {
                  data: input.value.programIds.map((programId) => ({
                    workspaceId: args.workspaceId,
                    programId,
                  })),
                },
        },
      },
      select: {
        id: true,
      },
    });

    return {
      status: "updated",
      recordId: product.id,
    };
  } catch (error) {
    if (isWorkspaceNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: "Punch card names in the same workspace must be unique.",
      };
    }

    throw error;
  }
}

export async function togglePunchCardProduct(args: {
  workspaceId: string;
  punchCardProductId: string;
  enabled: boolean;
  db?: AccessProductDatabase;
}): Promise<AccessProductMutationResult> {
  const db = args.db ?? accessProductDatabase;
  const result = await db.punchCardProduct.updateMany({
    where: {
      id: args.punchCardProductId,
      workspaceId: args.workspaceId,
      archivedAt: null,
    },
    data: {
      isEnabled: args.enabled,
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Punch card product not found.",
    };
  }

  return {
    status: args.enabled ? "enabled" : "disabled",
    recordId: args.punchCardProductId,
  };
}

export async function archivePunchCardProduct(args: {
  workspaceId: string;
  punchCardProductId: string;
  db?: AccessProductDatabase;
}): Promise<void> {
  const db = args.db ?? accessProductDatabase;

  await db.punchCardProduct.updateMany({
    where: {
      id: args.punchCardProductId,
      workspaceId: args.workspaceId,
      archivedAt: null,
    },
    data: {
      archivedAt: new Date(),
      isEnabled: false,
    },
  });
}

export async function createDropInProduct(args: {
  workspaceId: string;
  input: DropInProductFormInput;
  db?: AccessProductDatabase;
}): Promise<AccessProductMutationResult> {
  const db = args.db ?? accessProductDatabase;
  const input = validateDropInProductInput(
    sanitizeDropInProductInput(args.input),
  );

  if (input.status === "error") {
    return input;
  }

  const restrictions = await validateProgramRestrictions({
    workspaceId: args.workspaceId,
    programIds: input.value.programIds,
    db,
  });

  if (restrictions.status === "error") {
    return restrictions;
  }

  try {
    const product = await db.dropInProduct.create({
      data: {
        workspaceId: args.workspaceId,
        name: input.value.name,
        description: input.value.description,
        priceCents: input.value.priceCents,
        currency: input.value.currency,
        restrictionMode:
          input.value.programIds.length === 0 ? "GENERAL" : "PROGRAM_RESTRICTED",
        programRestrictions:
          input.value.programIds.length === 0
            ? undefined
            : {
                createMany: {
                  data: input.value.programIds.map((programId) => ({
                    workspaceId: args.workspaceId,
                    programId,
                  })),
                },
              },
      },
      select: {
        id: true,
      },
    });

    return {
      status: "created",
      recordId: product.id,
    };
  } catch (error) {
    if (isWorkspaceNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: "Drop-in product names in the same workspace must be unique.",
      };
    }

    throw error;
  }
}

export async function updateDropInProduct(args: {
  workspaceId: string;
  dropInProductId: string;
  input: DropInProductFormInput;
  db?: AccessProductDatabase;
}): Promise<AccessProductMutationResult> {
  const db = args.db ?? accessProductDatabase;
  const existing = await db.dropInProduct.findFirst({
    where: {
      id: args.dropInProductId,
      workspaceId: args.workspaceId,
    },
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
      },
    },
  });

  if (!existing) {
    return {
      status: "error",
      message: "Drop-in product not found.",
    };
  }

  const input = validateDropInProductInput(
    sanitizeDropInProductInput(args.input),
  );

  if (input.status === "error") {
    return input;
  }

  const restrictions = await validateProgramRestrictions({
    workspaceId: args.workspaceId,
    programIds: input.value.programIds,
    db,
  });

  if (restrictions.status === "error") {
    return restrictions;
  }

  const priceLocked = Boolean(existing.stripePriceId);

  try {
    const product = await db.dropInProduct.update({
      where: {
        id: args.dropInProductId,
      },
      data: {
        name: input.value.name,
        description: input.value.description,
        priceCents: priceLocked ? existing.priceCents : input.value.priceCents,
        currency: priceLocked ? existing.currency : input.value.currency,
        restrictionMode:
          input.value.programIds.length === 0 ? "GENERAL" : "PROGRAM_RESTRICTED",
        programRestrictions: {
          deleteMany: {},
          createMany:
            input.value.programIds.length === 0
              ? undefined
              : {
                  data: input.value.programIds.map((programId) => ({
                    workspaceId: args.workspaceId,
                    programId,
                  })),
                },
        },
      },
      select: {
        id: true,
      },
    });

    return {
      status: "updated",
      recordId: product.id,
    };
  } catch (error) {
    if (isWorkspaceNameUniqueConstraint(error)) {
      return {
        status: "error",
        message: "Drop-in product names in the same workspace must be unique.",
      };
    }

    throw error;
  }
}

export async function toggleDropInProduct(args: {
  workspaceId: string;
  dropInProductId: string;
  enabled: boolean;
  db?: AccessProductDatabase;
}): Promise<AccessProductMutationResult> {
  const db = args.db ?? accessProductDatabase;
  const result = await db.dropInProduct.updateMany({
    where: {
      id: args.dropInProductId,
      workspaceId: args.workspaceId,
      archivedAt: null,
    },
    data: {
      isEnabled: args.enabled,
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Drop-in product not found.",
    };
  }

  return {
    status: args.enabled ? "enabled" : "disabled",
    recordId: args.dropInProductId,
  };
}

export async function archiveDropInProduct(args: {
  workspaceId: string;
  dropInProductId: string;
  db?: AccessProductDatabase;
}): Promise<void> {
  const db = args.db ?? accessProductDatabase;

  await db.dropInProduct.updateMany({
    where: {
      id: args.dropInProductId,
      workspaceId: args.workspaceId,
      archivedAt: null,
    },
    data: {
      archivedAt: new Date(),
      isEnabled: false,
    },
  });
}

export async function listMemberPunchCardBalances(args: {
  workspaceId: string;
  memberId: string;
  db?: AccessProductDatabase;
}): Promise<MemberPunchCardBalanceSummary[]> {
  const db = args.db ?? accessProductDatabase;
  const records = await db.memberPunchCard.findMany({
    where: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
    },
    include: {
      punchCardProduct: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      {
        purchasedAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  return records.map((record) => ({
    id: record.id,
    name: record.punchCardProduct.name,
    originalPunches: record.originalPunches,
    remainingPunches: record.remainingPunches,
    status: record.status,
    purchasedAt: record.purchasedAt,
    purchasePriceCents: record.purchasePriceCents,
    purchaseCurrency: record.purchaseCurrency,
  }));
}

export async function grantMemberPunchCard(args: {
  workspaceId: string;
  memberId: string;
  punchCardProductId: string;
  db?: AccessProductDatabase;
}): Promise<AccessProductMutationResult> {
  const db = args.db ?? accessProductDatabase;
  const [member, product] = await Promise.all([
    db.member.findFirst({
      where: {
        id: args.memberId,
        workspaceId: args.workspaceId,
      },
      select: {
        id: true,
      },
    }),
    db.punchCardProduct.findFirst({
      where: {
        id: args.punchCardProductId,
        workspaceId: args.workspaceId,
        archivedAt: null,
      },
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
        },
      },
    }),
  ]);

  if (!member) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  if (!product) {
    return {
      status: "error",
      message: "Punch card product not found.",
    };
  }

  const card = await db.memberPunchCard.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      punchCardProductId: product.id,
      originalPunches: product.punchesIncluded,
      remainingPunches: product.punchesIncluded,
      status: "ACTIVE",
      purchasePriceCents: product.priceCents,
      purchaseCurrency: product.currency,
      purchasedAt: new Date(),
    },
    select: {
      id: true,
    },
  });

  await db.billingRecord.create({
    data: {
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      type: "PUNCH_CARD_GRANTED",
      status: "INFO",
      amountCents: product.priceCents,
      currency: product.currency,
    },
    select: {
      id: true,
    },
  });

  return {
    status: "granted",
    recordId: card.id,
  };
}
