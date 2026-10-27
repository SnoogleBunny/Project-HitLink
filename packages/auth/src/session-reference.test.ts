import { describe, expect, it, vi } from "vitest";
import { getSession, getSessionWithReference, hashSessionToken, MEMBER_SESSION_COOKIE_NAME, type StoredSessionRecord } from "./index.js";

function fixture() {
  const record: StoredSessionRecord = { id: "persisted-session-id", userId: "actor", expiresAt: new Date(Date.now() + 60_000),
    email: "actor@example.test", fullName: "Actor", memberships: [{ workspaceId: "gym", role: "CUSTOMER", createdAt: new Date() }] };
  const repository = { create: vi.fn(), findByTokenHash: vi.fn(async () => record as StoredSessionRecord | null), deleteByTokenHash: vi.fn() };
  const cookieStore = { get: vi.fn(() => ({ value: "  actual-cookie-bearer  " })), set: vi.fn() };
  return { record, repository, cookieStore };
}

describe("server command session references", () => {
  it("returns only the real persisted identity beside the unchanged display session with one lookup", async () => {
    const f = fixture();
    const result = await getSessionWithReference({ ...f, cookieName: MEMBER_SESSION_COOKIE_NAME });
    expect(result).toEqual({ session: { userId: "actor", email: "actor@example.test", displayName: "Actor", workspaceId: "gym", role: "CUSTOMER" }, currentSession: { id: "persisted-session-id", userId: "actor" } });
    expect(f.repository.findByTokenHash).toHaveBeenCalledTimes(1);
    expect(f.repository.findByTokenHash).toHaveBeenCalledWith(hashSessionToken("actual-cookie-bearer"));
    expect(f.cookieStore.get).toHaveBeenCalledTimes(1);
    expect(f.cookieStore.get).toHaveBeenCalledWith(MEMBER_SESSION_COOKIE_NAME);
    expect(JSON.stringify(result)).not.toContain("actual-cookie-bearer");
    expect(JSON.stringify(result)).not.toContain(hashSessionToken("actual-cookie-bearer"));
    expect(f.cookieStore.set).not.toHaveBeenCalled();
    const display = await getSession(f);
    expect(display).toEqual(result!.session);
    expect(display).not.toHaveProperty("currentSession");
    expect(display).not.toHaveProperty("sessionId");
    expect(display).not.toHaveProperty("id");
  });
  it.each(["deleted", "expired", "missing-reference", "ambiguous-membership"])("fails closed for %s without inventing a reference", async (kind) => {
    const f = fixture();
    if (kind === "deleted") f.repository.findByTokenHash.mockResolvedValue(null);
    if (kind === "expired") f.record.expiresAt = new Date(Date.now() - 1);
    if (kind === "missing-reference") f.record.id = "";
    if (kind === "ambiguous-membership") f.record.memberships.push({ workspaceId: "other", role: "OWNER", createdAt: new Date() });
    expect(await getSessionWithReference(f)).toBeNull();
    expect(f.repository.findByTokenHash).toHaveBeenCalledTimes(1);
    expect(f.repository.deleteByTokenHash).toHaveBeenCalledTimes(kind === "expired" ? 1 : 0);
  });
});
