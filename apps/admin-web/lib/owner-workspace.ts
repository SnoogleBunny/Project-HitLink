import { prisma, type WorkspaceStatus } from "@flowstate/db";
import { redirect } from "next/navigation";
import {
  getDashboardRouteDecision,
  getSessionOrNull,
  type OwnerSession,
} from "./admin-access";

interface OwnerWorkspaceRecord {
  id: string;
  name: string;
  businessType: string | null;
  status: WorkspaceStatus;
  location: {
    id: string;
    name: string;
    timezone: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    countryCode: string | null;
  } | null;
  settings: {
    allowMultipleRooms: boolean;
  } | null;
}

interface OwnerWorkspaceDatabase {
  workspace: {
    findUnique(args: {
      where: {
        id: string;
      };
      include: {
        location: true;
        settings: true;
      };
    }): Promise<OwnerWorkspaceRecord | null>;
  };
  workspaceUser: {
    findFirst(args: Record<string, unknown>): Promise<{ id: string } | null>;
  };
}

export interface OwnerWorkspaceContext {
  session: OwnerSession;
  workspaceUserId: string;
  workspace: OwnerWorkspaceRecord & {
    location: NonNullable<OwnerWorkspaceRecord["location"]>;
  };
  location: NonNullable<OwnerWorkspaceRecord["location"]>;
}

const ownerWorkspaceDatabase = prisma as unknown as OwnerWorkspaceDatabase;

export async function requireOwnerWorkspaceContext(args?: {
  db?: OwnerWorkspaceDatabase;
}): Promise<OwnerWorkspaceContext> {
  const session = await getSessionOrNull();
  const decision = getDashboardRouteDecision(session);

  if (decision.status === "redirect") {
    redirect(decision.location);
  }

  const ownerSession = session as OwnerSession;
  const db = args?.db ?? ownerWorkspaceDatabase;
  const [workspace, workspaceUser] = await Promise.all([
    db.workspace.findUnique({
      where: {
        id: ownerSession.workspaceId,
      },
      include: {
        location: true,
        settings: true,
      },
    }),
    db.workspaceUser.findFirst({
      where: {
        userId: ownerSession.userId,
        workspaceId: ownerSession.workspaceId,
        role: "OWNER",
        isActive: true,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!workspace?.location) {
    redirect("/onboarding");
  }

  if (!workspaceUser) {
    redirect("/unauthorized");
  }

  return {
    session: ownerSession,
    workspaceUserId: workspaceUser.id,
    workspace: {
      ...workspace,
      location: workspace.location,
    },
    location: workspace.location,
  };
}
