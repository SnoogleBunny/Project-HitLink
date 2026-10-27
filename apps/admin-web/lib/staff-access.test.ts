import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  Prisma,
  normalizeAuthoritySerializationError,
  requireActiveStaffAccessTx,
  validateStaffAccessChange,
} from "@flowstate/db";

const input = () => ({
  workspaceUserId: "staff",
  role: "COACH",
  isActive: false,
  expectedUpdatedAt: "2026-10-25T00:00:00.000Z",
  reason: "Staff contract ended",
  operationId: randomUUID(),
});
describe("staff access request boundary", () => {
  it("rejects customer promotion, missing reasons and stale-form metadata", () => {
    for (const invalid of [
      { role: "CUSTOMER" },
      { reason: " " },
      { operationId: "retry" },
      { expectedUpdatedAt: "not-a-date" },
    ])
      expect(() =>
        validateStaffAccessChange({ ...input(), ...invalid }),
      ).toThrow();
  });
  it("preserves a supported request and normalizes its review reason", () => {
    expect(
      validateStaffAccessChange({
        ...input(),
        reason: "  Staff contract ended  ",
      }),
    ).toMatchObject({
      role: "COACH",
      isActive: false,
      reason: "Staff contract ended",
      expectedUpdatedAt: new Date("2026-10-25T00:00:00.000Z"),
    });
  });
  it("rejects a revoked owner even when a caller retained the old owner context", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      requireActiveStaffAccessTx(
        {
          $queryRaw: vi.fn().mockResolvedValue([]),
          workspaceUser: { findFirst },
        } as unknown as Prisma.TransactionClient,
        { workspaceId: "gym", userId: "former-owner", capability: "OWNER" },
      ),
    ).rejects.toThrow("access changed");
  });
  it("normalizes only a real raw row-lock serialization error into the existing whole-transaction retry code", () => {
    const rawSerialization = new Prisma.PrismaClientKnownRequestError(
      "raw row lock",
      {
        code: "P2010",
        clientVersion: "test",
        meta: { code: "40001" },
      },
    );
    const normalized = normalizeAuthoritySerializationError(rawSerialization);
    expect(normalized).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(normalized).toMatchObject({ code: "P2034" });
    for (const error of [
      new Prisma.PrismaClientKnownRequestError("constraint failure", {
        code: "P2010",
        clientVersion: "test",
        meta: { code: "23514" },
      }),
      new Prisma.PrismaClientKnownRequestError(
        "existing serialization failure",
        { code: "P2034", clientVersion: "test" },
      ),
      new Error("Permission or audit failure"),
      { code: "P2010", meta: { code: "40001" } },
    ])
      expect(normalizeAuthoritySerializationError(error)).toBe(error);
  });
});
