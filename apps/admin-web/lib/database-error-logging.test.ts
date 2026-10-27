import { describe, expect, it } from "vitest";
import { projectDatabaseErrorLog } from "../../../packages/db/src/database-error-logging";

const timestamp = new Date("2030-01-01T12:00:00Z");
describe("safe database error event projection", () => {
  it("keeps only generated diagnostic identity, time and recognized model/operation", () => {
    const record = projectDatabaseErrorLog({
      timestamp,
      message:
        "Invalid `args.db.member.create()` invocation:\nPRIVATE_CUSTOMER_NAME secret_bearer_123",
    });
    expect(record).toEqual({
      schemaVersion: 1,
      event: "database.error",
      code: "PRISMA_DATABASE_ERROR",
      diagnosticId: expect.stringMatching(
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
      ),
      occurredAt: timestamp.toISOString(),
      model: "Member",
      operation: "create",
    });
  });
  it("keeps recognized exact code formats without copying error excerpts", () => {
    expect(
      projectDatabaseErrorLog({
        timestamp,
        message:
          "Error code: P2002\nRaw query failed. Code: `23505`. Message: `PRIVATE_SECRET`",
      }),
    ).toMatchObject({ prismaCode: "P2002", sqlState: "23505" });
  });
  it.each([
    "Invalid `db.CustomerSentinel.create()` invocation: PRIVATE_SECRET",
    "Invalid `db.member.readPrivateSecret()` invocation: PRIVATE_SECRET",
    "Error code: P2002PRIVATE_SECRET\nRaw query failed. Code: `SENTI`. Message: PRIVATE_SECRET",
    "PRIVATE_SECRET User.create Error code: P2002",
  ])("omits unknown or forged technical fields from %s", (message) => {
    const record = projectDatabaseErrorLog({ timestamp, message });
    expect(Object.keys(record).sort()).toEqual(
      ["code", "diagnosticId", "event", "occurredAt", "schemaVersion"].sort(),
    );
    expect(JSON.stringify(record)).not.toContain("PRIVATE_SECRET");
  });
  it("never trusts target, metadata, model or correlation fields attached to an event", () => {
    const record = projectDatabaseErrorLog({
      timestamp,
      message: "customer@private.test",
      target: "SECRET_TARGET",
      model: "SECRET_MODEL",
      errorCode: "P2002SECRET",
      diagnosticId: "SECRET_ID",
      meta: { token: "SECRET_TOKEN" },
    } as never);
    expect(Object.keys(record).sort()).toEqual(
      ["code", "diagnosticId", "event", "occurredAt", "schemaVersion"].sort(),
    );
    expect(JSON.stringify(record)).not.toMatch(/SECRET|private\.test/);
  });
  it("retains a known raw operation and custom SQLSTATE without SQL text", () => {
    const record = projectDatabaseErrorLog({
      timestamp,
      message:
        "Invalid `prisma.$executeRawUnsafe()` invocation:\n\nRaw query failed. Code: `P0001`. Message: `SECRET_SQL_TEXT`",
    });
    expect(record).toMatchObject({
      operation: "$executeRawUnsafe",
      sqlState: "P0001",
    });
    expect(record).not.toHaveProperty("model");
    expect(JSON.stringify(record)).not.toContain("SECRET_SQL_TEXT");
  });
});
