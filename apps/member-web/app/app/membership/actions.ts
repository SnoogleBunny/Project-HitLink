"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { startPunchCardCheckout } from "../../../lib/member-commerce";

export interface MembershipActionState {
  error: string | null;
}

export const emptyMembershipActionState: MembershipActionState = {
  error: null,
};

async function getCheckoutUrl(pathname: string): Promise<string> {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol =
    forwardedProto ?? (process.env.NODE_ENV === "production" ? "https" : "http");

  if (!host) {
    return `http://localhost:3001${pathname}`;
  }

  return `${protocol}://${host}${pathname}`;
}

export async function startPunchCardCheckoutAction(
  _previousState: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const context = await requireMemberPortalContext();
  const result = await startPunchCardCheckout({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    punchCardProductId: String(formData.get("punchCardProductId") ?? ""),
    successUrl: await getCheckoutUrl("/app/checkout/complete"),
    cancelUrl: await getCheckoutUrl("/app/membership"),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(result.url);

  return emptyMembershipActionState;
}
