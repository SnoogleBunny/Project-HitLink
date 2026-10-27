import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicAuthThrottleError } from "@flowstate/auth";
const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  hash: vi.fn(),
  session: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@flowstate/auth", async () => ({
  validateNewPassword: (await vi.importActual<typeof import("@flowstate/auth")>("@flowstate/auth")).validateNewPassword,
  consumePublicAuthAttempt: mocks.consume,
  getPublicAuthNetworkIdentity: () => "unverified-network",
  PublicAuthThrottleError: class extends Error {},
  PUBLIC_AUTH_UNAVAILABLE_MESSAGE: "Account access is temporarily unavailable.",
  createSession: mocks.session,
  hashPassword: mocks.hash,
}));
vi.mock("@flowstate/db", async () => ({
  PrismaClient: (await vi.importActual<typeof import("@prisma/client")>("@prisma/client")).PrismaClient,
  prisma: { user: { findUnique: mocks.find, create: mocks.create } },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({}),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { signupAction } from "./actions";
const form = () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    fullName: "Fictional Owner",
    email: " OWNER@example.test ",
    password: "Fictional-password-2026!",
    confirmPassword: "Fictional-password-2026!",
  }))
    data.set(key, value);
  return data;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.consume.mockResolvedValue({ accountKeyHash: "account" });
  mocks.find.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: "new-account" });
  mocks.hash.mockResolvedValue("hashed-password");
});
describe("owner signup admission", () => {
  it("denies abuse before account enumeration, hashing or creation", async () => {
    mocks.consume.mockRejectedValue(
      new PublicAuthThrottleError("Too many attempts."),
    );
    expect(await signupAction({ error: null }, form())).toEqual({
      error: "Too many attempts.",
    });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("normalizes signup identity and retains the normal owner onboarding boundary", async () => {
    await expect(signupAction({ error: null }, form())).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
    expect(mocks.consume).toHaveBeenCalledWith({
      email: "owner@example.test",
      action: "signup",
      portal: "admin",
      networkIdentity: "unverified-network",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          email: "owner@example.test",
          fullName: "Fictional Owner",
          passwordHash: "hashed-password",
        },
      }),
    );
  });
  it("keeps limiter storage/configuration failures generic and closed", async () => {
    mocks.consume.mockRejectedValue(
      new Error("database state and private details"),
    );
    expect(await signupAction({ error: null }, form())).toEqual({
      error: "Account access is temporarily unavailable.",
    });
    expect(mocks.find).not.toHaveBeenCalled();
  });
});

describe("owner signup new-password policy", () => {
  it.each([
    ["short", "elevenchars", "Use at least 12 characters for your password."],
    ["Unicode code points", "🔐".repeat(6), "Use at least 12 characters for your password."],
    ["UTF-8 bytes", "🔐".repeat(19), "Use a password of 72 bytes or fewer; accented characters and emoji can use more than one byte."],
  ])("rejects invalid %s before hashing or creating an account", async (_label, password, error) => {
    const data = form();
    data.set("password", password);
    data.set("confirmPassword", password);
    expect(await signupAction({ error: null }, data)).toEqual({ error });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("hashes the exact original password bytes, including surrounding whitespace", async () => {
    const password = "  fictional-owner-secret  ";
    const data = form();
    data.set("password", password);
    data.set("confirmPassword", password);
    await expect(signupAction({ error: null }, data)).rejects.toThrow("REDIRECT:/onboarding");
    expect(mocks.hash).toHaveBeenCalledWith(password);
  });
});
