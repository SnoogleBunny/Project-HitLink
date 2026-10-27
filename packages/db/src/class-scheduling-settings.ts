import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import {
  classOccurrenceInclude,
  lockClassSchedule,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import {
  addDays,
  dateOnlyStringToUtcDate,
  getWorkspaceDateString,
  toDateOnlyString,
} from "./occurrences.js";
import {
  parseClassSchedulingPolicy,
  evaluateClassSchedulingPolicy,
  schedulingPolicyHash,
  SchedulingPolicyError,
  type ClassSchedulingPolicy,
} from "./scheduling-policy.js";

type Actor = { workspaceId: string; userId: string };
export interface ClassSchedulingPolicyReview {
  version: number;
  previewHash: string;
  policy: ClassSchedulingPolicy;
  reason: string;
  retainedBookings: Array<{
    id: string;
    date: string;
    title: string;
    reason: string;
  }>;
  retainedBookingCount: number;
  queuedEntryCount: number;
}
async function state(tx: Prisma.TransactionClient, actor: Actor) {
  if (
    !(await tx.workspaceUser.findFirst({
      where: { ...actor, role: "OWNER", isActive: true },
      select: { id: true },
    }))
  )
    throw new SchedulingPolicyError(
      "Only the owner can confirm class booking rules.",
    );
  const workspace = await tx.workspace.findUniqueOrThrow({
    where: { id: actor.workspaceId },
    include: {
      location: true,
      timezoneRevisions: { orderBy: { version: "asc" } },
    },
  });
  if (!workspace.location)
    throw new SchedulingPolicyError(
      "Complete business setup before confirming class booking rules.",
    );
  const history = await tx.workspaceSchedulingPolicyRevision.findMany({
    where: { workspaceId: actor.workspaceId },
    orderBy: { version: "asc" },
  });
  return { workspace, history, version: history.at(-1)?.version ?? 0 };
}
export async function getClassSchedulingSettings(
  actor: Actor,
  db: PrismaClient = prisma,
) {
  return db.$transaction((tx) => state(tx, actor));
}
async function review(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: { policy: unknown; reason: string; expectedVersion: number },
  now: Date,
): Promise<ClassSchedulingPolicyReview> {
  const current = await state(tx, actor),
    policy = parseClassSchedulingPolicy(input.policy);
  const reason = input.reason.trim();
  if (
    !reason ||
    reason.length > 500 ||
    Array.from(reason).some((c) => c.charCodeAt(0) < 32)
  )
    throw new SchedulingPolicyError(
      "Record a reason using 500 characters or fewer.",
    );
  if (input.expectedVersion !== current.version)
    throw new SchedulingPolicyError(
      "Booking rules changed. Reload and preview the change again.",
    );
  const today = getWorkspaceDateString(
    now,
    current.workspace.location!.timezone,
  );
  const [bookings, queue] = await Promise.all([
    tx.classBooking.findMany({
      where: {
        workspaceId: actor.workspaceId,
        status: { in: ["BOOKED", "PENDING_PAYMENT"] },
        scheduledForDate: { gte: dateOnlyStringToUtcDate(addDays(today, -2)) },
      },
      include: { classTemplate: { include: classOccurrenceInclude } },
      orderBy: { id: "asc" },
    }),
    tx.waitlistEntry.findMany({
      where: {
        workspaceId: actor.workspaceId,
        status: "ACTIVE",
        scheduledForDate: { gte: dateOnlyStringToUtcDate(addDays(today, -2)) },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  const proposed = {
    id: "preview",
    workspaceId: actor.workspaceId,
    version: current.version + 1,
    policy,
    policyHash: schedulingPolicyHash(policy),
    activatedAt: now,
  };
  const retainedBookings: ClassSchedulingPolicyReview["retainedBookings"] = [];
  for (const booking of bookings) {
    const date = toDateOnlyString(booking.scheduledForDate),
      occurrence = resolveClassOccurrence({
        template: booking.classTemplate,
        scheduledForDate: date,
      });
    const result =
      occurrence &&
      evaluateClassSchedulingPolicy({
        revision: proposed,
        date,
        timezone: occurrence.timezone ?? current.workspace.location!.timezone,
        startTimeMinutes: occurrence.startTimeMinutes,
        endTimeMinutes: occurrence.endTimeMinutes,
        bookingCutoffMinutes: occurrence.bookingCutoffMinutes,
        now,
      });
    if (!result || !result.allowed)
      retainedBookings.push({
        id: booking.id,
        date,
        title: occurrence?.displayTitle ?? "Recorded class",
        reason: !result
          ? "The recorded occurrence needs review."
          : result.message,
      });
  }
  // Full committed-row identities/revisions and timezone history bind the review;
  // a new booking, queue request, date edit or policy write makes confirmation stale.
  const previewHash = createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        version: current.version,
        previousPolicyHash: current.history.at(-1)?.policyHash ?? null,
        policy,
        reason,
        timezone: current.workspace.location!.timezone,
        timezoneHistory: current.workspace.timezoneRevisions,
        bookings: bookings.map((b) => ({
          id: b.id,
          updatedAt: b.updatedAt,
          fundingRevision: b.fundingRevision,
          date: b.scheduledForDate,
          template: b.classTemplate,
        })),
        queue: queue.map((q) => ({
          id: q.id,
          updatedAt: q.updatedAt,
          date: q.scheduledForDate,
          schedulingPolicySnapshot: q.schedulingPolicySnapshot,
        })),
      }),
    )
    .digest("hex");
  return {
    version: current.version,
    previewHash,
    policy,
    reason,
    retainedBookings,
    retainedBookingCount: bookings.length,
    queuedEntryCount: queue.length,
  };
}
export async function previewClassSchedulingPolicy(args: {
  actor: Actor;
  input: { policy: unknown; reason: string; expectedVersion: number };
  db?: PrismaClient;
  now?: Date;
}) {
  return (args.db ?? prisma).$transaction(
    async (tx) => {
      await lockClassSchedule(tx, args.actor.workspaceId);
      return review(tx, args.actor, args.input, args.now ?? new Date());
    },
    { timeout: 30000 },
  );
}
export async function confirmClassSchedulingPolicy(args: {
  actor: Actor;
  input: { policy: unknown; reason: string; expectedVersion: number };
  previewHash: string;
  confirmed: boolean;
  db?: PrismaClient;
  now?: Date;
}) {
  if (!args.confirmed)
    throw new SchedulingPolicyError(
      "Acknowledge that existing commitments are retained before confirming.",
    );
  return (args.db ?? prisma).$transaction(
    async (tx) => {
      await lockClassSchedule(tx, args.actor.workspaceId);
      const now = args.now ?? new Date(),
        next = await review(tx, args.actor, args.input, now);
      if (args.previewHash !== next.previewHash)
        throw new SchedulingPolicyError(
          "The schedule or booking rules changed. Preview the current commitments again.",
        );
      const previous = await tx.workspaceSchedulingPolicyRevision.findFirst({
        where: { workspaceId: args.actor.workspaceId },
        orderBy: { version: "desc" },
      });
      const revision = await tx.workspaceSchedulingPolicyRevision.create({
        data: {
          workspaceId: args.actor.workspaceId,
          version: next.version + 1,
          policy: next.policy as unknown as Prisma.InputJsonValue,
          policyHash: schedulingPolicyHash(next.policy),
          previousPolicyHash: previous?.policyHash,
          actorUserId: args.actor.userId,
          reason: next.reason,
          previewHash: next.previewHash,
          activatedAt: now,
        },
      });
      await tx.workspaceDataEvent.create({
        data: {
          workspaceId: args.actor.workspaceId,
          actorUserId: args.actor.userId,
          kind: "CLASS_SCHEDULING_POLICY_CONFIRMED",
          metadata: {
            policyRevisionId: revision.id,
            policyVersion: revision.version,
            policyHash: revision.policyHash,
            previousPolicyHash: revision.previousPolicyHash,
            retainedBookingCount: next.retainedBookingCount,
            queuedEntryCount: next.queuedEntryCount,
          },
        },
      });
      return revision;
    },
    { timeout: 30000 },
  );
}
