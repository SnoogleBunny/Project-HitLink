"use server";

import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../lib/admin-access";
import {
  archiveClassTemplate,
  createClassTemplate,
  updateClassTemplate,
} from "../../../lib/class-templates";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

function getClassTemplateInput(formData: FormData) {
  return {
    programId: String(formData.get("programId") ?? ""),
    roomId: String(formData.get("roomId") ?? ""),
    coachWorkspaceUserId: String(formData.get("coachWorkspaceUserId") ?? ""),
    title: String(formData.get("title") ?? ""),
    weekday: String(formData.get("weekday") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    capacityOverride: String(formData.get("capacityOverride") ?? ""),
    bookingCutoffMinutes: String(formData.get("bookingCutoffMinutes") ?? ""),
    cancellationCutoffMinutes: String(
      formData.get("cancellationCutoffMinutes") ?? "",
    ),
  };
}

export async function createClassTemplateAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace, location } = await requireOwnerWorkspaceContext();
  const result = await createClassTemplate({
    workspaceId: workspace.id,
    locationId: location.id,
    input: getClassTemplateInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/schedule");

  return emptyFormState;
}

export async function updateClassTemplateAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace, location } = await requireOwnerWorkspaceContext();
  const templateId = String(formData.get("templateId") ?? "");
  const result = await updateClassTemplate({
    templateId,
    workspaceId: workspace.id,
    locationId: location.id,
    input: getClassTemplateInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/schedule");

  return emptyFormState;
}

export async function archiveClassTemplateAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const templateId = String(formData.get("templateId") ?? "");

  await archiveClassTemplate({
    templateId,
    workspaceId: workspace.id,
  });

  redirect("/dashboard/schedule");
}
