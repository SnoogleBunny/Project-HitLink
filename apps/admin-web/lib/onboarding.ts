import { prisma, type UserRole } from "@flowstate/db";
import {
  buildInitialMigrationData,
  type MigrationIntakeInput,
} from "./workspace-migration";

export interface OwnerOnboardingInput {
  userId: string;
  workspaceName: string;
  businessType?: string;
  timezone: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
  migration?: MigrationIntakeInput;
}

interface ExistingMembership {
  id: string;
  workspaceId: string;
  role: UserRole;
  isActive: boolean;
}

interface WorkspaceUserReader {
  findUnique(args: {
    where: {
      userId: string;
    };
  }): Promise<ExistingMembership | null>;
}

interface WorkspaceUserWriter {
  create(args: {
    data: {
      workspaceId: string;
      userId: string;
      role: "OWNER";
    };
  }): Promise<unknown>;
}

interface OwnerOnboardingTransaction {
  workspace: {
    create(args: {
      data: {
        name: string;
        businessType: string | null;
        status: "SETUP_INCOMPLETE";
      };
    }): Promise<{
      id: string;
    }>;
  };
  location: {
    create(args: {
      data: {
        workspaceId: string;
        name: string;
        timezone: string;
        addressLine1: string | null;
        addressLine2: string | null;
        city: string | null;
        region: string | null;
        postalCode: string | null;
        countryCode: string | null;
      };
    }): Promise<unknown>;
  };
  workspaceUser: WorkspaceUserWriter;
  workspaceSetting: {
    create(args: {
      data: {
        workspaceId: string;
        allowMultipleRooms: boolean;
      };
    }): Promise<unknown>;
  };
  workspaceMigration: {
    create(args: {
      data: ReturnType<typeof buildInitialMigrationData> & {
        workspaceId: string;
      };
    }): Promise<unknown>;
  };
}

interface OwnerOnboardingDatabase {
  workspaceUser: WorkspaceUserReader;
  $transaction<T>(
    callback: (tx: OwnerOnboardingTransaction) => Promise<T>,
  ): Promise<T>;
}

export type OwnerOnboardingResult =
  | {
      status: "created";
      workspaceId: string;
    }
  | {
      status: "redirect";
      location: "/dashboard" | "/dashboard/migration";
      workspaceId: string;
    }
  | {
      status: "blocked";
      message: string;
      // Server-only metadata used for structured logging in the action layer.
      workspaceUserId: string;
      isActive: boolean;
    };

const ownerOnboardingDatabase = prisma as unknown as OwnerOnboardingDatabase;
const inactiveMembershipBlockedMessage =
  "This account is already linked to a workspace membership that isn't active. A new workspace can’t be created with this account right now. Contact support or use a different email.";

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function sanitizeInput(input: OwnerOnboardingInput) {
  return {
    userId: input.userId,
    workspaceName: input.workspaceName.trim(),
    businessType: cleanNullable(input.businessType),
    timezone: input.timezone.trim(),
    addressLine1: cleanNullable(input.addressLine1),
    addressLine2: cleanNullable(input.addressLine2),
    city: cleanNullable(input.city),
    region: cleanNullable(input.region),
    postalCode: cleanNullable(input.postalCode),
    countryCode: cleanNullable(input.countryCode)?.toUpperCase() ?? null,
    migration: buildInitialMigrationData(input.migration ?? {}),
  };
}

function isWorkspaceMembershipUniqueConstraint(error: unknown): boolean {
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
    maybeError.meta.target.includes("userId")
  );
}

async function findExistingMembership(
  db: OwnerOnboardingDatabase,
  userId: string,
): Promise<ExistingMembership | null> {
  return db.workspaceUser.findUnique({
    where: {
      userId,
    },
  });
}

function resolveMembershipResult(
  membership: ExistingMembership,
): OwnerOnboardingResult {
  if (membership.isActive) {
    return {
      status: "redirect",
      location: "/dashboard",
      workspaceId: membership.workspaceId,
    };
  }

  return {
    status: "blocked",
    message: inactiveMembershipBlockedMessage,
    workspaceUserId: membership.id,
    isActive: membership.isActive,
  };
}

export async function createOwnerWorkspaceOnboarding(args: {
  input: OwnerOnboardingInput;
  db?: OwnerOnboardingDatabase;
}): Promise<OwnerOnboardingResult> {
  const db = args.db ?? ownerOnboardingDatabase;
  const input = sanitizeInput(args.input);
  const existingMembership = await findExistingMembership(db, input.userId);

  if (existingMembership) {
    // MVP treats WorkspaceUser as one durable membership row per user.
    return resolveMembershipResult(existingMembership);
  }

  try {
    return await db.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: input.workspaceName,
          businessType: input.businessType,
          status: "SETUP_INCOMPLETE",
        },
      });

      await tx.location.create({
        data: {
          workspaceId: workspace.id,
          name: input.workspaceName,
          timezone: input.timezone,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          region: input.region,
          postalCode: input.postalCode,
          countryCode: input.countryCode,
        },
      });

      await tx.workspaceUser.create({
        data: {
          workspaceId: workspace.id,
          userId: input.userId,
          role: "OWNER",
        },
      });

      await tx.workspaceSetting.create({
        data: {
          workspaceId: workspace.id,
          allowMultipleRooms: false,
        },
      });

      await tx.workspaceMigration.create({
        data: {
          workspaceId: workspace.id,
          ...input.migration,
        },
      });

      return {
        status: "created",
        workspaceId: workspace.id,
      };
    });
  } catch (error) {
    if (isWorkspaceMembershipUniqueConstraint(error)) {
      const membership = await findExistingMembership(db, input.userId);

      if (!membership) {
        throw new Error(
          `Workspace membership uniqueness conflict for user ${input.userId} but no WorkspaceUser row was found on a fresh reread.`,
        );
      }

      return resolveMembershipResult(membership);
    }

    throw error;
  }
}
