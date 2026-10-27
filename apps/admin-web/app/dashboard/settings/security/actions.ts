"use server";
import {
  clearSessionCookie,
  MEMBER_SESSION_COOKIE_NAME,
  revokeAllAccountSessions,
} from "@flowstate/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdminAccountContext } from "../../../../lib/account-security-context";
export async function signOutAllAction(form: FormData) {
  const context = await requireAdminAccountContext();
  if (form.get("confirm") !== "on")
    redirect("/dashboard/settings/security?error=confirm");
  try {
    await revokeAllAccountSessions({
      userId: context.session.userId,
      portal: "admin",
    });
  } catch {
    redirect("/dashboard/settings/security?error=retry");
  }
  const store = await cookies();
  clearSessionCookie(store);
  clearSessionCookie(store, { cookieName: MEMBER_SESSION_COOKIE_NAME });
  redirect("/login?signedOut=all");
}
