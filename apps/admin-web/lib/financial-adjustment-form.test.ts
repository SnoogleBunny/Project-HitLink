import { describe, it, expect } from "vitest";
import { parseAdjustmentAmount } from "./financial-adjustment-form";
describe("financial amount input", () => {
  it("accepts exact decimal amounts without floating-point rounding", () => { expect(parseAdjustmentAmount("19.99")).toBe(1999); expect(parseAdjustmentAmount("0.01")).toBe(1); expect(parseAdjustmentAmount("10.1")).toBe(1010); });
  it("rejects ambiguous, rounded, negative and out-of-range inputs", () => { for (const value of ["", "0", "-1", "1.001", "1e3", "1,000", "Infinity", "21474836.48"]) expect(() => parseAdjustmentAmount(value)).toThrow(); });
});
