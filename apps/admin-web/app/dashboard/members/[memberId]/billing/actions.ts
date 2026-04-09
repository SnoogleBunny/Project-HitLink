"use server";

import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../../../lib/admin-access";
import {
  assignMembershipToMember,
  cancelMembershipAtPeriodEnd,
  clearMemberMembershipFreeze,
  freezeMemberMembership,
} from "../../../../../lib/member-memberships";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";

function getMemberRedirect(memberId: string): string {
  return `/dashboard/members/${memberId}/billing`;
}

export async function assignMembershipAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");
  const result = await assignMembershipToMember({
    workspaceId: workspace.id,
    input: {
      memberId,
      membershipPlanId: String(formData.get("membershipPlanId") ?? ""),
      nextBillingDate: String(formData.get("nextBillingDate") ?? ""),
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

export async function freezeMembershipAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");
  const result = await freezeMemberMembership({
    workspaceId: workspace.id,
    input: {
      memberMembershipId: String(formData.get("memberMembershipId") ?? ""),
      frozenFrom: String(formData.get("frozenFrom") ?? ""),
      frozenUntil: String(formData.get("frozenUntil") ?? ""),
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

export async function cancelMembershipAction(formData: FormData): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");

  await cancelMembershipAtPeriodEnd({
    workspaceId: workspace.id,
    memberMembershipId: String(formData.get("memberMembershipId") ?? ""),
  });

  redirect(getMemberRedirect(memberId));
}

export async function clearMembershipFreezeAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");

  await clearMemberMembershipFreeze({
    workspaceId: workspace.id,
    memberMembershipId: String(formData.get("memberMembershipId") ?? ""),
  });

  redirect(getMemberRedirect(memberId));
}

