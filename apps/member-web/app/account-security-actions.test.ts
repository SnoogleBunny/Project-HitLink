import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  reset: vi.fn(),
  revoke: vi.fn(),
  clear: vi.fn(),
  cookies: vi.fn(),
  context: vi.fn(),
  SecurityError: class extends Error {},
  redirect: vi.fn((url: string) => {
    throw Error(`redirect:${url}`);
  }),
}));
vi.mock("@flowstate/auth", () => ({
  AccountSecurityError: mocks.SecurityError,
  requestPasswordReset: mocks.request,
  resetPassword: mocks.reset,
  revokeAllAccountSessions: mocks.revoke,
  clearSessionCookie: mocks.clear,
  MEMBER_SESSION_COOKIE_NAME: "member-cookie",
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../lib/member-auth", () => ({
  requireMemberPortalContext: mocks.context,
}));
import { requestResetAction } from "./forgot-password/actions";
import { resetPasswordAction } from "./reset-password/actions";
import { signOutAllAction } from "./app/account/security-actions";
const store = { set: vi.fn() };
const form = (values: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
};
const newPassword = "correct-new-password-2030";
const resetForm = () =>
  form({
    email: "person@example.test",
    token: "t".repeat(43),
    password: newPassword,
    confirmPassword: newPassword,
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_MEMBER_WEB_URL", "http://localhost:3001");
  mocks.cookies.mockResolvedValue(store);
  mocks.context.mockResolvedValue({ session: { userId: "current-user" } });
  mocks.redirect.mockImplementation((url: string) => {
    throw Error(`redirect:${url}`);
  });
});
describe("member account security actions", () => {
  it("uses the configured portal origin, ignoring posted redirect origins", async () => {
    mocks.request.mockResolvedValue({
      message: "If an account matches, a reset email has been requested.",
    });
    const result = await requestResetAction(
      { error: null, message: "" },
      form({
        email: "person@example.test",
        resetOrigin: "https://attacker.example",
        origin: "https://attacker.example",
      }),
    );
    expect(result).toEqual({
      error: null,
      message: "If an account matches, a reset email has been requested.",
    });
    expect(mocks.request).toHaveBeenCalledWith({
      email: "person@example.test",
      portal: "member",
      resetOrigin: "http://localhost:3001",
    });
  });
  it("does not report a request as successful when recovery fails", async () => {
    mocks.request.mockRejectedValue(Error("private provider detail"));
    expect(
      await requestResetAction(
        { error: null, message: "" },
        form({ email: "person@example.test" }),
      ),
    ).toEqual({
      error: "Password recovery is temporarily unavailable. Try again later.",
      message: "",
    });
  });
  it("rejects a mismatched confirmation without consuming the reset link", async () => {
    const input = resetForm();
    input.set("confirmPassword", "different-password");
    expect(
      await resetPasswordAction({ error: null, complete: false }, input),
    ).toEqual({ error: "Enter the same new password twice.", complete: false });
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("keeps cookies on an expired, invalid or reused reset link", async () => {
    mocks.reset.mockResolvedValue({
      status: "invalid",
      message: "This reset link is invalid or expired. Request a new link.",
    });
    expect(
      await resetPasswordAction({ error: null, complete: false }, resetForm()),
    ).toMatchObject({
      complete: false,
      error: expect.stringContaining("invalid or expired"),
    });
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("clears both local portal cookies only after a committed password reset", async () => {
    mocks.reset.mockResolvedValue({ status: "reset" });
    expect(
      await resetPasswordAction({ error: null, complete: false }, resetForm()),
    ).toEqual({ complete: true, error: null });
    expect(mocks.reset).toHaveBeenCalledWith({
      email: "person@example.test",
      token: "t".repeat(43),
      password: newPassword,
    });
    expect(mocks.clear).toHaveBeenCalledWith(store);
    expect(mocks.clear).toHaveBeenCalledWith(store, {
      cookieName: "member-cookie",
    });
  });
  it("retains the current cookies if a password update fails", async () => {
    mocks.reset.mockRejectedValue(Error("transaction failed"));
    expect(
      await resetPasswordAction({ error: null, complete: false }, resetForm()),
    ).toMatchObject({ complete: false, error: expect.any(String) });
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation before revoking sessions", async () => {
    await expect(
      signOutAllAction(form({ userId: "another-user" })),
    ).rejects.toThrow("redirect:/app/account?error=confirm");
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("revokes the authenticated account, ignoring a forged posted account id", async () => {
    mocks.revoke.mockResolvedValue({ revokedSessionCount: 2 });
    await expect(
      signOutAllAction(form({ confirm: "on", userId: "another-user" })),
    ).rejects.toThrow("redirect:/login?signedOut=all");
    expect(mocks.revoke).toHaveBeenCalledWith({
      userId: "current-user",
      portal: "member",
    });
    expect(mocks.clear).toHaveBeenCalledWith(store);
    expect(mocks.clear).toHaveBeenCalledWith(store, {
      cookieName: "member-cookie",
    });
  });
  it("retains cookies and shows retry if global session revocation fails", async () => {
    mocks.revoke.mockRejectedValue(Error("database unavailable"));
    await expect(signOutAllAction(form({ confirm: "on" }))).rejects.toThrow(
      "redirect:/app/account?error=retry",
    );
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
