import { describe, expect, it, vi } from "vitest";
import {
  deleteSession,
  getSession,
  getSessionFromToken,
  hashPassword,
  hashSessionToken,
  MEMBER_SESSION_COOKIE_NAME,
  verifyPassword,
} from "./index.js";

describe("password helpers", () => {
  it("hashes and verifies a valid password", async () => {
    const passwordHash = await hashPassword("owner-password-123");

    expect(passwordHash).not.toBe("owner-password-123");
    await expect(
      verifyPassword("owner-password-123", passwordHash),
    ).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const passwordHash = await hashPassword("owner-password-123");

    await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(
      false,
    );
    await expect(verifyPassword("owner-password-123", null)).resolves.toBe(
      false,
    );
  });
});

describe("session lookup", () => {
  it("returns the normalized app session for a valid token", async () => {
    const repository = {
      create: vi.fn(),
      findByTokenHash: vi.fn().mockResolvedValue({
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60_000),
        email: "owner@example.com",
        fullName: "  Dana Owner  ",
        memberships: [
          {
            workspaceId: "workspace_1",
            role: "OWNER",
            createdAt: new Date("2026-04-03T12:00:00.000Z"),
          },
        ],
      }),
      deleteByTokenHash: vi.fn(),
    };

    const session = await getSessionFromToken({
      token: "plain-session-token",
      repository,
    });

    expect(repository.findByTokenHash).toHaveBeenCalledWith(
      hashSessionToken("plain-session-token"),
    );
    expect(session).toEqual({
      userId: "user_1",
      email: "owner@example.com",
      displayName: "Dana Owner",
      workspaceId: "workspace_1",
      role: "OWNER",
    });
  });

  it("returns null when the token does not exist", async () => {
    const repository = {
      create: vi.fn(),
      findByTokenHash: vi.fn().mockResolvedValue(null),
      deleteByTokenHash: vi.fn(),
    };

    await expect(
      getSessionFromToken({
        token: "missing-token",
        repository,
      }),
    ).resolves.toBeNull();
  });

  it("returns null and deletes the stored session when it has expired", async () => {
    const repository = {
      create: vi.fn(),
      findByTokenHash: vi.fn().mockResolvedValue({
        userId: "user_1",
        expiresAt: new Date(Date.now() - 1_000),
        email: "owner@example.com",
        fullName: null,
        memberships: [],
      }),
      deleteByTokenHash: vi.fn(),
    };

    await expect(
      getSessionFromToken({
        token: "expired-token",
        repository,
      }),
    ).resolves.toBeNull();

    expect(repository.deleteByTokenHash).toHaveBeenCalledWith(
      hashSessionToken("expired-token"),
    );
  });

  it("uses the requested cookie name when deleting a member-scoped session", async () => {
    const cookieStore = {
      get: vi.fn((name: string) => {
        if (name === MEMBER_SESSION_COOKIE_NAME) {
          return {
            value: "member-session-token",
          };
        }

        return undefined;
      }),
      set: vi.fn(),
    };
    const repository = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      deleteByTokenHash: vi.fn(),
    };

    await deleteSession({
      cookieStore,
      repository,
      cookieName: MEMBER_SESSION_COOKIE_NAME,
    });

    expect(cookieStore.get).toHaveBeenCalledWith(MEMBER_SESSION_COOKIE_NAME);
    expect(repository.deleteByTokenHash).toHaveBeenCalledWith(
      hashSessionToken("member-session-token"),
    );
  });

  it("does not mutate cookies while reading an invalid session", async () => {
    const cookieStore = {
      get: vi.fn(() => ({
        value: "stale-token",
      })),
      set: vi.fn(),
    };
    const repository = {
      create: vi.fn(),
      findByTokenHash: vi.fn().mockResolvedValue(null),
      deleteByTokenHash: vi.fn(),
    };

    await expect(
      getSession({
        cookieStore,
        repository,
      }),
    ).resolves.toBeNull();

    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
