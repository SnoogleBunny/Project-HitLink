"use server";

import {
  clearSessionCookie,
  MEMBER_SESSION_COOKIE_NAME,
  revokeAllAccountSessions,
} from "@flowstate/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../lib/member-auth";

export async function signOutAllAction(form: FormData) {
  const context = await requireMemberPortalContext({ scope: "account" });
  if (form.get("confirm") !== "on") redirect("/app/account?error=confirm");
  try {
    await revokeAllAccountSessions({
      userId: context.session.userId,
      portal: "member",
    });
  } catch {
    redirect("/app/account?error=retry");
  }
  const store = await cookies();
  clearSessionCookie(store);
  clearSessionCookie(store, { cookieName: MEMBER_SESSION_COOKIE_NAME });
  redirect("/login?signedOut=all");
}
