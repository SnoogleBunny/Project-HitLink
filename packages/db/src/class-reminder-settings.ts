import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { lockStaffAuthorityTx } from "./staff-access.js";

const genericSettingsMessage =
  "Reminder settings could not be saved. Reload the current settings and try again.";
const knownSettingsMessages = new Set([
  "Choose reminders off or an advance interval between 1 and 527,040 minutes.",
  "Only the current active owner can change class reminders.",
  "Record the reason and reload the current reminder settings before saving.",
  "Reminder settings changed. Reload the current settings before saving.",
  "Reload the current reminder editor before saving.",
]);
const publicSettingsErrors = new WeakMap<object, string>();
export class ClassReminderSettingsError extends Error {
  constructor(message: string) {
    const safe = knownSettingsMessages.has(message)
      ? message
      : genericSettingsMessage;
    super(safe);
    publicSettingsErrors.set(this, safe);
  }
}
/** Fixed owned copy only; no exception fields, getters, prototypes or causes are read. */
export function classReminderSettingsMessage(error: unknown): string {
  return error !== null &&
    (typeof error === "object" || typeof error === "function")
    ? (publicSettingsErrors.get(error) ?? genericSettingsMessage)
    : genericSettingsMessage;
}
export function parseClassReminderLeadMinutes(value: unknown): number | null {
  if (value === null || value === "OFF") return null;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[1-9]\d*$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 527040)
    throw new ClassReminderSettingsError(
      "Choose reminders off or an advance interval between 1 and 527,040 minutes.",
    );
  return parsed;
}
async function owner(
  tx: Prisma.TransactionClient,
  actor: { workspaceId: string; userId: string },
) {
  await lockClassSchedule(tx, actor.workspaceId);
  await lockStaffAuthorityTx(tx, actor);
  if (
    !(await tx.workspaceUser.findFirst({
      where: {
        ...actor,
        role: "OWNER",
        isActive: true,
        workspace: { status: { not: "DISABLED" } },
      },
      select: { id: true },
    }))
  )
    throw new ClassReminderSettingsError(
      "Only the current active owner can change class reminders.",
    );
}
export async function getClassReminderSettings(
  actor: { workspaceId: string; userId: string },
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    await owner(tx, actor);
    const row = await tx.workspaceSetting.findUnique({
      where: { workspaceId: actor.workspaceId },
    });
    return {
      version: row?.classReminderVersion ?? 0,
      leadMinutes: row?.classReminderLeadMinutes ?? null,
    };
  });
}
/** Independent from identityVersion, booking acceptance and monetary terms. Missing configuration stays off. */
export async function updateClassReminderSettings(args: {
  actor: { workspaceId: string; userId: string };
  expectedVersion: number;
  leadMinutes: unknown;
  reason: string;
  db?: PrismaClient;
}) {
  const leadMinutes = parseClassReminderLeadMinutes(args.leadMinutes),
    reason = args.reason.trim();
  if (
    !Number.isSafeInteger(args.expectedVersion) ||
    args.expectedVersion < 0 ||
    !reason ||
    reason.length > 500 ||
    [...reason].some((character) => character.charCodeAt(0) < 32)
  )
    throw new ClassReminderSettingsError(
      "Record the reason and reload the current reminder settings before saving.",
    );
  return (args.db ?? prisma).$transaction(async (tx) => {
    await owner(tx, args.actor);
    const current = await tx.workspaceSetting.findUnique({
      where: { workspaceId: args.actor.workspaceId },
    });
    if ((current?.classReminderVersion ?? 0) !== args.expectedVersion)
      throw new ClassReminderSettingsError(
        "Reminder settings changed. Reload the current settings before saving.",
      );
    if (current?.classReminderLeadMinutes === leadMinutes)
      return { version: current.classReminderVersion, leadMinutes };
    const version = args.expectedVersion + 1;
    await tx.workspaceSetting.upsert({
      where: { workspaceId: args.actor.workspaceId },
      create: {
        workspaceId: args.actor.workspaceId,
        classReminderLeadMinutes: leadMinutes,
        classReminderVersion: version,
      },
      update: {
        classReminderLeadMinutes: leadMinutes,
        classReminderVersion: version,
      },
    });
    await tx.workspaceDataEvent.create({
      data: {
        workspaceId: args.actor.workspaceId,
        actorUserId: args.actor.userId,
        kind: "CLASS_REMINDER_SETTINGS_CHANGED",
        metadata: {
          schemaVersion: 1,
          version,
          previousLeadMinutes: current?.classReminderLeadMinutes ?? null,
          leadMinutes,
          reason,
        },
      },
    });
    // Superseded reminders retain their delivery record. Confirmation jobs and all business effects are untouched.
    await tx.notificationJob.updateMany({
      where: {
        workspaceId: args.actor.workspaceId,
        status: { in: ["PENDING", "FAILED"] },
        classNoticeDeliveryStartedAt: null,
        AND: [
          { context: { path: ["kind"], equals: "CLASS_SERVICE_NOTICE" } },
          { context: { path: ["notice"], equals: "REMINDER" } },
        ],
      },
      data: {
        status: "CANCELLED",
        nextAttemptAt: null,
        lastError: "The owner changed class reminder settings.",
      },
    });
    return { version, leadMinutes };
  });
}
