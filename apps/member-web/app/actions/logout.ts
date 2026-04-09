"use server";

import { deleteSession, MEMBER_SESSION_COOKIE_NAME } from "@hitlink/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logoutAction() {
  const cookieStore = await cookies();

  await deleteSession({
    cookieStore,
    cookieName: MEMBER_SESSION_COOKIE_NAME,
  });

  redirect("/login");
}
