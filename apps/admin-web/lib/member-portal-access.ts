import { hashPassword } from "@flowstate/auth";
import { prisma } from "@flowstate/db";

const minPasswordLength = 8;

interface MemberPortalAccessRecord {
  id: string;
  fullName: string;
  email: string | null;
  userId: string | null;
  user: {
    id: string;
    email: string;
  } | null;
}

interface MemberPortalAccessTransactionDatabase {
  user: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  workspaceUser: {
    create(args: Record<string, unknown>): Promise<{ id: string }>;
  };
  member: {
    updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
}

interface MemberPortalAccessDatabase extends MemberPortalAccessTransactionDatabase {
  member: MemberPortalAccessTransactionDatabase["member"] & {
    findFirst(args: Record<string, unknown>): Promise<MemberPortalAccessRecord | null>;
  };
  user: MemberPortalAccessTransactionDatabase["user"] & {
    findUnique(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
  $transaction<T>(
    callback: (tx: MemberPortalAccessTransactionDatabase) => Promise<T>,
  ): Promise<T>;
}

type MemberPortalAccessMutationResult =
  | {
      status: "created" | "reset";
      userId: string;
    }
  | {
      status: "error";
      message: string;
    };

const memberPortalAccessDatabase =
  prisma as unknown as MemberPortalAccessDatabase;

function cleanNullable(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function validatePassword(
  value: string | undefined,
): { status: "ok"; value: string } | { status: "error"; message: string } {
  const password = cleanNullable(value) ?? "";

  if (password.length < minPasswordLength) {
    return {
      status: "error",
      message: `Password must be at least ${minPasswordLength} characters.`,
    };
  }

  return {
    status: "ok",
    value: password,
  };
}

async function getMember(args: {
  workspaceId: string;
  memberId: string;
  db: MemberPortalAccessDatabase;
}): Promise<MemberPortalAccessRecord | null> {
  return args.db.member.findFirst({
    where: {
      id: args.memberId,
      workspaceId: args.workspaceId,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}

export async function createMemberPortalAccess(args: {
  workspaceId: string;
  memberId: string;
  password: string;
  db?: MemberPortalAccessDatabase;
}): Promise<MemberPortalAccessMutationResult> {
  const db = args.db ?? memberPortalAccessDatabase;
  const password = validatePassword(args.password);

  if (password.status === "error") {
    return password;
  }

  const member = await getMember({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });

  if (!member) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  if (member.userId) {
    return {
      status: "error",
      message: "Portal access already exists for this member.",
    };
  }

  if (!member.email) {
    return {
      status: "error",
      message: "Add an email address before creating portal access.",
    };
  }

  const existingUser = await db.user.findUnique({
    where: {
      email: member.email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return {
      status: "error",
      message: "That email already belongs to another user.",
    };
  }

  const passwordHash = await hashPassword(password.value);
  const userId = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: member.email,
        fullName: member.fullName,
        passwordHash,
      },
      select: {
        id: true,
      },
    });

    await tx.workspaceUser.create({
      data: {
        workspaceId: args.workspaceId,
        userId: user.id,
        role: "CUSTOMER",
      },
      select: {
        id: true,
      },
    });

    const result = await tx.member.updateMany({
      where: {
        id: member.id,
        workspaceId: args.workspaceId,
        userId: null,
      },
      data: {
        userId: user.id,
      },
    });

    if (result.count === 0) {
      throw new Error("Member portal access could not be linked.");
    }

    return user.id;
  });

  return {
    status: "created",
    userId,
  };
}

export async function resetMemberPortalPassword(args: {
  workspaceId: string;
  memberId: string;
  password: string;
  db?: MemberPortalAccessDatabase;
}): Promise<MemberPortalAccessMutationResult> {
  const db = args.db ?? memberPortalAccessDatabase;
  const password = validatePassword(args.password);

  if (password.status === "error") {
    return password;
  }

  const member = await getMember({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
    db,
  });

  if (!member) {
    return {
      status: "error",
      message: "Member not found.",
    };
  }

  if (!member.userId) {
    return {
      status: "error",
      message: "Portal access has not been created for this member yet.",
    };
  }

  const result = await db.user.updateMany({
    where: {
      id: member.userId,
    },
    data: {
      passwordHash: await hashPassword(password.value),
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: "Linked member user not found.",
    };
  }

  return {
    status: "reset",
    userId: member.userId,
  };
}
