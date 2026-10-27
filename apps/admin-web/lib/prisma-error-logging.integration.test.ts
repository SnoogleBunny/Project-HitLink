import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Prisma } from "@flowstate/db";
import { prisma } from "../../../packages/db/src/client";
const databaseUrl = process.env.TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "real Prisma failures log safe technical diagnostics",
  () => {
    let errorSpy: ReturnType<typeof vi.spyOn>,
      logSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => {
      await prisma.$disconnect();
    });
    function records() {
      const text = JSON.stringify([
        ...errorSpy.mock.calls,
        ...logSpy.mock.calls,
      ]);
      expect(text).not.toMatch(
        /PRIVATE_CUSTOMER_SENTINEL|BEARER_SECRET_SENTINEL|private@example\.test|RAW_SQL_SENTINEL/,
      );
      const records = errorSpy.mock.calls.map(
        ([line]) => JSON.parse(String(line)) as Record<string, unknown>,
      );
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        expect(record).toMatchObject({
          schemaVersion: 1,
          event: "database.error",
          code: "PRISMA_DATABASE_ERROR",
          diagnosticId: expect.any(String),
          occurredAt: expect.any(String),
        });
        expect(
          Object.keys(record).every((key) =>
            [
              "schemaVersion",
              "event",
              "code",
              "diagnosticId",
              "occurredAt",
              "prismaCode",
              "sqlState",
              "model",
              "operation",
            ].includes(key),
          ),
        ).toBe(true);
      }
      return records;
    }
    it("does not log a real model validation failure's customer and password arguments, and still rejects with its original typed error", async () => {
      let failure: unknown;
      try {
        await prisma.user.create({
          data: {
            fullName: "PRIVATE_CUSTOMER_SENTINEL",
            passwordHash: "BEARER_SECRET_SENTINEL",
          },
        } as Prisma.UserCreateArgs);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Prisma.PrismaClientValidationError);
      expect(records()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ model: "User", operation: "create" }),
        ]),
      );
    });
    it("does not log a real SQL exception's text or bearer and retains its SQLSTATE and original Prisma code", async () => {
      let failure: unknown;
      try {
        await prisma.$executeRawUnsafe(
          "DO $$ BEGIN RAISE EXCEPTION 'RAW_SQL_SENTINEL PRIVATE_CUSTOMER_SENTINEL BEARER_SECRET_SENTINEL private@example.test'; END $$",
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(failure).toMatchObject({ code: "P2010", meta: { code: "P0001" } });
      expect((failure as Error).message).toContain("RAW_SQL_SENTINEL");
      expect(records()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sqlState: "P0001" }),
        ]),
      );
    });
  },
);
