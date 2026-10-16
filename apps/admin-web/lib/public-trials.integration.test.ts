import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, completeVerifiedTrial, shouldDeliverNotification, type Prisma } from "@flowstate/db";
import { recordAttendance } from "./rosters";
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("verified public trials", () => {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const workspaceIds: string[] = [], userIds: string[] = [];
  const now = new Date("2030-01-01T12:00:00Z");
  let workspaceId: string, templateId: string, ownerId: string, ownerStaffId: string;
  beforeEach(async () => {
    const owner = await db.user.create({ data: { email: `${randomUUID()}@verified-trial.test` } }); userIds.push(owner.id); ownerId = owner.id;
    const workspace = await db.workspace.create({ data: { name: `trial-test-${randomUUID()}`, status: "ACTIVE", migration: { create: { stage: "COMPLETE", nextOwnerAction: "None", flowstateResponsibility: "Ready", ownerReviewAcknowledgedAt: now, ownerReviewAcknowledgedByUserId: owner.id, operationallyReadyAt: now, operationallyReadyByUserId: owner.id } } } }); workspaceId = workspace.id; workspaceIds.push(workspaceId);
    ownerStaffId = (await db.workspaceUser.create({ data: { workspaceId, userId: ownerId, role: "OWNER" } })).id;
    const location = await db.location.create({ data: { workspaceId, name: "Gym", timezone: "UTC" } });
    const room = await db.room.create({ data: { locationId: location.id, name: "Mat", capacity: 1 } });
    const program = await db.program.create({ data: { workspaceId, name: "Muay Thai" } });
    templateId = (await db.classTemplate.create({ data: { workspaceId, programId: program.id, roomId: room.id, weekday: "MONDAY", startTimeMinutes: 1080, endTimeMinutes: 1140, bookingCutoffMinutes: 60, cancellationCutoffMinutes: 60 } })).id;
    await db.workspaceWebsite.create({ data: { workspaceId, slug: randomUUID(), draft: {}, published: {}, publishedAt: now } });
  });
  afterAll(async () => {
    for (const id of workspaceIds) {
      await db.publicEnrollment.deleteMany({ where: { workspaceId: id } });
      await db.memberPortalGrant.deleteMany({ where: { workspaceId: id } });
      await db.attendanceRecord.deleteMany({ where: { workspaceId: id } });
      await db.classBooking.deleteMany({ where: { workspaceId: id } });
      await db.classInstance.deleteMany({ where: { workspaceId: id } });
      await db.classTemplate.deleteMany({ where: { workspaceId: id } });
      await db.workspace.delete({ where: { id } });
    }
    await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.$disconnect();
  });
  async function identity() {
    const user = await db.user.create({ data: { email: `${randomUUID()}@verified-trial.test`, workspaceUsers: { create: { workspaceId, role: "CUSTOMER" } }, member: { create: { workspaceId, fullName: "Trial adult", dateOfBirth: new Date("1990-01-01"), status: "TRIAL" } } }, include: { member: true } }); userIds.push(user.id); return { userId: user.id, memberId: user.member!.id, email: user.email };
  }
  async function enrollment(person: Awaited<ReturnType<typeof identity>>, overrides: Record<string, unknown> = {}) {
    return db.publicEnrollment.create({ data: { workspaceId, kind: "TRIAL", email: person.email, accessTokenHash: randomUUID(), verificationCodeHash: randomUUID(), verificationExpiresAt: new Date("2030-01-02"), verifiedAt: now, createdAt: now, status: "VERIFIED", memberId: person.memberId, participant: { fullName: "Trial adult", dateOfBirth: "1990-01-01", email: person.email, phone: "", guardianFullName: "", relationshipLabel: "", classTemplateId: templateId, scheduledForDate: "2030-01-07", offerId: "", termsFingerprint: "", accountUserId: person.userId, payerMemberId: person.memberId, ...overrides } as Prisma.InputJsonObject } });
  }
  const complete = (enrollmentId: string, actorUserId: string, clock = now) => completeVerifiedTrial({ workspaceId, enrollmentId, actorUserId, db, now: clock });
  it("requires verified enrollment and exact identity before writing a booking", async () => {
    const person = await identity(), row = await enrollment(person);
    await db.publicEnrollment.update({ where: { id: row.id }, data: { verifiedAt: null } });
    expect((await complete(row.id, person.userId)).status).toBe("error");
    await db.publicEnrollment.update({ where: { id: row.id }, data: { verifiedAt: now } });
    expect((await complete(row.id, ownerId)).status).toBe("error");
    expect(await db.classBooking.count({ where: { workspaceId } })).toBe(0);
  });
  it("books concurrent duplicate delivery once, limits program trials and never revives cancellation", async () => {
    const person = await identity(), row = await enrollment(person);
    const results = await Promise.all([complete(row.id, person.userId), complete(row.id, person.userId)]);
    expect(results.map((result) => result.status).sort()).toEqual(["already_booked", "booked"]);
    expect(await db.classBooking.count({ where: { workspaceId } })).toBe(1);
    expect(await db.notificationJob.count({ where: { workspaceId } })).toBe(1);
    const notice = await db.notificationJob.findFirstOrThrow({where:{workspaceId}});
    expect(notice.context).toMatchObject({kind:"CLASS_BOOKING"});
    expect(await shouldDeliverNotification(notice,db,now)).toBe(true);
    const other = await enrollment(person, { scheduledForDate: "2030-01-14" });
    expect((await complete(other.id, person.userId)).status).toBe("error");
    await db.classBooking.updateMany({ where: { workspaceId }, data: { status: "CANCELLED" } });
    expect((await complete(row.id, person.userId)).status).toBe("error");
    expect(await shouldDeliverNotification(notice,db,now)).toBe(false);
    expect(await db.classBooking.count({ where: { workspaceId, status: "BOOKED" } })).toBe(0);
  });
  it("serializes independent participants at the last seat and rejects the cutoff", async () => {
    const one = await identity(), two = await identity(); const a = await enrollment(one), b = await enrollment(two);
    const results = await Promise.all([complete(a.id, one.userId), complete(b.id, two.userId)]);
    expect(results.filter((result) => result.status === "booked")).toHaveLength(1);
    expect(results.filter((result) => result.status === "error")).toHaveLength(1);
    const three = await identity(), c = await enrollment(three, { scheduledForDate: "2030-01-01" });
    await db.classTemplate.update({ where: { id: templateId }, data: { weekday: "TUESDAY", startTimeMinutes: 780, endTimeMinutes: 840 } });
    expect((await complete(c.id, three.userId)).status).toBe("error");
  });
  it("requires verified live guardian book/sign authority and blocks attendance on unsigned child forms", async () => {
    const parent = await identity(), child = await db.member.create({ data: { workspaceId, fullName: "Child", dateOfBirth: new Date("2020-01-01"), status: "TRIAL" } });
    const guardian = await db.guardian.create({ data: { workspaceId, fullName: "Guardian", email: parent.email, familyLinks: { create: { workspaceId, childMemberId: child.id } } } });
    const row = await enrollment({ ...parent, memberId: child.id }, { dateOfBirth: "2020-01-01", guardianId: guardian.id, payerMemberId: parent.memberId });
    expect((await complete(row.id, parent.userId)).status).toBe("error");
    const grant = await db.memberPortalGrant.create({ data: { workspaceId, userId: parent.userId, memberId: child.id, guardianId: guardian.id, verifiedByWorkspaceUserId: ownerStaffId, verificationNote: "Fixture verified authority", canBook: true, canSign: false } });
    expect((await complete(row.id, parent.userId)).status).toBe("error");
    await db.memberPortalGrant.update({ where: { id: grant.id }, data: { canSign: true, revokedAt: now } });
    expect((await complete(row.id, parent.userId)).status).toBe("error");
    await db.memberPortalGrant.update({ where: { id: grant.id }, data: { revokedAt: null } });
    const form = await db.formDocument.create({ data: { workspaceId, name: "Trial waiver", formType: "WAIVER" } });
    const version = await db.formVersion.create({ data: { workspaceId, formDocumentId: form.id, versionNumber: 1, fileName: "waiver.pdf", mimeType: "application/pdf", fileSizeBytes: 1, fileSha256: "fixture", fileData: Buffer.from("x"), uploadedByWorkspaceUserId: ownerStaffId } });
    await db.formDocument.update({ where: { id: form.id }, data: { currentVersionId: version.id } });
    await db.requiredFormAssignment.create({ data: { workspaceId, formDocumentId: form.id, requirementTarget: "TRIAL" } });
    expect(await complete(row.id, parent.userId)).toMatchObject({ status: "booked", formsRequired: 1 });
    expect(await db.signatureRequest.findMany({ where: { workspaceId, memberId: child.id } })).toEqual([expect.objectContaining({ signerKind: "GUARDIAN", guardianId: guardian.id })]);
    expect(await recordAttendance({ access: { workspaceId, workspaceUserId: ownerStaffId, role: "OWNER", timezone: "UTC" }, memberId: child.id, classTemplateId: templateId, scheduledForDate: "2030-01-07", state: "PRESENT", db: db as never, now: new Date("2030-01-07T18:05:00Z") })).toMatchObject({ status: "error", message: expect.stringContaining("required forms") });
    expect(await db.attendanceRecord.count({ where: { workspaceId } })).toBe(0);
    const notice = await db.notificationJob.findFirstOrThrow({where:{workspaceId}});
    expect(await shouldDeliverNotification(notice,db,now)).toBe(true);
    await db.memberPortalGrant.update({where:{id:grant.id},data:{revokedAt:now}});
    expect(await shouldDeliverNotification(notice,db,now)).toBe(false);
  });
});
