import { isNativeError, isProxy } from "node:util/types";

/** Read one domain error's own message without inspecting unknown throws.
 * Exact prototype identity is conservative classification, not proof of origin.
 */
export function readOwnedErrorMessage(
  error: unknown,
  expectedPrototype: object,
): string | null {
  if (
    isProxy(error) ||
    !isNativeError(error) ||
    Object.getPrototypeOf(error) !== expectedPrototype
  )
    return null;
  const message = Object.getOwnPropertyDescriptor(error, "message");
  return message && "value" in message && typeof message.value === "string"
    ? message.value
    : null;
}
