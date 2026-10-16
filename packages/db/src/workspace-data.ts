import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./client.js";
import { lockClassSchedule } from "./class-occurrences.js";
import { workspaceExportFields } from "./workspace-export-fields.js";

export class WorkspaceDataError extends Error {}
export interface WorkspaceDataActor {
  workspaceId: string;
  userId: string;
}
type Options = { db?: PrismaClient; now?: Date };
type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown>;
async function retrySerialization<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt === 7
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(250, 25 * 2 ** attempt) + Math.floor(Math.random() * 25),
        ),
      );
    }
  }
  throw new WorkspaceDataError(
    "The records changed repeatedly. Reload and review before trying again.",
  );
}
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function fail(message: string): never {
  throw new WorkspaceDataError(message);
}
export async function requireWorkspaceDataOwner(
  db: Tx,
  actor: WorkspaceDataActor,
) {
  const owner = await db.workspaceUser.findFirst({
    where: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      role: "OWNER",
      isActive: true,
      workspace: { status: { not: "DISABLED" } },
    },
  });
  if (!owner) fail("Only an active owner can manage this gym's records.");
  return owner;
}
function text(value: string, label: string, max = 1000) {
  const result = value.trim();
  if (!result || result.length > max)
    fail(`${label} is required (up to ${max} characters).`);
  return result;
}
async function audit(
  db: Tx,
  actor: WorkspaceDataActor,
  kind: string,
  metadata: unknown,
) {
  await db.workspaceDataEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      actorUserId: actor.userId,
      kind,
      metadata: json(metadata),
    },
  });
}
function csvCell(value: unknown) {
  let result =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s]*[=+@\-\t\r]/.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}
/** Only models and scalar fields in the reviewed whitelist are queried. No coaching content is queried. */
async function snapshot(db: Tx, workspaceId: string) {
  const tables: Record<string, Row[]> = {};
  const files: Array<{
    id: string;
    name: string;
    mimeType: string;
    sha256: string;
    bytes: number;
    base64: string;
  }> = [];
  const dictionary: Record<string, unknown> = {};
  for (const [model, fields] of Object.entries(workspaceExportFields)) {
    const metadata = Prisma.dmmf.datamodel.models.find(
      (candidate) => candidate.name === model,
    );
    if (!metadata)
      fail(
        "An export model is unavailable. Apply the required migration before exporting.",
      );
    const delegate = (
      db as unknown as Record<
        string,
        { findMany(args: unknown): Promise<Row[]> }
      >
    )[model[0]!.toLowerCase() + model.slice(1)];
    if (!delegate)
      fail(
        "An export model is unavailable. Apply the required migration before exporting.",
      );
    const where =
      model === "Room"
        ? { location: { workspaceId } }
        : model === "MembershipLifecycleEvent"
          ? { request: { workspaceId } }
          : { workspaceId };
    const rows = await delegate.findMany({
      where,
      select: Object.fromEntries(fields.map((field) => [field, true])),
      orderBy: { id: "asc" },
      take: 50001,
    });
    if (rows.length > 50000)
      fail(
        "This export needs a larger batch. Contact your named records contact; no records have been omitted.",
      );
    for (const row of rows)
      if (row.fileData instanceof Uint8Array) {
        const bytes = Buffer.from(row.fileData);
        const checksum = hash(bytes);
        if (row.fileSha256 && row.fileSha256 !== checksum)
          fail(
            "A signed-form file failed its checksum check. Resolve the file before exporting.",
          );
        files.push({
          id: String(row.id),
          name: String(row.fileName),
          mimeType: String(row.mimeType),
          sha256: checksum,
          bytes: bytes.length,
          base64: bytes.toString("base64"),
        });
        delete row.fileData;
        row.fileReference = `files/${row.id}`;
      }
    tables[model] = JSON.parse(JSON.stringify(rows)) as Row[];
    dictionary[model] = metadata.fields
      .filter(
        (field) => fields.includes(field.name) && field.name !== "fileData",
      )
      .map((field) => ({
        name: field.name,
        type: field.type,
        optional: !field.isRequired,
        units: field.name.endsWith("Cents")
          ? "integer minor currency units; use the row's currency"
          : field.type === "DateTime"
            ? "ISO 8601; date-only fields retain YYYY-MM-DD semantics"
            : undefined,
      }));
  }
  tables.Workspace = [
    await db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true, businessType: true, createdAt: true },
    }),
  ];
  tables.WorkspaceUser = await db.workspaceUser.findMany({
    where: { workspaceId },
    select: {
      id: true,
      userId: true,
      role: true,
      isActive: true,
      user: { select: { fullName: true, email: true } },
    },
    orderBy: { id: "asc" },
  });
  tables.CoachingEnrollment = await db.coachingEnrollment.findMany({
    where: { workspaceId },
    select: {
      id: true,
      memberId: true,
      programVersionId: true,
      status: true,
      startsOn: true,
      endsOn: true,
      timezone: true,
      paymentId: true,
      paymentState: true,
      closedAt: true,
      retrievalUntil: true,
      settlementState: true,
      exportState: true,
    },
    orderBy: { id: "asc" },
  });
  const sourceHash = hash(JSON.stringify({ tables, files }));
  const csv = Object.fromEntries(
    Object.entries(tables).map(([model, rows]) => {
      const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      return [
        `${model}.csv`,
        [
          fields.map(csvCell).join(","),
          ...rows.map((row) =>
            fields.map((field) => csvCell(row[field])).join(","),
          ),
        ].join("\r\n"),
      ];
    }),
  );
  return { tables, files, csv, dictionary, sourceHash };
}
export async function createWorkspaceDataExport(
  actor: WorkspaceDataActor,
  purpose: string,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  await requireWorkspaceDataOwner(db, actor);
  const job = await db.workspaceDataExport.create({
    data: {
      workspaceId: actor.workspaceId,
      requestedByUserId: actor.userId,
      purpose: text(purpose, "Export purpose"),
      expiresAt: new Date(now.getTime() + 24 * 3600000),
    },
  });
  try {
    return await db.$transaction(
      async (tx) => {
        await lockClassSchedule(tx, actor.workspaceId);
        await requireWorkspaceDataOwner(tx, actor);
        const data = await snapshot(tx, actor.workspaceId);
        const manifest = {
          format: "HitLink relational export",
          version: 1,
          workspaceId: actor.workspaceId,
          sourceHash: data.sourceHash,
          exportedAt: now.toISOString(),
          tables: Object.fromEntries(
            Object.entries(data.tables).map(([name, rows]) => [
              name,
              rows.length,
            ]),
          ),
          files: data.files.map((file) => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            sha256: file.sha256,
            bytes: file.bytes,
          })),
          exclusions: [
            "Authentication secrets and session tokens",
            "Private coaching working notes and unpublished drafts",
            "Coaching intake and published client content: client-scoped export only",
            "Temporary migration source files and unrelated household/workspace records",
          ],
          relationships:
            "Stable IDs and *Id columns preserve links between the named tables. FormVersion.fileReference resolves to files/<id>; SignedDocument.formVersionId identifies the exact signed version.",
          csv: "CSV strings beginning with formula characters are prefixed with an apostrophe. JSON preserves original values.",
        };
        const source = JSON.stringify({ manifest, ...data });
        if (Buffer.byteLength(source) > 100 * 1024 * 1024)
          fail(
            "This export requires a larger batch. No partial archive has been marked complete.",
          );
        const artifact = gzipSync(source);
        const saved = await tx.workspaceDataExport.update({
          where: { id: job.id },
          data: {
            state: "READY",
            artifact,
            sha256: hash(artifact),
            byteCount: artifact.length,
            manifest: json(manifest),
          },
          select: {
            id: true,
            state: true,
            sha256: true,
            byteCount: true,
            expiresAt: true,
            manifest: true,
          },
        });
        await audit(tx, actor, "EXPORT_READY", {
          exportId: job.id,
          sha256: saved.sha256,
          byteCount: saved.byteCount,
        });
        return saved;
      },
      { isolationLevel: "RepeatableRead", timeout: 120000 },
    );
  } catch (error) {
    await db.workspaceDataExport.update({
      where: { id: job.id },
      data: {
        state: "FAILED",
        artifact: null,
        failureMessage:
          error instanceof WorkspaceDataError
            ? error.message
            : "Export failed. Contact the records contact and retry after the cause is resolved.",
      },
    });
    throw error;
  }
}
export async function downloadWorkspaceDataExport(
  actor: WorkspaceDataActor,
  exportId: string,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  return db.$transaction(async (tx) => {
    await requireWorkspaceDataOwner(tx, actor);
    const job = await tx.workspaceDataExport.findFirst({
      where: { id: exportId, workspaceId: actor.workspaceId },
    });
    if (!job || job.state !== "READY" || !job.artifact || job.expiresAt <= now)
      fail("This export is unavailable or expired. Prepare a new export.");
    if (hash(job.artifact) !== job.sha256)
      fail("The export checksum does not match. Prepare a new export.");
    await tx.workspaceDataExport.update({
      where: { id: job.id },
      data: { downloadedAt: now },
    });
    await audit(tx, actor, "EXPORT_DOWNLOADED", {
      exportId,
      sha256: job.sha256,
    });
    return {
      bytes: job.artifact,
      sha256: job.sha256!,
      filename: `hitlink-${actor.workspaceId}-${job.id}.json.gz`,
    };
  });
}
export async function confirmWorkspaceExportReceipt(
  actor: WorkspaceDataActor,
  exportId: string,
  checksum: string,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  return db.$transaction(async (tx) => {
    await requireWorkspaceDataOwner(tx, actor);
    const job = await tx.workspaceDataExport.findFirst({
      where: { id: exportId, workspaceId: actor.workspaceId },
    });
    if (
      !job ||
      job.state !== "READY" ||
      !job.downloadedAt ||
      job.expiresAt <= now ||
      job.sha256 !== checksum.trim()
    )
      fail(
        "Download and verify this exact archive before confirming its receipt.",
      );
    await tx.workspaceDataExport.update({
      where: { id: exportId },
      data: { receiptConfirmedAt: now, receiptConfirmedByUserId: actor.userId },
    });
    await audit(tx, actor, "EXPORT_RECEIPT_CONFIRMED", { exportId, checksum });
  });
}
export async function expireWorkspaceDataExports(options: Options = {}) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  return db.workspaceDataExport.updateMany({
    where: { expiresAt: { lte: now }, artifact: { not: null } },
    data: { artifact: null, state: "EXPIRED" },
  });
}
export async function saveWorkspaceOffboarding(
  actor: WorkspaceDataActor,
  input: {
    expectedVersion: number;
    accessEndsAt: string;
    retentionUntil: string;
    retentionReason: string;
    recordsContact: string;
    retentionHoldReason?: string;
    exportJobId: string;
  },
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  const accessEndsAt = new Date(input.accessEndsAt),
    retentionUntil = new Date(input.retentionUntil);
  if (
    !Number.isFinite(+accessEndsAt) ||
    !Number.isFinite(+retentionUntil) ||
    retentionUntil <= accessEndsAt
  )
    fail("Choose a future access end and a later retention review date.");
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await requireWorkspaceDataOwner(tx, actor);
    const prior = await tx.workspaceOffboarding.findUnique({
      where: { workspaceId: actor.workspaceId },
    });
    if (
      await tx.financialOperation.count({
        where: {
          workspaceId: actor.workspaceId,
          targetId: actor.workspaceId,
          status: { in: ["RESERVED", "SUBMITTED"] },
        },
      })
    )
      fail(
        "Wait for the platform billing operation to reconcile before changing this plan.",
      );
    if (accessEndsAt < now && (!prior || +prior.accessEndsAt !== +accessEndsAt))
      fail("Choose a future access end.");
    if (
      (prior?.version ?? 0) !== input.expectedVersion ||
      prior?.accessRevokedAt
    )
      fail("This offboarding plan changed. Reload before saving.");
    const job = await tx.workspaceDataExport.findFirst({
      where: {
        id: input.exportJobId,
        workspaceId: actor.workspaceId,
        receiptConfirmedAt: { not: null },
      },
    });
    if (!job)
      fail("Verify receipt of this gym's export before preparing offboarding.");
    const data = {
      accessEndsAt,
      retentionUntil,
      retentionReason: text(input.retentionReason, "Retention basis"),
      recordsContact: text(input.recordsContact, "Records contact", 250),
      retentionHoldReason: input.retentionHoldReason?.trim() || null,
      exportJobId: job.id,
      customerBillingDisposition: "STOP",
      state: "REVIEW",
      ownerConfirmedAt: null,
      ownerConfirmedByUserId: null,
    };
    const plan = prior
      ? await tx.workspaceOffboarding.update({
          where: { id: prior.id },
          data: { ...data, version: { increment: 1 } },
        })
      : await tx.workspaceOffboarding.create({
          data: {
            ...data,
            workspaceId: actor.workspaceId,
            requestedByUserId: actor.userId,
          },
        });
    await audit(tx, actor, "OFFBOARDING_PLAN_SAVED", {
      planId: plan.id,
      version: plan.version,
      accessEndsAt,
      retentionUntil,
      recordsContact: data.recordsContact,
    });
    return plan;
  });
}
export async function confirmWorkspaceOffboarding(
  actor: WorkspaceDataActor,
  version: number,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  await db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await requireWorkspaceDataOwner(tx, actor);
    const plan = await tx.workspaceOffboarding.findUnique({
      where: { workspaceId: actor.workspaceId },
    });
    if (!plan || plan.version !== version || plan.accessRevokedAt)
      fail("Review the current offboarding plan before confirming.");
    await audit(tx, actor, "OFFBOARDING_OWNER_CONFIRMED", {
      planId: plan.id,
      version,
    });
    await tx.workspaceOffboarding.update({
      where: { id: plan.id },
      data: { ownerConfirmedAt: now, ownerConfirmedByUserId: actor.userId },
    });
  });
}
async function inventory(tx: Tx, workspaceId: string, now: Date) {
  const plan = await tx.workspaceOffboarding.findUnique({
    where: { workspaceId },
    include: { exportJob: true },
  });
  const blockers: string[] = [];
  if (!plan)
    return { plan: null, blockers: ["Prepare an agreed offboarding plan."] };
  const owners = await tx.workspaceUser.findMany({
    where: { workspaceId, role: "OWNER", isActive: true },
    select: { userId: true },
  });
  const confirmations = await tx.workspaceDataEvent.findMany({
    where: { workspaceId, kind: "OFFBOARDING_OWNER_CONFIRMED" },
  });
  if (
    owners.some(
      (owner) =>
        !confirmations.some(
          (event) =>
            event.actorUserId === owner.userId &&
            (event.metadata as Row).version === plan.version,
        ),
    )
  )
    blockers.push("Every active owner must confirm this plan version.");
  if (!plan.exportJob?.receiptConfirmedAt)
    blockers.push("Verify export receipt.");
  if (
    await tx.financialOperation.count({
      where: {
        workspaceId,
        status: { in: ["RESERVED", "SUBMITTED", "REVIEW_REQUIRED"] },
      },
    })
  )
    blockers.push(
      "Resolve pending payment operations and reconciliation reviews.",
    );
  if (
    await tx.financialReviewCase.count({
      where: { workspaceId, resolvedAt: null },
    })
  )
    blockers.push("Resolve open financial review cases.");
  if (
    await tx.invoice.count({
      where: { workspaceId, status: { in: ["OPEN", "UNCOLLECTIBLE"] } },
    })
  )
    blockers.push(
      "Resolve outstanding invoice balances or document their disposition through billing.",
    );
  if (await tx.refund.count({ where: { workspaceId, status: "PENDING" } }))
    blockers.push("Resolve pending refunds.");
  if (
    await tx.memberPunchCard.count({
      where: { workspaceId, remainingPunches: { gt: 0 } },
    })
  )
    blockers.push(
      "Resolve unused class-pack units, including archived packs, through a recorded settlement or handover.",
    );
  if (
    await tx.accountCredit.count({
      where: {
        workspaceId,
        status: "ACTIVE",
        remainingAmountCents: { gt: 0 },
      },
    })
  )
    blockers.push(
      "Resolve remaining account credits through a recorded settlement or handover.",
    );
  if (
    await tx.coachingAppointment.count({
      where: {
        workspaceId,
        status: { in: ["HELD", "BOOKED"] },
        endsAt: { gte: plan.accessEndsAt },
      },
    })
  )
    blockers.push("Resolve future coaching appointments.");
  const coaching = await tx.coachingEnrollment.findMany({
    where: { workspaceId },
    select: { status: true, settlementState: true, retrievalUntil: true },
  });
  if (
    coaching.some(
      (item) =>
        item.status !== "CLOSED" ||
        !["NOT_REQUIRED", "SETTLED"].includes(item.settlementState),
    )
  )
    blockers.push("Close coaching services and resolve their settlements.");
  if (
    coaching.some(
      (item) => item.retrievalUntil && item.retrievalUntil > plan.accessEndsAt,
    )
  )
    blockers.push(
      "The access end precedes a promised coaching retrieval window.",
    );
  const location = await tx.location.findUnique({
    where: { workspaceId },
    select: { timezone: true },
  });
  const boundary = new Intl.DateTimeFormat("en-CA", {
    timeZone: location?.timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(plan.accessEndsAt);
  if (
    await tx.classBooking.count({
      where: {
        workspaceId,
        status: "BOOKED",
        scheduledForDate: { gte: new Date(`${boundary}T00:00:00Z`) },
      },
    })
  )
    blockers.push("Resolve class bookings on or after the access end.");
  if (
    await tx.eventBooking.count({
      where: {
        workspaceId,
        status: "BOOKED",
        event: { endsAt: { gte: plan.accessEndsAt } },
      },
    })
  )
    blockers.push("Resolve future event bookings.");
  if (
    await tx.privateLessonBooking.count({
      where: {
        workspaceId,
        status: "BOOKED",
        privateLessonSlot: { endsAt: { gte: plan.accessEndsAt } },
      },
    })
  )
    blockers.push("Resolve future private lessons.");
  const platform = await tx.workspacePlatformBilling.findUnique({
    where: { workspaceId },
  });
  if (
    !platform ||
    platform.status !== "STOP_CONFIRMED" ||
    !platform.stopsAt ||
    platform.stopsAt > plan.accessEndsAt ||
    !platform.verifiedAt ||
    now.getTime() - platform.verifiedAt.getTime() > 300000
  )
    blockers.push(
      "Freshly verify that HitLink platform charges stop by the access end.",
    );
  const evidence = plan.customerBillingEvidence as Row | null;
  if (
    !evidence?.verifiedAt ||
    now.getTime() - new Date(String(evidence.verifiedAt)).getTime() > 300000 ||
    evidence.version !== plan.version
  )
    blockers.push("Freshly verify every customer subscription's renewal stop.");
  return { plan, blockers };
}
export async function getWorkspaceDataManagement(
  actor: WorkspaceDataActor,
  options: Options = {},
) {
  const db = options.db ?? prisma;
  await requireWorkspaceDataOwner(db, actor);
  const [exports, grants, events, state] = await Promise.all([
    db.workspaceDataExport.findMany({
      where: { workspaceId: actor.workspaceId },
      select: {
        id: true,
        purpose: true,
        state: true,
        sha256: true,
        byteCount: true,
        expiresAt: true,
        createdAt: true,
        downloadedAt: true,
        receiptConfirmedAt: true,
        failureMessage: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.supportAccessGrant.findMany({
      where: { workspaceId: actor.workspaceId },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.workspaceDataEvent.findMany({
      where: { workspaceId: actor.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    inventory(db, actor.workspaceId, options.now ?? new Date()),
  ]);
  const safePlan = (value: NonNullable<typeof state.plan>) => {
    const { exportJob, ...record } = value;
    void exportJob;
    return record;
  };
  return {
    exports,
    grants,
    events,
    plan: state.plan ? safePlan(state.plan) : null,
    blockers: state.blockers,
  };
}
export async function finalizeWorkspaceOffboarding(
  actor: WorkspaceDataActor,
  version: number,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  return retrySerialization(() =>
    db.$transaction(
      async (tx) => {
        await lockClassSchedule(tx, actor.workspaceId);
        await requireWorkspaceDataOwner(tx, actor);
        const { plan, blockers } = await inventory(tx, actor.workspaceId, now);
        if (!plan || plan.version !== version)
          fail("The plan changed. Review it again.");
        if (now < plan.accessEndsAt)
          blockers.push("The agreed access end has not arrived.");
        if (blockers.length) fail(blockers.join(" "));
        const current = await snapshot(tx, actor.workspaceId);
        if (
          (plan.exportJob!.manifest as Row)?.sourceHash !== current.sourceHash
        )
          fail(
            "Records changed after the export. Prepare, download and verify a fresh archive, then update the plan.",
          );
        await tx.workspace.update({
          where: { id: actor.workspaceId },
          data: { status: "DISABLED" },
        });
        await tx.workspaceUser.updateMany({
          where: { workspaceId: actor.workspaceId },
          data: { isActive: false },
        });
        await tx.supportAccessGrant.updateMany({
          where: { workspaceId: actor.workspaceId, revokedAt: null },
          data: { revokedAt: now, revokedByUserId: actor.userId },
        });
        await tx.notificationJob.updateMany({
          where: {
            workspaceId: actor.workspaceId,
            status: { in: ["PENDING", "FAILED"] },
          },
          data: { status: "CANCELLED", nextAttemptAt: null },
        });
        const saved = await tx.workspaceOffboarding.update({
          where: { id: plan.id },
          data: {
            state: "ACCESS_REVOKED",
            accessRevokedAt: now,
            deletionState: plan.retentionHoldReason ? "HELD" : "RETAINED",
            customerBillingEvidence:
              plan.customerBillingEvidence ?? Prisma.JsonNull,
          },
        });
        await audit(tx, actor, "WORKSPACE_ACCESS_REVOKED", {
          planId: plan.id,
          exportId: plan.exportJobId,
          retentionUntil: plan.retentionUntil,
          recordsContact: plan.recordsContact,
          database: "retained until separately authorized deletion review",
          files: "retained with database",
          temporaryExports: "expire after 24 hours",
          backups:
            "records contact must verify provider retention and any holds; no backup deletion is implied",
        });
        return saved;
      },
      { isolationLevel: "Serializable", timeout: 120000 },
    ),
  );
}
export async function grantWorkspaceSupportAccess(
  actor: WorkspaceDataActor,
  input: { supportUserId: string; purpose: string; expiresAt: string },
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date(),
    expiresAt = new Date(input.expiresAt);
  if (
    !Number.isFinite(+expiresAt) ||
    expiresAt <= now ||
    +expiresAt > +now + 24 * 3600000
  )
    fail("Support access must end within 24 hours.");
  return db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await requireWorkspaceDataOwner(tx, actor);
    if (!(await tx.user.findUnique({ where: { id: input.supportUserId } })))
      fail("Choose a named support account that already exists.");
    const grant = await tx.supportAccessGrant.create({
      data: {
        workspaceId: actor.workspaceId,
        grantedByUserId: actor.userId,
        supportUserId: input.supportUserId,
        purpose: text(input.purpose, "Support purpose"),
        expiresAt,
        scopes: ["OPERATIONAL_DIAGNOSTICS"],
      },
    });
    await tx.supportAccessEvent.create({
      data: {
        grantId: grant.id,
        actorUserId: actor.userId,
        action: "GRANTED",
        metadata: { expiresAt: expiresAt.toISOString(), scopes: grant.scopes },
      },
    });
    return grant;
  });
}
export async function revokeWorkspaceSupportAccess(
  actor: WorkspaceDataActor,
  grantId: string,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  await db.$transaction(async (tx) => {
    await lockClassSchedule(tx, actor.workspaceId);
    await requireWorkspaceDataOwner(tx, actor);
    const grant = await tx.supportAccessGrant.findFirst({
      where: { id: grantId, workspaceId: actor.workspaceId },
    });
    if (!grant) fail("Support access was not found.");
    await tx.supportAccessGrant.update({
      where: { id: grantId },
      data: { revokedAt: now, revokedByUserId: actor.userId },
    });
    await tx.supportAccessEvent.create({
      data: {
        grantId,
        actorUserId: actor.userId,
        action: "REVOKED",
        metadata: {},
      },
    });
  });
}
export async function readWorkspaceSupportDiagnostics(
  userId: string,
  grantId: string,
  options: Options = {},
) {
  const db = options.db ?? prisma,
    now = options.now ?? new Date();
  return db.$transaction(async (tx) => {
    const candidate = await tx.supportAccessGrant.findUnique({
      where: { id: grantId },
      select: { workspaceId: true },
    });
    if (!candidate) fail("Support access is unavailable.");
    await lockClassSchedule(tx, candidate.workspaceId);
    const grant = await tx.supportAccessGrant.findUniqueOrThrow({
      where: { id: grantId },
    });
    if (
      grant.supportUserId !== userId ||
      grant.revokedAt ||
      grant.expiresAt <= now ||
      !grant.scopes.includes("OPERATIONAL_DIAGNOSTICS")
    )
      fail("Support access is unavailable or expired.");
    await requireWorkspaceDataOwner(tx, {
      workspaceId: grant.workspaceId,
      userId: grant.grantedByUserId,
    });
    const [workspace, operations, notifications, reviewCases] =
      await Promise.all([
        tx.workspace.findUniqueOrThrow({
          where: { id: grant.workspaceId },
          select: { id: true, name: true, status: true },
        }),
        tx.financialOperation.groupBy({
          by: ["kind", "status"],
          where: { workspaceId: grant.workspaceId },
          _count: true,
        }),
        tx.notificationJob.groupBy({
          by: ["status"],
          where: { workspaceId: grant.workspaceId },
          _count: true,
        }),
        tx.financialReviewCase.count({
          where: { workspaceId: grant.workspaceId, resolvedAt: null },
        }),
      ]);
    await tx.supportAccessEvent.create({
      data: {
        grantId,
        actorUserId: userId,
        action: "DIAGNOSTICS_READ",
        metadata: { scopes: grant.scopes },
      },
    });
    return {
      workspace,
      purpose: grant.purpose,
      expiresAt: grant.expiresAt,
      operations,
      notifications,
      openFinancialReviewCases: reviewCases,
    };
  });
}
