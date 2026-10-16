"use server";
import { revalidatePath } from "next/cache";
import {
  createMemberDataExport,
  confirmMemberDataExportReceipt,
  MemberDataError,
} from "@flowstate/db";
import type { RecordsExportState } from "@flowstate/ui";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
export async function ownerMemberRecordsAction(
  _previous: RecordsExportState,
  data: FormData,
): Promise<RecordsExportState> {
  const context = await requireOwnerWorkspaceContext();
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
    revalidatePath("/dashboard/members", "layout");
    return {
      error: null,
      success:
        data.get("intent") === "receipt"
          ? "Receipt saved."
          : "The archive is listed below.",
    };
  } catch (error) {
    revalidatePath("/dashboard/members", "layout");
    return {
      error:
        error instanceof MemberDataError
          ? error.message
          : "The archive could not be prepared. Review the record and try again.",
    };
  }
}
