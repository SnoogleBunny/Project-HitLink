import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  PrismaClient,
  createAccessBackedBooking,
  lockClassSchedule,
  parseBookingFormSnapshot,
  recordLocalFormSignature,
  snapshotMembershipTerms,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
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
    "Booking audience tests need a dedicated loopback test database.",
  );
(url ? describe : describe.skip)(
  "booking form audience is independent from funding/source",
  () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const workspaces: string[] = [],
      users: string[] = [];
    const now = new Date("2030-01-01T12:00:00Z");
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
    for (const status of ["TRIAL", "ACTIVE"] as const)
      for (const source of [
        "ADMIN",
        "MEMBER_PORTAL",
        "PUBLIC_TRIAL",
      ] as const) {
        it(`requires the ${status} person's current audience waiver for ${source} before any booking/funding write`, async () => {
          const owner = await db.user.create({
            data: { email: `${randomUUID()}-owner@example.test` },
          });
          const user = await db.user.create({
            data: { email: `${randomUUID()}-participant@example.test` },
          });
          users.push(owner.id, user.id);
          const workspace = await db.workspace.create({
            data: {
              name: `audience-forms-${randomUUID()}`,
              location: {
                create: {
                  name: "Gym",
                  timezone: "UTC",
                  rooms: { create: { name: "Mat", capacity: 5 } },
                },
              },
              workspaceUsers: {
                create: [
                  { userId: owner.id, role: "OWNER" },
                  { userId: user.id, role: "CUSTOMER" },
                ],
              },
            },
            include: {
              workspaceUsers: true,
              location: { include: { rooms: true } },
            },
          });
          const workspaceId = workspace.id;
          workspaces.push(workspaceId);
          await createFixtureClassSchedulingPolicy(db, workspaceId);
          const member = await db.member.create({
            data: {
              workspaceId,
              userId: user.id,
              email: user.email,
              fullName: "Fictional audience participant",
              status,
            },
          });
          const program = await db.program.create({
            data: { workspaceId, name: "Muay Thai" },
          });
          const template = await db.classTemplate.create({
            data: {
              workspaceId,
              programId: program.id,
              roomId: workspace.location!.rooms[0]!.id,
              weekday: "MONDAY",
              startTimeMinutes: 1080,
              endTimeMinutes: 1140,
              bookingCutoffMinutes: 60,
              cancellationCutoffMinutes: 120,
            },
          });
          const plan = await db.membershipPlan.create({
            data: {
              workspaceId,
              name: "Fictional valid membership",
              monthlyPriceCents: 10000,
              weeklyClassLimit: 2,
            },
          });
          await db.memberMembership.create({
            data: {
              workspaceId,
              memberId: member.id,
              membershipPlanId: plan.id,
              startedAt: new Date("2029-12-01Z"),
              allowanceAnchorDate: new Date("2030-01-01Z"),
              allowanceTimezone: "UTC",
              acceptedTerms: JSON.parse(
                JSON.stringify(snapshotMembershipTerms(plan, now)),
              ),
            },
          });
          const document = await db.formDocument.create({
            data: {
              workspaceId,
              name: "Exact current audience waiver",
              formType: "WAIVER",
            },
          });
          const bytes = Buffer.from("%PDF-1.7\n%%EOF\n");
          const version = await db.formVersion.create({
            data: {
              workspaceId,
              formDocumentId: document.id,
              versionNumber: 1,
              fileName: "fictional.pdf",
              mimeType: "application/pdf",
              fileData: bytes,
              fileSizeBytes: bytes.length,
              fileSha256: createHash("sha256").update(bytes).digest("hex"),
              uploadedByWorkspaceUserId: workspace.workspaceUsers.find(
                (row) => row.userId === owner.id,
              )!.id,
            },
          });
          await db.formDocument.update({
            where: { id: document.id },
            data: { currentVersionId: version.id },
          });
          await db.requiredFormAssignment.create({
            data: {
              workspaceId,
              formDocumentId: document.id,
              requirementTarget: status === "TRIAL" ? "TRIAL" : "MEMBER",
            },
          });
          const book = () =>
            createAccessBackedBooking({
              workspaceId,
              memberId: member.id,
              classTemplateId: template.id,
              scheduledForDate: "2030-01-07",
              timezone: "UTC",
              source,
              trial: source === "PUBLIC_TRIAL",
              db: db as never,
              now,
            });
          expect(await book()).toMatchObject({
            status: "error",
            code: "NO_ACCESS",
          });
          expect(await db.classBooking.count({ where: { workspaceId } })).toBe(
            0,
          );
          expect(
            await db.membershipAllowanceAllocation.count({
              where: { workspaceId },
            }),
          ).toBe(0);
          const request = await db.signatureRequest.create({
            data: {
              workspaceId,
              memberId: member.id,
              formVersionId: version.id,
              signerKind: "MEMBER",
              accessMethod: "PORTAL",
            },
          });
          expect(
            (
              await recordLocalFormSignature({
                workspaceId,
                memberId: member.id,
                requestId: request.id,
                actorUserId: user.id,
                signerName: "Fictional audience participant",
                db,
                now,
              })
            ).status,
          ).toBe("signed");
          const booking = await book();
          expect(booking.status).toBe("created");
          if (booking.status !== "created")
            throw new Error(
              "The exact signed waiver must permit this fixture booking.",
            );
          const stored = await db.classBooking.findUniqueOrThrow({
            where: { id: booking.bookingId },
          });
          const receipt = parseBookingFormSnapshot(
            stored.formRequirementSnapshot,
          );
          expect(receipt?.requirements).toHaveLength(1);
          expect(receipt?.requirements[0]).toMatchObject({
            formDocumentId: document.id,
            formVersionId: version.id,
            acceptanceCycleKey: "legacy",
            signerKind: "MEMBER",
          });
          expect(receipt?.serviceAt).toBe("2030-01-07T18:00:00.000Z");
        });
      }
  },
);
