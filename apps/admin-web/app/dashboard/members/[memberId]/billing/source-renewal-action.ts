"use server";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { recordSourceBillingRenewal } from "../../../../../lib/source-billing-renewals";
export async function sourceRenewalAction(
  _state: { ok: boolean; message: string },
  form: FormData,
) {
  const c = await requireOwnerWorkspaceContext();
  try {
    const file = form.get("receipt");
    if (!(file instanceof File))
      throw new Error("Attach the original paid source PDF receipt.");
    if (file.size > 5_000_000)
      throw new Error("The source receipt must be 5 MB or smaller.");
    await recordSourceBillingRenewal(
      {
        workspaceId: c.workspace.id,
        workspaceUserId: c.workspaceUserId,
        userId: c.session.userId,
      },
      {
        membershipId: String(form.get("membershipId") ?? ""),
        reviewToken: String(form.get("reviewToken") ?? ""),
        operationKey: String(form.get("operationKey") ?? ""),
        paidFrom: String(form.get("paidFrom") ?? ""),
        paidThrough: String(form.get("paidThrough") ?? ""),
        nextRenewalOn: String(form.get("nextRenewalOn") ?? ""),
        sourceReference: String(form.get("sourceReference") ?? ""),
        sourceAccountReference: String(
          form.get("sourceAccountReference") ?? "",
        ),
        bindingOnly: form.get("bindingOnly") === "true",
        receiptData: new Uint8Array(await file.arrayBuffer()),
      },
    );
    revalidatePath(`/dashboard/members/${form.get("memberId")}/billing`);
    return {
      ok: true,
      message:
        "Source paid period recorded. Billing remains with the original system.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not record the paid source period.",
    };
  }
}
