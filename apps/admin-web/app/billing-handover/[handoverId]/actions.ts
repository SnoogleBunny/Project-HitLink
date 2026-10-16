"use server";
import { revalidatePath } from "next/cache";
import {
  acceptWorkspaceBillingHandover,
  WorkspaceDataError,
} from "@flowstate/db";
import { getSessionOrNull } from "../../../lib/admin-access";
export async function acceptHandoverAction(
  _state: { error: string | null; success: string | null },
  data: FormData,
): Promise<{ error: string | null; success: string | null }> {
  const session = await getSessionOrNull();
  if (!session)
    return { error: "Sign in as the named receiving account.", success: null };
  const id = String(data.get("handoverId") ?? "");
  try {
    if (data.get("confirmed") !== "on")
      throw new WorkspaceDataError(
        "Review the exact balances and billing responsibility before accepting.",
      );
    await acceptWorkspaceBillingHandover(
      session.userId,
      id,
      String(data.get("fingerprint") ?? ""),
      String(data.get("evidenceReference") ?? ""),
    );
    revalidatePath(`/billing-handover/${id}`);
    revalidatePath("/dashboard/settings/data/handover");
    return {
      error: null,
      success: "Acceptance recorded for this exact snapshot.",
    };
  } catch (error) {
    return {
      error:
        error instanceof WorkspaceDataError
          ? error.message
          : "Acceptance could not be confirmed. Review the current handover before retrying.",
      success: null,
    };
  }
}
