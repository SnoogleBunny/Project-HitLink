import { describe, expect, it } from "vitest";
import {
  evaluateClassSchedulingPolicy,
  parseClassSchedulingPolicy,
  readClassSchedulingPolicy,
  schedulingPolicyHash,
} from "./scheduling-policy.js";
import {
  fixtureClassSchedulingPolicy,
  fixtureSchedulingRevision,
} from "../tests/scheduling-policy-fixture.js";
const args = {
  revision: fixtureSchedulingRevision(),
  date: "2026-10-27",
  timezone: "America/Vancouver",
  startTimeMinutes: 1080,
  endTimeMinutes: 1140,
  bookingCutoffMinutes: 60,
  now: new Date("2026-10-25T12:00:00Z"),
};
describe("owner-confirmed class scheduling policy", () => {
  it("rejects absent, unknown, duplicated, overlapping or unbounded policy data", () => {
    for (const policy of [
      null,
      {},
      { ...fixtureClassSchedulingPolicy, bypass: true },
      {
        schemaVersion: 1,
        classes: {
          ...fixtureClassSchedulingPolicy.classes,
          maxAdvanceMinutes: 0,
        },
      },
      {
        schemaVersion: 1,
        classes: {
          ...fixtureClassSchedulingPolicy.classes,
          weeklyHours: Array(7).fill(
            fixtureClassSchedulingPolicy.classes.weeklyHours[0],
          ),
        },
      },
      {
        schemaVersion: 1,
        classes: {
          ...fixtureClassSchedulingPolicy.classes,
          weeklyHours: fixtureClassSchedulingPolicy.classes.weeklyHours.map(
            (day) => ({
              ...day,
              intervals: [
                { startMinute: 540, endMinute: 700 },
                { startMinute: 650, endMinute: 900 },
              ],
            }),
          ),
        },
      },
    ])
      expect(() => parseClassSchedulingPolicy(policy)).toThrow();
  });
  it("canonicalizes weekdays and interval order for stable hashes", () => {
    const reversed = {
      ...fixtureClassSchedulingPolicy,
      classes: {
        ...fixtureClassSchedulingPolicy.classes,
        weeklyHours: [
          ...fixtureClassSchedulingPolicy.classes.weeklyHours,
        ].reverse(),
      },
    };
    expect(schedulingPolicyHash(reversed)).toBe(
      schedulingPolicyHash(fixtureClassSchedulingPolicy),
    );
  });
  it("fails closed without a delegate, tenant match or authentic policy hash", async () => {
    expect(await readClassSchedulingPolicy({}, "workspace_1")).toBeNull();
    expect(
      await readClassSchedulingPolicy(
        {
          workspaceSchedulingPolicyRevision: {
            findFirst: async () => fixtureSchedulingRevision("other"),
          },
        },
        "workspace_1",
      ),
    ).toBeNull();
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        revision: { ...args.revision, policyHash: "tampered" },
      }).allowed,
    ).toBe(false);
  });
  it("permits the opening boundary and denies immediately before it", () => {
    const startsAt = Date.parse("2026-10-28T01:00:00Z"),
      opensAt = startsAt - 60 * 1440 * 60000;
    expect(
      evaluateClassSchedulingPolicy({ ...args, now: new Date(opensAt) })
        .allowed,
    ).toBe(true);
    expect(
      evaluateClassSchedulingPolicy({ ...args, now: new Date(opensAt - 1) }),
    ).toMatchObject({ allowed: false, code: "NOT_OPEN" });
  });
  it("uses the stricter class/workspace cutoff, excluding its exact boundary", () => {
    const policy = {
      ...fixtureClassSchedulingPolicy,
      classes: {
        ...fixtureClassSchedulingPolicy.classes,
        minimumLeadMinutes: 120,
      },
    };
    const revision = {
      ...args.revision,
      policy,
      policyHash: schedulingPolicyHash(policy),
    };
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        revision,
        now: new Date("2026-10-27T22:59:59.999Z"),
      }).allowed,
    ).toBe(true);
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        revision,
        now: new Date("2026-10-27T23:00:00Z"),
      }),
    ).toMatchObject({ allowed: false, code: "CLOSED" });
  });
  it("requires the whole class inside one opening interval, including midnight end", () => {
    const policy = {
      ...fixtureClassSchedulingPolicy,
      classes: {
        ...fixtureClassSchedulingPolicy.classes,
        weeklyHours: fixtureClassSchedulingPolicy.classes.weeklyHours.map(
          (day) => ({
            ...day,
            intervals: [{ startMinute: 1080, endMinute: 1140 }],
          }),
        ),
      },
    };
    const revision = {
      ...args.revision,
      policy,
      policyHash: schedulingPolicyHash(policy),
    };
    expect(evaluateClassSchedulingPolicy({ ...args, revision }).allowed).toBe(
      true,
    );
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        revision,
        endTimeMinutes: 1141,
      }),
    ).toMatchObject({ allowed: false, code: "OUTSIDE_HOURS" });
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        startTimeMinutes: 1380,
        endTimeMinutes: 1440,
      }).allowed,
    ).toBe(true);
  });
  it("rejects missing and ambiguous DST local times rather than shifting a claim", () => {
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        timezone: "America/New_York",
        date: "2026-11-01",
        startTimeMinutes: 90,
        endTimeMinutes: 150,
      }),
    ).toMatchObject({ allowed: false, code: "INVALID_TIME" });
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        timezone: "America/New_York",
        date: "2027-03-14",
        startTimeMinutes: 150,
        endTimeMinutes: 210,
      }),
    ).toMatchObject({ allowed: false, code: "INVALID_TIME" });
  });
});

describe("narrow lead exception evaluation", () => {
  it("only permits a closed cutoff while actual service start is still future", () => {
    const at = new Date("2026-10-28T00:30:00Z");
    expect(evaluateClassSchedulingPolicy({ ...args, now: at }).allowed).toBe(
      false,
    );
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        now: at,
        allowLeadExceptionBeforeStart: true,
      }).allowed,
    ).toBe(true);
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        now: new Date("2026-10-28T01:00:00Z"),
        allowLeadExceptionBeforeStart: true,
      }),
    ).toMatchObject({ allowed: false, code: "CLOSED" });
  });
  it("keeps horizon and opening-hour failures authoritative", () => {
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        now: new Date("2026-01-01"),
        allowLeadExceptionBeforeStart: true,
      }),
    ).toMatchObject({ allowed: false, code: "NOT_OPEN" });
    const policy = {
      ...fixtureClassSchedulingPolicy,
      classes: {
        ...fixtureClassSchedulingPolicy.classes,
        weeklyHours: fixtureClassSchedulingPolicy.classes.weeklyHours.map(
          (day) => ({ ...day, intervals: [] }),
        ),
      },
    };
    expect(
      evaluateClassSchedulingPolicy({
        ...args,
        revision: {
          ...args.revision,
          policy,
          policyHash: schedulingPolicyHash(policy),
        },
        allowLeadExceptionBeforeStart: true,
      }),
    ).toMatchObject({ allowed: false, code: "OUTSIDE_HOURS" });
  });
});
