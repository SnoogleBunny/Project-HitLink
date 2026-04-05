"use server";

import { redirect } from "next/navigation";
import {
  emptyFormState,
  type BasicFormState,
} from "../../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import {
  archiveProgram,
  createProgram,
  updateProgram,
} from "../../../lib/programs";

function getProgramInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    ageGroupLabel: String(formData.get("ageGroupLabel") ?? ""),
    levelLabel: String(formData.get("levelLabel") ?? ""),
    progressTrackingEnabled: formData.get("progressTrackingEnabled") === "on",
  };
}

export async function createProgramAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await createProgram({
    workspaceId: workspace.id,
    input: getProgramInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/programs");

  return emptyFormState;
}

export async function updateProgramAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const programId = String(formData.get("programId") ?? "");
  const result = await updateProgram({
    programId,
    workspaceId: workspace.id,
    input: getProgramInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/programs");

  return emptyFormState;
}

export async function archiveProgramAction(formData: FormData): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const programId = String(formData.get("programId") ?? "");

  await archiveProgram({
    programId,
    workspaceId: workspace.id,
  });

  redirect("/dashboard/programs");
}
