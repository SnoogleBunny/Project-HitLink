"use server";

import { redirect } from "next/navigation";
import {
  emptyFormState,
  type BasicFormState,
} from "../../../lib/admin-access";
import {
  addGuardianToMember,
  createMember,
  updateMember,
} from "../../../lib/members";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

function getMemberInput(formData: FormData) {
  return {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
    status: String(formData.get("status") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    tags: String(formData.get("tags") ?? ""),
    formStatus: String(formData.get("formStatus") ?? ""),
  };
}

export async function createMemberAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await createMember({
    workspaceId: workspace.id,
    input: getMemberInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(`/dashboard/members/${result.memberId}`);

  return emptyFormState;
}

export async function updateMemberAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");
  const result = await updateMember({
    workspaceId: workspace.id,
    memberId,
    input: getMemberInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(`/dashboard/members/${memberId}`);

  return emptyFormState;
}

export async function addGuardianToMemberAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");
  const result = await addGuardianToMember({
    workspaceId: workspace.id,
    memberId,
    input: {
      fullName: String(formData.get("guardianFullName") ?? ""),
      email: String(formData.get("guardianEmail") ?? ""),
      phone: String(formData.get("guardianPhone") ?? ""),
      relationshipLabel: String(formData.get("relationshipLabel") ?? ""),
      isPrimary: formData.get("isPrimary") === "on",
      notes: String(formData.get("guardianNotes") ?? ""),
    },
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(`/dashboard/members/${memberId}`);

  return emptyFormState;
}
