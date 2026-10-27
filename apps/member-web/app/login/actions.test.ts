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
  MEMBER_SESSION_COOKIE_NAME: "flowstate_member_session",
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

import { emptyMemberLoginFormState } from "../form-states";
import { loginAction } from "./actions";

const readyMigration = {
  stage: "COMPLETE",
  ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
  ownerReviewAcknowledgedByUserId: "owner_1",
  operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
  operationallyReadyByUserId: "flowstate_operator_1",
};

const readyWorkspace = {
  status: "ACTIVE",
  migration: readyMigration,
};

function buildFormData() {
  const formData = new FormData();
  formData.set("email", "member@example.com");
  formData.set("password", "member-pass-123");

  return formData;
}

describe("member login action", () => {
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

  it("creates a member session with the member cookie for linked customer accounts only", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "member@example.com",
      passwordHash: "hash",
      workspaceUsers: [
        {
          workspaceId: "workspace_1",
          role: "CUSTOMER",
          workspace: readyWorkspace,
        },
      ],
      member: {
        id: "member_1",
      },
    });
    verifyPasswordMock.mockResolvedValue(true);

    await expect(
      loginAction(emptyMemberLoginFormState, buildFormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/app");

    expect(createSessionMock).toHaveBeenCalledWith({
      userId: "user_1",
      cookieStore: expect.any(Object),
      cookieName: "flowstate_member_session",
      expectedPasswordHash: "hash",
    });
    expect(prismaUserFindUniqueMock).toHaveBeenCalledWith({
      where: {
        email: "member@example.com",
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
        member: {
          select: {
            id: true,
          },
        },
      },
    });
  });

  it("rejects account-shape errors before evaluating portal readiness", async () => {
    prismaUserFindUniqueMock
      .mockResolvedValueOnce({
        id: "user_owner",
        email: "member@example.com",
        passwordHash: "hash",
        workspaceUsers: [
          {
            workspaceId: "workspace_1",
            role: "OWNER",
            workspace: {
              status: "SETUP_INCOMPLETE",
              migration: null,
            },
          },
        ],
        member: null,
      })
      .mockResolvedValueOnce({
        id: "user_unlinked",
        email: "member@example.com",
        passwordHash: "hash",
        workspaceUsers: [
          {
            workspaceId: "workspace_1",
            role: "CUSTOMER",
            workspace: {
              status: "SETUP_INCOMPLETE",
              migration: null,
            },
          },
        ],
        member: null,
      });
    verifyPasswordMock.mockResolvedValue(true);

    await expect(
      loginAction(emptyMemberLoginFormState, buildFormData()),
    ).resolves.toEqual({
      error: "This login is only available for linked member accounts.",
    });

    await expect(
      loginAction(emptyMemberLoginFormState, buildFormData()),
    ).resolves.toEqual({
      error: "This login is only available for linked member accounts.",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("verifies credentials before returning the portal readiness error", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "member@example.com",
      passwordHash: "hash",
      workspaceUsers: [
        {
          workspaceId: "workspace_1",
          role: "CUSTOMER",
          workspace: {
            status: "SETUP_INCOMPLETE",
            migration: null,
          },
        },
      ],
      member: {
        id: "member_1",
      },
    });
    verifyPasswordMock.mockResolvedValue(false);

    await expect(
      loginAction(emptyMemberLoginFormState, buildFormData()),
    ).resolves.toEqual({
      error: "Invalid email or password.",
    });

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects a pre-ready linked member before obtaining cookies or creating a session", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "member@example.com",
      passwordHash: "hash",
      workspaceUsers: [
        {
          workspaceId: "workspace_1",
          role: "CUSTOMER",
          workspace: {
            status: "SETUP_INCOMPLETE",
            migration: {
              ...readyMigration,
              stage: "REVIEW_READY",
              operationallyReadyAt: null,
              operationallyReadyByUserId: null,
            },
          },
        },
      ],
      member: {
        id: "member_1",
      },
    });
    verifyPasswordMock.mockResolvedValue(true);

    await expect(
      loginAction(emptyMemberLoginFormState, buildFormData()),
    ).resolves.toEqual({
      error: "This member portal is not ready yet.",
    });

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
  it("fails closed if a password reset wins before session creation", async () => {
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "member@example.com",
      passwordHash: "hash",
      workspaceUsers: [
        {
          workspaceId: "workspace_1",
          role: "CUSTOMER",
          workspace: readyWorkspace,
        },
      ],
      member: { id: "member_1" },
    });
    verifyPasswordMock.mockResolvedValue(true);
    createSessionMock.mockRejectedValueOnce(new Error("Password changed"));
    expect(
      await loginAction(emptyMemberLoginFormState, buildFormData()),
    ).toEqual({ error: expect.stringContaining("current password") });
    expect(redirectMock).not.toHaveBeenCalled();
  });
  it("denies persistent cooldown before account lookup, bcrypt or session creation", async () => {
    consumeMock.mockRejectedValue(
      new PublicAuthThrottleError(
        "Too many attempts. Wait a little and try again.",
      ),
    );
    expect(
      await loginAction(emptyMemberLoginFormState, buildFormData()),
    ).toEqual({ error: "Too many attempts. Wait a little and try again." });
    expect(consumeMock).toHaveBeenCalledWith({
      email: "member@example.com",
      action: "login",
      portal: "member",
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
    prismaUserFindUniqueMock.mockResolvedValue({
      id: "member-account",
      email: "member@example.com",
      passwordHash: "hash",
      member: { id: "member" },
      workspaceUsers: [
        {
          workspaceId: "workspace",
          role: "CUSTOMER",
          workspace: {
            status: "ACTIVE",
            migration: null,
            setupActivation: receipt,
          },
        },
      ],
    });
    verifyPasswordMock.mockResolvedValue(true);
    await expect(
      loginAction(emptyMemberLoginFormState, buildFormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/app");
    expect(clearThrottleMock).toHaveBeenCalledWith({
      accountKeyHash: "account-admission",
    });
  });
});
