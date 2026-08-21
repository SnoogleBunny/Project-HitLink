import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSessionFromTokenMock } = vi.hoisted(() => ({
  getSessionFromTokenMock: vi.fn(),
}));

vi.mock("@flowstate/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@flowstate/auth")>();

  return {
    ...actual,
    getSessionFromToken: getSessionFromTokenMock,
  };
});

import {
  ADMIN_SESSION_COOKIE_NAME,
  MEMBER_SESSION_COOKIE_NAME,
} from "@flowstate/auth";
import proxy from "./proxy";

function buildRequest(pathname: string, cookies: Record<string, string> = {}) {
  const headers = new Headers();
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  return new NextRequest(`http://member.flowstate.local${pathname}`, {
    headers,
  });
}

describe("member proxy stale-session recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears an invalid member cookie and settles on the login page", async () => {
    getSessionFromTokenMock.mockResolvedValue(null);

    const response = await proxy(
      buildRequest("/login", {
        [MEMBER_SESSION_COOKIE_NAME]: "invalid-member-token",
      }),
    );

    expect(getSessionFromTokenMock).toHaveBeenCalledWith({
      token: "invalid-member-token",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${MEMBER_SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
  });

  it("bounds expired-session recovery to one redirect from a protected route", async () => {
    getSessionFromTokenMock.mockResolvedValue(null);

    const protectedResponse = await proxy(
      buildRequest("/app", {
        [MEMBER_SESSION_COOKIE_NAME]: "expired-member-session-token",
      }),
    );

    expect(protectedResponse.status).toBe(307);
    expect(protectedResponse.headers.get("location")).toBe(
      "http://member.flowstate.local/login",
    );
    expect(protectedResponse.headers.get("set-cookie")).toContain(
      `${MEMBER_SESSION_COOKIE_NAME}=;`,
    );

    const loginResponse = await proxy(buildRequest("/login"));

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("location")).toBeNull();
    expect(getSessionFromTokenMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a valid member session unchanged", async () => {
    getSessionFromTokenMock.mockResolvedValue({
      userId: "member-user",
      email: "member@example.com",
      displayName: "Member",
      workspaceId: "workspace-1",
      role: "CUSTOMER",
    });

    const response = await proxy(
      buildRequest("/login", {
        [MEMBER_SESSION_COOKIE_NAME]: "valid-member-token",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://member.flowstate.local/app",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not accept or clear an admin cookie as a member session", async () => {
    const response = await proxy(
      buildRequest("/app", {
        [ADMIN_SESSION_COOKIE_NAME]: "admin-token",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://member.flowstate.local/login",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(getSessionFromTokenMock).not.toHaveBeenCalled();
  });
});
