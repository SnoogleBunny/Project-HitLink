import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, getSessionMock, getSessionWithReferenceMock, redirectMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getSessionMock: vi.fn(),
  getSessionWithReferenceMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("@flowstate/auth", () => ({
  MEMBER_SESSION_COOKIE_NAME: "flowstate_member_session",
  getSession: getSessionMock,
  getSessionWithReference: getSessionWithReferenceMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { requireMemberCommandContext, requireMemberPortalContext } from "./member-auth";

const readyMigration = {
  stage: "COMPLETE",
  ownerReviewAcknowledgedAt: new Date("2026-07-25T12:00:00.000Z"),
  ownerReviewAcknowledgedByUserId: "owner_1",
  operationallyReadyAt: new Date("2026-07-25T12:05:00.000Z"),
  operationallyReadyByUserId: "flowstate_operator_1",
};

describe("verified family account boundaries", () => {
  const parent = {
    id: "parent",
    fullName: "Parent",
    email: "parent@example.test",
    status: "ACTIVE" as const,
  };
  const child = {
    id: "child",
    workspaceId: "gym",
    fullName: "Child",
    email: null,
    status: "ACTIVE" as const,
  };
  function fixture() {
    const grant = {
      id: "grant",
      workspaceId: "gym",
      userId: "parent_user",
      memberId: "child",
      guardianId: "guardian",
      verifiedAt: new Date(),
      revokedAt: null as Date | null,
      canBook: true,
      canSign: false,
      canPay: false,
      member: child,
      guardian: {
        workspaceId: "gym",
        familyLinks: [{ workspaceId: "gym", childMemberId: "child" }],
      },
    };
    return {
      grant,
      db: {
        workspace: {
          findUnique: vi
            .fn()
            .mockResolvedValue({
              id: "gym",
              name: "Gym",
              status: "ACTIVE",
              migration: readyMigration,
              location: {
                id: "location",
                name: "Gym",
                timezone: "America/Vancouver",
              },
            }),
        },
        member: { findFirst: vi.fn().mockResolvedValue(parent) },
        memberPortalGrant: {
          findMany: vi.fn().mockImplementation(async () => [grant]),
        },
      },
    };
  }
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      userId: "parent_user",
      workspaceId: "gym",
      email: parent.email,
      displayName: "Parent",
      role: "CUSTOMER",
    });
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "gym:child" }),
      set: vi.fn(),
    });
  });
  it("uses one authentic session reference and keeps it outside the rendered context", async () => {
    const { db } = fixture();
    const session = { userId: "parent_user", workspaceId: "gym", email: parent.email, displayName: "Parent", role: "CUSTOMER" };
    getSessionWithReferenceMock.mockResolvedValue({ session, currentSession: { id: "actual-stored-session", userId: session.userId } });
    const result = await requireMemberCommandContext({ db, permission: "book", memberId: "child" });
    expect(result.actor).toEqual({ userId: "parent_user", sessionId: "actual-stored-session" });
    expect(result.context.member.id).toBe("child");
    expect(result.context.session).toEqual(session);
    expect(JSON.stringify(result.context)).not.toContain("actual-stored-session");
    expect(getSessionWithReferenceMock).toHaveBeenCalledTimes(1);
    expect(getSessionMock).not.toHaveBeenCalled();
  });
  it("does not substitute a display session when the command session is missing", async () => {
    const { db } = fixture();
    getSessionWithReferenceMock.mockResolvedValue(null);
    await expect(requireMemberCommandContext({ db, permission: "book", memberId: "child" })).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(db.member.findFirst).not.toHaveBeenCalled();
  });
  it("rejects a reference for a different authenticated account", async () => {
    const { db } = fixture();
    getSessionWithReferenceMock.mockResolvedValue({ session: { userId: "parent_user", workspaceId: "gym", role: "CUSTOMER" }, currentSession: { id: "foreign-session", userId: "other_user" } });
    await expect(requireMemberCommandContext({ db, permission: "book", memberId: "child" })).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
  });
  it("selects the child with an explicit booking grant and preserves the payer identity", async () => {
    const { db } = fixture();
    const context = await requireMemberPortalContext({
      db,
      permission: "book",
    });
    expect(context.member.id).toBe("child");
    expect(context.accountMember?.id).toBe("parent");
    expect(context.permissions).toMatchObject({
      canBook: true,
      canSign: false,
      canPay: false,
      guardianId: "guardian",
    });
  });
  it("keeps account/payment scope on the signed-in adult despite a selected child", async () => {
    const { db } = fixture();
    const context = await requireMemberPortalContext({
      db,
      scope: "account",
      permission: "pay",
    });
    expect(context.member.id).toBe("parent");
    expect(context.permissions?.grantId).toBeNull();
  });
  it.each(["sign", "pay"] as const)(
    "does not infer %s permission from booking permission",
    async (permission) => {
      const { db } = fixture();
      await expect(
        requireMemberPortalContext({ db, permission }),
      ).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
    },
  );
  it("rejects revoked access on a submitted booking instead of booking for the adult", async () => {
    const { db, grant } = fixture();
    grant.revokedAt = new Date();
    await expect(
      requireMemberPortalContext({ db, permission: "book" }),
    ).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
  });
  it("recovers a stale selected-person cookie safely on a read", async () => {
    const { db, grant } = fixture();
    grant.revokedAt = new Date();
    expect((await requireMemberPortalContext({ db })).member.id).toBe("parent");
  });
  it("does not authorize an arbitrary requested member", async () => {
    const { db } = fixture();
    await expect(
      requireMemberPortalContext({ db, memberId: "unknown" }),
    ).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
  });
  it("rejects cross-workspace grants even if a database adapter returns one", async () => {
    const { db, grant } = fixture();
    grant.workspaceId = "other-gym";
    await expect(
      requireMemberPortalContext({ db, memberId: "child", permission: "book" }),
    ).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
  });
  it("rejects a grant after its verified relationship is removed", async () => {
    const { db, grant } = fixture();
    grant.guardian.familyLinks = [];
    await expect(
      requireMemberPortalContext({ db, memberId: "child", permission: "book" }),
    ).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
  });
  it("never infers family access when only the adult member exists", async () => {
    const { db } = fixture();
    db.memberPortalGrant.findMany.mockResolvedValue([]);
    await expect(
      requireMemberPortalContext({ db, memberId: "child" }),
    ).rejects.toThrow("NEXT_REDIRECT:/unauthorized");
  });
});

describe("requireMemberPortalContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
    });
  });

  it("redirects unauthenticated users to the member login", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(requireMemberPortalContext()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
  });

  it("returns the linked member context for a customer session", async () => {
    getSessionMock.mockResolvedValue({
      userId: "user_1",
      email: "member@example.com",
      displayName: "Jordan Lee",
      workspaceId: "workspace_1",
      role: "CUSTOMER",
    });

    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_1",
          name: "Sahara Muay Thai",
          status: "ACTIVE",
          migration: readyMigration,
          location: {
            id: "location_1",
            name: "Main Gym",
            timezone: "America/Vancouver",
          },
        }),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue({
          id: "member_1",
          fullName: "Jordan Lee",
          email: "member@example.com",
          status: "ACTIVE",
        }),
      },
    };

    const context = await requireMemberPortalContext({ db });

    expect(context.member.id).toBe("member_1");
    expect(context.workspace.id).toBe("workspace_1");
  });

  it("redirects to unauthorized when the workspace is not operationally ready", async () => {
    getSessionMock.mockResolvedValue({
      userId: "user_1",
      email: "member@example.com",
      displayName: "Jordan Lee",
      workspaceId: "workspace_1",
      role: "CUSTOMER",
    });

    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_1",
          name: "Sahara Muay Thai",
          status: "SETUP_INCOMPLETE",
          migration: {
            ...readyMigration,
            stage: "GO_LIVE_SCHEDULED",
            operationallyReadyAt: null,
            operationallyReadyByUserId: null,
          },
          location: {
            id: "location_1",
            name: "Main Gym",
            timezone: "America/Vancouver",
          },
        }),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue({
          id: "member_1",
          fullName: "Jordan Lee",
          email: "member@example.com",
          status: "ACTIVE",
        }),
      },
    };

    await expect(requireMemberPortalContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });

  it("redirects to unauthorized when an otherwise valid member context has a null migration", async () => {
    getSessionMock.mockResolvedValue({
      userId: "user_1",
      email: "member@example.com",
      displayName: "Jordan Lee",
      workspaceId: "workspace_1",
      role: "CUSTOMER",
    });

    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_1",
          name: "Sahara Muay Thai",
          status: "ACTIVE",
          migration: null,
          location: {
            id: "location_1",
            name: "Main Gym",
            timezone: "America/Vancouver",
          },
        }),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue({
          id: "member_1",
          fullName: "Jordan Lee",
          email: "member@example.com",
          status: "ACTIVE",
        }),
      },
    };

    await expect(requireMemberPortalContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });

  it("allows a linked member after a complete clean-business activation without a migration", async () => {
    getSessionMock.mockResolvedValue({
      userId: "user_1",
      email: "member@example.com",
      workspaceId: "workspace_1",
      role: "CUSTOMER",
    });
    const workspace = {
      id: "workspace_1",
      name: "New business",
      status: "ACTIVE",
      migration: null,
      location: { id: "location_1", name: "Virtual", timezone: "UTC" },
      setupActivation: {
        ownerUserId: "owner_1",
        snapshotHash: "a".repeat(64),
        ownerVerifiedAt: new Date("2030-01-01T12:00:00Z"),
        activatedAt: new Date("2030-01-01T12:05:00Z"),
      },
    };
    const db = {
      workspace: { findUnique: vi.fn().mockResolvedValue(workspace) },
      member: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: "member_1",
            fullName: "Member",
            email: "member@example.com",
            status: "ACTIVE",
          }),
      },
    };
    expect((await requireMemberPortalContext({ db })).member.id).toBe(
      "member_1",
    );
    db.workspace.findUnique.mockResolvedValue({
      ...workspace,
      status: "SETUP_INCOMPLETE",
    });
    await expect(requireMemberPortalContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
    db.workspace.findUnique.mockResolvedValue({
      ...workspace,
      setupActivation: {
        ...workspace.setupActivation,
        snapshotHash: "unreviewed",
      },
    });
    await expect(requireMemberPortalContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });

  it("redirects to unauthorized when the runtime workspace adapter omits migration", async () => {
    getSessionMock.mockResolvedValue({
      userId: "user_1",
      email: "member@example.com",
      displayName: "Jordan Lee",
      workspaceId: "workspace_1",
      role: "CUSTOMER",
    });

    const runtimeWorkspaceWithoutMigration = {
      id: "workspace_1",
      name: "Sahara Muay Thai",
      status: "ACTIVE",
      location: {
        id: "location_1",
        name: "Main Gym",
        timezone: "America/Vancouver",
      },
    } as unknown as {
      id: string;
      name: string;
      status: string;
      migration: typeof readyMigration | null;
      location: {
        id: string;
        name: string;
        timezone: string;
      };
    };
    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue(runtimeWorkspaceWithoutMigration),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue({
          id: "member_1",
          fullName: "Jordan Lee",
          email: "member@example.com",
          status: "ACTIVE",
        }),
      },
    };

    expect("migration" in runtimeWorkspaceWithoutMigration).toBe(false);
    await expect(requireMemberPortalContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });

  it("redirects to unauthorized when the session is not linked to exactly one member", async () => {
    getSessionMock.mockResolvedValue({
      userId: "user_1",
      email: "member@example.com",
      displayName: "Jordan Lee",
      workspaceId: "workspace_1",
      role: "CUSTOMER",
    });

    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_1",
          name: "Sahara Muay Thai",
          status: "ACTIVE",
          location: {
            id: "location_1",
            name: "Main Gym",
            timezone: "America/Vancouver",
          },
        }),
      },
      member: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(requireMemberPortalContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });
});
