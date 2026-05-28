import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cookiesMock,
  createSessionMock,
  prismaUserFindUniqueMock,
  redirectMock,
  verifyPasswordMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createSessionMock: vi.fn(),
  prismaUserFindUniqueMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
  verifyPasswordMock: vi.fn(),
}));

vi.mock("@flowstate/auth", () => ({
  MEMBER_SESSION_COOKIE_NAME: "flowstate_member_session",
  createSession: createSessionMock,
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@flowstate/db", () => ({
  prisma: {
    user: {
      findUnique: prismaUserFindUniqueMock,
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { emptyMemberLoginFormState } from "../form-states";
import { loginAction } from "./actions";

function buildFormData() {
  const formData = new FormData();
  formData.set("email", "member@example.com");
  formData.set("password", "member-pass-123");

  return formData;
}

describe("member login action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    });
  });

  it("rejects owner or unlinked accounts from the member login flow", async () => {
    prismaUserFindUniqueMock
      .mockResolvedValueOnce({
        id: "user_owner",
        email: "member@example.com",
        passwordHash: "hash",
        workspaceUsers: [
          {
            workspaceId: "workspace_1",
            role: "OWNER",
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
});
