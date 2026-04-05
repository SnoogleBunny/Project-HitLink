import { prisma, type WorkspaceStatus } from "@hitlink/db";
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
}

export interface OwnerWorkspaceContext {
  session: OwnerSession;
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
  const workspace = await db.workspace.findUnique({
    where: {
      id: ownerSession.workspaceId,
    },
    include: {
      location: true,
      settings: true,
    },
  });

  if (!workspace?.location) {
    redirect("/onboarding");
  }

  return {
    session: ownerSession,
    workspace: {
      ...workspace,
      location: workspace.location,
    },
    location: workspace.location,
  };
}
