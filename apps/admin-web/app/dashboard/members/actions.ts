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
import {
  createMemberPortalAccess,
  resetMemberPortalPassword,
} from "../../../lib/member-portal-access";
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
  };
}

function getPasswordInput(formData: FormData) {
  return {
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
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

export async function createMemberPortalAccessAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");
  const passwords = getPasswordInput(formData);

  if (passwords.password !== passwords.confirmPassword) {
    return {
      error: "Passwords do not match.",
    };
  }

  const result = await createMemberPortalAccess({
    workspaceId: workspace.id,
    memberId,
    password: passwords.password,
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(`/dashboard/members/${memberId}`);

  return emptyFormState;
}

export async function resetMemberPortalPasswordAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const memberId = String(formData.get("memberId") ?? "");
  const passwords = getPasswordInput(formData);

  if (passwords.password !== passwords.confirmPassword) {
    return {
      error: "Passwords do not match.",
    };
  }

  const result = await resetMemberPortalPassword({
    workspaceId: workspace.id,
    memberId,
    password: passwords.password,
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(`/dashboard/members/${memberId}`);

  return emptyFormState;
}
