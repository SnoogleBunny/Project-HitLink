import { describe, expect, it, vi } from "vitest";
import {
  expireStalePendingStaffInvites,
  inviteCoachToWorkspace,
  resendPendingCoachInvite,
  revokePendingCoachInvite,
} from "./staff-invites";

describe("staff invite helpers", () => {
  it("expires stale pending invites through the shared helper", async () => {
    const db = {
      staffInvite: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({
          count: 2,
        }),
      },
    };
    const now = new Date("2026-04-05T10:00:00.000Z");

    await expect(
      expireStalePendingStaffInvites({
        workspaceId: "workspace_1",
        db,
        now,
      }),
    ).resolves.toBe(2);

    expect(db.staffInvite.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        status: "PENDING",
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: "EXPIRED",
      },
    });
  });

  it("creates a pending coach invite with a normalized email", async () => {
    const db = {
      staffInvite: {
        create: vi.fn(async () => ({
          id: "invite_1",
        })),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({
            count: 0,
          })
          .mockResolvedValueOnce({
            count: 1,
          }),
      },
    };
    const now = new Date("2026-04-05T10:00:00.000Z");

    await expect(
      inviteCoachToWorkspace({
        workspaceId: "workspace_1",
        invitedByUserId: "owner_1",
        email: "  Coach@Example.com ",
        db,
        now,
        tokenGenerator: () => "token_1",
      }),
    ).resolves.toEqual({
      status: "created",
      inviteId: "invite_1",
    });

    expect(db.staffInvite.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace_1",
        invitedByUserId: "owner_1",
        email: "coach@example.com",
        role: "COACH",
        token: "token_1",
        expiresAt: new Date("2026-04-12T10:00:00.000Z"),
      },
      select: {
        id: true,
      },
    });
  });

  it("refreshes the same pending invite when the normalized email already has a pending coach invite", async () => {
    const db = {
      staffInvite: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: "invite_1",
        }),
        findMany: vi.fn(),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({
            count: 0,
          })
          .mockResolvedValueOnce({
            count: 1,
          }),
      },
    };
    const now = new Date("2026-04-05T10:00:00.000Z");

    await expect(
      inviteCoachToWorkspace({
        workspaceId: "workspace_1",
        invitedByUserId: "owner_1",
        email: "coach@example.com",
        db,
        now,
        tokenGenerator: () => "token_2",
      }),
    ).resolves.toEqual({
      status: "refreshed",
      inviteId: "invite_1",
    });

    expect(db.staffInvite.findFirst).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace_1",
        email: "coach@example.com",
        role: "COACH",
        status: "PENDING",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
      },
    });
    expect(db.staffInvite.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "invite_1",
        workspaceId: "workspace_1",
        role: "COACH",
        status: "PENDING",
      },
      data: {
        invitedByUserId: "owner_1",
        token: "token_2",
        expiresAt: new Date("2026-04-12T10:00:00.000Z"),
      },
    });
  });

  it("resends a pending coach invite by rotating the token and expiry", async () => {
    const db = {
      staffInvite: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({
            count: 0,
          })
          .mockResolvedValueOnce({
            count: 1,
          }),
      },
    };
    const now = new Date("2026-04-05T10:00:00.000Z");

    await expect(
      resendPendingCoachInvite({
        workspaceId: "workspace_1",
        inviteId: "invite_1",
        invitedByUserId: "owner_1",
        db,
        now,
        tokenGenerator: () => "token_3",
      }),
    ).resolves.toEqual({
      status: "resent",
      inviteId: "invite_1",
    });

    expect(db.staffInvite.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "invite_1",
        workspaceId: "workspace_1",
        role: "COACH",
        status: "PENDING",
      },
      data: {
        invitedByUserId: "owner_1",
        token: "token_3",
        expiresAt: new Date("2026-04-12T10:00:00.000Z"),
      },
    });
  });

  it("does not resend a pending invite from another workspace", async () => {
    const db = {
      staffInvite: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({
            count: 0,
          })
          .mockResolvedValueOnce({
            count: 0,
          }),
      },
    };
    const now = new Date("2026-04-05T10:00:00.000Z");

    await expect(
      resendPendingCoachInvite({
        workspaceId: "workspace_1",
        inviteId: "invite_foreign",
        invitedByUserId: "owner_1",
        db,
        now,
        tokenGenerator: () => "token_4",
      }),
    ).resolves.toEqual({
      status: "error",
      message: "That invite is no longer pending.",
    });

    expect(db.staffInvite.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "invite_foreign",
        workspaceId: "workspace_1",
        role: "COACH",
        status: "PENDING",
      },
      data: {
        invitedByUserId: "owner_1",
        token: "token_4",
        expiresAt: new Date("2026-04-12T10:00:00.000Z"),
      },
    });
  });

  it("revokes a pending coach invite with a revoked timestamp", async () => {
    const db = {
      staffInvite: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({
            count: 0,
          })
          .mockResolvedValueOnce({
            count: 1,
          }),
      },
    };
    const now = new Date("2026-04-05T10:00:00.000Z");

    await expect(
      revokePendingCoachInvite({
        workspaceId: "workspace_1",
        inviteId: "invite_1",
        db,
        now,
      }),
    ).resolves.toEqual({
      status: "revoked",
      inviteId: "invite_1",
    });

    expect(db.staffInvite.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "invite_1",
        workspaceId: "workspace_1",
        role: "COACH",
        status: "PENDING",
      },
      data: {
        status: "REVOKED",
        revokedAt: now,
      },
    });
  });

  it("does not revoke a pending invite from another workspace", async () => {
    const db = {
      staffInvite: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({
            count: 0,
          })
          .mockResolvedValueOnce({
            count: 0,
          }),
      },
    };
    const now = new Date("2026-04-05T10:00:00.000Z");

    await expect(
      revokePendingCoachInvite({
        workspaceId: "workspace_1",
        inviteId: "invite_foreign",
        db,
        now,
      }),
    ).resolves.toEqual({
      status: "error",
      message: "That invite is no longer pending.",
    });

    expect(db.staffInvite.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "invite_foreign",
        workspaceId: "workspace_1",
        role: "COACH",
        status: "PENDING",
      },
      data: {
        status: "REVOKED",
        revokedAt: now,
      },
    });
  });
});
