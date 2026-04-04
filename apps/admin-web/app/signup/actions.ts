"use server";

import { createSession, hashPassword } from "@hitlink/auth";
import { prisma } from "@hitlink/db";
import { cookies } from "next/headers";
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

  if (password.length < 8) {
    return {
      error: "Password must be at least 8 characters.",
    };
  }

  if (password !== confirmPassword) {
    return {
      error: "Passwords do not match.",
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
