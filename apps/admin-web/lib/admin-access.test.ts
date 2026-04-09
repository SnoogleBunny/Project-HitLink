import { describe, expect, it } from "vitest";
import {
  getDashboardRouteDecision,
  getHomeRouteDestination,
} from "./route-decisions";

describe("dashboard route protection", () => {
  it("redirects unauthenticated users to login", () => {
    expect(getDashboardRouteDecision(null)).toEqual({
      status: "redirect",
      location: "/login",
    });
  });

  it("redirects authenticated owners without a workspace to onboarding", () => {
    expect(
      getDashboardRouteDecision({
        userId: "user_1",
        email: "owner@example.com",
        displayName: "Dana Owner",
        workspaceId: null,
        role: null,
      }),
    ).toEqual({
      status: "redirect",
      location: "/onboarding",
    });
  });

  it("allows an owner with a workspace", () => {
    expect(
      getDashboardRouteDecision({
        userId: "user_1",
        email: "owner@example.com",
        displayName: "Dana Owner",
        workspaceId: "workspace_1",
        role: "OWNER",
      }),
    ).toEqual({
      status: "allow",
    });
  });

  it("keeps the owner dashboard owner-only but routes coaches to their daily roster", () => {
    expect(
      getDashboardRouteDecision({
        userId: "coach_1",
        email: "coach@example.com",
        displayName: "Casey Coach",
        workspaceId: "workspace_1",
        role: "COACH",
      }),
    ).toEqual({
      status: "redirect",
      location: "/unauthorized",
    });

    expect(
      getHomeRouteDestination({
        userId: "coach_1",
        email: "coach@example.com",
        displayName: "Casey Coach",
        workspaceId: "workspace_1",
        role: "COACH",
      }),
    ).toBe("/dashboard/coach/today");
  });

  it("routes customers to unauthorized", () => {
    expect(
      getHomeRouteDestination({
        userId: "customer_1",
        email: "customer@example.com",
        displayName: "Chris Customer",
        workspaceId: "workspace_1",
        role: "CUSTOMER",
      }),
    ).toBe("/unauthorized");
  });
});
