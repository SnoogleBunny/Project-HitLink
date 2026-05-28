import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, getSessionMock, redirectMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getSessionMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

vi.mock("@flowstate/auth", () => ({
  MEMBER_SESSION_COOKIE_NAME: "flowstate_member_session",
  getSession: getSessionMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { requireMemberPortalContext } from "./member-auth";

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
