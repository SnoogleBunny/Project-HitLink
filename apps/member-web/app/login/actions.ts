"use server";
import {
  consumePublicAuthAttempt,
  clearSuccessfulPublicAuthLogin,
  getPublicAuthNetworkIdentity,
  PublicAuthThrottleError,
  PUBLIC_AUTH_UNAVAILABLE_MESSAGE,
} from "@flowstate/auth";

import {
  createSession,
  MEMBER_SESSION_COOKIE_NAME,
  verifyPassword,
} from "@flowstate/auth";
import { isWorkspaceOperationallyReady, prisma } from "@flowstate/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  emptyMemberLoginFormState,
  type MemberLoginFormState,
} from "../form-states";

export async function loginAction(
  _previousState: MemberLoginFormState,
  formData: FormData,
): Promise<MemberLoginFormState> {
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
      portal: "member",
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
      member: {
        select: {
          id: true,
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

  if (
    user.workspaceUsers.length !== 1 ||
    membership?.role !== "CUSTOMER" ||
    !membership.workspaceId ||
    !user.member
  ) {
    return {
      error: "This login is only available for linked member accounts.",
    };
  }

  if (
    !isWorkspaceOperationallyReady({
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
  ) {
    return {
      error: "This member portal is not ready yet.",
    };
  }

  const cookieStore = await cookies();

  try {
    await createSession({
      userId: user.id,
      cookieStore,
      cookieName: MEMBER_SESSION_COOKIE_NAME,
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

  redirect("/app");

  return emptyMemberLoginFormState;
}
