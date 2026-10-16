"use server";
import { redirect } from "next/navigation";
import { FinancialError, resumeCheckoutOperation } from "@flowstate/db";
import { createStripeCheckoutGateway } from "@flowstate/payments";
import { requireMemberPortalContext } from "../../../../lib/member-auth";

export async function checkCheckoutAction(_previous: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const context = await requireMemberPortalContext({ scope: "account" });
  let url: string;
  try {
    const result = await resumeCheckoutOperation({ operationId: String(form.get("operationId") ?? ""), workspaceId: context.workspace.id, actorUserId: context.session.userId, gateway: createStripeCheckoutGateway() });
    if (result.status === "error") return { error: result.message };
    url = result.url;
  } catch (error) {
    if (error instanceof FinancialError) return { error: error.message };
    return { error: "We could not check this payment. Your request is saved; please try again shortly." };
  }
  redirect(url);
}
