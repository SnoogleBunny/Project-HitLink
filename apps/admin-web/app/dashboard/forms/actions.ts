"use server";

import { redirect } from "next/navigation";
import { prisma, type FormType, type RequirementTarget } from "@hitlink/db";
import { emptyFormState, type BasicFormState } from "../../../lib/admin-access";
import {
  createFormDocumentWithInitialVersion,
  createFormVersion,
  setRequiredFormAssignment,
} from "../../../lib/forms";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

const formTypes: FormType[] = [
  "WAIVER",
  "MEMBERSHIP_AGREEMENT",
  "CHILD_GUARDIAN_WAIVER",
  "CUSTOM",
];

const requirementTargets: RequirementTarget[] = [
  "TRIAL",
  "MEMBER",
  "GUARDIAN",
  "MEMBERSHIP_ACTIVATION",
];

function isFormType(value: string): value is FormType {
  return formTypes.includes(value as FormType);
}

function isRequirementTarget(value: string): value is RequirementTarget {
  return requirementTargets.includes(value as RequirementTarget);
}

async function getPdfUpload(formData: FormData) {
  const file = formData.get("pdf");

  if (!(file instanceof File)) {
    return null;
  }

  return {
    fileName: file.name,
    mimeType: file.type || null,
    fileSizeBytes: file.size,
    fileData: new Uint8Array(await file.arrayBuffer()),
  };
}

async function getWorkspaceUserId(args: {
  workspaceId: string;
  userId: string;
}): Promise<string | null> {
  const workspaceUser = await prisma.workspaceUser.findFirst({
    where: {
      workspaceId: args.workspaceId,
      userId: args.userId,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  return workspaceUser?.id ?? null;
}

export async function createFormDocumentAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const formTypeValue = String(formData.get("formType") ?? "");

  if (!isFormType(formTypeValue)) {
    return {
      error: "Select a valid form type.",
    };
  }

  const workspaceUserId = await getWorkspaceUserId({
    workspaceId: workspace.id,
    userId: session.userId,
  });

  if (!workspaceUserId) {
    return {
      error: "Active owner membership not found.",
    };
  }

  const upload = await getPdfUpload(formData);

  if (!upload) {
    return {
      error: "Upload a PDF file.",
    };
  }

  const result = await createFormDocumentWithInitialVersion({
    workspaceId: workspace.id,
    uploadedByWorkspaceUserId: workspaceUserId,
    input: {
      name: String(formData.get("name") ?? ""),
      formType: formTypeValue,
      description: String(formData.get("description") ?? ""),
      ...upload,
    },
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(`/dashboard/forms/${result.formDocumentId}`);

  return emptyFormState;
}

export async function uploadFormVersionAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  const workspaceUserId = await getWorkspaceUserId({
    workspaceId: workspace.id,
    userId: session.userId,
  });

  if (!workspaceUserId) {
    return {
      error: "Active owner membership not found.",
    };
  }

  const upload = await getPdfUpload(formData);

  if (!upload) {
    return {
      error: "Upload a PDF file.",
    };
  }

  const formDocumentId = String(formData.get("formDocumentId") ?? "");
  const result = await createFormVersion({
    workspaceId: workspace.id,
    uploadedByWorkspaceUserId: workspaceUserId,
    input: {
      formDocumentId,
      ...upload,
    },
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect(`/dashboard/forms/${result.formDocumentId}`);

  return emptyFormState;
}

export async function toggleRequiredFormAssignmentAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const targetValue = String(formData.get("requirementTarget") ?? "");

  if (!isRequirementTarget(targetValue)) {
    return;
  }

  const formDocumentId = String(formData.get("formDocumentId") ?? "");
  const isActive = String(formData.get("isActive") ?? "false") === "true";

  await setRequiredFormAssignment({
    workspaceId: workspace.id,
    formDocumentId,
    requirementTarget: targetValue,
    isActive,
  });

  redirect(`/dashboard/forms/${formDocumentId}`);
}
