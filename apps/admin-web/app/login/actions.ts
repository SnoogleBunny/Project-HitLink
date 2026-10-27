"use server";
import {
  consumePublicAuthAttempt,
  clearSuccessfulPublicAuthLogin,
  getPublicAuthNetworkIdentity,
  PublicAuthThrottleError,
  PUBLIC_AUTH_UNAVAILABLE_MESSAGE,
} from "@flowstate/auth";

import { createSession, verifyPassword } from "@flowstate/auth";
import { isWorkspaceOperationallyReady, prisma } from "@flowstate/db";
import { cookies, headers } from "next/headers";
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

  let admission: Awaited<ReturnType<typeof consumePublicAuthAttempt>>;
  try {
    admission = await consumePublicAuthAttempt({
      email,
      action: "login",
      portal: "admin",
      networkIdentity: getPublicAuthNetworkIdentity(await headers()),
    });
  } catch (error) {
    return {
      error:
        error instanceof PublicAuthThrottleError
          ? error.message
          : PUBLIC_AUTH_UNAVAILABLE_MESSAGE,
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
              setup: { select: { id: true } },
              setupActivation: true,
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
    ? isWorkspaceOperationallyReady({
        workspaceStatus: membership.workspace.status,
        setupActivation: membership.workspace.setupActivation,
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

  try {
    await createSession({
      userId: user.id,
      cookieStore,
      expectedPasswordHash: user.passwordHash,
    });
  } catch {
    return {
      error:
        "Your sign-in could not be confirmed. Try again with your current password.",
    };
  }

  // A successful password/session boundary resets only the account quota.
  // Network admission remains bounded even for successful automation.
  await clearSuccessfulPublicAuthLogin(admission).catch(() => {});

  if (membership?.role === "OWNER" && !workspaceIsReady) {
    redirect(
      membership.workspace.setup ? "/dashboard/setup" : "/dashboard/migration",
    );
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
