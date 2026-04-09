"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import {
  createMemberPaymentMethodUpdateSession,
  retryOwnFailedPayment,
} from "../../../lib/member-billing";

export interface BillingActionState {
  error: string | null;
}

export const emptyBillingActionState: BillingActionState = {
  error: null,
};

async function getBillingReturnUrl(): Promise<string> {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = forwardedProto ?? (process.env.NODE_ENV === "production" ? "https" : "http");

  if (!host) {
    return "http://localhost:3001/app/billing";
  }

  return `${protocol}://${host}/app/billing`;
}

export async function startPaymentMethodUpdateAction(
  _previousState: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const context = await requireMemberPortalContext();
  const result = await createMemberPaymentMethodUpdateSession({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    returnUrl: await getBillingReturnUrl(),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(result.url);

  return emptyBillingActionState;
}

export async function retryOwnFailedPaymentAction(
  _previousState: BillingActionState,
  _formData: FormData,
): Promise<BillingActionState> {
  const context = await requireMemberPortalContext();
  const result = await retryOwnFailedPayment({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  revalidatePath("/app");
  revalidatePath("/app/billing");
  redirect("/app/billing");

  return emptyBillingActionState;
}
