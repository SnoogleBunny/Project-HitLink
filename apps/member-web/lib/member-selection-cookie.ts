export const SELECTED_MEMBER_COOKIE = "hitlink_member_selection";
const LEGACY_SELECTED_MEMBER_COOKIE = "hitlink_selected_member";

interface SelectionCookieStore {
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      path: string;
      maxAge: number;
    },
  ): unknown;
}

/** Call only after the account's current authority over this member has been checked. */
export function setMemberSelectionCookie(
  store: SelectionCookieStore,
  workspaceId: string,
  memberId: string,
) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
  // Older registration pages wrote a root cookie. A distinct name avoids duplicate-path parsing ambiguity.
  store.set(LEGACY_SELECTED_MEMBER_COOKIE, "", {
    ...options,
    path: "/",
    maxAge: 0,
  });
  store.set(SELECTED_MEMBER_COOKIE, `${workspaceId}:${memberId}`, {
    ...options,
    path: "/app",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function readMemberSelectionCookie(
  value: string | undefined,
  workspaceId: string,
): string | undefined {
  const prefix = `${workspaceId}:`;
  return value?.startsWith(prefix) && value.length > prefix.length
    ? value.slice(prefix.length)
    : undefined;
}
