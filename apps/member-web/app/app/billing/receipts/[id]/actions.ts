"use server";
import {
  queuePaymentConfirmationCopy,
  PaymentConfirmationError,
} from "@flowstate/db";
import { redirect } from "next/navigation";
import { requireMemberPortalContext } from "../../../../../lib/member-auth";
export async function emailPaymentConfirmationCopy(form: FormData) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const id = String(form.get("confirmationId") ?? "");
  let error: string | undefined;
  try {
    await queuePaymentConfirmationCopy({
      actor: {
        kind: "PAYER",
        workspaceId: context.workspace.id,
        userId: context.session.userId,
      },
      confirmationId: id,
      operationId: String(form.get("operationId") ?? ""),
    });
  } catch (caught) {
    error =
      caught instanceof PaymentConfirmationError
        ? caught.message
        : "The copy could not be queued. Reload before trying again.";
  }
  redirect(
    `/app/billing/receipts/${encodeURIComponent(id)}?${new URLSearchParams(error ? { error } : { queued: "1" })}`,
  );
}
