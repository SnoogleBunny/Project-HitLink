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
import { SELECTED_MEMBER_COOKIE, readMemberSelectionCookie } from "./member-selection-cookie";
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

export interface MemberIdentityRecord {
  id: string;
  fullName: string;
  email: string | null;
  status: MemberStatus;
}

interface PortalGrantRecord {
  id: string;
  workspaceId: string;
  userId: string;
  memberId: string;
  guardianId: string;
  verifiedAt: Date;
  revokedAt: Date | null;
  canBook: boolean;
  canSign: boolean;
  canPay: boolean;
  member: MemberIdentityRecord & { workspaceId: string };
  guardian: { workspaceId: string; familyLinks: Array<{ workspaceId: string; childMemberId: string }> };
}

export interface PortalPermissions {
  canBook: boolean;
  canSign: boolean;
  canPay: boolean;
  guardianId: string | null;
  grantId: string | null;
}

export { SELECTED_MEMBER_COOKIE } from "./member-selection-cookie";

interface MemberPortalDatabase {
  workspace: {
    findUnique(args: Record<string, unknown>): Promise<MemberWorkspaceRecord | null>;
  };
  member: {
    findFirst(args: Record<string, unknown>): Promise<MemberIdentityRecord | null>;
  };
  memberPortalGrant?: {
    findMany(args: Record<string, unknown>): Promise<PortalGrantRecord[]>;
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
  accountMember?: MemberIdentityRecord;
  authorizedMembers?: Array<Pick<MemberIdentityRecord, "id" | "fullName">>;
  permissions?: PortalPermissions;
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
  scope?: "member" | "account";
  memberId?: string;
  permission?: "view" | "book" | "sign" | "pay";
}): Promise<MemberPortalContext> {
  const session = await getMemberSessionOrNull();

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "CUSTOMER" || !session.workspaceId) {
    redirect("/unauthorized");
  }

  const db = args?.db ?? memberPortalDatabase;
  const [workspace, accountMember, grants] = await Promise.all([
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
    db.memberPortalGrant?.findMany({
      where: { workspaceId: session.workspaceId, userId: session.userId, revokedAt: null },
      include: {
        member: { select: { id: true, workspaceId: true, fullName: true, email: true, status: true } },
        guardian: { select: { workspaceId: true, familyLinks: { select: { workspaceId: true, childMemberId: true } } } },
      },
    }) ?? Promise.resolve([]),
  ]);

  if (!workspace?.location || !accountMember) {
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

  // Relationship records and similar email addresses never grant account access.
  const validGrants = grants.filter((grant) =>
    grant.workspaceId === workspace.id && grant.userId === session.userId &&
    !grant.revokedAt && Boolean(grant.verifiedAt) &&
    grant.member.workspaceId === workspace.id && grant.member.id === grant.memberId &&
    grant.guardian.workspaceId === workspace.id &&
    grant.guardian.familyLinks.some((link) => link.workspaceId === workspace.id && link.childMemberId === grant.memberId),
  );
  const authorizedMembers = [accountMember, ...validGrants.map((grant) => grant.member)]
    .filter((member, index, values) => values.findIndex((item) => item.id === member.id) === index)
    .map(({ id, fullName }) => ({ id, fullName }));
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SELECTED_MEMBER_COOKIE)?.value;
  const cookieMemberId = readMemberSelectionCookie(cookieValue, workspace.id);
  const selectedId = args?.scope === "account" ? accountMember.id : args?.memberId ?? cookieMemberId ?? accountMember.id;
  const grant = validGrants.find((item) => item.memberId === selectedId);
  const member = selectedId === accountMember.id ? accountMember : grant?.member;
  // Do not silently redirect a stale form to another person's account.
  if (!member && args?.memberId) redirect("/unauthorized");
  if (!member && args?.permission && args.permission !== "view") redirect("/unauthorized");
  const permissions: PortalPermissions = grant ? {
    canBook: grant.canBook, canSign: grant.canSign, canPay: grant.canPay,
    guardianId: grant.guardianId, grantId: grant.id,
  } : { canBook: true, canSign: true, canPay: true, guardianId: null, grantId: null };
  if (
    (args?.permission === "book" && !permissions.canBook) ||
    (args?.permission === "sign" && !permissions.canSign) ||
    (args?.permission === "pay" && !permissions.canPay)
  ) redirect("/unauthorized");

  return {
    session: session as MemberSession,
    workspace: {
      ...workspace,
      location: workspace.location,
    },
    location: workspace.location,
    member: member ?? accountMember,
    accountMember,
    authorizedMembers,
    permissions,
  };
}
