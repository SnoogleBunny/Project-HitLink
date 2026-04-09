import type { AppSession } from "@hitlink/auth";
import { getSession } from "@hitlink/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getDashboardRouteDecision,
  getHomeRouteDestination,
  getOnboardingRouteDecision,
  type OwnerSession,
} from "./route-decisions";

export {
  emptyFormState,
  getDashboardRouteDecision,
  getHomeRouteDestination,
  getOnboardingRouteDecision,
  type BasicFormState,
  type OperationsSession,
  type OwnerSession,
} from "./route-decisions";

export async function getSessionOrNull(): Promise<AppSession | null> {
  const cookieStore = await cookies();

  return getSession({
    cookieStore,
  });
}

export async function redirectAuthenticatedUser(): Promise<void> {
  const session = await getSessionOrNull();

  if (session) {
    redirect(getHomeRouteDestination(session));
  }
}

export async function requireDashboardSession(): Promise<OwnerSession> {
  const session = await getSessionOrNull();
  const decision = getDashboardRouteDecision(session);

  if (decision.status === "redirect") {
    redirect(decision.location);
  }

  return session as OwnerSession;
}

export async function requireOnboardingSession(): Promise<AppSession> {
  const session = await getSessionOrNull();
  const decision = getOnboardingRouteDecision(session);

  if (decision.status === "redirect") {
    redirect(decision.location);
  }

  return session as AppSession;
}
