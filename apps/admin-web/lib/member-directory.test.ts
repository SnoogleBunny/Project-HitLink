import { describe, expect, it } from "vitest";
import {
  buildMemberDirectoryWhere,
  decodeMemberDirectoryCursor,
  describeMembershipService,
  encodeMemberDirectoryCursor,
  parseMemberDirectoryFilters,
  planMembershipAllowance,
  snapshotMembershipTerms,
  summarizeMembershipAllowanceWindow,
} from "@flowstate/db";
const now = new Date("2030-02-01T01:00:00Z");
const membership = () => ({
  id: "membership",
  memberId: "person",
  status: "FROZEN",
  startedAt: new Date("2029-01-01Z"),
  endedAt: null,
  nextBillingDate: new Date("2030-03-01Z"),
  cancelAtPeriodEnd: false,
  frozenFrom: new Date("2030-01-15Z"),
  frozenUntil: new Date("2030-02-15Z"),
  allowanceTimezone: "America/Los_Angeles",
  allowanceAnchorDate: new Date("2030-01-01Z"),
  sourceBillingManaged: false,
  sourceAccessHeld: false,
  sourceBillingEvidence: [],
  acceptedTerms: snapshotMembershipTerms(
    { weeklyClassLimit: 2, monthlyClassLimit: 8 },
    now,
  ),
  membershipPlan: {
    name: "Accepted membership",
    weeklyClassLimit: 1,
    monthlyClassLimit: 1,
    programRestrictions: [],
  },
  billingState: {
    status: "PAYMENT_FAILED",
    gracePeriodEndsAt: new Date("2030-02-02Z"),
  },
});
describe("MF05/MF08 independent service facts", () => {
  it("rejects unbounded and unsupported search inputs instead of widening the directory", () => {
    expect(() => parseMemberDirectoryFilters({ q: "x".repeat(121) })).toThrow();
    expect(() =>
      parseMemberDirectoryFilters({ condition: "constructor" }),
    ).toThrow();
    expect(() => parseMemberDirectoryFilters({ status: "ELIGIBLE" })).toThrow();
    expect(() => parseMemberDirectoryFilters({ q: ["one", "two"] })).toThrow();
    expect(() => parseMemberDirectoryFilters({ operationalTag: "x".repeat(41) })).toThrow();
    expect(() => parseMemberDirectoryFilters({ operationalTag: ["one", "two"] })).toThrow();
    const filters = parseMemberDirectoryFilters({
      q: " A_B% ",
      cohortLabel: " Competition ",
      classProgram: "Padwork",
      condition: "PACK_BALANCE",
    });
    expect(filters.query).toBe("A_B%");
    const predicate = buildMemberDirectoryWhere("exact_workspace", filters);
    expect(predicate.AND).toContainEqual({
      workspaceId: "exact_workspace",
      archivedAt: null,
    });
    expect(predicate.AND).toContainEqual({ tags: { has: "Competition" } });
  });
  it("binds a cursor to the complete normalized filters, preserving same-name identities", () => {
    const filters = parseMemberDirectoryFilters({ q: "Alex" });
    // Real directory cursors are created by the DB reader; an arbitrary hash can never pass the decoder.
    const forged = encodeMemberDirectoryCursor({
      fullName: "Alex",
      id: "member_2",
      filterHash: "forged",
    });
    expect(() => decodeMemberDirectoryCursor(forged, filters)).toThrow(
      "filters changed",
    );
    expect(() =>
      decodeMemberDirectoryCursor("x".repeat(1501), filters),
    ).toThrow();
  });
  it("keeps a freeze and financial hold independent when the payment becomes current", () => {
    const row = membership();
    const first = describeMembershipService(row as never, now, "UTC", true, {
      state: "REVIEW",
      membershipId: row.id,
      message: "Frozen on this date",
    });
    row.billingState = {
      status: "ACTIVE",
      gracePeriodEndsAt: new Date("2030-02-02Z"),
    };
    const paid = describeMembershipService(row as never, now, "UTC", true, {
      state: "REVIEW",
      membershipId: row.id,
      message: "Frozen on this date",
    });
    expect(first).toMatchObject({
      contractState: "FROZEN",
      paymentState: "PAYMENT_FAILED",
      held: true,
    });
    expect(paid).toMatchObject({
      contractState: "FROZEN",
      paymentState: "ACTIVE",
      held: true,
      graceUntil: null,
    });
    expect(row.status).toBe("FROZEN");
  });
  it("does not reactivate an ended contract after a payment or erase its scheduled cancellation", () => {
    const row = {
      ...membership(),
      status: "ACTIVE",
      frozenFrom: null,
      frozenUntil: null,
      cancelAtPeriodEnd: true,
      nextBillingDate: new Date("2030-01-20Z"),
      billingState: { status: "ACTIVE", gracePeriodEndsAt: null },
    };
    expect(
      describeMembershipService(row as never, now, "UTC", false, {
        state: "NONE",
      }),
    ).toMatchObject({
      contractState: "ENDED",
      paymentState: "ACTIVE",
      cancellationScheduled: true,
      endsOn: "2030-01-19",
    });
  });
  it("plans in the accepted timezone from the actual instant, keeping old caps when the catalog changes", () => {
    const row = {
      ...membership(),
      status: "ACTIVE",
      frozenFrom: null,
      frozenUntil: null,
    };
    const planned = planMembershipAllowance({
      membership: row as never,
      timezone: "UTC",
      occurrenceStartsAt: now,
      scheduledForDate: "2030-02-01",
    });
    expect(planned).not.toHaveProperty("error");
    if ("error" in planned) throw new Error(planned.error);
    expect(planned.windows).toContainEqual({
      kind: "BILLING_MONTH",
      startsOn: "2030-01-01",
      endsOn: "2030-02-01",
      limit: 8,
    });
    expect(planned.terms.monthlyClassLimit).toBe(8);
    const legacy = planMembershipAllowance({
      membership: { ...row, acceptedTerms: null } as never,
      timezone: "UTC",
      occurrenceStartsAt: now,
      scheduledForDate: "2030-02-01",
    });
    expect(legacy).toMatchObject({ windows: [] });
    const corrupt = planMembershipAllowance({
      membership: {
        ...row,
        acceptedTerms: { monthlyClassLimit: 100 },
      } as never,
      timezone: "UTC",
      occurrenceStartsAt: now,
      scheduledForDate: "2030-02-01",
    });
    expect(corrupt).toEqual({
      error: "The accepted membership terms need owner review before booking.",
    });
  });
  it("counts opening, reserved and used units once and never moves an old adjustment into another period", () => {
    const window = {
      kind: "BILLING_MONTH" as const,
      startsOn: "2030-01-01",
      endsOn: "2030-02-01",
      limit: 8,
    };
    expect(
      summarizeMembershipAllowanceWindow({
        window,
        reserved: 2,
        used: 1,
        openingUsed: 2,
        adjustment: -1,
      }),
    ).toEqual({ ...window, limit: 7, reserved: 2, used: 3, remaining: 2 });
    expect(window.limit).toBe(8);
    expect(
      summarizeMembershipAllowanceWindow({
        window,
        reserved: 6,
        used: 2,
        openingUsed: 2,
        adjustment: -1,
      }).remaining,
    ).toBe(0);
  });
});
