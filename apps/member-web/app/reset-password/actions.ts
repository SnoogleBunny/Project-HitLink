"use server";

import {
  clearSessionCookie,
  MEMBER_SESSION_COOKIE_NAME,
  resetPassword,
} from "@flowstate/auth";
import { cookies } from "next/headers";

export async function resetPasswordAction(
  _state: { error: string | null; complete: boolean },
  form: FormData,
) {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirmPassword") ?? ""))
    return { error: "Enter the same new password twice.", complete: false };
  try {
    const result = await resetPassword({
      email: String(form.get("email") ?? ""),
      token: String(form.get("token") ?? ""),
      password,
    });
    if (result.status !== "reset")
      return { error: result.message, complete: false };
    const store = await cookies();
    clearSessionCookie(store);
    clearSessionCookie(store, { cookieName: MEMBER_SESSION_COOKIE_NAME });
    return { error: null, complete: true };
  } catch {
    return {
      error:
        "Your password change could not be confirmed. Try the link again or request a new one.",
      complete: false,
    };
  }
}
