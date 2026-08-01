import {
  getSession,
  MEMBER_SESSION_COOKIE_NAME,
  type AppSession,
} from "@flowstate/auth";
import {
  isWorkspaceMigrationReady,
  prisma,
  type MemberStatus,
  type WorkspaceStatus,
} from "@flowstate/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

interface MemberWorkspaceRecord {
  id: string;
  name: string;
  status: WorkspaceStatus;
  location: {
    id: string;
    name: string;
    timezone: string;
  } | null;
  migration: {
    stage: string;
    ownerReviewAcknowledgedAt: Date | null;
    ownerReviewAcknowledgedByUserId: string | null;
    operationallyReadyAt: Date | null;
    operationallyReadyByUserId: string | null;
  } | null;
}

interface MemberIdentityRecord {
  id: string;
  fullName: string;
  email: string | null;
  status: MemberStatus;
}

interface MemberPortalDatabase {
  workspace: {
    findUnique(args: Record<string, unknown>): Promise<MemberWorkspaceRecord | null>;
  };
  member: {
    findFirst(args: Record<string, unknown>): Promise<MemberIdentityRecord | null>;
  };
}

export interface MemberSession extends AppSession {
  role: "CUSTOMER";
  workspaceId: string;
}

export interface MemberPortalContext {
  session: MemberSession;
  workspace: MemberWorkspaceRecord & {
    location: NonNullable<MemberWorkspaceRecord["location"]>;
  };
  location: NonNullable<MemberWorkspaceRecord["location"]>;
  member: MemberIdentityRecord;
}

const memberPortalDatabase = prisma as unknown as MemberPortalDatabase;

export async function getMemberSessionOrNull(): Promise<AppSession | null> {
  const cookieStore = await cookies();

  return getSession({
    cookieStore,
    cookieName: MEMBER_SESSION_COOKIE_NAME,
  });
}

export async function redirectAuthenticatedMember(): Promise<void> {
  const session = await getMemberSessionOrNull();

  if (session) {
    redirect("/app");
  }
}

export async function requireMemberPortalContext(args?: {
  db?: MemberPortalDatabase;
}): Promise<MemberPortalContext> {
  const session = await getMemberSessionOrNull();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "CUSTOMER" || !session.workspaceId) {
    redirect("/unauthorized");
  }

  const db = args?.db ?? memberPortalDatabase;
  const [workspace, member] = await Promise.all([
    db.workspace.findUnique({
      where: {
        id: session.workspaceId,
      },
      include: {
        location: true,
        migration: {
          select: {
            stage: true,
            ownerReviewAcknowledgedAt: true,
            ownerReviewAcknowledgedByUserId: true,
            operationallyReadyAt: true,
            operationallyReadyByUserId: true,
          },
        },
      },
    }),
    db.member.findFirst({
      where: {
        workspaceId: session.workspaceId,
        userId: session.userId,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
      },
    }),
  ]);

  if (!workspace?.location || !member) {
    redirect("/unauthorized");
  }

  if (
    !isWorkspaceMigrationReady({
      workspaceStatus: workspace.status,
      migrationStage: workspace.migration?.stage,
      ownerReviewAcknowledgedAt:
        workspace.migration?.ownerReviewAcknowledgedAt,
      ownerReviewAcknowledgedByUserId:
        workspace.migration?.ownerReviewAcknowledgedByUserId,
      operationallyReadyAt: workspace.migration?.operationallyReadyAt,
      operationallyReadyByUserId:
        workspace.migration?.operationallyReadyByUserId,
    })
  ) {
    redirect("/unauthorized");
  }

  return {
    session: session as MemberSession,
    workspace: {
      ...workspace,
      location: workspace.location,
    },
    location: workspace.location,
    member,
  };
}
