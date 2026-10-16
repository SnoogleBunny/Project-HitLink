import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

// Updated only after reviewing every owned model, relation and file-bearing field.
// A schema change blocks deletion until this inventory is reviewed again.
export const REVIEWED_RETENTION_SCHEMA =
  "c8f7b3f0ea259a2346bc80bcf102a2bac1b55f189f753b3df73291cd03b2d97d";
const survivors = new Set([
  "User",
  "AuthSession",
  "WorkspaceRetentionCase",
  "WorkspaceRetentionEvent",
]);
const indirectScope: Record<string, (workspaceId: string) => object> = {
  Room: (workspaceId) => ({ location: { workspaceId } }),
  CoachingProgramVersion: (workspaceId) => ({ program: { workspaceId } }),
  CoachingAssignment: (workspaceId) => ({ enrollment: { workspaceId } }),
  CoachingIntake: (workspaceId) => ({ enrollment: { workspaceId } }),
  CoachingMilestone: (workspaceId) => ({ enrollment: { workspaceId } }),
  CoachingDailyNote: (workspaceId) => ({ enrollment: { workspaceId } }),
  CoachingDailyNoteRevision: (workspaceId) => ({
    note: { enrollment: { workspaceId } },
  }),
  CoachingPrivateNote: (workspaceId) => ({ enrollment: { workspaceId } }),
  MembershipLifecycleEvent: (workspaceId) => ({ request: { workspaceId } }),
  SupportAccessEvent: (workspaceId) => ({ grant: { workspaceId } }),
};
const brokenCycles = new Set([
  "ClassBooking.fundedByBookingId",
  "FormDocument.currentVersionId",
  "ImportedFinancialEvidence.parentEvidenceId",
]);
export class RetentionInventoryError extends Error {}

type Row = Record<string, unknown> & { id: string };
type Delegate = {
  findMany(args: unknown): Promise<Row[]>;
  count(args: unknown): Promise<number>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function delegate(tx: Prisma.TransactionClient, model: string) {
  const result = (tx as unknown as Record<string, Delegate>)[
    model[0]!.toLowerCase() + model.slice(1)
  ];
  if (!result)
    throw new RetentionInventoryError(
      "A reviewed retention model is unavailable.",
    );
  return result;
}
export function currentRetentionSchemaFingerprint() {
  return digest(Prisma.dmmf.datamodel);
}
function reviewedModels() {
  if (currentRetentionSchemaFingerprint() !== REVIEWED_RETENTION_SCHEMA)
    throw new RetentionInventoryError(
      "The records inventory needs review after a schema change. Nothing has been deleted.",
    );
  const models = Prisma.dmmf.datamodel.models.filter(
    (model) => !survivors.has(model.name),
  );
  for (const model of models) {
    if (
      !model.fields.some(
        (field) => field.name === "id" && field.isId && field.type === "String",
      )
    )
      throw new RetentionInventoryError(
        "A record identity needs a reviewed deletion procedure.",
      );
    if (
      model.name !== "Workspace" &&
      !model.fields.some((field) => field.name === "workspaceId") &&
      !indirectScope[model.name]
    )
      throw new RetentionInventoryError(
        "A record has no reviewed workspace scope. Nothing has been deleted.",
      );
    for (const field of model.fields.filter(
      (item) => item.relationFromFields?.length,
    ))
      if (
        field.relationFromFields!.length !== 1 ||
        field.relationToFields?.[0] !== "id"
      )
        throw new RetentionInventoryError(
          "A relationship needs a reviewed deletion procedure.",
        );
  }
  return models;
}
/** IDs and foreign keys only: private text, file bytes and payment details are never read. */
export async function inspectRetentionInventory(
  tx: Prisma.TransactionClient,
  workspaceId: string,
) {
  const models = reviewedModels();
  const tables = await tx.$queryRaw<
    Array<{ table: string; columns: string[] }>
  >`
    SELECT c.relname AS "table", ARRAY_AGG(a.attname ORDER BY a.attname) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p') AND c.relname <> '_prisma_migrations'
    GROUP BY c.relname
  `;
  const knownTables = new Map(
    Prisma.dmmf.datamodel.models.map((model) => [
      model.dbName ?? model.name,
      model.fields
        .filter((field) => field.kind !== "object")
        .map((field) => field.dbName ?? field.name)
        .sort(),
    ]),
  );
  if (
    tables.length !== knownTables.size ||
    tables.some(
      (table) =>
        JSON.stringify(table.columns.sort()) !==
        JSON.stringify(knownTables.get(table.table)),
    )
  )
    throw new RetentionInventoryError(
      "Database tables or columns differ from the reviewed inventory. Nothing has been deleted.",
    );
  const byName = new Map(models.map((model) => [model.name, model]));
  const tableNames = models.map((model) => model.dbName ?? model.name);
  const expectedForeignKeys = new Set(
    models.flatMap((model) =>
      model.fields
        .filter(
          (field) => field.relationFromFields?.length && byName.has(field.type),
        )
        .map((field) => {
          const parent = byName.get(field.type)!;
          return JSON.stringify([
            model.dbName ?? model.name,
            field.relationFromFields!.map(
              (name) =>
                model.fields.find((item) => item.name === name)?.dbName ?? name,
            ),
            parent.dbName ?? parent.name,
            field.relationToFields!.map(
              (name) =>
                parent.fields.find((item) => item.name === name)?.dbName ??
                name,
            ),
          ]);
        }),
    ),
  );
  const actualForeignKeys = await tx.$queryRaw<
    Array<{
      child: string;
      childFields: string[];
      parent: string;
      parentFields: string[];
      sameSchema: boolean;
    }>
  >`
    SELECT child.relname AS child, parent.relname AS parent, child_schema.nspname = current_schema() AS "sameSchema",
      ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY AS k(n, i)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS "childFields",
      ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY AS k(n, i)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS "parentFields"
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace
    JOIN pg_namespace parent_schema ON parent_schema.oid = parent.relnamespace
    WHERE c.contype = 'f' AND parent_schema.nspname = current_schema()
      AND parent.relname = ANY(${tableNames}::text[])
  `;
  const actualKeys = new Set(
    actualForeignKeys.map((key) =>
      JSON.stringify([
        key.child,
        key.childFields,
        key.parent,
        key.parentFields,
      ]),
    ),
  );
  if (
    actualForeignKeys.some((key) => !key.sameSchema) ||
    actualKeys.size !== expectedForeignKeys.size ||
    [...actualKeys].some((key) => !expectedForeignKeys.has(key))
  )
    throw new RetentionInventoryError(
      "Database relationships differ from the reviewed inventory. Nothing has been deleted.",
    );
  const rows = new Map<string, Row[]>();
  for (const model of models) {
    const where =
      model.name === "Workspace"
        ? { id: workspaceId }
        : model.fields.some((field) => field.name === "workspaceId")
          ? { workspaceId }
          : indirectScope[model.name]!(workspaceId);
    const foreignKeys = model.fields.flatMap(
      (field) => field.relationFromFields ?? [],
    );
    const records = await delegate(tx, model.name).findMany({
      where,
      select: Object.fromEntries(
        ["id", ...foreignKeys].map((field) => [field, true]),
      ),
      orderBy: { id: "asc" },
      take: 50001,
    });
    if (records.length > 50000)
      throw new RetentionInventoryError(
        "This gym needs a larger reviewed deletion batch. Nothing has been deleted.",
      );
    rows.set(model.name, records);
  }
  const ids = new Map(
    [...rows].map(([model, records]) => [
      model,
      new Set(records.map((row) => row.id)),
    ]),
  );
  for (const model of models) {
    for (const field of model.fields.filter(
      (item) => item.relationFromFields?.length && ids.has(item.type),
    )) {
      const foreignKey = field.relationFromFields![0]!;
      const parentIds = ids.get(field.type)!;
      // A locally scoped row must not point into another gym.
      for (const row of rows.get(model.name)!) {
        const target = row[foreignKey];
        if (target != null && !parentIds.has(String(target)))
          throw new RetentionInventoryError(
            "A relationship crosses the gym boundary. Reconcile it before deletion.",
          );
      }
      // And another gym's malformed child must not disappear through ON DELETE CASCADE/SET NULL.
      if (
        parentIds.size &&
        (await delegate(tx, model.name).count({
          where: {
            [foreignKey]: { in: [...parentIds] },
            id: { notIn: [...ids.get(model.name)!] },
          },
        }))
      )
        throw new RetentionInventoryError(
          "Another gym references these records. Reconcile that relationship before deletion.",
        );
    }
  }
  const counts = Object.fromEntries(
    [...rows].map(([model, records]) => [model, records.length]),
  );
  const fingerprint = digest({
    workspaceId,
    schema: REVIEWED_RETENTION_SCHEMA,
    ids: [...ids].map(([model, values]) => [model, [...values]]),
  });
  return { counts, fingerprint, rows, models };
}
/** Caller holds the retention, schedule, family and financial locks in one Serializable transaction. */
export async function deleteReviewedWorkspaceRecords(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  expectedFingerprint: string,
) {
  const inventory = await inspectRetentionInventory(tx, workspaceId);
  if (inventory.fingerprint !== expectedFingerprint)
    throw new RetentionInventoryError(
      "The records changed after preview. Review the current counts before deleting.",
    );
  const names = new Set(inventory.models.map((model) => model.name));
  const edges = new Map(
    inventory.models.map((model) => [
      model.name,
      new Set(
        model.fields
          .filter(
            (field) =>
              field.relationFromFields?.length &&
              names.has(field.type) &&
              !brokenCycles.has(
                `${model.name}.${field.relationFromFields![0]}`,
              ),
          )
          .map((field) => field.type),
      ),
    ]),
  );
  const remaining = new Set(names),
    order: string[] = [];
  while (remaining.size) {
    const next = [...remaining].find(
      (name) => ![...remaining].some((child) => edges.get(child)!.has(name)),
    );
    if (!next)
      throw new RetentionInventoryError(
        "A relationship cycle needs a reviewed deletion order. Nothing has been deleted.",
      );
    remaining.delete(next);
    order.push(next);
  }
  // Clear only reviewed nullable cycles inside the same atomic removal transaction.
  for (const [model, field] of [
    ["ClassBooking", "fundedByBookingId"],
    ["FormDocument", "currentVersionId"],
    ["ImportedFinancialEvidence", "parentEvidenceId"],
  ] as const) {
    const ids = inventory.rows.get(model)!.map((row) => row.id);
    if (ids.length)
      await delegate(tx, model).updateMany({
        where: { id: { in: ids } },
        data: { [field]: null },
      });
  }
  for (const model of order) {
    const ids = inventory.rows.get(model)!.map((row) => row.id);
    if (!ids.length) continue;
    const deleted = await delegate(tx, model).deleteMany({
      where: { id: { in: ids } },
    });
    if (deleted.count !== ids.length)
      throw new RetentionInventoryError(
        "A deletion count changed. The transaction was rolled back.",
      );
  }
  return {
    counts: inventory.counts,
    inventoryHash: inventory.fingerprint,
    schemaHash: REVIEWED_RETENTION_SCHEMA,
  };
}
