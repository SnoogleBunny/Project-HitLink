import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SELECTED_MEMBER_COOKIE,
  readMemberSelectionCookie,
  setMemberSelectionCookie,
} from "./member-selection-cookie";

afterEach(() => vi.unstubAllEnvs());
describe("workspace-scoped member selection", () => {
  it("retires the root legacy cookie and writes a distinct scoped selection", () => {
    vi.stubEnv("NODE_ENV", "production");
    const store = { set: vi.fn() };
    setMemberSelectionCookie(store, "gym", "child");
    expect(store.set).toHaveBeenNthCalledWith(
      1,
      "hitlink_selected_member",
      "",
      { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 },
    );
    expect(store.set).toHaveBeenNthCalledWith(
      2,
      SELECTED_MEMBER_COOKIE,
      "gym:child",
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/app",
        maxAge: 2592000,
      },
    );
    expect(SELECTED_MEMBER_COOKIE).not.toBe("hitlink_selected_member");
  });
  it("reads only a nonempty participant in the requested workspace", () => {
    expect(readMemberSelectionCookie("gym:child", "gym")).toBe("child");
    expect(
      readMemberSelectionCookie("another-gym:child", "gym"),
    ).toBeUndefined();
    expect(readMemberSelectionCookie("child", "gym")).toBeUndefined();
    expect(readMemberSelectionCookie("gym:", "gym")).toBeUndefined();
    expect(readMemberSelectionCookie(undefined, "gym")).toBeUndefined();
  });
});
