import { describe, expect, it } from "vitest";
import { formatMemberBillingDate } from "./member-billing-dates";
describe("accepted billing dates and date-only boundaries", () => {
  it("keeps a UTC contract renewal on November 1 even on a Vancouver server", () => {
    const renewal = new Date("2026-11-01T00:00:00Z");
    expect(formatMemberBillingDate(renewal, "UTC")).toBe("Nov 1, 2026");
    expect(formatMemberBillingDate(renewal, "America/Vancouver")).toBe(
      "Oct 31, 2026",
    );
    expect(
      formatMemberBillingDate(
        new Date("2026-11-01T07:00:00Z"),
        "America/Vancouver",
      ),
    ).toBe("Nov 1, 2026");
  });
  it("preserves stored date-only freeze and allowance boundaries without a local-day shift", () => {
    expect(formatMemberBillingDate(new Date("2026-11-01T00:00:00Z"))).toBe(
      "Nov 1, 2026",
    );
    expect(formatMemberBillingDate(null)).toBe("Not set");
  });
});
