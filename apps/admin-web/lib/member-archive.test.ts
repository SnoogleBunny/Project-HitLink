import { describe, expect, it } from "vitest";
import { validateArchiveChange } from "./member-archive";

describe("member archive authorization input", () => {
  it("retains a bounded reason for the attributed record", () => {
    expect(
      validateArchiveChange({
        expectedVersion: 0,
        reason: "  Retired from training  ",
      }),
    ).toBe("Retired from training");
  });
  it.each([-1, 1.5, NaN])("rejects a forged version %s", (expectedVersion) => {
    expect(() =>
      validateArchiveChange({ expectedVersion, reason: "Reviewed departure" }),
    ).toThrow("Reload");
  });
  it.each(["", "x", "x".repeat(501)])("requires a usable reason", (reason) => {
    expect(() => validateArchiveChange({ expectedVersion: 0, reason })).toThrow(
      "reason",
    );
  });
});
