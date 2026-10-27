import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  buildMemberDirectoryWhere,
  buildRequiredFormsMemberFilterTx,
  summarizeRequiredFormsForMembersTx,
  changeMemberOperations,
  lockClassSchedule,
  parseMemberDirectoryFilters,
  readOwnerMemberDirectory,
} from "@flowstate/db";
import { inspectRetentionInventory, deleteReviewedWorkspaceRecords } from "../../../packages/db/src/retention-inventory.js";
const url = process.env.TEST_DATABASE_URL;
if (url && (!/test|e2e/i.test(new URL(url).pathname) || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))) throw new Error("Tag directory tests require a dedicated loopback test database.");
(url ? describe : describe.skip)("MF05 current operational-tag heads before directory pagination", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const workspaceIds: string[] = [], userIds: string[] = [];
  const now = new Date("2030-02-01T12:00:00Z");
  async function fixture() {
    const key = randomUUID();
    const user = await db.user.create({ data: { email: `${key}-owner@example.test`, fullName: "Fictional Tag Owner" } });
    userIds.push(user.id);
    const workspace = await db.workspace.create({ data: { name: `Fictional tag directory ${key}`, status: "ACTIVE", location: { create: { name: "Main", timezone: "UTC", rooms: { create: { name: "Mat", capacity: 20 } } } }, workspaceUsers: { create: { userId: user.id, role: "OWNER" } } }, include: { workspaceUsers: true, location: { include: { rooms: true } } } });
    workspaceIds.push(workspace.id);
    const member = await db.member.create({ data: { workspaceId: workspace.id, fullName: "Fictional tag participant", status: "ACTIVE", tags: ["Legacy label"] } });
    const actor = { workspaceId: workspace.id, userId: user.id };
    return { workspace, member, user, actor, staff: workspace.workspaceUsers[0]! };
  }
  const filters = (params: Record<string, unknown>) => parseMemberDirectoryFilters(params);
  const page = (f: Awaited<ReturnType<typeof fixture>>, params: Record<string, unknown>, extra: { pageSize?: number; after?: string } = {}) => readOwnerMemberDirectory(f.actor, { db, now, filters: filters(params), ...extra });
  async function tag(f: Awaited<ReturnType<typeof fixture>>, memberId: string, label: string, action: "ADD" | "RETRACT" = "ADD", expectedVersion = 0, purpose: "OPERATIONAL" | "COHORT_ELIGIBILITY" = "OPERATIONAL") {
    const common = { memberId, recordKind: "TAG" as const, recordKey: `tag:${purpose}:${createHash("sha256").update(label).digest("hex")}`, tagLabel: label, tagPurpose: purpose, expectedVersion, operationId: randomUUID() };
    return changeMemberOperations(f.actor, action === "ADD" ? { ...common, action, visibility: "OWNER_ONLY" } : { ...common, action, reason: "Fictional instruction withdrawn" }, { db, now });
  }
  async function purge(workspaceId: string) {
    await db.$transaction(async (tx) => {
      await lockClassSchedule(tx, workspaceId);
      const inventory = await inspectRetentionInventory(tx, workspaceId);
      await deleteReviewedWorkspaceRecords(tx, workspaceId, inventory.fingerprint);
    }, { timeout: 120000 });
  }
  afterAll(async () => {
    for (const workspaceId of workspaceIds) if (await db.workspace.findUnique({ where: { id: workspaceId } })) await purge(workspaceId);
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }, 120000);
  it("excludes a retracted historical tag and includes only an explicit fresh reapplication without changing legacy labels", async () => {
    const f = await fixture(), label = "Use side entrance";
    await tag(f, f.member.id, label);
    expect((await page(f, { operationalTag: label })).members.map(row => row.id)).toEqual([f.member.id]);
    await tag(f, f.member.id, label, "RETRACT", 1);
    expect((await page(f, { operationalTag: label })).members).toEqual([]);
    await tag(f, f.member.id, label);
    expect((await page(f, { operationalTag: label })).members.map(row => row.id)).toEqual([f.member.id]);
    const revisions = await db.memberOperationalRevision.findMany({ where: { workspaceId: f.workspace.id, memberId: f.member.id }, orderBy: { version: "asc" } });
    expect(revisions.map(row => [row.version, row.previousVersion, row.action])).toEqual([[1, null, "ADD"], [2, 1, "RETRACT"], [3, 2, "ADD"]]);
    expect((await db.member.findUniqueOrThrow({ where: { id: f.member.id } })).tags).toEqual(["Legacy label"]);
  });
  it("keeps exact tenant, person and purpose scopes and composes an operational tag with its independent saved label", async () => {
    const f = await fixture(), other = await fixture(), label = "Competition review";
    await tag(other, other.member.id, label);
    await tag(f, f.member.id, label, "ADD", 0, "COHORT_ELIGIBILITY");
    expect((await page(f, { operationalTag: label })).members).toEqual([]);
    const second = await db.member.create({ data: { workspaceId: f.workspace.id, fullName: "Second fictional participant" } });
    await tag(f, second.id, label);
    expect((await page(f, { operationalTag: label })).members.map(row => row.id)).toEqual([second.id]);
    expect((await page(f, { operationalTag: label, cohortLabel: label })).members).toEqual([]);
    await tag(f, f.member.id, label);
    expect((await page(f, { operationalTag: label, cohortLabel: label })).members.map(row => row.id)).toEqual([f.member.id]);
    expect((await page(other, { operationalTag: label })).members.map(row => row.id)).toEqual([other.member.id]);
  });
  it("applies current tags, real WF07 forms, contact, saved-label and waitlist filters before same-name cursor pagination", async () => {
    const f = await fixture(), label = "Review on arrival";
    await db.member.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ workspaceId: f.workspace.id, fullName: `AAA unrelated ${i}`, status: "TRIAL" as const, tags: ["Target cohort"] })) });
    const program = await db.program.create({ data: { workspaceId: f.workspace.id, name: "Fictional padwork" } });
    const template = await db.classTemplate.create({ data: { workspaceId: f.workspace.id, programId: program.id, roomId: f.workspace.location!.rooms[0]!.id, weekday: "FRIDAY", startTimeMinutes: 1080, endTimeMinutes: 1140, bookingCutoffMinutes: 0, cancellationCutoffMinutes: 120 } });
    const document = await db.formDocument.create({ data: { workspaceId: f.workspace.id, name: "Fictional directory waiver", formType: "WAIVER" } });
    const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
    const version = await db.formVersion.create({ data: { workspaceId: f.workspace.id, formDocumentId: document.id, versionNumber: 1, fileName: "fictional.pdf", mimeType: "application/pdf", fileData: bytes, fileSizeBytes: bytes.length, fileSha256: createHash("sha256").update(bytes).digest("hex"), uploadedByWorkspaceUserId: f.staff.id } });
    await db.formDocument.update({ where: { id: document.id }, data: { currentVersionId: version.id } });
    await db.requiredFormAssignment.create({ data: { workspaceId: f.workspace.id, formDocumentId: document.id, requirementTarget: "MEMBER" } });
    const selected: Array<{ id: string }> = [];
    for (let i = 0; i < 3; i++) {
      const member = await db.member.create({ data: { workspaceId: f.workspace.id, fullName: "ZZZ same fictional name", email: "selected@example.test", status: "ACTIVE", tags: ["Target cohort"] } });
      await tag(f, member.id, label);
      if (i < 2) {
        selected.push(member);
        await db.waitlistEntry.create({ data: { workspaceId: f.workspace.id, memberId: member.id, classTemplateId: template.id, scheduledForDate: new Date("2030-02-01Z") } });
      }
    }
    const params = { q: "selected@example.test", status: "ACTIVE", operationalTag: label, cohortLabel: "Target cohort", condition: "WAITLISTED", forms: "ACTION_REQUIRED" };
    const formProof = await db.$transaction(async tx => {
      const formFilter = await buildRequiredFormsMemberFilterTx({ db: tx, actor: f.actor, state: "ACTION_REQUIRED", now });
      const summary = await summarizeRequiredFormsForMembersTx({ db: tx, actor: f.actor, memberIds: selected.map(row => row.id), now });
      return { states: selected.map(row => summary.get(row.id)?.state), formsOnlyCount: await tx.member.count({ where: { AND: [formFilter, { id: { in: selected.map(row => row.id) } }] } }), composedCount: await tx.member.count({ where: { AND: [buildMemberDirectoryWhere(f.workspace.id, filters(params)), formFilter] } }) };
    });
    expect(formProof).toEqual({ states: ["ACTION_REQUIRED", "ACTION_REQUIRED"], formsOnlyCount: 2, composedCount: 2 });
    const first = await page(f, params, { pageSize: 1 });
    const second = await page(f, params, { pageSize: 1, after: first.nextCursor! });
    expect(first.members).toHaveLength(1);
    expect(second.members).toHaveLength(1);
    expect([first.members[0]!.id, second.members[0]!.id]).toEqual(selected.map(row => row.id).sort());
    expect(first.members[0]!.forms).toMatchObject({ state: "ACTION_REQUIRED", missingCount: 1 });
    expect(second.nextCursor).toBeNull();
    const count = await db.$transaction(async tx => {
      const formFilter = await buildRequiredFormsMemberFilterTx({ db: tx, actor: f.actor, state: "ACTION_REQUIRED", now });
      return tx.member.count({ where: { AND: [buildMemberDirectoryWhere(f.workspace.id, filters(params)), formFilter] } });
    });
    expect(count).toBe(2);
    await expect(page(f, { ...params, operationalTag: "Different label" }, { after: first.nextCursor! })).rejects.toThrow("filters changed");
  });
  it("rejects a coach before reading owner tag/profile/service data", async () => {
    const f = await fixture();
    const coach = await db.user.create({ data: { email: `${randomUUID()}-coach@example.test` } });
    userIds.push(coach.id);
    await db.workspaceUser.create({ data: { workspaceId: f.workspace.id, userId: coach.id, role: "COACH" } });
    await tag(f, f.member.id, "Owner private operational label");
    await expect(readOwnerMemberDirectory({ workspaceId: f.workspace.id, userId: coach.id }, { db, now, filters: filters({ operationalTag: "Owner private operational label" }) })).rejects.toThrow();
  });
  it("enforces generated exact predecessors, prevents gaps/forks, and retains the existing immutable history guard", async () => {
    const f = await fixture(), label = "SQL chain proof";
    await tag(f, f.member.id, label);
    const first = await db.memberOperationalRevision.findFirstOrThrow({ where: { workspaceId: f.workspace.id } });
    const body = {
      workspaceId: first.workspaceId, memberId: first.memberId, recordKey: first.recordKey,
      recordKind: first.recordKind, version: first.version, action: first.action,
      visibility: first.visibility, tagLabel: first.tagLabel, tagPurpose: first.tagPurpose,
      actorUserId: first.actorUserId, actorWorkspaceUserId: first.actorWorkspaceUserId,
      actorNameSnapshot: first.actorNameSnapshot, actorRoleSnapshot: first.actorRoleSnapshot,
      operationId: first.operationId, inputHash: first.inputHash,
    };
    await expect(db.memberOperationalRevision.create({ data: { ...body, operationId: randomUUID(), version: 3, action: "AMEND", reason: "Fictional invalid gap" } })).rejects.toThrow();
    const otherMember = await db.member.create({ data: { workspaceId: f.workspace.id, fullName: "Fictional different stream" } });
    await expect(db.memberOperationalRevision.create({ data: { ...body, memberId: otherMember.id, operationId: randomUUID(), version: 2, action: "AMEND", reason: "Fictional other-person predecessor" } })).rejects.toThrow();
    await expect(db.memberOperationalRevision.create({ data: { ...body, recordKey: `tag:OPERATIONAL:${createHash("sha256").update("Different record").digest("hex")}`, tagLabel: "Different record", operationId: randomUUID(), version: 2, action: "AMEND", reason: "Fictional other-record predecessor" } })).rejects.toThrow();
    const otherWorkspace = await fixture();
    await expect(db.memberOperationalRevision.create({ data: { ...body, workspaceId: otherWorkspace.workspace.id, memberId: otherWorkspace.member.id, operationId: randomUUID(), version: 2, action: "AMEND", reason: "Fictional other-tenant predecessor" } })).rejects.toThrow();
    await expect(db.memberOperationalRevision.create({ data: { ...body, operationId: randomUUID(), version: 2, previousVersion: 999, action: "AMEND", reason: "Fictional forged predecessor" } })).rejects.toThrow();
    await db.memberOperationalRevision.create({ data: { ...body, operationId: randomUUID(), version: 2, action: "AMEND", reason: "Fictional accepted next revision" } });
    await expect(db.memberOperationalRevision.create({ data: { ...body, operationId: randomUUID(), version: 2, action: "AMEND", reason: "Fictional duplicate fork" } })).rejects.toThrow();
    await expect(db.memberOperationalRevision.update({ where: { id: first.id }, data: { tagLabel: "Rewritten history" } })).rejects.toThrow("immutable");
    expect(await db.memberOperationalRevision.count({ where: { workspaceId: f.workspace.id } })).toBe(2);
  });
  it("purges a complete self-linked chain through reviewed retention without touching another workspace", async () => {
    const f = await fixture(), other = await fixture(), label = "Retained scope proof";
    await tag(f, f.member.id, label);
    await tag(f, f.member.id, label, "RETRACT", 1);
    await tag(f, f.member.id, label);
    await tag(other, other.member.id, label);
    await purge(f.workspace.id);
    expect(await db.workspace.findUnique({ where: { id: f.workspace.id } })).toBeNull();
    expect(await db.memberOperationalRevision.count({ where: { workspaceId: f.workspace.id } })).toBe(0);
    expect(await db.memberOperationalRevision.count({ where: { workspaceId: other.workspace.id } })).toBe(1);
    expect(await db.user.findUnique({ where: { id: f.user.id } })).not.toBeNull();
  });
});
