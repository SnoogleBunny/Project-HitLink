"use server";

import {
  createSession,
  MEMBER_SESSION_COOKIE_NAME,
  verifyPassword,
} from "@flowstate/auth";
import { prisma } from "@flowstate/db";
import { cookies } from "next/headers";
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

  const cookieStore = await cookies();

  await createSession({
    userId: user.id,
    cookieStore,
    cookieName: MEMBER_SESSION_COOKIE_NAME,
  });

  redirect("/app");

  return emptyMemberLoginFormState;
}
