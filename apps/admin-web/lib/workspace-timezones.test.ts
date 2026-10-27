import { describe, expect, it } from "vitest";
import { canonicalWorkspaceTimezone, timezoneAtInstant, timezoneForOccurrenceDate } from "@flowstate/db";

const revisions = [{ version: 1, previousTimezone: "UTC", timezone: "Asia/Tokyo", effectiveFromDate: new Date("2030-01-08"), effectiveAt: new Date("2030-01-07T15:00:00Z") }];
describe("effective-dated business timezone resolution", () => {
  it("keeps historical date identities on their old zone independently of today's clock", () => {
    expect(timezoneForOccurrenceDate("UTC", revisions, "2030-01-07")).toBe("UTC");
    expect(timezoneForOccurrenceDate("UTC", revisions, "2030-01-08")).toBe("Asia/Tokyo");
    expect(timezoneForOccurrenceDate("UTC", revisions, "2020-01-08")).toBe("UTC");
  });
  it("changes the current clock only at the accepted effective instant", () => {
    expect(timezoneAtInstant("UTC", revisions, new Date("2030-01-07T14:59:59Z"))).toBe("UTC");
    expect(timezoneAtInstant("UTC", revisions, new Date("2030-01-07T15:00:00Z"))).toBe("Asia/Tokyo");
    expect(timezoneAtInstant("UTC", [], new Date("2030-01-08"))).toBe("UTC");
  });
  it("accepts a named timezone and rejects invalid or fixed-offset inputs", () => {
    expect(canonicalWorkspaceTimezone(" America/Vancouver ")).toBe("America/Vancouver");
    expect(canonicalWorkspaceTimezone("UTC")).toBe("UTC");
    expect(canonicalWorkspaceTimezone("+09:00")).toBeNull();
    expect(canonicalWorkspaceTimezone("not-a-zone")).toBeNull();
  });
});
