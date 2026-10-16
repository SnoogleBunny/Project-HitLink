import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { PrismaClient, recordLocalFormSignature, resolveRequiredFormStatusesForMember, buildSignatureRequestToken } from "@flowstate/db";
const testUrl = process.env.TEST_DATABASE_URL;
(testUrl ? describe : describe.skip)("atomic guardian and member signatures", () => {
  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const workspaces: string[] = [], users: string[] = [];
  let workspaceId: string, ownerId: string, parentId: string, memberId: string, guardianId: string, grantId: string, formId: string, versionId: string, requestId: string;
  beforeEach(async () => {
    vi.stubEnv("FORMS_MAGIC_LINK_SECRET", "forms-signature-test-secret-not-for-production");
    const owner = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
    const parent = await db.user.create({ data: { email: `${randomUUID()}@example.test` } });
    users.push(owner.id, parent.id); parentId = parent.id;
    const workspace = await db.workspace.create({ data: { name: "Signature integration", workspaceUsers: { create: [{ userId: owner.id, role: "OWNER" }, { userId: parent.id, role: "CUSTOMER" }] } }, include: { workspaceUsers: true } });
    workspaceId = workspace.id; workspaces.push(workspaceId); ownerId = workspace.workspaceUsers.find(item => item.role === "OWNER")!.id;
    const member = await db.member.create({ data: { workspaceId, fullName: "Child participant", dateOfBirth: new Date("2015-01-01"), status: "ACTIVE" } }); memberId = member.id;
    const guardian = await db.guardian.create({ data: { workspaceId, fullName: "Parent", familyLinks: { create: { workspaceId, childMemberId: memberId } } } }); guardianId = guardian.id;
    grantId = (await db.memberPortalGrant.create({ data: { workspaceId, userId: parentId, memberId, guardianId, verifiedByWorkspaceUserId: ownerId, verificationNote: "Identity checked", canSign: true } })).id;
    const form = await db.formDocument.create({ data: { workspaceId, name: "Required agreement", formType: "MEMBERSHIP_AGREEMENT", assignments: { create: { workspaceId, requirementTarget: "MEMBERSHIP_ACTIVATION" } } } }); formId = form.id;
    versionId = (await db.formVersion.create({ data: { workspaceId, formDocumentId: formId, versionNumber: 1, fileName: "agreement.pdf", mimeType: "application/pdf", fileSizeBytes: 8, fileSha256: "fixture", fileData: Buffer.from("%PDF-1.7"), uploadedByWorkspaceUserId: ownerId } })).id;
    await db.formDocument.update({ where: { id: formId }, data: { currentVersionId: versionId } });
    requestId = (await db.signatureRequest.create({ data: { workspaceId, formVersionId: versionId, memberId, guardianId, signerKind: "GUARDIAN", accessMethod: "PORTAL" } })).id;
  });
  afterAll(async () => {
    for (const workspaceId of workspaces) {
      await db.signedDocument.deleteMany({ where: { workspaceId } });
      await db.signatureRequest.deleteMany({ where: { workspaceId } });
      await db.formDocument.updateMany({ where: { workspaceId }, data: { currentVersionId: null } });
      await db.formVersion.deleteMany({ where: { workspaceId } });
      await db.memberPortalGrant.deleteMany({ where: { workspaceId } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); vi.unstubAllEnvs();
  });
  const args = () => ({ workspaceId, memberId, requestId, guardianId, actorUserId: parentId, signerName: "Parent", db });
  it("records one exact-version signature on concurrent taps and resolves child activation requirements", async () => {
    const result = await Promise.all([recordLocalFormSignature(args()), recordLocalFormSignature(args())]);
    expect(result.map(item => item.status).sort()).toEqual(["already_signed", "signed"]);
    expect(await db.signedDocument.count({ where: { workspaceId } })).toBe(1);
    const forms = await resolveRequiredFormStatusesForMember({ workspaceId, memberId, targets: ["MEMBERSHIP_ACTIVATION"], db });
    expect(forms.items).toHaveLength(1); expect(forms.items[0]).toMatchObject({ signerKind: "GUARDIAN", status: "SIGNED", currentVersionId: versionId });
  });
  it("checks guardian revocation after acquiring the shared family lock", async () => {
    let release!: () => void, locked!: () => void;
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    const lockedPromise = new Promise<void>(resolve => { locked = resolve; });
    const revocation = db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`family-access:${workspaceId}`}))`;
      locked(); await releasePromise;
      await tx.memberPortalGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
    });
    await lockedPromise;
    const signing = recordLocalFormSignature(args()); release(); await revocation;
    expect(await signing).toMatchObject({ status: "error", message: expect.stringMatching(/no longer active/) });
    expect(await db.signedDocument.count({ where: { workspaceId } })).toBe(0);
  });
  it("requires the actor and rejects superseded forms without completing the request", async () => {
    expect(await recordLocalFormSignature({ ...args(), actorUserId: undefined })).toMatchObject({ status: "error" });
    const newVersion = await db.formVersion.create({ data: { workspaceId, formDocumentId: formId, versionNumber: 2, fileName: "agreement-v2.pdf", mimeType: "application/pdf", fileSizeBytes: 8, fileSha256: "fixture2", fileData: Buffer.from("%PDF-1.7"), uploadedByWorkspaceUserId: ownerId } });
    await db.formDocument.update({ where: { id: formId }, data: { currentVersionId: newVersion.id } });
    expect(await recordLocalFormSignature(args())).toMatchObject({ status: "error", message: expect.stringMatching(/changed/) });
    expect((await db.signatureRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("OPEN");
    expect(await db.signedDocument.count({ where: { workspaceId } })).toBe(0);
  });
  it("never lets a minor self-sign even with a member account and a legacy MEMBER request", async () => {
    const childUser = await db.user.create({ data: { email: `${randomUUID()}@example.test` } }); users.push(childUser.id);
    await db.workspaceUser.create({ data: { workspaceId, userId: childUser.id, role: "CUSTOMER" } });
    await db.member.update({ where: { id: memberId }, data: { userId: childUser.id } });
    await db.signatureRequest.update({ where: { id: requestId }, data: { signerKind: "MEMBER", guardianId: null } });
    expect(await recordLocalFormSignature({ ...args(), actorUserId: childUser.id, guardianId: undefined })).toMatchObject({ status: "error", message: expect.stringMatching(/guardian/) });
    const forms = await resolveRequiredFormStatusesForMember({ workspaceId, memberId, targets: ["MEMBERSHIP_ACTIVATION"], db });
    expect(forms.items[0]).toMatchObject({ signerKind: "GUARDIAN", status: "PENDING" });
    expect(forms.items[0]?.openRequests.every(item => item.signerKind === "GUARDIAN")).toBe(true);
  });
  it("honors revocation for a previously issued guardian link", async () => {
    await db.signatureRequest.delete({ where: { id: requestId } });
    const forms = await resolveRequiredFormStatusesForMember({ workspaceId, memberId, targets: ["MEMBERSHIP_ACTIVATION"], db });
    const link = forms.items[0]!.openRequests.find(item => item.accessMethod === "MAGIC_LINK")!;
    const token = buildSignatureRequestToken(link.requestId);
    await db.memberPortalGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
    expect(await recordLocalFormSignature({ token, signerName: "Parent", db })).toMatchObject({ status: "error", message: expect.stringMatching(/no longer active/) });
    expect(await db.signedDocument.count({ where: { workspaceId } })).toBe(0);
  });
});
