import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@flowstate/db";
import { MemberBookingAuthorityError, requireCurrentMemberBookingAuthorityTx } from "../../../packages/db/src/member-booking-authority";

function fixture() {
  const userId = "actor", workspaceId = "gym", memberId = "child", sessionId = "real-session";
  const grant = { id: "grant", workspaceId, userId, memberId, guardianId: "guardian", verifiedAt: new Date(), revokedAt: null as Date | null, canBook: true, canPay: false,
    guardian: { workspaceId, familyLinks: [{ workspaceId, childMemberId: memberId, guardianId: "guardian" }] } };
  let clock = new Date("2030-01-01T12:00:00Z");
  const calls: string[] = [];
  const tx = {
    $queryRawUnsafe: vi.fn(async () => []),
    $queryRaw: vi.fn(async (query: TemplateStringsArray) => { calls.push(query.join("?")); return []; }),
    workspace: { findUnique: vi.fn(async () => ({ status: "ACTIVE", location: { id: "location" }, migration: { stage: "COMPLETE", ownerReviewAcknowledgedAt: new Date(), ownerReviewAcknowledgedByUserId: "owner", operationallyReadyAt: new Date(), operationallyReadyByUserId: "owner" }, setupActivation: null })) },
    workspaceUser: { findUnique: vi.fn(async () => ({ isActive: true, role: "CUSTOMER" })) },
    authSession: { findUnique: vi.fn(async () => ({ id: sessionId, userId, expiresAt: new Date("2030-01-01T12:01:00Z") })) },
    member: { findFirst: vi.fn(async (args: { where: { id?: string } }) => args.where.id === memberId ? { id: memberId, userId: null } : { id: "account", userId }) },
    memberPortalGrant: { findUnique: vi.fn(async () => grant) },
  };
  const input = { workspaceId, memberId, actor: { userId, sessionId }, authorizationClock: () => clock };
  return { tx, grant, calls, input, advance: () => { clock = new Date("2030-01-01T12:02:00Z"); } };
}

describe("transaction-time member booking authority", () => {
  it("permits a booking-only guardian without granting payment", async () => {
    const f = fixture();
    expect(await requireCurrentMemberBookingAuthorityTx(f.tx as unknown as Prisma.TransactionClient, f.input)).toMatchObject({ guardianId: "guardian", canBook: true, canPay: false });
    await expect(requireCurrentMemberBookingAuthorityTx(f.tx as unknown as Prisma.TransactionClient, { ...f.input, permission: "pay" })).rejects.toBeInstanceOf(MemberBookingAuthorityError);
  });
  it("checks session expiry after a late identity wait and all rereads", async () => {
    const f = fixture();
    f.tx.memberPortalGrant.findUnique.mockImplementation(async () => { f.advance(); return f.grant; });
    await expect(requireCurrentMemberBookingAuthorityTx(f.tx as unknown as Prisma.TransactionClient, f.input)).rejects.toBeInstanceOf(MemberBookingAuthorityError);
    expect(f.calls.some(sql => sql.includes("auth_sessions") && sql.includes("FOR SHARE"))).toBe(true);
    expect(f.calls.some(sql => sql.includes("family_links") && sql.includes("FOR SHARE"))).toBe(true);
  });
  it.each(["revoked", "booking-bit", "family-link", "foreign-session", "inactive-role"])("denies current %s without relying on the earlier context", async (kind) => {
    const f = fixture();
    if (kind === "revoked") f.grant.revokedAt = new Date();
    if (kind === "booking-bit") f.grant.canBook = false;
    if (kind === "family-link") f.grant.guardian.familyLinks = [];
    if (kind === "foreign-session") f.tx.authSession.findUnique.mockResolvedValue({ id: "real-session", userId: "other", expiresAt: new Date("2030-01-01T13:00:00Z") });
    if (kind === "inactive-role") f.tx.workspaceUser.findUnique.mockResolvedValue({ isActive: false, role: "CUSTOMER" });
    await expect(requireCurrentMemberBookingAuthorityTx(f.tx as unknown as Prisma.TransactionClient, f.input)).rejects.toBeInstanceOf(MemberBookingAuthorityError);
  });
});
