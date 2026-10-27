import { createHash, randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { PrismaClient, ChangeMemberOperationsInput } from "@flowstate/db";
type AddTagInput = Extract<ChangeMemberOperationsInput, { recordKind: "TAG"; visibility: unknown }> & { action: "ADD" };
const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!/test|e2e/i.test(new URL(url).pathname) ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
)
  throw new Error(
    "Tag reapplication proof requires an explicit disposable loopback test database.",
  );
(url ? describe : describe.skip)(
  "MF06 fresh tag reapplication after a retained retraction",
  () => {
    let api: typeof import("@flowstate/db"), db: PrismaClient;
    let workspaceId: string,
      memberId: string,
      ownerId: string,
      coachId: string,
      templateId: string;
    let users: string[];
    const date = "2099-01-05",
      now = new Date("2099-01-05T12:00:00Z");
    const owner = () => ({ workspaceId, userId: ownerId });
    const coach = () => ({
      workspaceId,
      userId: coachId,
      occurrence: { classTemplateId: templateId, date },
    });
    const options = () => ({ db, now });
    const tag = (
      label: string,
      purpose: "OPERATIONAL" | "COHORT_ELIGIBILITY" = "OPERATIONAL",
    ): AddTagInput => ({
      memberId,
      recordKind: "TAG",
      recordKey: `tag:${purpose}:${createHash("sha256").update(label).digest("hex")}`,
      action: "ADD",
      tagLabel: label,
      tagPurpose: purpose,
      visibility: "ASSIGNED_OPERATIONS",
      expectedVersion: 0,
      operationId: randomUUID(),
    });
    beforeAll(async () => {
      process.env.DATABASE_URL = url;
      api = await import("@flowstate/db");
      db = api.prisma;
    });
    beforeEach(async () => {
      users = [randomUUID(), randomUUID()];
      [ownerId, coachId] = [users[0]!, users[1]!];
      await db.user.createMany({
        data: users.map((id) => ({
          id,
          fullName: `Fictional operations ${id}`,
          email: `${id}@tag-reapply.example.test`,
        })),
      });
      const workspace = await db.workspace.create({
        data: {
          name: `tag-reapply-${randomUUID()}`,
          status: "ACTIVE",
          location: {
            create: {
              name: "Gym",
              timezone: "UTC",
              rooms: { create: { name: "Mat", capacity: 10 } },
            },
          },
          workspaceUsers: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: coachId, role: "COACH" },
            ],
          },
          programs: { create: { name: "Training" } },
        },
        include: {
          workspaceUsers: true,
          location: { include: { rooms: true } },
          programs: true,
        },
      });
      workspaceId = workspace.id;
      memberId = (
        await db.member.create({
          data: {
            workspaceId,
            fullName: "Fictional retained tag participant",
            tags: ["Legacy untouched"],
          },
        })
      ).id;
      templateId = (
        await db.classTemplate.create({
          data: {
            workspaceId,
            programId: workspace.programs[0]!.id,
            roomId: workspace.location!.rooms[0]!.id,
            coachWorkspaceUserId: workspace.workspaceUsers.find(
              (row) => row.userId === coachId,
            )!.id,
            weekday: "MONDAY",
            title: "Dated tag scope",
            startTimeMinutes: 1380,
            endTimeMinutes: 1439,
            bookingCutoffMinutes: 0,
            cancellationCutoffMinutes: 0,
          },
        })
      ).id;
      await db.classBooking.create({
        data: {
          workspaceId,
          memberId,
          classTemplateId: templateId,
          scheduledForDate: new Date(`${date}Z`),
          status: "BOOKED",
        },
      });
    });
    afterEach(async () => {
      await db.workspace.delete({ where: { id: workspaceId } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    });
    afterAll(() => db.$disconnect());
    it("an owner's explicit fresh ADD reapplies a retired operational label using new visibility and a consecutive immutable version, never an old shared snapshot", async () => {
      const input = tag("Reception route");
      await api.changeMemberOperations(owner(), input, options());
      await api.changeMemberOperations(
        owner(),
        {
          ...input,
          action: "RETRACT",
          expectedVersion: 1,
          operationId: randomUUID(),
          reason: "Retire the old reception routing label",
        },
        options(),
      );
      const oldRows = await db.memberOperationalRevision.findMany({
        where: { workspaceId, recordKey: input.recordKey },
        orderBy: { version: "asc" },
      });
      const fresh = {
        ...input,
        operationId: randomUUID(),
        visibility: "OWNER_ONLY" as const,
      };
      expect(
        await api.changeMemberOperations(owner(), fresh, options()),
      ).toMatchObject({ version: 3, replayed: false });
      const rows = await db.memberOperationalRevision.findMany({
        where: { workspaceId, recordKey: input.recordKey },
        orderBy: { version: "asc" },
      });
      expect(rows.slice(0, 2)).toEqual(oldRows);
      expect(
        rows.map((row) => [row.version, row.action, row.visibility]),
      ).toEqual([
        [1, "ADD", "ASSIGNED_OPERATIONS"],
        [2, "RETRACT", "ASSIGNED_OPERATIONS"],
        [3, "ADD", "OWNER_ONLY"],
      ]);
      expect(
        (await api.getMemberOperations(coach(), memberId, options())).tags,
      ).toEqual([]);
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: memberId } })).tags,
      ).toEqual(["Legacy untouched"]);
      expect(
        await api.changeMemberOperations(owner(), fresh, options()),
      ).toMatchObject({ version: 3, replayed: true });
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: input.recordKey },
        }),
      ).toBe(3);
    });
    it("an assigned coach may reapply only their own latest retired shared operational label; an active head or owner intervention still denies", async () => {
      const input = tag("Coach reception note");
      await api.changeMemberOperations(coach(), input, options());
      await api.changeMemberOperations(
        coach(),
        {
          ...input,
          action: "RETRACT",
          expectedVersion: 1,
          operationId: randomUUID(),
          reason: "Retired during class operations review",
        },
        options(),
      );
      expect(
        await api.changeMemberOperations(
          coach(),
          { ...input, operationId: randomUUID() },
          options(),
        ),
      ).toMatchObject({ version: 3 });
      await expect(
        api.changeMemberOperations(
          coach(),
          { ...input, operationId: randomUUID() },
          options(),
        ),
      ).rejects.toThrow(/changed|already exists|reload/i);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: input.recordKey },
        }),
      ).toBe(3);
      await api.changeMemberOperations(
        owner(),
        {
          ...input,
          action: "RETRACT",
          expectedVersion: 3,
          operationId: randomUUID(),
          reason: "Owner retired this label after review",
        },
        options(),
      );
      await expect(
        api.changeMemberOperations(
          coach(),
          { ...input, operationId: randomUUID() },
          options(),
        ),
      ).rejects.toThrow(/unavailable/i);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: input.recordKey },
        }),
      ).toBe(4);
    });
    it("concurrent fresh cohort reapplications have one winner, never overwrite an active head, and do not resurrect a NOTE or change the retained seat/funding", async () => {
      const input = tag("Reviewed cohort", "COHORT_ELIGIBILITY");
      await api.changeMemberOperations(owner(), input, options());
      await api.changeMemberOperations(
        owner(),
        {
          ...input,
          action: "RETRACT",
          expectedVersion: 1,
          operationId: randomUUID(),
          reason: "Retired the previous eligibility label",
        },
        options(),
      );
      const booking = await db.classBooking.findFirstOrThrow({
        where: { workspaceId, memberId },
      });
      const attempts = await Promise.allSettled(
        [1, 2].map(() =>
          api.changeMemberOperations(
            owner(),
            { ...input, operationId: randomUUID() },
            options(),
          ),
        ),
      );
      expect(
        attempts.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        attempts.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: memberId } })).tags,
      ).toEqual(["Legacy untouched", "Reviewed cohort"]);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: input.recordKey },
        }),
      ).toBe(3);
      await expect(
        api.changeMemberOperations(
          owner(),
          { ...input, visibility: "OWNER_ONLY", operationId: randomUUID() },
          options(),
        ),
      ).rejects.toThrow(/changed|already exists|reload/i);
      const note = {
        memberId,
        recordKey: `note:${randomUUID()}`,
        recordKind: "NOTE" as const,
        action: "ADD" as const,
        expectedVersion: 0,
        operationId: randomUUID(),
        visibility: "ASSIGNED_OPERATIONS" as const,
        noteBody: "A note remains retired",
      };
      await api.changeMemberOperations(owner(), note, options());
      await api.changeMemberOperations(
        owner(),
        {
          ...note,
          action: "RETRACT",
          expectedVersion: 1,
          operationId: randomUUID(),
          reason: "Retire this note without a resurrection path",
        },
        options(),
      );
      await expect(
        api.changeMemberOperations(
          owner(),
          { ...note, operationId: randomUUID() },
          options(),
        ),
      ).rejects.toThrow(/changed|already exists|reload/i);
      expect(
        await db.memberOperationalRevision.count({
          where: { workspaceId, recordKey: note.recordKey },
        }),
      ).toBe(2);
      expect(
        await db.classBooking.findUniqueOrThrow({ where: { id: booking.id } }),
      ).toEqual(booking);
      expect(
        await db.membershipAllowanceEntry.count({ where: { workspaceId } }),
      ).toBe(0);
      expect(await db.punchCardEntry.count({ where: { workspaceId } })).toBe(0);
    });
  },
);
