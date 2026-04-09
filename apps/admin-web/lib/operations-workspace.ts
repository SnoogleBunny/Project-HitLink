import { prisma, type UserRole, type WorkspaceStatus } from "@hitlink/db";
import { redirect } from "next/navigation";
import { getSessionOrNull, type OperationsSession } from "./admin-access";

interface OperationsWorkspaceRecord {
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

interface OperationsWorkspaceUserRecord {
  id: string;
  role: UserRole;
}

interface OperationsWorkspaceDatabase {
  workspace: {
    findUnique(args: {
      where: {
        id: string;
      };
      include: {
        location: true;
        settings: true;
      };
    }): Promise<OperationsWorkspaceRecord | null>;
  };
  workspaceUser: {
    findFirst(args: Record<string, unknown>): Promise<OperationsWorkspaceUserRecord | null>;
  };
}

export interface OperationsWorkspaceContext {
  session: OperationsSession;
  workspaceUserId: string;
  workspaceUserRole: "OWNER" | "COACH";
  workspace: OperationsWorkspaceRecord & {
    location: NonNullable<OperationsWorkspaceRecord["location"]>;
  };
  location: NonNullable<OperationsWorkspaceRecord["location"]>;
}

const operationsWorkspaceDatabase =
  prisma as unknown as OperationsWorkspaceDatabase;

export async function requireOperationsWorkspaceContext(args?: {
  db?: OperationsWorkspaceDatabase;
}): Promise<OperationsWorkspaceContext> {
  const session = await getSessionOrNull();

  if (!session) {
    redirect("/login");
  }

  if (
    !session.workspaceId ||
    (session.role !== "OWNER" && session.role !== "COACH")
  ) {
    redirect("/unauthorized");
  }

  const operationsSession = session as OperationsSession;
  const db = args?.db ?? operationsWorkspaceDatabase;
  const [workspace, workspaceUser] = await Promise.all([
    db.workspace.findUnique({
      where: {
        id: operationsSession.workspaceId,
      },
      include: {
        location: true,
        settings: true,
      },
    }),
    db.workspaceUser.findFirst({
      where: {
        userId: operationsSession.userId,
        workspaceId: operationsSession.workspaceId,
        isActive: true,
        role: {
          in: ["OWNER", "COACH"],
        },
      },
      select: {
        id: true,
        role: true,
      },
    }),
  ]);

  if (!workspace?.location) {
    redirect("/onboarding");
  }

  if (!workspaceUser || workspaceUser.role === "CUSTOMER") {
    redirect("/unauthorized");
  }

  return {
    session: operationsSession,
    workspaceUserId: workspaceUser.id,
    workspaceUserRole: workspaceUser.role,
    workspace: {
      ...workspace,
      location: workspace.location,
    },
    location: workspace.location,
  };
}
