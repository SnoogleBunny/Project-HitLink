"use server";

import { revalidatePath } from "next/cache";
import {
  changeMemberArchive,
  MemberArchiveError,
} from "../../../lib/member-archive";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

export async function changeMemberArchiveAction(
  _previous: { error: string | null; success: string | null },
  data: FormData,
): Promise<{ error: string | null; success: string | null }> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(data.get("memberId") ?? "");
  const operation = data.get("operation");
  const version = String(data.get("version") ?? "");
  if (
    !["archive", "reactivate"].includes(String(operation)) ||
    !/^\d+$/.test(version)
  )
    return {
      error: "Reload this member before changing archive status.",
      success: null,
    };
  const archived = operation === "archive";
  try {
    await changeMemberArchive(
      { workspaceId: workspace.id, userId: session.userId },
      {
        memberId,
        archived,
        expectedVersion: Number(version),
        reason: String(data.get("reason") ?? ""),
        expectedImpactHash: String(data.get("impactHash") ?? ""),
        retainBalancesAndUnits: data.get("retainBalancesAndUnits") === "on",
      },
    );
  } catch (error) {
    if (error instanceof MemberArchiveError)
      return { error: error.message, success: null };
    throw error;
  }
  revalidatePath("/dashboard/members");
  revalidatePath(`/dashboard/members/${memberId}`);
  return {
    error: null,
    success: archived
      ? "Member archived. Their records and balances are retained."
      : "Member reactivated. Review their current service eligibility before booking.",
  };
}
