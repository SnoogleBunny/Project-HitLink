"use server";

import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../lib/admin-access";
import {
  archiveMembershipPlan,
  createMembershipPlan,
  updateMembershipPlan,
} from "../../../lib/membership-plans";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

function getMembershipPlanInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    lifecyclePolicy: {
      version: 1,
      noticeLength: Number(formData.get("noticeLength")),
      noticeUnit: String(formData.get("noticeUnit") ?? ""),
      alignment: String(formData.get("noticeAlignment") ?? ""),
      noticeBilling: String(formData.get("noticeBilling") ?? ""),
      approvalRequired: formData.get("approvalRequired") === "on",
      collectExistingDebt: formData.get("collectExistingDebt") === "on",
      allowMemberCancellation: formData.get("allowMemberCancellation") === "on",
      allowMemberFreeze: formData.get("allowMemberFreeze") === "on",
      freezeEnabled: formData.get("freezeEnabled") === "on",
      freezeMaxCycles: Number(formData.get("freezeMaxCycles")),
    },
    weeklyClassLimit: String(formData.get("weeklyClassLimit") ?? ""),
    monthlyClassLimit: String(formData.get("monthlyClassLimit") ?? ""),
    allowanceCountingMode: String(formData.get("allowanceCountingMode") ?? "ATTENDANCE"),
    lateCancellationConsumesClass: formData.get("lateCancellationConsumesClass") === "on",
    noShowConsumesClass: formData.get("noShowConsumesClass") === "on",
    description: String(formData.get("description") ?? ""),
    monthlyPriceCents: String(formData.get("monthlyPriceCents") ?? ""),
    currency: String(formData.get("currency") ?? "usd"),
    cancellationPolicyReference: String(
      formData.get("cancellationPolicyReference") ?? "",
    ),
    freezePolicyReference: String(formData.get("freezePolicyReference") ?? ""),
    programIds: formData.getAll("programIds").map(String),
  };
}

export async function createMembershipPlanAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await createMembershipPlan({
    workspaceId: workspace.id,
    input: getMembershipPlanInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/membership-plans");

  return emptyFormState;
}

export async function updateMembershipPlanAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const membershipPlanId = String(formData.get("membershipPlanId") ?? "");
  const result = await updateMembershipPlan({
    workspaceId: workspace.id,
    membershipPlanId,
    input: getMembershipPlanInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/membership-plans");

  return emptyFormState;
}

export async function archiveMembershipPlanAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const membershipPlanId = String(formData.get("membershipPlanId") ?? "");

  await archiveMembershipPlan({
    workspaceId: workspace.id,
    membershipPlanId,
  });

  redirect("/dashboard/membership-plans");
}

