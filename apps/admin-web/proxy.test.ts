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

  return new NextRequest(`http://admin.flowstate.local${pathname}`, {
    headers,
  });
}

describe("admin proxy stale-session recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears an invalid admin cookie and settles on the login page", async () => {
    getSessionFromTokenMock.mockResolvedValue(null);

    const response = await proxy(
      buildRequest("/login", {
        [ADMIN_SESSION_COOKIE_NAME]: "invalid-admin-token",
      }),
    );

    expect(getSessionFromTokenMock).toHaveBeenCalledWith({
      token: "invalid-admin-token",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
  });

  it("bounds deleted-session recovery to one redirect from a protected route", async () => {
    getSessionFromTokenMock.mockResolvedValue(null);

    const protectedResponse = await proxy(
      buildRequest("/dashboard", {
        [ADMIN_SESSION_COOKIE_NAME]: "deleted-admin-session-token",
      }),
    );

    expect(protectedResponse.status).toBe(307);
    expect(protectedResponse.headers.get("location")).toBe(
      "http://admin.flowstate.local/login",
    );
    expect(protectedResponse.headers.get("set-cookie")).toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=;`,
    );

    const loginResponse = await proxy(buildRequest("/login"));

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get("location")).toBeNull();
    expect(getSessionFromTokenMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a valid admin session unchanged", async () => {
    getSessionFromTokenMock.mockResolvedValue({
      userId: "admin-user",
      email: "owner@example.com",
      displayName: "Owner",
      workspaceId: "workspace-1",
      role: "OWNER",
    });

    const response = await proxy(
      buildRequest("/login", {
        [ADMIN_SESSION_COOKIE_NAME]: "valid-admin-token",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://admin.flowstate.local/",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not accept or clear a member cookie as an admin session", async () => {
    const response = await proxy(
      buildRequest("/dashboard", {
        [MEMBER_SESSION_COOKIE_NAME]: "member-token",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://admin.flowstate.local/login",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(getSessionFromTokenMock).not.toHaveBeenCalled();
  });
});
