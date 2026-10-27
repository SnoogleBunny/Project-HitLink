"use server";

import {
  consumePublicAuthAttempt,
  getPublicAuthNetworkIdentity,
  PublicAuthThrottleError,
  PUBLIC_AUTH_UNAVAILABLE_MESSAGE,
  createSession,
  hashPassword,
  validateNewPassword,
} from "@flowstate/auth";
import { prisma } from "@flowstate/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../lib/admin-access";

export async function signupAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!fullName || !email || !password || !confirmPassword) {
    return {
      error: "Full name, email, and password are required.",
    };
  }

  if (!email.includes("@")) {
    return {
      error: "Enter a valid email address.",
    };
  }

  const passwordError = validateNewPassword(password);
  if (passwordError) {
    return {
      error: passwordError,
    };
  }

  if (password !== confirmPassword) {
    return {
      error: "Passwords do not match.",
    };
  }

  try {
    await consumePublicAuthAttempt({
      email,
      action: "signup",
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

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return {
      error: "That email already has an account.",
    };
  }

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: await hashPassword(password),
    },
    select: {
      id: true,
    },
  });

  const cookieStore = await cookies();

  await createSession({
    userId: user.id,
    cookieStore,
  });

  redirect("/onboarding");

  return emptyFormState;
}
