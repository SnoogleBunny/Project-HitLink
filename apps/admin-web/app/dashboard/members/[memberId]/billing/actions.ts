"use server";

import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../../../lib/admin-access";
import { grantMemberPunchCard } from "../../../../../lib/access-products";
import {
  assignMembershipToMember,
} from "../../../../../lib/member-memberships";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";

function getMemberRedirect(memberId: string): string {
  return `/dashboard/members/${memberId}/billing`;
}

export async function assignMembershipAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace, workspaceUserId } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");
  const result = await assignMembershipToMember({
    workspaceId: workspace.id,
    input: {
      memberId,
      membershipPlanId: String(formData.get("membershipPlanId") ?? ""),
      nextBillingDate: String(formData.get("nextBillingDate") ?? ""),
      acceptedTermsConfirmed: formData.get("acceptedTermsConfirmed") === "on",
      expectedTermsVersion: String(formData.get("expectedTermsVersion") ?? ""),
      acceptedByWorkspaceUserId: workspaceUserId,
    },
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(getMemberRedirect(memberId));

  return emptyFormState;
}

export async function grantPunchCardAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace, workspaceUserId } = await requireOwnerWorkspaceContext();
  if (formData.get("acceptedPackTerms") !== "on") return { error: "Confirm the member has accepted the pack terms." };
  const mutationId = String(formData.get("mutationId") ?? "");
  if (!/^[\da-f-]{36}$/i.test(mutationId)) return { error: "Refresh before granting a pack." };
  const memberId = String(formData.get("memberId") ?? "");
  const result = await grantMemberPunchCard({
    workspaceId: workspace.id,
    memberId,
    mutationId, actorWorkspaceUserId: workspaceUserId,
    punchCardProductId: String(formData.get("punchCardProductId") ?? ""),
    expectedTermsVersion: Number(formData.get("expectedTermsVersion")),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(getMemberRedirect(memberId));

  return emptyFormState;
}
