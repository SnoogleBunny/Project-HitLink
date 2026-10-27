import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicAuthThrottleError } from "@flowstate/auth";

const {
  consumeMock,
  clearThrottleMock,
  cookiesMock,
  createSessionMock,
  prismaUserFindUniqueMock,
  redirectMock,
  verifyPasswordMock,
} = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  clearThrottleMock: vi.fn(),
  cookiesMock: vi.fn(),
  createSessionMock: vi.fn(),
  prismaUserFindUniqueMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  verifyPasswordMock: vi.fn(),
}));

vi.mock("@flowstate/auth", () => ({
  consumePublicAuthAttempt: consumeMock,
  clearSuccessfulPublicAuthLogin: clearThrottleMock,
  getPublicAuthNetworkIdentity: () => "unverified-network",
  PublicAuthThrottleError: class extends Error {},
  PUBLIC_AUTH_UNAVAILABLE_MESSAGE:
    "Account access is temporarily unavailable. Try again shortly.",
  createSession: createSessionMock,
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@flowstate/db", async () => {
  const actual =
    await vi.importActual<typeof import("@flowstate/db")>("@flowstate/db");

  return {
    ...actual,
    prisma: {
      user: {
        findUnique: prismaUserFindUniqueMock,
      },
    },
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: cookiesMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { emptyFormState } from "../../lib/admin-access";
import { loginAction } from "./actions";

const readyMigration: {
  stage: string;
  ownerReviewAcknowledgedAt: Date | null;
  ownerReviewAcknowledgedByUserId: string | null;
  operationallyReadyAt: Date | null;
  operationallyReadyByUserId: string | null;
} = {
  stage: "COMPLETE",
  ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
  ownerReviewAcknowledgedByUserId: "owner_1",
  operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
  operationallyReadyByUserId: "flowstate_operator_1",
};

function buildFormData() {
  const formData = new FormData();
  formData.set("email", "admin@example.com");
  formData.set("password", "admin-pass-123");

  return formData;
}

function buildAdminUser(args: {
  role: "OWNER" | "COACH";
  workspaceStatus?: "ACTIVE" | "SETUP_INCOMPLETE";
  migration?: typeof readyMigration | null;
}) {
  return {
    id: `${args.role.toLowerCase()}_1`,
    email: "admin@example.com",
    fullName: args.role === "OWNER" ? "Dana Owner" : "Casey Coach",
    passwordHash: "hash",
    workspaceUsers: [
      {
        workspaceId: "workspace_1",
        role: args.role,
        workspace: {
          status: args.workspaceStatus ?? "ACTIVE",
          migration:
            args.migration === undefined ? readyMigration : args.migration,
        },
      },
    ],
  };
}

describe("admin login action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSessionMock.mockReset().mockResolvedValue(undefined);
    consumeMock
      .mockReset()
      .mockResolvedValue({ accountKeyHash: "account-admission" });
    clearThrottleMock.mockReset().mockResolvedValue(undefined);
    cookiesMock.mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
    });
  });

  it("keeps the ready coach destination and creates the admin session", async () => {
    prismaUserFindUniqueMock.mockResolvedValue(
      buildAdminUser({ role: "COACH" }),
    );
    verifyPasswordMock.mockResolvedValue(true);

    await expect(loginAction(emptyFormState, buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/coach/today",
    );

    expect(prismaUserFindUniqueMock).toHaveBeenCalledWith({
      where: {
        email: "admin@example.com",
      },
      include: {
        workspaceUsers: {
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            workspaceId: true,
            role: true,
            workspace: {
              select: {
                status: true,
                setup: { select: { id: true } },
                setupActivation: true,
                migration: {
                  select: {
                    stage: true,
                    ownerReviewAcknowledgedAt: true,
                    ownerReviewAcknowledgedByUserId: true,
                    operationallyReadyAt: true,
                    operationallyReadyByUserId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(createSessionMock).toHaveBeenCalledWith({
      userId: "coach_1",
      cookieStore: expect.any(Object),
      expectedPasswordHash: "hash",
    });
  });

  it("routes a pre-ready owner session to migration", async () => {
    prismaUserFindUniqueMock.mockResolvedValue(
      buildAdminUser({
        role: "OWNER",
        workspaceStatus: "SETUP_INCOMPLETE",
        migration: {
          ...readyMigration,
          stage: "GO_LIVE_SCHEDULED",
          operationallyReadyAt: null,
          operationallyReadyByUserId: null,
        },
      }),
    );
    verifyPasswordMock.mockResolvedValue(true);

    await expect(loginAction(emptyFormState, buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/migration",
    );

    expect(createSessionMock).toHaveBeenCalledWith({
      userId: "owner_1",
      cookieStore: expect.any(Object),
      expectedPasswordHash: "hash",
    });
  });

  it("rejects a pre-ready coach before obtaining cookies or creating a session", async () => {
    prismaUserFindUniqueMock.mockResolvedValue(
      buildAdminUser({
        role: "COACH",
        workspaceStatus: "SETUP_INCOMPLETE",
        migration: null,
      }),
    );
    verifyPasswordMock.mockResolvedValue(true);

    await expect(loginAction(emptyFormState, buildFormData())).resolves.toEqual(
      {
        error: "This workspace is not ready for operations yet.",
      },
    );

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("verifies credentials before returning the workspace readiness error", async () => {
    prismaUserFindUniqueMock.mockResolvedValue(
      buildAdminUser({
        role: "COACH",
        workspaceStatus: "SETUP_INCOMPLETE",
        migration: null,
      }),
    );
    verifyPasswordMock.mockResolvedValue(false);

    await expect(loginAction(emptyFormState, buildFormData())).resolves.toEqual(
      {
        error: "Invalid email or password.",
      },
    );

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("preserves onboarding login for an owner account without a workspace", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "owner_without_workspace",
      email: "admin@example.com",
      fullName: "New Owner",
      passwordHash: "hash",
      workspaceUsers: [],
    });
    verifyPasswordMock.mockResolvedValue(true);

    await expect(loginAction(emptyFormState, buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );

    expect(createSessionMock).toHaveBeenCalledWith({
      userId: "owner_without_workspace",
      cookieStore: expect.any(Object),
      expectedPasswordHash: "hash",
    });
  });
  it("fails closed if a password reset wins before session creation", async () => {
    prismaUserFindUniqueMock.mockResolvedValue(
      buildAdminUser({ role: "OWNER" }),
    );
    verifyPasswordMock.mockResolvedValue(true);
    createSessionMock.mockRejectedValueOnce(new Error("Password changed"));
    expect(await loginAction(emptyFormState, buildFormData())).toEqual({
      error: expect.stringContaining("current password"),
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
  it("denies persistent cooldown before account lookup, bcrypt or session creation", async () => {
    consumeMock.mockRejectedValue(
      new PublicAuthThrottleError(
        "Too many attempts. Wait a little and try again.",
      ),
    );
    expect(await loginAction(emptyFormState, buildFormData())).toEqual({
      error: "Too many attempts. Wait a little and try again.",
    });
    expect(consumeMock).toHaveBeenCalledWith({
      email: "admin@example.com",
      action: "login",
      portal: "admin",
      networkIdentity: "unverified-network",
    });
    expect(prismaUserFindUniqueMock).not.toHaveBeenCalled();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(clearThrottleMock).not.toHaveBeenCalled();
  });
  it("accepts a clean setup activation receipt without inventing a migration", async () => {
    const receipt = {
      ownerUserId: "owner",
      snapshotHash: "a".repeat(64),
      ownerVerifiedAt: new Date("2026-10-26T10:00:00Z"),
      activatedAt: new Date("2026-10-26T10:01:00Z"),
    };
    const user = buildAdminUser({ role: "COACH", migration: null });
    prismaUserFindUniqueMock.mockResolvedValue({
      ...user,
      workspaceUsers: [
        {
          ...user.workspaceUsers[0]!,
          workspace: {
            status: "ACTIVE",
            migration: null,
            setupActivation: receipt,
          },
        },
      ],
    });
    verifyPasswordMock.mockResolvedValue(true);
    await expect(loginAction(emptyFormState, buildFormData())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard/coach/today",
    );
    expect(clearThrottleMock).toHaveBeenCalledWith({
      accountKeyHash: "account-admission",
    });
  });
});
