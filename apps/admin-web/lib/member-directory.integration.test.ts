import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  getMembershipAllowanceSummary,
  readOwnerMemberDirectory,
  readOwnerMemberServiceSummary,
  parseMemberDirectoryFilters,
  snapshotMembershipTerms,
  snapshotPunchCardTerms,
  summarizeMembershipAllowancesForMembersTx,
  changeMemberOperations,
  lockClassSchedule,
} from "@flowstate/db";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory.js";
const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!/test|e2e/i.test(new URL(url).pathname) ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
)
  throw new Error(
    "Directory integration needs a dedicated loopback test database.",
  );
(url ? describe : describe.skip)(
  "MF05/MF08 bounded directory and independent services in PostgreSQL",
  () => {
    const db = new PrismaClient({ datasourceUrl: url }),
      workspaces: string[] = [],
      users: string[] = [];
    const now = new Date("2030-02-01T01:00:00Z");
    async function fixture() {
      const key = randomUUID();
      const owner = await db.user.create({
        data: { email: `${key}-owner@example.test` },
      });
      const coach = await db.user.create({
        data: { email: `${key}-coach@example.test` },
      });
      const customer = await db.user.create({
        data: { email: `${key}-customer@example.test` },
      });
      users.push(owner.id, coach.id, customer.id);
      const workspace = await db.workspace.create({
        data: {
          name: `Fictional directory ${key}`,
          status: "ACTIVE",
          location: {
            create: {
              name: "Mat",
              timezone: "UTC",
              rooms: { create: { name: "Main", capacity: 100 } },
            },
          },
          workspaceUsers: {
            create: [
              { userId: owner.id, role: "OWNER" },
              { userId: coach.id, role: "COACH" },
              { userId: customer.id, role: "CUSTOMER" },
            ],
          },
        },
        include: {
          workspaceUsers: true,
          location: { include: { rooms: true } },
        },
      });
      workspaces.push(workspace.id);
      const ownerStaff = workspace.workspaceUsers.find(
        (row) => row.userId === owner.id,
      )!;
      const coachStaff = workspace.workspaceUsers.find(
        (row) => row.userId === coach.id,
      )!;
      const member = await db.member.create({
        data: {
          workspaceId: workspace.id,
          fullName: "Fictional directory participant",
          email: customer.email,
          userId: customer.id,
          dateOfBirth: new Date("1990-01-01Z"),
          status: "ACTIVE",
        },
      });
      const program = await db.program.create({
        data: { workspaceId: workspace.id, name: "Recorded padwork" },
      });
      const template = await db.classTemplate.create({
        data: {
          workspaceId: workspace.id,
          programId: program.id,
          roomId: workspace.location!.rooms[0]!.id,
          weekday: "FRIDAY",
          startTimeMinutes: 1080,
          endTimeMinutes: 1140,
          bookingCutoffMinutes: 0,
          cancellationCutoffMinutes: 120,
        },
      });
      const plan = await db.membershipPlan.create({
        data: {
          workspaceId: workspace.id,
          name: "Accepted limits",
          monthlyPriceCents: 10000,
          weeklyClassLimit: 3,
          monthlyClassLimit: 8,
        },
      });
      const membership = await db.memberMembership.create({
        data: {
          workspaceId: workspace.id,
          memberId: member.id,
          membershipPlanId: plan.id,
          status: "ACTIVE",
          startedAt: new Date("2029-01-01Z"),
          allowanceTimezone: "America/Los_Angeles",
          allowanceAnchorDate: new Date("2030-01-01Z"),
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotMembershipTerms(plan, now)),
          ),
        },
      });
      return {
        workspace,
        member,
        owner,
        coach,
        customer,
        ownerStaff,
        coachStaff,
        plan,
        membership,
        program,
        template,
        actor: { workspaceId: workspace.id, userId: owner.id },
      };
    }
    const query = (
      f: Awaited<ReturnType<typeof fixture>>,
      filters: Record<string, unknown> = {},
      extra: { after?: string; pageSize?: number } = {},
    ) =>
      readOwnerMemberDirectory(f.actor, {
        db,
        now,
        filters: parseMemberDirectoryFilters(filters),
        ...extra,
      });
    afterAll(async () => {
      for (const workspaceId of workspaces)
        await db.$transaction(
          async (tx) => {
            await lockClassSchedule(tx, workspaceId);
            const inventory = await inspectRetentionInventory(tx, workspaceId);
            await deleteReviewedWorkspaceRecords(
              tx,
              workspaceId,
              inventory.fingerprint,
            );
          },
          { timeout: 120000 },
        );
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    }, 120000);
    it("applies name/contact, program, cohort, condition and archive predicates before pagination", async () => {
      const f = await fixture();
      await db.member.createMany({
        data: Array.from({ length: 55 }, (_, index) => ({
          workspaceId: f.workspace.id,
          fullName: `AAA unrelated ${index}`,
          tags: ["Competition"],
        })),
      });
      await db.member.update({
        where: { id: f.member.id },
        data: {
          fullName: "ZZZ selected participant",
          phone: "+1 fictional 778",
          tags: ["Competition"],
        },
      });
      await db.classBooking.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date("2030-02-01Z"),
          status: "BOOKED",
        },
      });
      const page = await query(
        f,
        {
          q: "778",
          classProgram: "padwork",
          cohortLabel: "Competition",
          condition: "CLASS_BOOKED",
        },
        { pageSize: 1 },
      );
      expect(page.members.map((row) => row.id)).toEqual([f.member.id]);
      expect(page.nextCursor).toBeNull();
      await db.member.update({
        where: { id: f.member.id },
        data: { archivedAt: now },
      });
      expect((await query(f, { q: "778" })).members).toHaveLength(0);
      expect(
        (await query(f, { q: "778", archived: "1" })).members.map(
          (row) => row.id,
        ),
      ).toEqual([f.member.id]);
    });
    it("keeps duplicate names distinct and reuses every filter on subsequent cursor pages", async () => {
      const f = await fixture();
      await db.member.createMany({
        data: Array.from({ length: 53 }, () => ({
          workspaceId: f.workspace.id,
          fullName: "Same fictional name",
          tags: ["Search cohort"],
        })),
      });
      let after: string | undefined;
      const ids: string[] = [];
      do {
        const page = await query(
          f,
          { q: "Same fictional", cohortLabel: "Search cohort" },
          { after },
        );
        ids.push(...page.members.map((row) => row.id));
        after = page.nextCursor ?? undefined;
      } while (after);
      expect(ids).toHaveLength(53);
      expect(new Set(ids).size).toBe(53);
      const first = await query(f, {
        q: "Same fictional",
        cohortLabel: "Search cohort",
      });
      await expect(
        query(f, { q: "Changed filter" }, { after: first.nextCursor! }),
      ).rejects.toThrow("filters changed");
    });
    it("denies coaches, customers, revoked owners and disabled businesses without exposing the owner directory", async () => {
      const f = await fixture(),
        filters = parseMemberDirectoryFilters({});
      for (const userId of [f.coach.id, f.customer.id])
        await expect(
          readOwnerMemberDirectory(
            { workspaceId: f.workspace.id, userId },
            { filters, db, now },
          ),
        ).rejects.toThrow("staff access changed");
      const other = await fixture();
      expect(
        await readOwnerMemberServiceSummary(f.actor, other.member.id, {
          db,
          now,
        }),
      ).toBeNull();
      await db.workspaceUser.update({
        where: { id: f.ownerStaff.id },
        data: { isActive: false },
      });
      await expect(query(f)).rejects.toThrow("staff access changed");
      await db.workspaceUser.update({
        where: { id: f.ownerStaff.id },
        data: { isActive: true },
      });
      await db.workspace.update({
        where: { id: f.workspace.id },
        data: { status: "DISABLED" },
      });
      await expect(query(f)).rejects.toThrow("staff access changed");
    });
    it("selects tag heads before retraction/purpose projection and never exposes note bodies", async () => {
      const f = await fixture(),
        label = "Use side entrance",
        recordKey = `tag:OPERATIONAL:${createHash("sha256").update(label).digest("hex")}`;
      await changeMemberOperations(
        f.actor,
        {
          memberId: f.member.id,
          recordKey,
          recordKind: "TAG",
          action: "ADD",
          tagLabel: label,
          tagPurpose: "OPERATIONAL",
          visibility: "ASSIGNED_OPERATIONS",
          expectedVersion: 0,
          operationId: randomUUID(),
        },
        { db, now },
      );
      await changeMemberOperations(
        f.actor,
        {
          memberId: f.member.id,
          recordKey,
          recordKind: "TAG",
          action: "RETRACT",
          tagLabel: label,
          tagPurpose: "OPERATIONAL",
          expectedVersion: 1,
          operationId: randomUUID(),
          reason: "Fictional instruction withdrawn",
        },
        { db, now },
      );
      await changeMemberOperations(
        f.actor,
        {
          memberId: f.member.id,
          recordKey: `note:${randomUUID()}`,
          recordKind: "NOTE",
          action: "ADD",
          noteBody: "PRIVATE_NOTE_SENTINEL",
          visibility: "OWNER_ONLY",
          expectedVersion: 0,
          operationId: randomUUID(),
        },
        { db, now },
      );
      const page = await query(f);
      expect(page.members[0]!.services.operationalTags).toEqual([]);
      expect(JSON.stringify(page)).not.toContain("PRIVATE_NOTE_SENTINEL");
      expect(
        (await db.member.findUniqueOrThrow({ where: { id: f.member.id } }))
          .tags,
      ).not.toContain(label);
    });
    it("retains independent freeze, debt, pack and coaching facts when one payment becomes current", async () => {
      const f = await fixture();
      await db.memberMembership.update({
        where: { id: f.membership.id },
        data: {
          status: "FROZEN",
          frozenFrom: new Date("2030-01-15Z"),
          frozenUntil: new Date("2030-02-15Z"),
        },
      });
      await db.membershipBillingState.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          memberMembershipId: f.membership.id,
          status: "PAYMENT_FAILED",
        },
      });
      const product = await db.punchCardProduct.create({
        data: {
          workspaceId: f.workspace.id,
          name: "Separately acquired pack",
          punchesIncluded: 5,
          priceCents: 5000,
        },
      });
      const pack = await db.memberPunchCard.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          punchCardProductId: product.id,
          originalPunches: 5,
          remainingPunches: 4,
          purchasePriceCents: 5000,
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotPunchCardTerms(product, now)),
          ),
        },
      });
      const program = await db.coachingProgram.create({
        data: { workspaceId: f.workspace.id, name: "Separate coaching" },
      });
      const version = await db.coachingProgramVersion.create({
        data: {
          programId: program.id,
          number: 1,
          durationDays: 30,
          deliveryWeekdays: [1],
          responseHours: 24,
          goals: "PRIVATE_GOALS_SENTINEL",
          milestones: [],
          priceCents: 10000,
          currency: "cad",
          terms: "Accepted fictional terms",
        },
      });
      await db.coachingEnrollment.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          programVersionId: version.id,
          startsOn: new Date("2030-01-01Z"),
          endsOn: new Date("2030-02-28Z"),
          timezone: "UTC",
          acceptedAt: now,
          contactVerifiedAt: now,
          currentCoachWorkspaceUserId: f.coachStaff.id,
          paymentState: "PAID",
          caseOwnerWorkspaceUserId: f.ownerStaff.id,
        },
      });
      const invoice = await db.invoice.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          memberMembershipId: f.membership.id,
          subtotalCents: 10000,
          totalCents: 10000,
          amountDueCents: 10000,
          status: "OPEN",
        },
      });
      await db.membershipBillingState.update({
        where: { memberMembershipId: f.membership.id },
        data: { status: "ACTIVE" },
      });
      const page = await query(f),
        summary = page.members[0]!.services;
      expect(summary.membership).toMatchObject({
        contractState: "FROZEN",
        paymentState: "ACTIVE",
      });
      expect(summary.packs).toContainEqual(
        expect.objectContaining({
          id: pack.id,
          recordedUnits: 4,
          state: "RECORDED_BALANCE",
        }),
      );
      expect(summary.coaching).toContainEqual(
        expect.objectContaining({ state: "ACTIVE", paymentState: "PAID" }),
      );
      expect(
        (await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } }))
          .amountDueCents,
      ).toBe(10000);
      expect(
        (
          await db.memberMembership.findUniqueOrThrow({
            where: { id: f.membership.id },
          })
        ).status,
      ).toBe("FROZEN");
      expect(JSON.stringify(page)).not.toContain("PRIVATE_GOALS_SENTINEL");
    });
    it("matches the single reader for dual caps, opening balance, settlement and adjustment in the accepted timezone", async () => {
      const f = await fixture();
      // Change today's catalog; the accepted 3/8 limits must remain authoritative.
      await db.membershipPlan.update({
        where: { id: f.plan.id },
        data: { weeklyClassLimit: 1, monthlyClassLimit: 1 },
      });
      const booking = await db.classBooking.create({
        data: {
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          classTemplateId: f.template.id,
          scheduledForDate: new Date("2030-01-31Z"),
          fundingMembershipId: f.membership.id,
        },
      });
      for (const [kind, start, end, cap] of [
        ["BILLING_MONTH", "2030-01-01", "2030-02-01", 8],
        ["WEEK", "2030-01-29", "2030-02-01", 3],
      ] as const) {
        await db.membershipAllowanceAllocation.create({
          data: {
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            memberMembershipId: f.membership.id,
            bookingId: booking.id,
            kind,
            periodStart: new Date(start),
            periodEnd: new Date(end),
            limit: cap,
            state: "RESERVED",
          },
        });
        await db.membershipAllowanceOpeningBalance.create({
          data: {
            workspaceId: f.workspace.id,
            memberMembershipId: f.membership.id,
            kind,
            periodStart: new Date(start),
            periodEnd: new Date(end),
            asOfDate: new Date("2030-01-30Z"),
            usedCount: 1,
            sourceExternalId: randomUUID(),
            sourceEvidence: "Fictional imported count",
            sourceFileHash: "a".repeat(64),
            sourceRowHash: "b".repeat(64),
            importJobId: "fictional-job",
            stagingRecordId: "fictional-row",
            actorId: f.owner.id,
          },
        });
        await db.membershipAllowanceAdjustment.create({
          data: {
            id: randomUUID(),
            workspaceId: f.workspace.id,
            memberId: f.member.id,
            memberMembershipId: f.membership.id,
            kind,
            periodStart: new Date(start),
            periodEnd: new Date(end),
            delta: 1,
            reason: "Fictional reviewed adjustment",
            actorWorkspaceUserId: f.ownerStaff.id,
          },
        });
      }
      const single = await getMembershipAllowanceSummary({
        workspaceId: f.workspace.id,
        memberId: f.member.id,
        scheduledForDate: "2030-02-01",
        occurrenceStartsAt: now,
        timezone: "UTC",
        db,
      });
      const batch = await db.$transaction((tx) =>
        summarizeMembershipAllowancesForMembersTx({
          workspaceId: f.workspace.id,
          memberIds: [f.member.id],
          scheduledForDate: "2030-02-01",
          occurrenceStartsAt: now,
          timezone: "UTC",
          db: tx,
        }),
      );
      expect(batch.get(f.member.id)).toEqual({
        state: "READY",
        membershipId: f.membership.id,
        summary: single,
      });
      expect(single!.windows).toContainEqual(
        expect.objectContaining({
          kind: "WEEK",
          startsOn: "2030-01-29",
          limit: 4,
          reserved: 1,
          used: 1,
          remaining: 2,
        }),
      );
      expect(single!.windows).toContainEqual(
        expect.objectContaining({
          kind: "BILLING_MONTH",
          startsOn: "2030-01-01",
          limit: 9,
          reserved: 1,
          used: 1,
          remaining: 7,
        }),
      );
    });
    it("applies a required-forms operational filter before selecting the first page", async () => {
      const f = await fixture();
      await db.member.createMany({
        data: Array.from({ length: 55 }, (_, index) => ({
          workspaceId: f.workspace.id,
          fullName: `AAA trial ${index}`,
          status: "TRIAL",
        })),
      });
      const document = await db.formDocument.create({
        data: {
          workspaceId: f.workspace.id,
          name: "Fictional required member form",
          formType: "WAIVER",
        },
      });
      const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
      const version = await db.formVersion.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: document.id,
          versionNumber: 1,
          fileName: "fictional.pdf",
          mimeType: "application/pdf",
          fileData: bytes,
          fileSizeBytes: bytes.length,
          fileSha256: createHash("sha256").update(bytes).digest("hex"),
          uploadedByWorkspaceUserId: f.ownerStaff.id,
        },
      });
      await db.formDocument.update({
        where: { id: document.id },
        data: { currentVersionId: version.id },
      });
      await db.requiredFormAssignment.create({
        data: {
          workspaceId: f.workspace.id,
          formDocumentId: document.id,
          requirementTarget: "MEMBER",
        },
      });
      const page = await query(
        f,
        { forms: "ACTION_REQUIRED" },
        { pageSize: 1 },
      );
      expect(page.members.map((row) => row.id)).toEqual([f.member.id]);
      expect(page.members[0]!.forms).toMatchObject({
        state: "ACTION_REQUIRED",
        requiredCount: 1,
        missingCount: 1,
      });
      expect(page.nextCursor).toBeNull();
    });
    it("keeps the actual database query count bounded as a directory page grows from one to fifty people", async () => {
      const f = await fixture();
      const extra = Array.from({ length: 49 }, (_, index) => ({
        id: randomUUID(),
        workspaceId: f.workspace.id,
        fullName: `ZZZ bounded ${index}`,
        status: "ACTIVE" as const,
      }));
      await db.member.createMany({ data: extra });
      await db.memberMembership.createMany({
        data: extra.map((member) => ({
          workspaceId: f.workspace.id,
          memberId: member.id,
          membershipPlanId: f.plan.id,
          startedAt: new Date("2029-01-01Z"),
          allowanceTimezone: "UTC",
          allowanceAnchorDate: new Date("2030-01-01Z"),
          acceptedTerms: JSON.parse(
            JSON.stringify(snapshotMembershipTerms(f.plan, now)),
          ),
        })),
      });
      const measured = new PrismaClient({
        datasourceUrl: url,
        log: [{ emit: "event", level: "query" }],
      });
      let count = 0;
      measured.$on("query", () => {
        count++;
      });
      try {
        await readOwnerMemberDirectory(f.actor, {
          db: measured,
          now,
          filters: parseMemberDirectoryFilters({}),
          pageSize: 1,
        });
        const one = count;
        count = 0;
        const page = await readOwnerMemberDirectory(f.actor, {
          db: measured,
          now,
          filters: parseMemberDirectoryFilters({}),
          pageSize: 50,
        });
        expect(page.members).toHaveLength(50);
        expect(count).toBeLessThanOrEqual(one + 3);
        expect(count).toBeLessThan(50);
      } finally {
        await measured.$disconnect();
      }
    });
    it("bounds page work and explicitly reports truncated product history rather than asserting no access", async () => {
      const f = await fixture();
      const product = await db.punchCardProduct.create({
        data: {
          workspaceId: f.workspace.id,
          name: "History pack",
          punchesIncluded: 2,
          priceCents: 2000,
        },
      });
      await db.memberPunchCard.createMany({
        data: Array.from({ length: 12 }, () => ({
          workspaceId: f.workspace.id,
          memberId: f.member.id,
          punchCardProductId: product.id,
          originalPunches: 2,
          remainingPunches: 1,
          purchasePriceCents: 2000,
        })),
      });
      const page = await query(f);
      expect(page.members[0]!.services.packs).toHaveLength(10);
      expect(page.members[0]!.services.morePacks).toBe(true);
      await expect(
        readOwnerMemberDirectory(f.actor, {
          db,
          now,
          filters: parseMemberDirectoryFilters({}),
          pageSize: 51,
        }),
      ).rejects.toThrow("between 1 and 50");
      await expect(
        db.$transaction((tx) =>
          summarizeMembershipAllowancesForMembersTx({
            db: tx,
            workspaceId: f.workspace.id,
            memberIds: Array.from({ length: 51 }, (_, i) => `member_${i}`),
            scheduledForDate: "2030-01-31",
            timezone: "UTC",
          }),
        ),
      ).rejects.toThrow("at most 50");
    });
  },
);
