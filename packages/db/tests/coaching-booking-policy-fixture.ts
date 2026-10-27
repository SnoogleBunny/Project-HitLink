import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { lockClassSchedule } from "../src/class-occurrences.js";
import {
  deleteReviewedWorkspaceRecords,
  inspectRetentionInventory,
} from "../src/retention-inventory.js";
import {
  confirmCoachingBookingPolicy,
  previewCoachingBookingPolicy,
} from "../src/coaching-booking-settings.js";
import {
  coachingBookingWeekdays,
  parseCoachingBookingPolicy,
  type CoachingBookingPolicy,
} from "../src/coaching-booking-policy.js";

/** Fictional test policy only. This is never a runtime or migration default. */
export const fixtureCoachingBookingPolicy: CoachingBookingPolicy = {
  schemaVersion: 1,
  appointments: {
    weeklyHours: coachingBookingWeekdays.map((weekday) => ({
      weekday,
      intervals: [{ startMinute: 0, endMinute: 1440 }],
    })),
    maxAdvanceMinutes: 60 * 1440,
    minimumLeadMinutes: 0,
    minimumBufferMinutes: 0,
    resolutionResponseHours: 24,
  },
};

/** Confirm actual policy history through the same preview/commit path as owners. */
export async function createFixtureCoachingBookingPolicy(
  db: PrismaClient,
  workspaceId: string,
  ownerUserId: string,
  now = new Date(),
) {
  const actor = { workspaceId, userId: ownerUserId };
  const input = {
    policy: parseCoachingBookingPolicy(fixtureCoachingBookingPolicy),
    reason:
      "Explicit fictional fixture: all seven service days open, 60-day horizon, zero lead/buffer, 24-hour booking-help review",
    expectedVersion: 0,
    operationId: randomUUID(),
  };
  const review = await previewCoachingBookingPolicy({ actor, input, db, now });
  return confirmCoachingBookingPolicy({
    actor,
    input,
    db,
    now,
    previewHash: review.previewHash,
    confirmed: true,
  });
}

/** Use the canonical reviewed purge for fictional policy receipts and their workspace. */
export async function deleteFixtureCoachingWorkspace(
  db: PrismaClient,
  workspaceId: string,
) {
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
          const inventory = await inspectRetentionInventory(tx, workspaceId);
          await deleteReviewedWorkspaceRecords(
            tx,
            workspaceId,
            inventory.fingerprint,
          );
        },
        { isolationLevel: "Serializable", timeout: 120000 },
      );
      return;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 11
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 25 + Math.random() * 100),
      );
    }
  }
}
