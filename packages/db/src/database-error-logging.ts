import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

type ErrorEvent = { timestamp: Date; message: string };
const modelNames = new Map(
  Object.values(Prisma.ModelName).map((model) => [
    model[0]!.toLowerCase() + model.slice(1),
    model,
  ]),
);
const operations = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);
const rawOperations = new Set([
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
]);
const sqlStateClasses = new Set([
  "00",
  "01",
  "02",
  "03",
  "08",
  "09",
  "0A",
  "0B",
  "0F",
  "0L",
  "0P",
  "0Z",
  "20",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "2B",
  "2D",
  "2F",
  "34",
  "38",
  "39",
  "3B",
  "3D",
  "3F",
  "40",
  "42",
  "44",
  "53",
  "54",
  "55",
  "57",
  "58",
  "72",
  "F0",
  "HV",
  "P0",
  "XX",
]);

/** Deliberately project known technical tokens; never serialize an engine message or target. */
export function projectDatabaseErrorLog(event: ErrorEvent) {
  const message = typeof event.message === "string" ? event.message : "";
  const occurredAt =
    event.timestamp instanceof Date && Number.isFinite(+event.timestamp)
      ? event.timestamp.toISOString()
      : new Date().toISOString();
  const record: {
    schemaVersion: 1;
    event: "database.error";
    code: "PRISMA_DATABASE_ERROR";
    diagnosticId: string;
    occurredAt: string;
    prismaCode?: string;
    sqlState?: string;
    model?: string;
    operation?: string;
  } = {
    schemaVersion: 1,
    event: "database.error",
    code: "PRISMA_DATABASE_ERROR",
    diagnosticId: randomUUID(),
    occurredAt,
  };
  const prismaCode = /^Error code: (P[1-6]\d{3})(?:\r?\n|$)/m.exec(
    message,
  )?.[1];
  if (prismaCode) record.prismaCode = prismaCode;
  const sqlState = /(?:^|\n)Raw query failed\. Code: `([0-9A-Z]{5})`\./.exec(
    message,
  )?.[1];
  if (sqlState && sqlStateClasses.has(sqlState.slice(0, 2)))
    record.sqlState = sqlState;

  const invocation =
    /(?:^|\n)Invalid `((?:[A-Za-z_$][A-Za-z0-9_$]{0,63}\.){0,6})([A-Za-z_$][A-Za-z0-9_$]{0,63})\(\)` invocation(?:\s|:|$)/.exec(
      message,
    );
  if (invocation) {
    const operation = invocation[2]!;
    if (rawOperations.has(operation)) record.operation = operation;
    else if (operations.has(operation)) {
      const path = invocation[1]!.split(".").filter(Boolean);
      const model = modelNames.get(path.at(-1) ?? "");
      if (model) {
        record.model = model;
        record.operation = operation;
      }
    }
  }
  return record;
}
