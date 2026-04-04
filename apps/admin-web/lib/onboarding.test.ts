import { describe, expect, it, vi } from "vitest";
import { createOwnerWorkspaceOnboarding } from "./onboarding";

function buildInput() {
  return {
    userId: "user_1",
    workspaceName: "Sahara Muay Thai",
    businessType: "Muay Thai gym",
    timezone: "America/Vancouver",
    addressLine1: "123 Main Street",
    city: "Vancouver",
    region: "BC",
    postalCode: "V6B 1A1",
    countryCode: "ca",
  };
}

describe("owner workspace onboarding", () => {
  it("creates the workspace, primary location, owner membership, and settings", async () => {
    const created = {
      location: null as Record<string, unknown> | null,
      workspace: null as Record<string, unknown> | null,
      workspaceSetting: null as Record<string, unknown> | null,
      workspaceUser: null as Record<string, unknown> | null,
    };

    const db = {
      workspaceUser: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          workspace: {
            create: vi.fn(async ({ data }) => {
              created.workspace = data;
              return { id: "workspace_1" };
            }),
          },
          location: {
            create: vi.fn(async ({ data }) => {
              created.location = data;
              return {};
            }),
          },
          workspaceUser: {
            create: vi.fn(async ({ data }) => {
              created.workspaceUser = data;
              return {};
            }),
          },
          workspaceSetting: {
            create: vi.fn(async ({ data }) => {
              created.workspaceSetting = data;
              return {};
            }),
          },
        }),
      ),
    };

    const result = await createOwnerWorkspaceOnboarding({
      input: buildInput(),
      db,
    });

    expect(result).toEqual({
      status: "created",
      workspaceId: "workspace_1",
    });
    expect(created.workspace).toEqual({
      name: "Sahara Muay Thai",
      businessType: "Muay Thai gym",
      status: "ACTIVE",
    });
    expect(created.location).toEqual({
      workspaceId: "workspace_1",
      name: "Sahara Muay Thai",
      timezone: "America/Vancouver",
      addressLine1: "123 Main Street",
      addressLine2: null,
      city: "Vancouver",
      region: "BC",
      postalCode: "V6B 1A1",
      countryCode: "CA",
    });
    expect(created.workspaceUser).toEqual({
      workspaceId: "workspace_1",
      userId: "user_1",
      role: "OWNER",
    });
    expect(created.workspaceSetting).toEqual({
      workspaceId: "workspace_1",
      allowMultipleRooms: false,
    });
  });

  it("redirects immediately when an active membership already exists", async () => {
    const db = {
      workspaceUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_user_1",
          workspaceId: "workspace_1",
          role: "OWNER",
          isActive: true,
        }),
      },
      $transaction: vi.fn(),
    };

    await expect(
      createOwnerWorkspaceOnboarding({
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "redirect",
      location: "/dashboard",
      workspaceId: "workspace_1",
    });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("blocks onboarding when an inactive membership already exists", async () => {
    const db = {
      workspaceUser: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_user_1",
          workspaceId: "workspace_1",
          role: "OWNER",
          isActive: false,
        }),
      },
      $transaction: vi.fn(),
    };

    await expect(
      createOwnerWorkspaceOnboarding({
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "blocked",
      message:
        "This account is already linked to a workspace membership that isn’t active. A new workspace can’t be created with this account right now. Contact support or use a different email.",
      workspaceUserId: "workspace_user_1",
      isActive: false,
    });

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("treats a duplicate submit race as an idempotent redirect when the reread is active", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "workspace_user_1",
        workspaceId: "workspace_1",
        role: "OWNER",
        isActive: true,
      });

    const db = {
      workspaceUser: {
        findUnique,
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          workspace: {
            create: vi.fn(async () => ({ id: "workspace_1" })),
          },
          location: {
            create: vi.fn(async () => ({})),
          },
          workspaceUser: {
            create: vi.fn(async () => {
              throw {
                code: "P2002",
                meta: {
                  target: ["userId"],
                },
              };
            }),
          },
          workspaceSetting: {
            create: vi.fn(async () => ({})),
          },
        }),
      ),
    };

    await expect(
      createOwnerWorkspaceOnboarding({
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "redirect",
      location: "/dashboard",
      workspaceId: "workspace_1",
    });

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("blocks onboarding when the duplicate submit reread finds an inactive membership", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "workspace_user_1",
        workspaceId: "workspace_1",
        role: "OWNER",
        isActive: false,
      });

    const db = {
      workspaceUser: {
        findUnique,
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          workspace: {
            create: vi.fn(async () => ({ id: "workspace_1" })),
          },
          location: {
            create: vi.fn(async () => ({})),
          },
          workspaceUser: {
            create: vi.fn(async () => {
              throw {
                code: "P2002",
                meta: {
                  target: ["userId"],
                },
              };
            }),
          },
          workspaceSetting: {
            create: vi.fn(async () => ({})),
          },
        }),
      ),
    };

    await expect(
      createOwnerWorkspaceOnboarding({
        input: buildInput(),
        db,
      }),
    ).resolves.toEqual({
      status: "blocked",
      message:
        "This account is already linked to a workspace membership that isn’t active. A new workspace can’t be created with this account right now. Contact support or use a different email.",
      workspaceUserId: "workspace_user_1",
      isActive: false,
    });

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("fails loudly when a uniqueness conflict occurs but a fresh reread finds no membership", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);

    const db = {
      workspaceUser: {
        findUnique,
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          workspace: {
            create: vi.fn(async () => ({ id: "workspace_1" })),
          },
          location: {
            create: vi.fn(async () => ({})),
          },
          workspaceUser: {
            create: vi.fn(async () => {
              throw {
                code: "P2002",
                meta: {
                  target: ["userId"],
                },
              };
            }),
          },
          workspaceSetting: {
            create: vi.fn(async () => ({})),
          },
        }),
      ),
    };

    await expect(
      createOwnerWorkspaceOnboarding({
        input: buildInput(),
        db,
      }),
    ).rejects.toThrow(
      "Workspace membership uniqueness conflict for user user_1 but no WorkspaceUser row was found on a fresh reread.",
    );

    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
