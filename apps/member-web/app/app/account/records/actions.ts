"use server";
import { revalidatePath } from "next/cache";
import {
  createMemberDataExport,
  confirmMemberDataExportReceipt,
  MemberDataError,
} from "@flowstate/db";
import type { RecordsExportState } from "@flowstate/ui";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
export async function memberRecordsAction(
  _previous: RecordsExportState,
  data: FormData,
): Promise<RecordsExportState> {
  const context = await requireMemberPortalContext({ scope: "account" });
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  try {
    if (data.get("intent") === "receipt") {
      if (data.get("reviewed") !== "on")
        return {
          error: "Check the downloaded archive before confirming receipt.",
        };
      await confirmMemberDataExportReceipt(
        actor,
        String(data.get("exportId") ?? ""),
        String(data.get("checksum") ?? ""),
      );
    } else {
      const scope = data.get("scope");
      if (scope !== "MEMBER" && scope !== "PAYER")
        return { error: "Choose a record scope." };
      await createMemberDataExport(
        actor,
        { scope, targetId: String(data.get("targetId") ?? "") },
        String(data.get("requestId") ?? ""),
      );
    }
    revalidatePath("/app/account/records");
    return {
      error: null,
      success:
        data.get("intent") === "receipt"
          ? "Receipt saved."
          : "Your archive is listed below.",
    };
  } catch (error) {
    revalidatePath("/app/account/records");
    return {
      error:
        error instanceof MemberDataError
          ? error.message
          : "The archive could not be prepared. Ask your gym’s records contact to review it.",
    };
  }
}
