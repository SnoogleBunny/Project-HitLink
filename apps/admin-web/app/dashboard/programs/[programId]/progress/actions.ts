"use server";
import { revalidatePath } from "next/cache";
import {
  ProgramProgressError,
  reviewProgramRankPolicy,
  saveProgramRankPolicy,
  setProgressCapabilities,
  type IneligibleClassBooking,
  type ProgramRankPolicy,
} from "@flowstate/db";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
export interface RankPolicyState {
  error?: string;
  message?: string;
  review?: {
    token: string;
    policy: ProgramRankPolicy;
    affected: IneligibleClassBooking[];
  };
}
export async function programRankAction(
  _state: RankPolicyState,
  form: FormData,
): Promise<RankPolicyState> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const actor = { workspaceId: workspace.id, userId: session.userId },
    programId = String(form.get("programId") ?? "");
  try {
    if (form.get("command") === "capabilities") {
      await setProgressCapabilities(actor, {
        workspaceUserId: String(form.get("workspaceUserId") ?? ""),
        canManageProgress: form.get("canManageProgress") === "on",
        canOverridePrerequisites: form.get("canOverridePrerequisites") === "on",
      });
      revalidatePath(`/dashboard/programs/${programId}/progress`);
      return { message: "Coach permissions saved." };
    }
    let policy: ProgramRankPolicy;
    try {
      policy = JSON.parse(String(form.get("policy") ?? ""));
    } catch {
      return {
        error: "The rank settings could not be read. Refresh and try again.",
      };
    }
    if (form.get("command") !== "save")
      return {
        review: await reviewProgramRankPolicy(actor, { programId, policy }),
      };
    const resolution = form.get("resolution");
    await saveProgramRankPolicy(actor, {
      programId,
      policy,
      reviewToken: String(form.get("reviewToken") ?? ""),
      operationKey: String(form.get("operationKey") ?? ""),
      reason: String(form.get("reason") ?? ""),
      resolution:
        resolution === "CANCEL" || resolution === "EXCEPTION"
          ? resolution
          : undefined,
    });
    revalidatePath(`/dashboard/programs/${programId}/progress`);
    revalidatePath("/dashboard/programs");
    revalidatePath("/dashboard/schedule");
    return { message: "Rank settings saved." };
  } catch (error) {
    if (error instanceof ProgramProgressError) return { error: error.message };
    throw error;
  }
}
