import { describe, expect, it } from "vitest";
import { parseRoomDefaultCapacity, RoomCapacityError } from "@flowstate/db";
describe("room default capacity input contract", () => {
  it("keeps blank unlimited and accepts positive whole values within PostgreSQL Int", () => {
    expect(parseRoomDefaultCapacity(" ")).toBeNull();
    expect(parseRoomDefaultCapacity(" 24 ")).toBe(24);
    expect(parseRoomDefaultCapacity("2.0")).toBe(2);
    expect(parseRoomDefaultCapacity("2147483647")).toBe(2147483647);
  });
  it("rejects zero, negatives, fractions, non-finite and out-of-range values", () => {
    for (const value of [
      "0",
      "-1",
      "1.5",
      "NaN",
      "Infinity",
      "2147483648",
      "not-a-capacity",
    ])
      expect(() => parseRoomDefaultCapacity(value)).toThrow(RoomCapacityError);
  });
});
