import { randomUUID } from "node:crypto";
import { createOwnerWorkspaceOnboarding } from "../lib/onboarding";
import {
  Prisma,
  PrismaClient,
  lockClassSchedule,
  snapshotMembershipTerms,
  createAccessBackedBooking,
} from "@flowstate/db";
import { createFixtureClassSchedulingPolicy } from "../../../packages/db/tests/scheduling-policy-fixture.js";
import {
  inspectRetentionInventory,
  deleteReviewedWorkspaceRecords,
} from "../../../packages/db/src/retention-inventory.js";

export const testUrl = process.env.TEST_DATABASE_URL;
if (
  testUrl &&
  (!["localhost", "127.0.0.1"].includes(new URL(testUrl).hostname) ||
    !new URL(testUrl).pathname.endsWith("_test") ||
    !process.env.DATABASE_URL ||
    new URL(testUrl).host !== new URL(process.env.DATABASE_URL).host ||
    new URL(testUrl).pathname !== new URL(process.env.DATABASE_URL).pathname)
)
  throw new Error(
    "Booking notice tests require matching local disposable DATABASE_URL and TEST_DATABASE_URL ending in _test.",
  );
export function noticeFixtures() {
  const db = new PrismaClient({ datasourceUrl: testUrl }),
    workspaces: string[] = [],
    users: string[] = [];
  const now = new Date("2030-01-01T12:00:00Z"),
    date = "2030-01-07";
  async function fixture(options: { freshOnboarding?: boolean } = {}) {
    const owner = await db.user.create({
      data: {
        email: `${randomUUID()}@booking-notice.example.test`,
        fullName: "Fictional owner",
      },
    });
    users.push(owner.id);
    const readiness = {
      stage: "COMPLETE" as const,
      nextOwnerAction: "Ready",
      flowstateResponsibility: "Ready",
      ownerReviewAcknowledgedAt: now,
      ownerReviewAcknowledgedByUserId: owner.id,
      operationallyReadyAt: now,
      operationallyReadyByUserId: owner.id,
    };
    const onboarding = options.freshOnboarding
      ? await createOwnerWorkspaceOnboarding({
          input: {
            userId: owner.id,
            workspaceName: `Fictional onboarding notice ${randomUUID()}`,
            kind: "MIGRATION",
            timezone: "UTC",
          },
          db: db as never,
        })
      : null;
    if (onboarding && onboarding.status !== "created")
      throw new Error("Expected an isolated fresh onboarding fixture.");
    // Track the committed onboarding transaction before any readiness fixture write.
    if (onboarding?.status === "created") workspaces.push(onboarding.workspaceId);
    const workspace = onboarding?.status === "created"
      ? await db.workspace.update({
          where: { id: onboarding.workspaceId },
          // Explicit fictional readiness evidence, not a production activation claim.
          data: { status: "ACTIVE", migration: { update: readiness } },
        })
      : await db.workspace.create({
          data: {
            name: `Fictional booking notice ${randomUUID()}`,
            status: "ACTIVE",
            migration: { create: readiness },
          },
        });
    if (!onboarding) workspaces.push(workspace.id);
    const staff = onboarding
      ? await db.workspaceUser.findUniqueOrThrow({ where: { userId: owner.id } })
      : await db.workspaceUser.create({
          data: {
            workspaceId: workspace.id,
            userId: owner.id,
            role: "OWNER",
            isActive: true,
          },
        });
    await createFixtureClassSchedulingPolicy(db, workspace.id, owner.id);
    const locationData = {
      name: "Fictional Gym",
      timezone: "UTC",
      addressLine1: "123 Fictional Road",
      city: "Fictional City",
      countryCode: "CA",
    };
    const location = onboarding
      ? await db.location.update({ where: { workspaceId: workspace.id }, data: locationData })
      : await db.location.create({ data: { workspaceId: workspace.id, ...locationData } });
    const room = await db.room.create({
      data: { locationId: location.id, name: "North mat", capacity: 12 },
    });
    const program = await db.program.create({
      data: { workspaceId: workspace.id, name: "Fictional Muay Thai" },
    });
    const template = await db.classTemplate.create({
      data: {
        workspaceId: workspace.id,
        roomId: room.id,
        programId: program.id,
        title: "Evening technique",
        weekday: "MONDAY",
        startTimeMinutes: 1080,
        endTimeMinutes: 1140,
        bookingCutoffMinutes: 60,
        cancellationCutoffMinutes: 120,
      },
    });
    const plan = await db.membershipPlan.create({
      data: {
        workspaceId: workspace.id,
        name: "Fictional unlimited",
        monthlyPriceCents: 12000,
      },
    });
    const account = await db.user.create({
      data: {
        email: `${randomUUID()}@booking-notice.example.test`,
        fullName: "Fictional participant",
        workspaceUsers: {
          create: {
            workspaceId: workspace.id,
            role: "CUSTOMER",
            isActive: true,
          },
        },
      },
    });
    users.push(account.id);
    const member = await db.member.create({
      data: {
        workspaceId: workspace.id,
        userId: account.id,
        fullName: "Fictional participant",
        email: account.email,
        notes: "PRIVATE_NOTE_NEVER_EMAIL",
        dateOfBirth: new Date("2000-01-01"),
        status: "ACTIVE",
      },
    });
    const membership = await db.memberMembership.create({
      data: {
        workspaceId: workspace.id,
        memberId: member.id,
        membershipPlanId: plan.id,
        status: "ACTIVE",
        startedAt: new Date("2029-12-01"),
        allowanceAnchorDate: new Date("2030-01-01"),
        allowanceTimezone: "UTC",
        acceptedTerms: JSON.parse(
          JSON.stringify(snapshotMembershipTerms(plan)),
        ),
      },
    });
    const book = (
      changes: Partial<Parameters<typeof createAccessBackedBooking>[0]> = {},
    ) =>
      createAccessBackedBooking({
        workspaceId: workspace.id,
        memberId: member.id,
        classTemplateId: template.id,
        scheduledForDate: date,
        timezone: "UTC",
        source: "ADMIN",
        allowDropIn: false,
        db: db as never,
        now,
        ...changes,
      });
    return {
      workspace,
      owner,
      staff,
      location,
      room,
      program,
      template,
      plan,
      account,
      member,
      membership,
      book,
    };
  }
  async function cleanup() {
    for (const workspaceId of [...workspaces]) {
      for (let attempt = 0; ; attempt++) {
        try {
          await db.$transaction(
            async (tx) => {
              await lockClassSchedule(tx, workspaceId);
              for (const prefix of ["family-access", "financial", "retention"])
                await tx.$queryRawUnsafe(
                  "SELECT pg_advisory_xact_lock(hashtext($1))::text",
                  `${prefix}:${workspaceId}`,
                );
              const inventory = await inspectRetentionInventory(
                tx,
                workspaceId,
              );
              await deleteReviewedWorkspaceRecords(
                tx,
                workspaceId,
                inventory.fingerprint,
              );
            },
            { isolationLevel: "Serializable", timeout: 120000 },
          );
          workspaces.splice(workspaces.indexOf(workspaceId), 1);
          break;
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2034" ||
            attempt >= 11
          )
            throw error;
        }
      }
    }
    await db.user.deleteMany({ where: { id: { in: [...users] } } });
    users.splice(0, users.length);
  }
  const disconnect = () => db.$disconnect();
  return { db, fixture, cleanup, disconnect, now, date, users };
}
