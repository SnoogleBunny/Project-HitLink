"use server";

import { createSession, verifyPassword } from "@flowstate/auth";
import { isWorkspaceMigrationReady, prisma } from "@flowstate/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getHomeRouteDestination,
  type BasicFormState,
  emptyFormState,
} from "../../lib/admin-access";

export async function loginAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      error: "Email and password are required.",
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
    include: {
      workspaceUsers: {
        where: {
          isActive: true,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          workspaceId: true,
          role: true,
          workspace: {
            select: {
              status: true,
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
          },
        },
      },
    },
  });

  const isValidPassword = await verifyPassword(password, user?.passwordHash);

  if (!user || !isValidPassword) {
    return {
      error: "Invalid email or password.",
    };
  }

  const membership = user.workspaceUsers[0];
  const workspaceIsReady = membership
    ? isWorkspaceMigrationReady({
        workspaceStatus: membership.workspace.status,
        migrationStage: membership.workspace.migration?.stage,
        ownerReviewAcknowledgedAt:
          membership.workspace.migration?.ownerReviewAcknowledgedAt,
        ownerReviewAcknowledgedByUserId:
          membership.workspace.migration?.ownerReviewAcknowledgedByUserId,
        operationallyReadyAt:
          membership.workspace.migration?.operationallyReadyAt,
        operationallyReadyByUserId:
          membership.workspace.migration?.operationallyReadyByUserId,
      })
    : false;

  if (membership?.role === "COACH" && !workspaceIsReady) {
    return {
      error: "This workspace is not ready for operations yet.",
    };
  }

  const cookieStore = await cookies();

  await createSession({
    userId: user.id,
    cookieStore,
  });

  if (membership?.role === "OWNER" && !workspaceIsReady) {
    redirect("/dashboard/migration");
  }

  redirect(
    getHomeRouteDestination({
      userId: user.id,
      email: user.email,
      displayName: user.fullName?.trim() || user.email,
      workspaceId: membership?.workspaceId ?? null,
      role: membership?.role ?? null,
    }),
  );

  return emptyFormState;
}
