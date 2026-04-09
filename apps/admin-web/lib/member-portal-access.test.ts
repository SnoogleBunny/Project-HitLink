import { describe, expect, it, vi } from "vitest";
import {
  createMemberPortalAccess,
  resetMemberPortalPassword,
} from "./member-portal-access";

type PortalAccessTestDb = NonNullable<
  Parameters<typeof createMemberPortalAccess>[0]["db"]
>;

function createMockDb(): PortalAccessTestDb {
  return {
    member: {
      findFirst: vi.fn().mockResolvedValue({
        id: "member_1",
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        userId: null,
        user: null,
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: "user_1",
      }),
      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },
    workspaceUser: {
      create: vi.fn().mockResolvedValue({
        id: "workspace_user_1",
      }),
    },
    $transaction: vi.fn(async (callback) =>
      callback({
        user: {
          create: vi.fn().mockResolvedValue({
            id: "user_1",
          }),
          updateMany: vi.fn().mockResolvedValue({
            count: 1,
          }),
        },
        workspaceUser: {
          create: vi.fn().mockResolvedValue({
            id: "workspace_user_1",
          }),
        },
        member: {
          updateMany: vi.fn().mockResolvedValue({
            count: 1,
          }),
        },
      }),
    ),
  };
}

describe("member portal access helpers", () => {
  it("creates a linked customer user for a member without portal access", async () => {
    const db = createMockDb();

    await expect(
      createMemberPortalAccess({
        workspaceId: "workspace_1",
        memberId: "member_1",
        password: "member-pass-123",
        db,
      }),
    ).resolves.toEqual({
      status: "created",
      userId: "user_1",
    });

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: {
        email: "jordan@example.com",
      },
      select: {
        id: true,
      },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects portal provisioning when the member is missing an email or another user already owns it", async () => {
    const db = createMockDb();
    db.member.findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "member_1",
        fullName: "Jordan Lee",
        email: null,
        userId: null,
        user: null,
      })
      .mockResolvedValueOnce({
        id: "member_1",
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        userId: null,
        user: null,
      });
    db.user.findUnique = vi.fn().mockResolvedValue({
      id: "user_existing",
    });

    await expect(
      createMemberPortalAccess({
        workspaceId: "workspace_1",
        memberId: "member_1",
        password: "member-pass-123",
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Add an email address before creating portal access.",
    });

    await expect(
      createMemberPortalAccess({
        workspaceId: "workspace_1",
        memberId: "member_1",
        password: "member-pass-123",
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "That email already belongs to another user.",
    });
  });

  it("resets the password only when a member is already linked to a user", async () => {
    const db = createMockDb();
    db.member.findFirst = vi
      .fn()
      .mockResolvedValueOnce({
        id: "member_1",
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        userId: null,
        user: null,
      })
      .mockResolvedValueOnce({
        id: "member_1",
        fullName: "Jordan Lee",
        email: "jordan@example.com",
        userId: "user_1",
        user: {
          id: "user_1",
          email: "jordan@example.com",
        },
      });

    await expect(
      resetMemberPortalPassword({
        workspaceId: "workspace_1",
        memberId: "member_1",
        password: "member-pass-123",
        db,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Portal access has not been created for this member yet.",
    });

    await expect(
      resetMemberPortalPassword({
        workspaceId: "workspace_1",
        memberId: "member_1",
        password: "member-pass-123",
        db,
      }),
    ).resolves.toEqual({
      status: "reset",
      userId: "user_1",
    });
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: "user_1",
      },
      data: {
        passwordHash: expect.any(String),
      },
    });
  });
});
