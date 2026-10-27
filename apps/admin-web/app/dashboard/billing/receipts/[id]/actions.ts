"use server";
import {
  queuePaymentConfirmationCopy,
  PaymentConfirmationError,
} from "@flowstate/db";
import { redirect } from "next/navigation";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
export async function emailPaymentConfirmationCopy(form: FormData) {
  const context = await requireOwnerWorkspaceContext();
  const id = String(form.get("confirmationId") ?? "");
  let error: string | undefined;
  try {
    await queuePaymentConfirmationCopy({
      actor: {
        kind: "OWNER",
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
    `/dashboard/billing/receipts/${encodeURIComponent(id)}?${new URLSearchParams(error ? { error } : { queued: "1" })}`,
  );
}
