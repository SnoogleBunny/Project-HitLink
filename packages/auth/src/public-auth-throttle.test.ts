import { describe, expect, it } from "vitest";
import {
  buildPublicAuthThrottlePlan,
  getPublicAuthNetworkIdentity,
  PUBLIC_AUTH_UNAVAILABLE_MESSAGE,
} from "./public-auth-throttle.js";
const secret = "fictional-unit-test-hmac-key-at-least-32-bytes",
  now = new Date("2026-10-26T12:00:10Z");
const input = {
  email: "Coach@Example.test",
  action: "login" as const,
  portal: "admin" as const,
  networkIdentity: "ipv4:192.0.2.5",
};
describe("public authentication throttle keys and proxy trust", () => {
  it("shares account limits across portals and networks, and network limits across accounts", () => {
    const first = buildPublicAuthThrottlePlan(input, { secret, now });
    const second = buildPublicAuthThrottlePlan(
      {
        ...input,
        email: " coach@example.test ",
        portal: "member",
        networkIdentity: "another-network",
      },
      { secret, now },
    );
    expect(first.account.keyHash).toBe(second.account.keyHash);
    const third = buildPublicAuthThrottlePlan(
      { ...input, email: "different@example.test" },
      { secret, now },
    );
    expect(first.network.keyHash).toBe(third.network.keyHash);
    expect(first.account.keyHash).not.toBe(third.account.keyHash);
  });
  it("uses secret-keyed identifiers rather than storing raw or unsalted account/network lookup values", () => {
    const plan = buildPublicAuthThrottlePlan(input, { secret, now });
    expect(plan.account.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(plan)).not.toContain(input.email);
    expect(JSON.stringify(plan)).not.toContain("192.0.2.5");
    expect(
      buildPublicAuthThrottlePlan(input, { secret: `${secret}-rotation`, now })
        .account.keyHash,
    ).not.toBe(plan.account.keyHash);
  });
  it("ignores all client forwarding claims unless proxy trust is explicitly enabled", () => {
    const headers = new Headers({
      "x-real-ip": "192.0.2.1",
      "x-forwarded-for": "203.0.113.9",
      forwarded: "for=203.0.113.9",
    });
    expect(getPublicAuthNetworkIdentity(headers, false)).toBe(
      "unverified-network",
    );
    expect(getPublicAuthNetworkIdentity(headers, true)).toBe("ipv4:192.0.2.1");
    expect(
      getPublicAuthNetworkIdentity(
        new Headers({ "x-forwarded-for": "203.0.113.9" }),
        true,
      ),
    ).toBe("unverified-network");
    expect(
      getPublicAuthNetworkIdentity(
        new Headers({ "x-real-ip": "192.0.2.1, 203.0.113.9" }),
        true,
      ),
    ).toBe("unverified-network");
  });
  it("normalizes equivalent IPv6 forms before deriving network admission keys", () => {
    expect(
      getPublicAuthNetworkIdentity(
        new Headers({ "x-real-ip": "2001:0DB8:0:0:0:0:0:1" }),
        true,
      ),
    ).toBe(
      getPublicAuthNetworkIdentity(
        new Headers({ "x-real-ip": "2001:db8::1" }),
        true,
      ),
    );
  });
  it("bounds observation windows and expires old fingerprints without interpreting local date keys", () => {
    const plan = buildPublicAuthThrottlePlan(input, { secret, now });
    expect(plan.network.windowEndsAt.toISOString()).toBe(
      "2026-10-26T12:01:00.000Z",
    );
    expect(plan.account.windowEndsAt.toISOString()).toBe(
      "2026-10-26T12:15:00.000Z",
    );
    expect(+plan.account.expiresAt - +plan.account.windowEndsAt).toBe(
      24 * 3600000,
    );
    expect(
      buildPublicAuthThrottlePlan(input, {
        secret,
        now: new Date("2026-10-26T12:15:00Z"),
      }).account.keyHash,
    ).not.toBe(plan.account.keyHash);
  });
  it("fails closed for missing/short server secrets and invalid identity input", () => {
    expect(() =>
      buildPublicAuthThrottlePlan(input, { secret: "short", now }),
    ).toThrow(PUBLIC_AUTH_UNAVAILABLE_MESSAGE);
    expect(() =>
      buildPublicAuthThrottlePlan({ ...input, email: "" }, { secret, now }),
    ).toThrow(PUBLIC_AUTH_UNAVAILABLE_MESSAGE);
  });
});
