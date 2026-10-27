import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicAuthThrottleError } from "@flowstate/auth";
const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  start: vi.fn(),
  find: vi.fn(),
  hash: vi.fn(),
  verify: vi.fn(),
  identity: vi.fn(),
  jar: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => mocks.jar,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@flowstate/auth", async () => ({
  validateNewPassword: (await vi.importActual<typeof import("@flowstate/auth")>("@flowstate/auth")).validateNewPassword,
  consumePublicAuthAttempt: mocks.consume,
  clearSuccessfulPublicAuthLogin: vi.fn().mockResolvedValue(undefined),
  getPublicAuthNetworkIdentity: () => "unverified-network",
  PublicAuthThrottleError: class extends Error {},
  createSession: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
  hashPassword: mocks.hash,
  verifyPassword: mocks.verify,
  MEMBER_SESSION_COOKIE_NAME: "member",
}));
vi.mock("@flowstate/db", async () => ({
  PrismaClient: (await vi.importActual<typeof import("@prisma/client")>("@prisma/client")).PrismaClient,
  FinancialError: class extends Error {},
  PublicEnrollmentError: class extends Error {},
  getPublishedGymWebsite: vi
    .fn()
    .mockResolvedValue({ workspaceId: "published-gym" }),
  getPublicEnrollment: vi
    .fn()
    .mockResolvedValue({
      id: "enrollment",
      kind: "TRIAL",
      email: "verified@example.test",
      verifiedAt: new Date(),
    }),
  startPublicEnrollment: mocks.start,
  preparePublicEnrollmentIdentity: mocks.identity,
  prisma: { user: { findUnique: mocks.find } },
  acceptPublicMembershipTerms: vi.fn(),
  getPublicEnrollmentForms: vi.fn(),
  readPublicParticipant: vi.fn().mockReturnValue({}),
  verifyPublicEnrollment: vi.fn(),
  completeVerifiedTrial: vi.fn(),
}));
vi.mock("@flowstate/payments", () => ({
  startPublicMembershipCheckout: vi.fn(),
  resumePublicMembershipCheckout: vi.fn(),
}));
vi.mock("../../../lib/gym-website", () => ({
  publicMemberOrigin: () => "http://localhost",
}));
import { publicRegistrationAction } from "./registration-actions";
const form = (step: string) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    slug: "fictional-gym",
    kind: "TRIAL",
    step,
    email: "new@example.test",
    password: "fictional-password",
  }))
    data.set(key, value);
  return data;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.consume.mockReset().mockResolvedValue({ accountKeyHash: "account" });
  mocks.jar.get.mockReturnValue({ value: "registration-token" });
  mocks.start.mockResolvedValue({ token: "opaque-registration-token" });
});
describe("public member registration authentication admission", () => {
  it("throttles public signup before creating an enrollment or verification email", async () => {
    mocks.consume.mockRejectedValue(
      new PublicAuthThrottleError("Too many attempts."),
    );
    expect(
      await publicRegistrationAction({ error: null }, form("start")),
    ).toEqual({ error: "Too many attempts." });
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
  });
  it("guards the verified account/password step before lookup, bcrypt or identity changes", async () => {
    mocks.consume.mockRejectedValue(
      new PublicAuthThrottleError("Too many attempts."),
    );
    expect(
      await publicRegistrationAction({ error: null }, form("account")),
    ).toEqual({ error: "Too many attempts." });
    expect(mocks.consume).toHaveBeenCalledWith({
      email: "verified@example.test",
      action: "login",
      portal: "member",
      networkIdentity: "unverified-network",
    });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it("preserves public signup for admitted requests", async () => {
    expect(
      await publicRegistrationAction({ error: null }, form("start")),
    ).toEqual({ error: null });
    expect(mocks.consume).toHaveBeenCalledWith({
      email: "new@example.test",
      action: "signup",
      portal: "member",
      networkIdentity: "unverified-network",
    });
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.jar.set).toHaveBeenCalled();
  });
});

describe("public registration new-password policy", () => {
  beforeEach(() => {
    mocks.find.mockReset().mockResolvedValue(null);
    mocks.hash.mockReset().mockResolvedValue("new-password-hash");
    mocks.verify.mockReset().mockResolvedValue(true);
    mocks.identity.mockReset().mockResolvedValue({ userId: "account", memberId: "person", reviewRequired: false });
  });

  it.each([
    ["Unicode code points", "🔐".repeat(6), "Use at least 12 characters for your password."],
    ["UTF-8 bytes", "🔐".repeat(19), "Use a password of 72 bytes or fewer; accented characters and emoji can use more than one byte."],
  ])("rejects invalid %s before preparing a new identity", async (_label, password, error) => {
    const data = form("account");
    data.set("password", password);
    expect(await publicRegistrationAction({ error: null }, data)).toEqual({ error });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.identity).not.toHaveBeenCalled();
  });

  it("preserves original password bytes for a new account", async () => {
    const password = "  fictional-member-secret  ";
    const data = form("account");
    data.set("password", password);
    expect(await publicRegistrationAction({ error: null }, data)).toEqual({ error: null });
    expect(mocks.hash).toHaveBeenCalledWith(password);
  });

  it("verifies an existing short legacy password without applying new-password policy", async () => {
    mocks.find.mockResolvedValue({ id: "existing", passwordHash: "existing-hash" });
    const data = form("account");
    data.set("password", "old-pass");
    expect(await publicRegistrationAction({ error: null }, data)).toEqual({ error: null });
    expect(mocks.verify).toHaveBeenCalledWith("old-pass", "existing-hash");
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.identity).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "existing", passwordHash: undefined }));
  });
});
