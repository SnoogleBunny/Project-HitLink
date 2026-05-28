import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionOrNullMock, redirectMock } = vi.hoisted(() => ({
  getSessionOrNullMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("./admin-access", async () => {
  const actual = await vi.importActual<typeof import("./admin-access")>(
    "./admin-access",
  );

  return {
    ...actual,
    getSessionOrNull: getSessionOrNullMock,
  };
});

import { requireOwnerWorkspaceContext } from "./owner-workspace";

describe("requireOwnerWorkspaceContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the owner workspace context when the primary location exists", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "owner_1",
      email: "owner@example.com",
      displayName: "Dana Owner",
      workspaceId: "workspace_1",
      role: "OWNER",
    });

    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_1",
          name: "Sahara Muay Thai",
          businessType: "Muay Thai gym",
          status: "ACTIVE",
          location: {
            id: "location_1",
            name: "Main Gym",
            timezone: "America/Vancouver",
            addressLine1: null,
            addressLine2: null,
            city: null,
            region: null,
            postalCode: null,
            countryCode: null,
          },
          settings: {
            allowMultipleRooms: true,
          },
        }),
      },
      workspaceUser: {
        findFirst: vi.fn().mockResolvedValue({
          id: "owner_workspace_user_1",
        }),
      },
    };

    const result = await requireOwnerWorkspaceContext({ db });

    expect(result.session.role).toBe("OWNER");
    expect(result.workspace.id).toBe("workspace_1");
    expect(result.workspaceUserId).toBe("owner_workspace_user_1");
    expect(result.location.id).toBe("location_1");
    expect(db.workspace.findUnique).toHaveBeenCalledWith({
      where: {
        id: "workspace_1",
      },
      include: {
        location: true,
        settings: true,
      },
    });
    expect(db.workspaceUser.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "owner_1",
        workspaceId: "workspace_1",
        role: "OWNER",
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  });

  it("redirects coaches to unauthorized", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "coach_1",
      email: "coach@example.com",
      displayName: "Casey Coach",
      workspaceId: "workspace_1",
      role: "COACH",
    });

    await expect(requireOwnerWorkspaceContext()).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });

  it("redirects customers to unauthorized", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "customer_1",
      email: "customer@example.com",
      displayName: "Chris Customer",
      workspaceId: "workspace_1",
      role: "CUSTOMER",
    });

    await expect(requireOwnerWorkspaceContext()).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });

  it("redirects to onboarding when the workspace has no primary location", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "owner_1",
      email: "owner@example.com",
      displayName: "Dana Owner",
      workspaceId: "workspace_1",
      role: "OWNER",
    });

    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_1",
          name: "Sahara Muay Thai",
          businessType: "Muay Thai gym",
          status: "ACTIVE",
          location: null,
          settings: null,
        }),
      },
      workspaceUser: {
        findFirst: vi.fn().mockResolvedValue({
          id: "owner_workspace_user_1",
        }),
      },
    };

    await expect(requireOwnerWorkspaceContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding",
    );
  });

  it("redirects to unauthorized when the owner workspace user is inactive", async () => {
    getSessionOrNullMock.mockResolvedValue({
      userId: "owner_1",
      email: "owner@example.com",
      displayName: "Dana Owner",
      workspaceId: "workspace_1",
      role: "OWNER",
    });

    const db = {
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          id: "workspace_1",
          name: "Sahara Muay Thai",
          businessType: "Muay Thai gym",
          status: "ACTIVE",
          location: {
            id: "location_1",
            name: "Main Gym",
            timezone: "America/Vancouver",
            addressLine1: null,
            addressLine2: null,
            city: null,
            region: null,
            postalCode: null,
            countryCode: null,
          },
          settings: {
            allowMultipleRooms: true,
          },
        }),
      },
      workspaceUser: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(requireOwnerWorkspaceContext({ db })).rejects.toThrow(
      "NEXT_REDIRECT:/unauthorized",
    );
  });
});
