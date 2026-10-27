"use server";

import { AccountSecurityError, requestPasswordReset } from "@flowstate/auth";

export async function requestResetAction(
  _state: { error: string | null; message: string },
  form: FormData,
) {
  try {
    const result = await requestPasswordReset({
      email: String(form.get("email") ?? ""),
      portal: "member",
      resetOrigin:
        process.env.NEXT_PUBLIC_MEMBER_WEB_URL ??
        process.env.NEXT_PUBLIC_MEMBER_APP_URL ??
        "",
    });
    return { error: null, message: result.message };
  } catch (error) {
    return {
      error:
        error instanceof AccountSecurityError
          ? error.message
          : "Password recovery is temporarily unavailable. Try again later.",
      message: "",
    };
  }
}
