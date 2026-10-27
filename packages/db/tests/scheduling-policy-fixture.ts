import type { PrismaClient, Prisma } from "@prisma/client";
import {
  schedulingWeekdays,
  schedulingPolicyHash,
  type ClassSchedulingPolicy,
  type SchedulingPolicyRevision,
} from "../src/scheduling-policy.js";
/** Explicit fictional test policy. Production callers must obtain owner confirmation. */
export const fixtureClassSchedulingPolicy: ClassSchedulingPolicy = {
  schemaVersion: 1,
  classes: {
    weeklyHours: schedulingWeekdays.map((weekday) => ({
      weekday,
      intervals: [{ startMinute: 0, endMinute: 1440 }],
    })),
    maxAdvanceMinutes: 60 * 1440,
    minimumLeadMinutes: 0,
  },
};
export function fixtureSchedulingRevision(
  workspaceId = "workspace_1",
): SchedulingPolicyRevision {
  return {
    id: `fixture-policy:${workspaceId}`,
    workspaceId,
    version: 1,
    policy: fixtureClassSchedulingPolicy,
    policyHash: schedulingPolicyHash(fixtureClassSchedulingPolicy),
    activatedAt: new Date("2000-01-01T00:00:00Z"),
  };
}
export async function createFixtureClassSchedulingPolicy(
  db: Pick<
    PrismaClient | Prisma.TransactionClient,
    "workspaceSchedulingPolicyRevision"
  >,
  workspaceId: string,
  actorUserId = "fictional-reviewed-owner",
) {
  const revision = fixtureSchedulingRevision(workspaceId);
  return db.workspaceSchedulingPolicyRevision.create({
    data: {
      id: revision.id,
      workspaceId,
      version: 1,
      policy: fixtureClassSchedulingPolicy as unknown as Prisma.InputJsonValue,
      policyHash: revision.policyHash,
      previewHash: revision.policyHash,
      actorUserId,
      reason:
        "Explicit fictional fixture: daily opening, 60-day window, no extra notice",
      activatedAt: revision.activatedAt,
    },
  });
}
