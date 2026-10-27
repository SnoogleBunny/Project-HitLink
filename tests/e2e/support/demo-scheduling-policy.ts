import type { PrismaClient } from "@prisma/client";
import {
  confirmClassSchedulingPolicy,
  previewClassSchedulingPolicy,
  schedulingWeekdays,
  type ClassSchedulingPolicy,
} from "../../../packages/db/src/index.js";
/** Upgrade only the preserved fictional E2E demo, never runtime or a customer's workspace. */
export async function ensureDemoSchedulingPolicy(
  db: PrismaClient,
  databaseUrl = process.env.DATABASE_URL,
) {
  let target: URL;
  try {
    target = new URL(databaseUrl ?? "");
  } catch {
    throw new Error("An explicit disposable E2E database is required.");
  }
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    [...target.searchParams.keys()].some(
      (key) => key.toLowerCase() === "host",
    ) ||
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    !/test|e2e|canonical_repair/i.test(decodeURIComponent(target.pathname))
  )
    throw new Error(
      "Demo policy upgrades are limited to dedicated local E2E test databases.",
    );
  const workspace = await db.workspace.findUnique({
    where: { id: "demo-workspace-flowstate" },
    include: { migration: true, workspaceUsers: { include: { user: true } } },
  });
  const owner = workspace?.workspaceUsers.find(
    (row) =>
      row.role === "OWNER" &&
      row.isActive &&
      row.user.email === "demo-owner@flowstate.local",
  );
  if (
    !workspace ||
    !owner ||
    workspace.migration?.id !== "demo-workspace-migration" ||
    workspace.migration.stage !== "COMPLETE"
  )
    throw new Error(
      "The canonical fictional demo and its owner must be present before a test policy upgrade.",
    );
  if (
    await db.workspaceSchedulingPolicyRevision.findFirst({
      where: { workspaceId: workspace.id },
    })
  )
    return;
  const policy: ClassSchedulingPolicy = {
    schemaVersion: 1,
    classes: {
      weeklyHours: schedulingWeekdays.map((weekday) => ({
        weekday,
        intervals: [{ startMinute: 360, endMinute: 1320 }],
      })),
      maxAdvanceMinutes: 60 * 1440,
      minimumLeadMinutes: 30,
    },
  };
  const actor = { workspaceId: workspace.id, userId: owner.userId },
    input = {
      policy,
      reason:
        "Explicit fictional E2E fixture upgrade: daily 06:00–22:00, rolling 60-day window, 30-minute notice",
      expectedVersion: 0,
    };
  const review = await previewClassSchedulingPolicy({ actor, input, db });
  await confirmClassSchedulingPolicy({
    actor,
    input,
    db,
    previewHash: review.previewHash,
    confirmed: true,
  });
}
