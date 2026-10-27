"use server";
import { AccountSecurityError, requestPasswordReset } from "@flowstate/auth";
export async function requestResetAction(
  _state: { error: string | null; message: string },
  form: FormData,
) {
  try {
    return {
      error: null,
      message: (
        await requestPasswordReset({
          email: String(form.get("email") ?? ""),
          portal: "admin",
          resetOrigin:
            process.env.NEXT_PUBLIC_APP_URL ??
            process.env.NEXT_PUBLIC_FLOWSTATE_APP_URL ??
            "",
        })
      ).message,
    };
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
