import { randomBytes } from "node:crypto";
import { prisma, type UserRole } from "@hitlink/db";

const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const missingPendingInviteMessage = "That invite is no longer pending.";

interface PendingCoachInviteRecord {
  id: string;
  email: string;
  role: UserRole;
  status: "PENDING";
  expiresAt: Date;
  createdAt: Date;
  invitedByUser: {
    fullName: string | null;
    email: string;
  };
}

interface StaffInviteDatabase {
  staffInvite: {
    create(args: {
      data: {
        workspaceId: string;
        invitedByUserId: string;
        email: string;
        role: "COACH";
        token: string;
        expiresAt: Date;
      };
      select: {
        id: true;
      };
    }): Promise<{
      id: string;
    }>;
    findFirst(args: {
      where: {
        id?: string;
        workspaceId: string;
        email?: string;
        role: "COACH";
        status: "PENDING";
      };
      orderBy?: {
        createdAt: "desc";
      };
      select: {
        id: true;
      };
    }): Promise<{
      id: string;
    } | null>;
    findMany(args: {
      where: {
        workspaceId: string;
        role: "COACH";
        status: "PENDING";
      };
      include: {
        invitedByUser: {
          select: {
            fullName: true;
            email: true;
          };
        };
      };
      orderBy: {
        createdAt: "desc";
      };
    }): Promise<PendingCoachInviteRecord[]>;
    updateMany(args: {
      where: {
        id?: string;
        workspaceId: string;
        role?: "COACH";
        status?: "PENDING";
        expiresAt?: {
          lte: Date;
        };
      };
      data: {
        invitedByUserId?: string;
        token?: string;
        expiresAt?: Date;
        status?: "EXPIRED" | "REVOKED";
        revokedAt?: Date;
      };
    }): Promise<{
      count: number;
    }>;
  };
}

export interface PendingCoachInvite {
  id: string;
  email: string;
  status: "PENDING";
  expiresAt: Date;
  createdAt: Date;
  invitedByDisplayName: string;
  invitedByEmail: string;
}

type StaffInviteMutationResult =
  | {
      status: "created" | "refreshed" | "resent" | "revoked";
      inviteId: string;
    }
  | {
      status: "error";
      message: string;
    };

const staffInviteDatabase = prisma as unknown as StaffInviteDatabase;

function buildInviteToken(): string {
  return randomBytes(24).toString("hex");
}

function buildInviteExpiry(now: Date): Date {
  return new Date(now.getTime() + STAFF_INVITE_TTL_MS);
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function expireStalePendingStaffInvites(args: {
  workspaceId: string;
  db?: StaffInviteDatabase;
  now?: Date;
}): Promise<number> {
  const db = args.db ?? staffInviteDatabase;
  const now = args.now ?? new Date();
  const result = await db.staffInvite.updateMany({
    where: {
      workspaceId: args.workspaceId,
      status: "PENDING",
      expiresAt: {
        lte: now,
      },
    },
    data: {
      status: "EXPIRED",
    },
  });

  return result.count;
}

export async function listPendingCoachInvites(args: {
  workspaceId: string;
  db?: StaffInviteDatabase;
  now?: Date;
}): Promise<PendingCoachInvite[]> {
  const db = args.db ?? staffInviteDatabase;
  await expireStalePendingStaffInvites(args);

  const invites = await db.staffInvite.findMany({
    where: {
      workspaceId: args.workspaceId,
      role: "COACH",
      status: "PENDING",
    },
    include: {
      invitedByUser: {
        select: {
          fullName: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    status: "PENDING",
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    invitedByDisplayName:
      invite.invitedByUser.fullName?.trim() || invite.invitedByUser.email,
    invitedByEmail: invite.invitedByUser.email,
  }));
}

export async function inviteCoachToWorkspace(args: {
  workspaceId: string;
  invitedByUserId: string;
  email: string;
  db?: StaffInviteDatabase;
  now?: Date;
  tokenGenerator?: () => string;
}): Promise<StaffInviteMutationResult> {
  const db = args.db ?? staffInviteDatabase;
  const now = args.now ?? new Date();
  const email = normalizeInviteEmail(args.email);

  if (!email || !email.includes("@")) {
    return {
      status: "error",
      message: "Enter a valid coach email address.",
    };
  }

  await expireStalePendingStaffInvites({
    workspaceId: args.workspaceId,
    db,
    now,
  });

  const existingInvite = await db.staffInvite.findFirst({
    where: {
      workspaceId: args.workspaceId,
      email,
      role: "COACH",
      status: "PENDING",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
    },
  });

  const token = args.tokenGenerator?.() ?? buildInviteToken();
  const expiresAt = buildInviteExpiry(now);

  if (existingInvite) {
    await db.staffInvite.updateMany({
      where: {
        id: existingInvite.id,
        workspaceId: args.workspaceId,
        role: "COACH",
        status: "PENDING",
      },
      data: {
        invitedByUserId: args.invitedByUserId,
        token,
        expiresAt,
      },
    });

    return {
      status: "refreshed",
      inviteId: existingInvite.id,
    };
  }

  const invite = await db.staffInvite.create({
    data: {
      workspaceId: args.workspaceId,
      invitedByUserId: args.invitedByUserId,
      email,
      role: "COACH",
      token,
      expiresAt,
    },
    select: {
      id: true,
    },
  });

  return {
    status: "created",
    inviteId: invite.id,
  };
}

export async function resendPendingCoachInvite(args: {
  inviteId: string;
  workspaceId: string;
  invitedByUserId: string;
  db?: StaffInviteDatabase;
  now?: Date;
  tokenGenerator?: () => string;
}): Promise<StaffInviteMutationResult> {
  const db = args.db ?? staffInviteDatabase;
  const now = args.now ?? new Date();
  const token = args.tokenGenerator?.() ?? buildInviteToken();
  const expiresAt = buildInviteExpiry(now);

  await expireStalePendingStaffInvites({
    workspaceId: args.workspaceId,
    db,
    now,
  });

  const result = await db.staffInvite.updateMany({
    where: {
      id: args.inviteId,
      workspaceId: args.workspaceId,
      role: "COACH",
      status: "PENDING",
    },
    data: {
      invitedByUserId: args.invitedByUserId,
      token,
      expiresAt,
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: missingPendingInviteMessage,
    };
  }

  return {
    status: "resent",
    inviteId: args.inviteId,
  };
}

export async function revokePendingCoachInvite(args: {
  inviteId: string;
  workspaceId: string;
  db?: StaffInviteDatabase;
  now?: Date;
}): Promise<StaffInviteMutationResult> {
  const db = args.db ?? staffInviteDatabase;
  const now = args.now ?? new Date();

  await expireStalePendingStaffInvites({
    workspaceId: args.workspaceId,
    db,
    now,
  });

  const result = await db.staffInvite.updateMany({
    where: {
      id: args.inviteId,
      workspaceId: args.workspaceId,
      role: "COACH",
      status: "PENDING",
    },
    data: {
      status: "REVOKED",
      revokedAt: now,
    },
  });

  if (result.count === 0) {
    return {
      status: "error",
      message: missingPendingInviteMessage,
    };
  }

  return {
    status: "revoked",
    inviteId: args.inviteId,
  };
}
