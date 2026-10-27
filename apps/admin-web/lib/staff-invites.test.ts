import { describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@flowstate/auth";
import type { PrismaClient } from "@flowstate/db";
import {
  acceptStaffInvite,
  hashStaffInviteToken,
  INVALID_STAFF_INVITE_MESSAGE,
  listPendingCoachInvites,
  normalizeInviteEmail,
  staffInviteLink,
} from "./staff-invites";
describe("staff invitation boundaries", () => {
  it("normalizes account identity and stores a one-way token fingerprint", () => {
    expect(normalizeInviteEmail(" Coach@Example.test ")).toBe(
      "coach@example.test",
    );
    const token = "fictional-invite-token-that-is-long-enough";
    expect(hashStaffInviteToken(token)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashStaffInviteToken(token)).not.toContain(token);
    expect(hashStaffInviteToken(token)).not.toBe(
      hashStaffInviteToken(`${token}-changed`),
    );
  });
  it("puts the bearer in a fragment on the trusted invitation route", () => {
    const link = new URL(
      staffInviteLink(
        "https://admin.example.test/old?tracking=1",
        "fictional_token",
      ),
    );
    expect(link.pathname).toBe("/staff-invite");
    expect(link.search).toBe("");
    expect(new URLSearchParams(link.hash.slice(1)).get("token")).toBe(
      "fictional_token",
    );
    expect(() => staffInviteLink("http://admin.example.test", "token")).toThrow(
      "not configured",
    );
    expect(() =>
      staffInviteLink("https://user:password@example.test", "token"),
    ).toThrow("not configured");
    expect(staffInviteLink("http://127.0.0.1:3100", "token")).toContain(
      "/staff-invite#token=token",
    );
  });
  it("rejects a malformed bearer before reading account or invitation records", async () => {
    await expect(
      acceptStaffInvite({
        token: "bad",
        email: "x@example.test",
        password: "irrelevant",
        fullName: "Fictional",
      }),
    ).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
  });
  it("keeps the dashboard projection read-only and excludes expired invitations", async () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const findMany = vi
      .fn()
      .mockResolvedValue([
        {
          id: "invite",
          email: "coach@example.test",
          expiresAt: new Date("2026-11-01Z"),
          createdAt: now,
          invitedByUser: { fullName: "Owner", email: "owner@example.test" },
        },
      ]);
    const result = await listPendingCoachInvites({
      workspaceId: "gym",
      now,
      db: { staffInvite: { findMany } },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "gym",
          role: "COACH",
          status: "PENDING",
          expiresAt: { gt: now },
        },
      }),
    );
    expect(result[0]?.invitedByDisplayName).toBe("Owner");
    expect(result[0]).not.toHaveProperty("token");
  });
});

function invitationPasswordFixture(existing: { id: string; email: string; passwordHash: string } | null = null) {
  const now = new Date("2026-10-26T12:00:00Z");
  const token = "fictional_invite_token_with_more_than_32_characters";
  const invite = { id: "invite", workspaceId: "gym", invitedByUserId: "owner", email: "coach@example.test", role: "COACH", status: "PENDING", expiresAt: new Date("2026-11-01T12:00:00Z"), token: hashStaffInviteToken(token) };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    staffInvite: {
      findFirst: vi.fn().mockResolvedValue(invite),
      update: vi.fn().mockResolvedValue({ ...invite, status: "ACCEPTED", acceptedAt: now }),
    },
    workspaceDataEvent: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
    workspaceUser: { findFirst: vi.fn().mockResolvedValue({ id: "owner-role" }), count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: "coach-role" }) },
    user: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockImplementation(async ({ data }: { data: { email: string; fullName: string; passwordHash: string } }) => ({ id: "new-coach", ...data })),
    },
    authSession: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    notificationJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const db = {
    staffInvite: { findUnique: vi.fn().mockResolvedValue(invite) },
    user: { findUnique: vi.fn().mockResolvedValue(existing) },
    workspaceDataEvent: tx.workspaceDataEvent,
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  return { now, token, tx, db: db as unknown as PrismaClient };
}

describe("staff invite new-password policy", () => {
  it.each(["short", "🔐".repeat(19)])("rejects invalid new credentials and records a rejected attempt without account writes", async (password) => {
    const f = invitationPasswordFixture();
    await expect(acceptStaffInvite({ token: f.token, email: "coach@example.test", fullName: "Fictional Coach", password, db: f.db, now: f.now })).rejects.toThrow(INVALID_STAFF_INVITE_MESSAGE);
    expect(f.tx.user.create).not.toHaveBeenCalled();
    expect(f.tx.workspaceUser.create).not.toHaveBeenCalled();
    expect(f.tx.staffInvite.update).not.toHaveBeenCalled();
    expect(f.tx.workspaceDataEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "STAFF_INVITE_ACCEPT_REJECTED" }) }));
  });

  it("preserves all bytes when creating a valid invited account", async () => {
    const f = invitationPasswordFixture();
    const password = "  fictional-coach-secret  ";
    const result = await acceptStaffInvite({ token: f.token, email: "coach@example.test", fullName: "Fictional Coach", password, db: f.db, now: f.now });
    expect(result.userId).toBe("new-coach");
    expect(await verifyPassword(password, result.passwordHash)).toBe(true);
    expect(await verifyPassword(password.trim(), result.passwordHash)).toBe(false);
    expect(f.tx.user.create).toHaveBeenCalledOnce();
  });

  it("keeps existing-account verification compatible with a short legacy password", async () => {
    const password = "old-pass";
    const account = { id: "existing-coach", email: "coach@example.test", passwordHash: await hashPassword(password) };
    const f = invitationPasswordFixture(account);
    const result = await acceptStaffInvite({ token: f.token, email: account.email, fullName: "Fictional Coach", password, db: f.db, now: f.now });
    expect(result.userId).toBe(account.id);
    expect(result.passwordHash).toBe(account.passwordHash);
    expect(f.tx.user.create).not.toHaveBeenCalled();
  });
});
