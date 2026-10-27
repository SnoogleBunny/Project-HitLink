import { projectMembershipGraceReceipt } from "../../../packages/db/src/membership-grace-projection";
import {
  exportedFormEventKinds,
  projectFormEvent,
} from "../../../packages/db/src/form-export-projection";
import { prisma, Prisma } from "@flowstate/db";
import { projectRoomCapacityReceipt } from "../../../packages/db/src/scheduling-export-projection";

const safeFields = new Set([
  "id",
  "memberId",
  "workspaceUserId",
  "inviteId",
  "name",
  "fullName",
  "businessType",
  "email",
  "phone",
  "contactEmail",
  "contactPhone",
  "role",
  "isActive",
  "status",
  "archivedAt",
  "version",
  "identityVersion",
  "timezone",
  "currency",
  "locale",
  "tags",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "countryCode",
  "acceptedAt",
  "revokedAt",
  "expiresAt",
  "revokedSessionCount",
  "targetUserId",
  "targetWorkspaceUserId",
  "canManageProgress",
  "canOverridePrerequisites",
]);
const known = (kind: string) =>
  [
    "BUSINESS_SETTINGS_CHANGED",
    "MEMBER_ARCHIVED",
    "MEMBER_REACTIVATED",
    "STAFF_ACCESS_CHANGED",
  ].includes(kind) || kind.startsWith("STAFF_INVITE_");
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const safe = (value: unknown) =>
  Object.fromEntries(
    Object.entries(object(value)).filter(
      ([key, item]) =>
        safeFields.has(key) &&
        (item === null ||
          ["string", "number", "boolean"].includes(typeof item) ||
          (Array.isArray(item) &&
            item.every((part) => typeof part === "string"))),
    ),
  );
/** This general owner log deliberately excludes private coaching text, secrets and arbitrary JSON. */
export function projectWorkspaceAudit(kind: string, metadata: unknown) {
  if ((exportedFormEventKinds as readonly string[]).includes(kind)) {
    const receipt = projectFormEvent(kind, metadata) as Record<string, unknown>;
    return {
      context: receipt,
      before: typeof receipt.from === "string" ? { state: receipt.from } : {},
      after: typeof receipt.to === "string" ? { state: receipt.to } : {},
      reason: null,
    };
  }

  if (kind === "MEMBERSHIP_GRACE_BOOKING_RELEASED") {
    const { from, to, ...receipt } = projectMembershipGraceReceipt(metadata);
    return { context: receipt, before: { status: from }, after: { status: to }, reason: null };
  }
  if (kind === "ROOM_DEFAULT_CAPACITY_CONFIRMED") {
    const { previousCapacity, capacity, reason, ...receipt } =
      projectRoomCapacityReceipt(metadata);
    return {
      context: receipt,
      before: { capacity: previousCapacity },
      after: { capacity },
      reason,
    };
  }
  const raw = object(metadata);
  if (!known(kind)) return { context: {}, before: {}, after: {}, reason: null };
  return {
    context: safe(raw),
    before: safe(raw.before),
    after: safe(raw.after),
    reason: typeof raw.reason === "string" ? raw.reason.slice(0, 2000) : null,
  };
}
export async function getWorkspaceAudit(args: {
  workspaceId: string;
  actorUserId: string;
  page?: number;
  kind?: string;
  db?: typeof prisma;
}) {
  const db = args.db ?? prisma;
  const page =
    Number.isSafeInteger(args.page) && args.page! > 0 && args.page! < 1000000
      ? args.page!
      : 1;
  const kind =
    args.kind && /^[A-Z0-9_]{1,80}$/.test(args.kind) ? args.kind : undefined;
  return db.$transaction(
    async (tx) => {
      if (
        !(await tx.workspaceUser.findFirst({
          where: {
            workspaceId: args.workspaceId,
            userId: args.actorUserId,
            role: "OWNER",
            isActive: true,
          },
          select: { id: true },
        }))
      )
        throw new Error("Owner access required.");
      const where = {
        workspaceId: args.workspaceId,
        ...(kind ? { kind } : {}),
      };
      const [count, events, kinds] = await Promise.all([
        tx.workspaceDataEvent.count({ where }),
        tx.workspaceDataEvent.findMany({
          where,
          select: {
            id: true,
            actorUserId: true,
            kind: true,
            metadata: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
          skip: (page - 1) * 50,
        }),
        tx.workspaceDataEvent.groupBy({
          by: ["kind"],
          where: { workspaceId: args.workspaceId },
          orderBy: { kind: "asc" },
          _count: { _all: true },
        }),
      ]);
      const staff = await tx.workspaceUser.findMany({
        where: {
          workspaceId: args.workspaceId,
          userId: {
            in: events.flatMap((row) =>
              row.actorUserId ? [row.actorUserId] : [],
            ),
          },
        },
        select: { userId: true, user: { select: { fullName: true } } },
      });
      const names = new Map(
        staff.map((row) => [row.userId, row.user.fullName]),
      );
      return {
        count,
        page,
        kind,
        kinds,
        events: events.map(({ metadata, ...row }) => ({
          ...row,
          actorName: row.actorUserId
            ? (names.get(row.actorUserId) ?? "Former or external account")
            : "System",
          ...projectWorkspaceAudit(row.kind, metadata),
        })),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
