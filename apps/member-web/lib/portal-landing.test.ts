import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@flowstate/db";
import { getPortalLanding, portalLanding } from "./portal-landing";

describe("role-appropriate portal landing", () => {
  it("keeps a gym-only account on Classes", () => {
    expect(
      portalLanding({
        enrollments: [],
        hasPayerRequests: false,
        hasClasses: true,
      }).href,
    ).toBe("/app/schedule");
  });
  it.each(["ACTIVE", "PAUSED"])(
    "opens a single %s coaching client on My day",
    (status) => {
      expect(
        portalLanding({
          enrollments: [{ id: "own-program", status }],
          hasPayerRequests: false,
          hasClasses: false,
        }).href,
      ).toBe("/app/coaching/own-program?view=notes");
    },
  );
  it.each(["ONBOARDING", "SCHEDULED", "AWAITING_REPLACEMENT", "CLOSED"])(
    "opens %s coaching on program status and records",
    (status) => {
      expect(
        portalLanding({
          enrollments: [{ id: "own-program", status }],
          hasPayerRequests: false,
          hasClasses: false,
        }).href,
      ).toBe("/app/coaching/own-program?view=program");
    },
  );
  it("offers an explicit service choice for a hybrid family account", () => {
    expect(
      portalLanding({
        enrollments: [{ id: "own-program", status: "ACTIVE" }],
        hasPayerRequests: false,
        hasClasses: true,
      }),
    ).toEqual({
      href: null,
      coachingHref: "/app/coaching/own-program?view=notes",
    });
  });
  it("opens the picker for multiple programs and payer-only requests", () => {
    expect(
      portalLanding({
        enrollments: [
          { id: "a", status: "ACTIVE" },
          { id: "b", status: "ACTIVE" },
        ],
        hasPayerRequests: false,
        hasClasses: false,
      }).href,
    ).toBe("/app/coaching");
    expect(
      portalLanding({
        enrollments: [],
        hasPayerRequests: true,
        hasClasses: false,
      }).href,
    ).toBe("/app/coaching");
  });
  it("binds coaching and payer reads to the signed-in account while class service checks cover only its authorized family", async () => {
    const now = new Date("2026-11-02T12:00:00Z");
    const enrollments = vi
      .fn()
      .mockResolvedValue([
        {
          id: "own-program",
          status: "ONBOARDING",
          closedAt: null,
          acceptedAt: now,
          contactVerifiedAt: now,
          currentCoachWorkspaceUserId: "accepted-coach",
          currentCoach: { isActive: true },
          paymentState: "PAID",
          timezone: "UTC",
          startsOn: new Date("2026-11-01"),
          endsOn: new Date("2026-12-01"),
          pauseStartsOn: null,
          pauseEndsOn: null,
        },
      ]);
    const payer = vi.fn().mockResolvedValue(0);
    const membership = vi.fn().mockResolvedValue(1);
    const db = {
      coachingEnrollment: { findMany: enrollments },
      coachingPayerGrant: { count: payer },
      memberMembership: { count: membership },
      memberPunchCard: { count: vi.fn().mockResolvedValue(0) },
      classBooking: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;
    expect(
      await getPortalLanding(
        {
          workspaceId: "gym",
          userId: "adult-user",
          accountMemberId: "adult-member",
          authorizedMemberIds: ["adult-member", "verified-child"],
        },
        db,
        now,
      ),
    ).toEqual({
      href: null,
      coachingHref: "/app/coaching/own-program?view=notes",
    });
    expect(enrollments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "gym",
          memberId: "adult-member",
          member: { userId: "adult-user" },
          OR: [{ closedAt: null }, { retrievalUntil: { gt: now } }],
        },
      }),
    );
    expect(payer).toHaveBeenCalledWith({
      where: {
        workspaceId: "gym",
        payerUserId: "adult-user",
        payerMemberId: "adult-member",
        activeSlot: "ACTIVE",
        revokedAt: null,
      },
    });
    expect(membership).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "gym",
          memberId: { in: ["adult-member", "verified-child"] },
        }),
      }),
    );
  });
});
