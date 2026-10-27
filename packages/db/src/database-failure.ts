import { Prisma } from "@prisma/client";
import { isNativeError, isProxy } from "node:util/types";

export type DatabaseFailure = {
  code: string;
  clientVersion?: string;
  modelName?: string;
  target?: string[];
  sqlState?: string;
};

function ownValue(value: object, key: string): unknown {
  const property = Object.getOwnPropertyDescriptor(value, key);
  if (property && !("value" in property)) throw new Error("Accessor property");
  return property?.value;
}

/** Read bounded SDK data without executing supplied getters or proxy traps.
 * Callers own constraint matching, messages, retry limits and replay authority.
 * Prototype identity is conservative classification, not proof of SDK origin.
 */
export function readDatabaseFailure(error: unknown): DatabaseFailure | null {
  try {
    if (
      isProxy(error) ||
      !isNativeError(error) ||
      Object.getPrototypeOf(error) !==
        Prisma.PrismaClientKnownRequestError.prototype
    )
      return null;
    const code = ownValue(error, "code");
    if (typeof code !== "string" || !/^P[1-6]\d{3}$/.test(code)) return null;
    const clientVersion = ownValue(error, "clientVersion");
    if (clientVersion !== undefined && typeof clientVersion !== "string")
      return null;
    const meta = ownValue(error, "meta");
    if (meta != null && (typeof meta !== "object" || isProxy(meta)))
      return null;
    const modelName = meta == null ? undefined : ownValue(meta, "modelName");
    const sqlState = meta == null ? undefined : ownValue(meta, "code");
    if (modelName !== undefined && typeof modelName !== "string") return null;
    if (sqlState !== undefined && typeof sqlState !== "string") return null;
    const rawTarget = meta == null ? undefined : ownValue(meta, "target");
    if (rawTarget != null && isProxy(rawTarget)) return null;
    let target: string[] | undefined;
    if (rawTarget !== undefined) {
      if (!Array.isArray(rawTarget)) return null;
      const length = ownValue(rawTarget, "length");
      if (
        typeof length !== "number" ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > 32
      )
        return null;
      target = [];
      for (let index = 0; index < length; index++) {
        const field = ownValue(rawTarget, String(index));
        if (typeof field !== "string" || field.length > 128) return null;
        target.push(field);
      }
    }
    return { code, clientVersion, modelName, target, sqlState };
  } catch {
    return null;
  }
}
