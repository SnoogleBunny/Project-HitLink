import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@flowstate/db";
const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration("verified family permissions in PostgreSQL", () => {
  let db: PrismaClient;
  let change: (typeof import("./family-portal-access"))["changeFamilyPortalAccess"];
  const prefix = `family_${Date.now()}`;
  const gym = `${prefix}_gym`;
  const owner = `${prefix}_owner`;
  const adult = `${prefix}_adult`;
  const child = `${prefix}_child`;
  const guardian = `${prefix}_guardian`;
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    db = (await import("@flowstate/db")).prisma;
    change = (await import("./family-portal-access")).changeFamilyPortalAccess;
    await db.user.createMany({ data: [{ id: owner, email: `${owner}@example.test` }, { id: adult, email: `${adult}@example.test` }] });
    await db.workspace.create({ data: { id: gym, name: "Family access integration", workspaceUsers: { create: { id: owner, userId: owner, role: "OWNER" } }, members: { create: [{ id: `${adult}_member`, userId: adult, fullName: "Parent" }, { id: child, fullName: "Child" }] }, guardians: { create: { id: guardian, fullName: "Parent" } } } });
    await db.familyLink.create({ data: { workspaceId: gym, guardianId: guardian, childMemberId: child, relationshipLabel: "Parent" } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.portalAccessChange.deleteMany({ where: { workspaceId: gym } });
    await db.memberPortalGrant.deleteMany({ where: { workspaceId: gym } });
    await db.workspace.deleteMany({ where: { id: gym } });
    await db.user.deleteMany({ where: { id: { in: [owner, adult] } } });
  });
  function input() {
    return { workspaceId: gym, actorWorkspaceUserId: owner, memberId: child, userId: adult, guardianId: guardian, expectedVersion: 0, reason: "Reviewed identity and guardian authority in person.", revoke: false, canBook: true, canSign: false, canPay: false, identityAndAuthorityVerified: true };
  }
  it("requires verified authority and refuses actors outside the gym before writing", async () => {
    expect((await change({ ...input(), identityAndAuthorityVerified: false })).error).toMatch(/Verify/);
    expect((await change({ ...input(), actorWorkspaceUserId: adult })).error).toBeTruthy();
    expect(await db.memberPortalGrant.count({ where: { workspaceId: gym } })).toBe(0);
  });
  it("serializes competing edits, preserves audited versions, and revokes without deleting evidence", async () => {
    const results = await Promise.all([change(input()), change({ ...input(), canSign: true })]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.filter((result) => result.error)).toHaveLength(1);
    expect(await db.portalAccessChange.count({ where: { workspaceId: gym } })).toBe(1);
    const granted = await db.memberPortalGrant.findFirstOrThrow({ where: { workspaceId: gym } });
    expect(granted.version).toBe(1);
    expect((await change({ ...input(), expectedVersion: 1, revoke: true, reason: "Guardian requested removal of portal access." })).error).toBeNull();
    const revoked = await db.memberPortalGrant.findUniqueOrThrow({ where: { id: granted.id } });
    expect(revoked.revokedAt).not.toBeNull();
    expect(revoked.version).toBe(2);
    expect(await db.portalAccessChange.count({ where: { grantId: granted.id } })).toBe(2);
    expect((await change({ ...input(), expectedVersion: 1 })).error).toMatch(/changed/);
  });
});
