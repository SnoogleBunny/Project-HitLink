import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { readDatabaseFailure } from "./database-failure.js";

const known = (code = "P2002", meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("Private engine text", {
    code,
    clientVersion: "6.19.3",
    meta,
  });

describe("inert database failure reader", () => {
  it("projects native SDK fields without exposing message or arbitrary metadata", () => {
    expect(
      readDatabaseFailure(
        known("P2002", {
          modelName: "Room",
          target: ["locationId", "name"],
          private: "secret",
        }),
      ),
    ).toEqual({
      code: "P2002",
      clientVersion: "6.19.3",
      modelName: "Room",
      target: ["locationId", "name"],
      sqlState: undefined,
    });
    expect(readDatabaseFailure(known("P2034"))?.code).toBe("P2034");
    expect(
      readDatabaseFailure(known("P2010", { code: "40001" }))?.sqlState,
    ).toBe("40001");
  });

  it.each([
    null,
    undefined,
    1,
    "P2034",
    { code: "P2034" },
    new Error("P2034"),
    Object.create(Prisma.PrismaClientKnownRequestError.prototype),
  ])("does not classify non-SDK value %#", (value) =>
    expect(readDatabaseFailure(value)).toBeNull(),
  );

  it("rejects errors, metadata, targets and prototypes involving proxies without traps", () => {
    let traps = 0;
    const proxy = <T extends object>(value: T) =>
      new Proxy(value, {
        get() {
          traps++;
          throw new Error("get trap");
        },
        getPrototypeOf() {
          traps++;
          throw new Error("prototype trap");
        },
        getOwnPropertyDescriptor() {
          traps++;
          throw new Error("descriptor trap");
        },
      });
    const prototypeProxy = known();
    Object.setPrototypeOf(prototypeProxy, proxy({}));
    const revoked = Proxy.revocable(known(), {});
    revoked.revoke();
    for (const value of [
      proxy(known()),
      known("P2002", proxy({})),
      known("P2002", { target: proxy([]) }),
      prototypeProxy,
      revoked.proxy,
    ])
      expect(readDatabaseFailure(value)).toBeNull();
    expect(traps).toBe(0);
  });

  it("does not invoke getters or accept inherited and malformed target fields", () => {
    let reads = 0;
    const getter = {
      get() {
        reads++;
        throw new Error("getter");
      },
    };
    for (const property of ["code", "meta", "clientVersion"]) {
      const error = known();
      Object.defineProperty(error, property, getter);
      expect(readDatabaseFailure(error)).toBeNull();
    }
    for (const property of ["target", "modelName", "code"]) {
      const meta = {};
      Object.defineProperty(meta, property, getter);
      expect(readDatabaseFailure(known("P2002", meta))).toBeNull();
    }
    const target = ["id"];
    Object.defineProperty(target, "0", getter);
    expect(readDatabaseFailure(known("P2002", { target }))).toBeNull();
    for (const malformed of [
      new Array(1),
      Array(33).fill("id"),
      [1],
      "id",
      ["x".repeat(129)],
    ])
      expect(
        readDatabaseFailure(known("P2002", { target: malformed })),
      ).toBeNull();
    expect(reads).toBe(0);
  });
});
