import { createHash } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type MemberOperationalRevision,
} from "@prisma/client";
import { prisma } from "./client.js";
import {
  classOccurrenceInclude,
  lockClassSchedule,
  resolveClassOccurrence,
} from "./class-occurrences.js";
import {
  getWorkspaceDateString,
  getZonedDateTimeAsUtc,
  parseDateOnlyString,
  toDateOnlyString,
} from "./occurrences.js";
import { resolveWorkspaceClockTimezone } from "./workspace-timezones.js";
import { parseClassPrerequisites } from "./program-progress-policy.js";
import { prerequisiteFingerprint } from "./program-progress.js";
import {
  requireActiveStaffAccessTx,
  StaffAccessError,
} from "./staff-access.js";

export class MemberOperationsError extends Error {}
export type OperationalVisibility = "OWNER_ONLY" | "ASSIGNED_OPERATIONS";
export type TagPurpose = "OPERATIONAL" | "COHORT_ELIGIBILITY";
export type MemberOperationsActor = {
  workspaceId: string;
  userId: string;
  occurrence?: { classTemplateId: string; date: string };
};
type BaseCommand = {
  memberId: string;
  recordKey: string;
  expectedVersion: number;
  operationId: string;
  reason?: string;
};
export type ChangeMemberOperationsInput = BaseCommand &
  (
    | {
        recordKind: "NOTE";
        action: "ADD" | "AMEND";
        visibility: OperationalVisibility;
        noteBody: string;
      }
    | { recordKind: "NOTE"; action: "RETRACT" }
    | {
        recordKind: "TAG";
        action: "ADD" | "CLASSIFY" | "AMEND";
        visibility: OperationalVisibility;
        tagPurpose: TagPurpose;
        tagLabel: string;
      }
    | {
        recordKind: "TAG";
        action: "RETRACT";
        tagPurpose: TagPurpose;
        tagLabel: string;
      }
  );
export type CurrentMemberOperation = {
  recordKey: string;
  recordKind: "NOTE" | "TAG";
  version: number;
  visibility: OperationalVisibility;
  noteBody: string | null;
  tagLabel: string | null;
  tagPurpose: TagPurpose | null;
  actorName: string;
  createdAt: string;
  canAmend: boolean;
};
export type MemberOperationsCursor = { createdAt: string; id: string };
type Options = { db?: PrismaClient; now?: Date };
type ReadOptions = Options & {
  before?: MemberOperationsCursor;
  limit?: number;
};
type Tx = Prisma.TransactionClient;
type Row = MemberOperationalRevision;
function fail(message: string): never {
  throw new MemberOperationsError(message);
}
const denied = (): never =>
  fail("These internal operations records are unavailable for this account.");
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const requestPattern = /^[a-zA-Z0-9:_-]{16,150}$/;
function text(value: unknown, max: number, field: string, required = false) {
  if (value !== undefined && value !== null && typeof value !== "string")
    fail(`Enter a valid ${field}.`);
  const result = String(value ?? "").trim();
  if (
    result.length > max ||
    Array.from(result).some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    fail(`Keep ${field} within ${max} characters without control characters.`);
  if (required && !result) fail(`Enter ${field}.`);
  return result || null;
}
function normalize(input: ChangeMemberOperationsInput) {
  if (
    !requestPattern.test(input.operationId) ||
    !requestPattern.test(input.recordKey) ||
    !input.memberId
  )
    fail("Reload this member before saving the operational change.");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
    fail("Reload the current record before changing it.");
  if (
    !["NOTE", "TAG"].includes(input.recordKind) ||
    !["ADD", "AMEND", "RETRACT", "CLASSIFY"].includes(input.action)
  )
    fail("Choose a supported operational change.");
  const reason = text(input.reason, 500, "change reason");
  if (input.action !== "ADD" && (!reason || reason.length < 5))
    fail("Explain the change using 5 to 500 characters.");
  const visibility =
    input.action === "RETRACT"
      ? null
      : "visibility" in input
        ? input.visibility
        : null;
  if (
    input.action !== "RETRACT" &&
    !["OWNER_ONLY", "ASSIGNED_OPERATIONS"].includes(visibility ?? "")
  )
    fail("Choose who may see this operational record.");
  const noteBody =
    input.recordKind === "NOTE" && input.action !== "RETRACT"
      ? text(
          "noteBody" in input ? input.noteBody : null,
          2000,
          "operational note",
          true,
        )
      : null;
  const tagLabel =
    input.recordKind === "TAG"
      ? text(input.tagLabel, 40, "tag label", true)
      : null;
  const tagPurpose = input.recordKind === "TAG" ? input.tagPurpose : null;
  if (input.recordKind === "NOTE") {
    if (
      !/^note:[a-f0-9-]{36}$/i.test(input.recordKey) ||
      String(input.action) === "CLASSIFY"
    )
      fail("This note request is invalid. Reload the member.");
  } else if (
    !["OPERATIONAL", "COHORT_ELIGIBILITY"].includes(tagPurpose ?? "") ||
    input.recordKey !== `tag:${tagPurpose}:${digest(tagLabel!)}`
  ) {
    fail("This tag request is invalid. Reload the member.");
  }
  if (input.action === "CLASSIFY" && tagPurpose !== "COHORT_ELIGIBILITY")
    fail("Only an existing cohort label can be classified.");
  return {
    memberId: input.memberId,
    recordKey: input.recordKey,
    recordKind: input.recordKind,
    expectedVersion: input.expectedVersion,
    operationId: input.operationId,
    action: input.action,
    visibility,
    noteBody,
    tagLabel,
    tagPurpose,
    reason,
  };
}

// READ COMMITTED is intentional: advisory-lock acquisition itself can establish
// an older SERIALIZABLE snapshot while waiting for a staff/schedule change.
// A new statement snapshot after this shared lock must see the actor that won.
// All product authority/assignment/tag commands share lockClassSchedule; unique
// record/version keys plus expectedVersion protect the append-only stream.
async function locked<T>(
  db: PrismaClient,
  workspaceId: string,
  work: (tx: Tx) => Promise<T>,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await lockClassSchedule(tx, workspaceId);
          return work(tx);
        },
        { isolationLevel: "ReadCommitted", timeout: 20000 },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 3
      )
        throw error;
    }
  }
}
async function currentStaff(tx: Tx, actor: MemberOperationsActor) {
  try {
    const staff = await requireActiveStaffAccessTx(tx, {
      ...actor,
      capability: "OPERATIONS",
    });
    const person = await tx.user.findUniqueOrThrow({
      where: { id: staff.userId },
      select: { fullName: true, email: true },
    });
    return { ...staff, displayName: person.fullName?.trim() || person.email };
  } catch (error) {
    if (error instanceof StaffAccessError) return denied();
    throw error;
  }
}
async function occurrenceScope(
  tx: Tx,
  actor: MemberOperationsActor,
  staff: Awaited<ReturnType<typeof currentStaff>>,
) {
  const source = actor.occurrence;
  if (!source || parseDateOnlyString(source.date).status !== "ok")
    return denied();
  const template = await tx.classTemplate.findFirst({
    where: { id: source.classTemplateId, workspaceId: actor.workspaceId },
    include: classOccurrenceInclude,
  });
  const occurrence =
    template &&
    resolveClassOccurrence({ template, scheduledForDate: source.date });
  if (
    !occurrence ||
    occurrence.status !== "ACTIVE" ||
    (staff.role === "COACH" && occurrence.coachWorkspaceUserId !== staff.id)
  )
    return denied();
  return occurrence;
}
async function authorize(
  tx: Tx,
  actor: MemberOperationsActor,
  memberId: string,
  write = false,
) {
  const staff = await currentStaff(tx, actor);
  const member = await tx.member.findFirst({
    where: { workspaceId: actor.workspaceId, id: memberId },
    select: {
      id: true,
      fullName: true,
      tags: true,
      notes: true,
      archivedAt: true,
    },
  });
  if (!member) return denied();
  if (write && member.archivedAt)
    fail(
      "Reactivate this member before adding or changing internal operations records.",
    );
  if (staff.role === "COACH" || actor.occurrence) {
    const occurrence = await occurrenceScope(tx, actor, staff);
    const booked = await tx.classBooking.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        memberId,
        classTemplateId: occurrence.classTemplateId,
        scheduledForDate: new Date(`${actor.occurrence!.date}T00:00:00Z`),
        status: { in: ["BOOKED", "ATTENDED", "ABSENT", "NO_SHOW"] },
      },
      select: { id: true },
    });
    if (!booked) return denied();
  }
  return { staff, member };
}
function canManage(staff: Awaited<ReturnType<typeof currentStaff>>, row: Row) {
  return (
    staff.role === "OWNER" ||
    (row.actorUserId === staff.userId &&
      row.visibility === "ASSIGNED_OPERATIONS" &&
      row.tagPurpose !== "COHORT_ELIGIBILITY" &&
      row.action !== "RETRACT")
  );
}
function project(
  staff: Awaited<ReturnType<typeof currentStaff>>,
  row: Row,
): CurrentMemberOperation {
  return {
    recordKey: row.recordKey,
    recordKind: row.recordKind as "NOTE" | "TAG",
    version: row.version,
    visibility: row.visibility as OperationalVisibility,
    noteBody: row.noteBody,
    tagLabel: row.tagLabel,
    tagPurpose: row.tagPurpose as TagPurpose | null,
    actorName: row.actorNameSnapshot,
    createdAt: row.createdAt.toISOString(),
    canAmend: canManage(staff, row),
  };
}
async function currentPage(
  tx: Tx,
  args: {
    workspaceId: string;
    memberId: string;
    recordKind: "NOTE" | "TAG";
    sharedOnly: boolean;
    includeRetracted?: boolean;
    purpose?: TagPurpose;
    limit: number;
    before?: MemberOperationsCursor;
  },
) {
  if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 101)
    fail("Choose a valid operations page size.");
  const before = args.before;
  if (
    before &&
    (!Number.isFinite(+new Date(before.createdAt)) ||
      !before.id ||
      before.id.length > 150)
  )
    fail("Reload the operations history page.");
  // Visibility/action filtering is deliberately AFTER latest version selection.
  return tx.$queryRaw<Row[]>(Prisma.sql`
    SELECT * FROM (
      SELECT DISTINCT ON ("recordKey") * FROM "member_operational_revisions"
      WHERE "workspaceId" = ${args.workspaceId} AND "memberId" = ${args.memberId}
      ORDER BY "recordKey", "version" DESC
    ) latest WHERE "recordKind" = ${args.recordKind}
      ${args.sharedOnly ? Prisma.sql`AND "visibility" = 'ASSIGNED_OPERATIONS'` : Prisma.empty}
      ${args.includeRetracted ? Prisma.empty : Prisma.sql`AND "action" <> 'RETRACT'`}
      ${args.purpose ? Prisma.sql`AND "tagPurpose" = ${args.purpose}` : Prisma.empty}
      ${before ? Prisma.sql`AND ("createdAt", "id") < (${new Date(before.createdAt)}, ${before.id})` : Prisma.empty}
    ORDER BY "createdAt" DESC, "id" DESC LIMIT ${args.limit}
  `);
}
async function assertCohortProjection(
  tx: Tx,
  workspaceId: string,
  memberId: string,
  labels: string[],
) {
  if (
    labels.length > 50 ||
    new Set(labels.map((value) => value.toLocaleLowerCase("en-US"))).size !==
      labels.length
  )
    fail("The cohort labels need an owner review before this change.");
  const tracked = await currentPage(tx, {
    workspaceId,
    memberId,
    recordKind: "TAG",
    sharedOnly: false,
    purpose: "COHORT_ELIGIBILITY",
    limit: 51,
  });
  if (
    tracked.length > 50 ||
    tracked.some((row) => !labels.includes(row.tagLabel!))
  )
    fail(
      "Cohort labels changed outside this history. Ask an owner to reconcile the record.",
    );
  // Detect a previously retracted label silently reintroduced by an import.
  const keys = labels.map((label) => `tag:COHORT_ELIGIBILITY:${digest(label)}`);
  for (const recordKey of keys) {
    const latest = await tx.memberOperationalRevision.findFirst({
      where: { workspaceId, memberId, recordKey },
      orderBy: { version: "desc" },
    });
    if (latest?.action === "RETRACT")
      fail(
        "Cohort labels changed outside this history. Ask an owner to reconcile the record.",
      );
  }
  return tracked;
}
async function protectBookedCohortSeats(
  tx: Tx,
  actor: MemberOperationsActor,
  memberId: string,
  removed: string[],
  now: Date,
) {
  if (!removed.length) return;
  const workspace = await tx.workspace.findUniqueOrThrow({
    where: { id: actor.workspaceId },
    select: { location: { select: { timezone: true } } },
  });
  const baseline = workspace.location?.timezone ?? "UTC";
  const timezone = await resolveWorkspaceClockTimezone({
    workspaceId: actor.workspaceId,
    baselineTimezone: baseline,
    now,
    db: tx,
  });
  const from = new Date(`${getWorkspaceDateString(now, timezone)}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 2);
  const bookings = await tx.classBooking.findMany({
    where: {
      workspaceId: actor.workspaceId,
      memberId,
      status: { in: ["BOOKED", "PENDING_PAYMENT"] },
      scheduledForDate: { gte: from },
    },
    include: { classTemplate: { include: classOccurrenceInclude } },
    take: 1001,
  });
  if (bookings.length > 1000)
    fail(
      "This member needs a larger booking review before changing cohort labels.",
    );
  for (const booking of bookings) {
    const date = toDateOnlyString(booking.scheduledForDate);
    const occurrence = resolveClassOccurrence({
      template: booking.classTemplate,
      scheduledForDate: date,
    });
    if (
      !occurrence ||
      occurrence.status !== "ACTIVE" ||
      getZonedDateTimeAsUtc({
        dateString: date,
        minutes: occurrence.startTimeMinutes,
        timezone: occurrence.timezone ?? baseline,
      }) <= now
    )
      continue;
    const rules = parseClassPrerequisites(occurrence.prerequisites);
    if (!rules)
      fail(
        "A booked class needs eligibility-settings review before cohort labels change.",
      );
    if (!rules.cohortTag || !removed.includes(rules.cohortTag)) continue;
    const exception = await tx.classPrerequisiteException.findUnique({
      where: {
        workspaceId_classTemplateId_memberId_scheduledForDate_policyFingerprint:
          {
            workspaceId: actor.workspaceId,
            memberId,
            classTemplateId: occurrence.classTemplateId,
            scheduledForDate: booking.scheduledForDate,
            policyFingerprint: prerequisiteFingerprint(
              occurrence.program.rankPolicy,
              occurrence.prerequisites,
            ),
          },
      },
    });
    if (!exception)
      fail(
        `This change affects a booked class on ${date} (${occurrence.title}). Resolve that booking or its eligibility before saving.`,
      );
  }
}

export async function changeMemberOperations(
  actor: MemberOperationsActor,
  input: ChangeMemberOperationsInput,
  options: Options = {},
) {
  const change = normalize(input),
    now = options.now ?? new Date();
  const inputHash = hash({
    actor: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      occurrence: actor.occurrence ?? null,
    },
    ...change,
  });
  return locked(options.db ?? prisma, actor.workspaceId, async (tx) => {
    const { staff, member } = await authorize(tx, actor, change.memberId, true);
    if (
      staff.role === "COACH" &&
      (change.tagPurpose === "COHORT_ELIGIBILITY" ||
        change.visibility === "OWNER_ONLY" ||
        change.action === "CLASSIFY")
    )
      return denied();
    const latest = await tx.memberOperationalRevision.findFirst({
      where: {
        workspaceId: actor.workspaceId,
        memberId: member.id,
        recordKey: change.recordKey,
      },
      orderBy: { version: "desc" },
    });
    // A new TAG ADD is an explicit fresh intent after a retained retraction.
    // It never overwrites an active head or restores a NOTE. Coaches still
    // need their own latest shared operational revision, not owner intervention.
    const freshTagReapply =
      change.recordKind === "TAG" &&
      change.action === "ADD" &&
      change.expectedVersion === 0 &&
      latest?.recordKind === "TAG" &&
      latest.action === "RETRACT";
    const ownSharedReapply =
      freshTagReapply &&
      latest.actorUserId === actor.userId &&
      latest.visibility === "ASSIGNED_OPERATIONS" &&
      latest.tagPurpose === "OPERATIONAL";
    if (
      latest &&
      staff.role === "COACH" &&
      !canManage(staff, latest) &&
      !ownSharedReapply
    )
      return denied();
    const previous = await tx.memberOperationalRevision.findUnique({
      where: {
        workspaceId_operationId: {
          workspaceId: actor.workspaceId,
          operationId: change.operationId,
        },
      },
    });
    if (previous) {
      if (
        previous.inputHash !== inputHash ||
        previous.actorUserId !== actor.userId ||
        previous.memberId !== member.id ||
        previous.recordKey !== change.recordKey
      )
        fail(
          "This request was already used for a different change. Reload the page.",
        );
      return {
        recordKey: previous.recordKey,
        recordKind: previous.recordKind,
        version: previous.version,
        eventId: previous.id,
        replayed: true,
      };
    }
    if ((latest?.version ?? 0) !== change.expectedVersion && !freshTagReapply)
      fail(
        "This operational record changed. Review the current version before saving.",
      );
    if (
      latest &&
      (latest.recordKind !== change.recordKind ||
        latest.tagPurpose !== change.tagPurpose ||
        latest.tagLabel !== change.tagLabel)
    )
      fail(
        "This record cannot change its type or label. Reload the current record.",
      );
    if (change.action === "ADD") {
      if (
        latest &&
        (change.recordKind === "NOTE" || latest.action !== "RETRACT")
      )
        fail("This operational record already exists. Reload before saving.");
    } else if (change.action === "CLASSIFY") {
      if (latest || !member.tags.includes(change.tagLabel!))
        fail(
          "This existing cohort label needs another owner review before classification.",
        );
    } else if (!latest || latest.action === "RETRACT")
      fail("This operational record is no longer available for that change.");
    let nextLabels: string[] | null = null;
    if (change.recordKind === "TAG") {
      if (change.tagPurpose === "COHORT_ELIGIBILITY") {
        await assertCohortProjection(
          tx,
          actor.workspaceId,
          member.id,
          member.tags,
        );
        if (change.action === "ADD") {
          if (
            member.tags.some(
              (value) =>
                value.toLocaleLowerCase("en-US") ===
                change.tagLabel!.toLocaleLowerCase("en-US"),
            )
          )
            fail(
              "This cohort label already exists. Review its classification instead.",
            );
          if (member.tags.length >= 50)
            fail("Keep at most 50 cohort labels on one member.");
          nextLabels = [...member.tags, change.tagLabel!];
        } else if (change.action === "RETRACT") {
          nextLabels = member.tags.filter((value) => value !== change.tagLabel);
          await protectBookedCohortSeats(
            tx,
            actor,
            member.id,
            [change.tagLabel!],
            now,
          );
        }
      } else if (change.action === "ADD") {
        const active = await currentPage(tx, {
          workspaceId: actor.workspaceId,
          memberId: member.id,
          recordKind: "TAG",
          sharedOnly: false,
          purpose: "OPERATIONAL",
          limit: 51,
        });
        if (active.length >= 50)
          fail("Keep at most 50 operational labels on one member.");
        if (
          active.some(
            (row) =>
              row.tagLabel!.toLocaleLowerCase("en-US") ===
              change.tagLabel!.toLocaleLowerCase("en-US"),
          )
        )
          fail(
            "That operational label is already recorded. Ask an owner to review it.",
          );
      }
    }
    const visibility = change.visibility ?? latest!.visibility;
    // Every reviewed cohort command writes its compatibility projection, even
    // a visibility-only classification. A staging import with a pre-lock
    // Serializable snapshot must conflict/retry before replacing these labels.
    if (
      change.recordKind === "TAG" &&
      change.tagPurpose === "COHORT_ELIGIBILITY"
    )
      await tx.member.update({
        where: { id: member.id },
        data: { tags: nextLabels ?? member.tags },
      });
    const saved = await tx.memberOperationalRevision.create({
      data: {
        workspaceId: actor.workspaceId,
        memberId: member.id,
        recordKey: change.recordKey,
        recordKind: change.recordKind,
        version: (latest?.version ?? 0) + 1,
        action: change.action,
        visibility,
        noteBody: change.noteBody,
        tagLabel: change.tagLabel,
        tagPurpose: change.tagPurpose,
        actorUserId: actor.userId,
        actorWorkspaceUserId: staff.id,
        actorNameSnapshot: staff.displayName,
        actorRoleSnapshot: staff.role,
        sourceClassTemplateId: actor.occurrence?.classTemplateId ?? null,
        sourceScheduledDate: actor.occurrence
          ? new Date(`${actor.occurrence.date}T00:00:00Z`)
          : null,
        reason: change.reason,
        operationId: change.operationId,
        inputHash,
        createdAt: now,
      },
    });
    return {
      recordKey: saved.recordKey,
      recordKind: saved.recordKind,
      version: saved.version,
      eventId: saved.id,
      replayed: false,
    };
  });
}

export async function getMemberOperations(
  actor: MemberOperationsActor,
  memberId: string,
  options: ReadOptions = {},
) {
  const limit = options.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
    fail("Choose a valid operations page size.");
  return locked(options.db ?? prisma, actor.workspaceId, async (tx) => {
    const { staff, member } = await authorize(tx, actor, memberId);
    const sharedOnly = staff.role !== "OWNER";
    const [notes, tags] = await Promise.all([
      currentPage(tx, {
        workspaceId: actor.workspaceId,
        memberId,
        recordKind: "NOTE",
        sharedOnly,
        limit: limit + 1,
        before: options.before,
      }),
      currentPage(tx, {
        workspaceId: actor.workspaceId,
        memberId,
        recordKind: "TAG",
        sharedOnly,
        limit: 101,
      }),
    ]);
    if (tags.length > 100)
      fail("These tags need an owner review before they can be displayed.");
    const visibleNotes = notes.slice(0, limit),
      last = visibleNotes.at(-1);
    const classified = new Set(
      tags
        .filter((row) => row.tagPurpose === "COHORT_ELIGIBILITY")
        .map((row) => row.tagLabel),
    );
    return {
      memberId,
      memberName: member.fullName,
      canChooseVisibility: staff.role === "OWNER",
      canWrite: !member.archivedAt,
      notes: visibleNotes.map((row) => project(staff, row)),
      tags: tags.map((row) => project(staff, row)),
      nextNotesCursor:
        notes.length > limit && last
          ? { createdAt: last.createdAt.toISOString(), id: last.id }
          : null,
      ...(staff.role === "OWNER"
        ? {
            legacy: {
              note: member.notes,
              unclassifiedTags: member.tags.filter(
                (label) => !classified.has(label),
              ),
            },
          }
        : {}),
    };
  });
}
export async function getMemberOperationsHistory(
  actor: MemberOperationsActor,
  input: {
    memberId: string;
    recordKey?: string;
    before?: MemberOperationsCursor;
    limit?: number;
  },
  options: Options = {},
) {
  const limit = input.limit ?? 20;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (input.before &&
      (!Number.isFinite(+new Date(input.before.createdAt)) ||
        !input.before.id ||
        input.before.id.length > 150))
  )
    fail("Reload the operations history page.");
  return locked(options.db ?? prisma, actor.workspaceId, async (tx) => {
    const { staff } = await authorize(tx, actor, input.memberId);
    if (staff.role !== "OWNER") return denied();
    const before = input.before;
    const rows = await tx.memberOperationalRevision.findMany({
      where: {
        workspaceId: actor.workspaceId,
        memberId: input.memberId,
        ...(input.recordKey ? { recordKey: input.recordKey } : {}),
        ...(before
          ? {
              OR: [
                { createdAt: { lt: new Date(before.createdAt) } },
                {
                  createdAt: new Date(before.createdAt),
                  id: { lt: before.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit),
      last = items.at(-1);
    return {
      items: items.map((row) => ({
        ...project(staff, row),
        action: row.action,
        reason: row.reason,
        actorRole: row.actorRoleSnapshot,
      })),
      nextCursor:
        rows.length > limit && last
          ? { createdAt: last.createdAt.toISOString(), id: last.id }
          : null,
    };
  });
}
export type MemberOperationsView = Awaited<
  ReturnType<typeof getMemberOperations>
>;

export async function getRosterMemberOperations(
  actor: MemberOperationsActor,
  options: Options = {},
) {
  return locked(options.db ?? prisma, actor.workspaceId, async (tx) => {
    const staff = await currentStaff(tx, actor);
    const occurrence = await occurrenceScope(tx, actor, staff);
    const bookings = await tx.classBooking.findMany({
      where: {
        workspaceId: actor.workspaceId,
        classTemplateId: occurrence.classTemplateId,
        scheduledForDate: new Date(`${actor.occurrence!.date}T00:00:00Z`),
        status: { in: ["BOOKED", "ATTENDED", "ABSENT", "NO_SHOW"] },
      },
      select: { memberId: true },
    });
    const memberIds = [...new Set(bookings.map((row) => row.memberId))];
    const result: Record<
      string,
      {
        notes: CurrentMemberOperation[];
        tags: CurrentMemberOperation[];
        hasMore: boolean;
      }
    > = {};
    for (const memberId of memberIds)
      result[memberId] = { notes: [], tags: [], hasMore: false };
    if (!memberIds.length) return result;
    const rows = await tx.$queryRaw<
      (Row & { displayOrder: bigint })[]
    >(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON ("memberId", "recordKey") * FROM "member_operational_revisions"
        WHERE "workspaceId" = ${actor.workspaceId} AND "memberId" IN (${Prisma.join(memberIds)})
        ORDER BY "memberId", "recordKey", "version" DESC
      ), visible AS (
        SELECT *, row_number() OVER (PARTITION BY "memberId", "recordKind" ORDER BY "createdAt" DESC, "id" DESC) AS "displayOrder"
        FROM latest WHERE "visibility" = 'ASSIGNED_OPERATIONS' AND "action" <> 'RETRACT'
      ) SELECT * FROM visible WHERE "displayOrder" <= 21
      ORDER BY "memberId", "recordKind", "createdAt" DESC, "id" DESC
    `);
    for (const row of rows) {
      const target = result[row.memberId]!;
      if (Number(row.displayOrder) > (row.recordKind === "NOTE" ? 3 : 20)) {
        target.hasMore = true;
        continue;
      }
      (row.recordKind === "NOTE" ? target.notes : target.tags).push({
        ...project(staff, row),
        canAmend:
          row.recordKind === "TAG" && row.tagPurpose === "COHORT_ELIGIBILITY"
            ? false
            : canManage(staff, row),
      });
    }
    return result;
  });
}
