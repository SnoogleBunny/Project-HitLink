"use server";

import { deleteSession } from "@hitlink/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logoutAction() {
  const cookieStore = await cookies();

  await deleteSession({
    cookieStore,
  });

  redirect("/login");
}
