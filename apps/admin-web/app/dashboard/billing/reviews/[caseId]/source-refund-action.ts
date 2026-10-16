"use server";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { recordSourceRefundReceipt } from "../../../../../lib/source-refund-receipts";
export async function recordSourceRefundAction(
  _previous: { message: string; ok: boolean },
  form: FormData,
) {
  const context = await requireOwnerWorkspaceContext();
  try {
    const file = form.get("receipt");
    if (!(file instanceof File))
      throw new Error("Attach the source refund PDF receipt.");
    if (file.size > 5_000_000)
      throw new Error("The source receipt must be 5 MB or smaller.");
    const amount = String(form.get("amount") ?? "");
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount))
      throw new Error("Enter the exact refund amount.");
    const [whole, fraction = ""] = amount.split(".");
    const amountCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    await recordSourceRefundReceipt(
      {
        workspaceId: context.workspace.id,
        workspaceUserId: context.workspaceUserId,
        userId: context.session.userId,
      },
      {
        caseId: String(form.get("caseId") ?? ""),
        reviewToken: String(form.get("reviewToken") ?? ""),
        sourceReference: String(form.get("sourceReference") ?? ""),
        amountCents,
        refundedAt: String(form.get("refundedAt") ?? ""),
        receiptData: new Uint8Array(await file.arrayBuffer()),
        reason: String(form.get("reason") ?? ""),
      },
    );
    revalidatePath("/dashboard/billing");
    revalidatePath(`/dashboard/billing/reviews/${form.get("caseId")}`);
    return { ok: true, message: "Source refund receipt recorded." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not record the source receipt.",
    };
  }
}
