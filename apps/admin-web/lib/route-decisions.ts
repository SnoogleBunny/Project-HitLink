import type { AppSession } from "@hitlink/auth";

export interface BasicFormState {
  error: string | null;
}

export const emptyFormState: BasicFormState = {
  error: null,
};

export interface OwnerSession extends AppSession {
  role: "OWNER";
  workspaceId: string;
}

export interface OperationsSession extends AppSession {
  role: "OWNER" | "COACH";
  workspaceId: string;
}

type RouteDecision =
  | {
      status: "allow";
    }
  | {
      status: "redirect";
      location: "/dashboard" | "/login" | "/onboarding" | "/unauthorized";
    };

export function getDashboardRouteDecision(
  session: AppSession | null,
): RouteDecision {
  if (!session) {
    return {
      status: "redirect",
      location: "/login",
    };
  }

  if (session.role === "OWNER" && session.workspaceId) {
    return {
      status: "allow",
    };
  }

  if (!session.role && !session.workspaceId) {
    return {
      status: "redirect",
      location: "/onboarding",
    };
  }

  return {
    status: "redirect",
    location: "/unauthorized",
  };
}

export function getOnboardingRouteDecision(
  session: AppSession | null,
): RouteDecision {
  if (!session) {
    return {
      status: "redirect",
      location: "/login",
    };
  }

  if (!session.role && !session.workspaceId) {
    return {
      status: "allow",
    };
  }

  if (session.role === "OWNER" && session.workspaceId) {
    return {
      status: "redirect",
      location: "/dashboard",
    };
  }

  return {
    status: "redirect",
    location: "/unauthorized",
  };
}

export function getHomeRouteDestination(session: AppSession | null): string {
  if (session?.role === "COACH" && session.workspaceId) {
    return "/dashboard/coach/today";
  }

  if (session?.role === "OWNER" && session.workspaceId) {
    return "/dashboard";
  }

  const dashboardDecision = getDashboardRouteDecision(session);

  if (dashboardDecision.status === "redirect") {
    return dashboardDecision.location;
  }

  return "/dashboard";
}
