"use server";

import { redirect } from "next/navigation";
import { emptyFormState, type BasicFormState } from "../../../lib/admin-access";
import {
  archiveDropInProduct,
  archivePunchCardProduct,
  createDropInProduct,
  createPunchCardProduct,
  toggleDropInProduct,
  togglePunchCardProduct,
  updateDropInProduct,
  updatePunchCardProduct,
} from "../../../lib/access-products";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

function getPunchCardInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    punchesIncluded: String(formData.get("punchesIncluded") ?? ""),
    priceCents: String(formData.get("priceCents") ?? ""),
    currency: String(formData.get("currency") ?? "usd"),
    programIds: formData.getAll("programIds").map(String),
  };
}

function getDropInInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    priceCents: String(formData.get("priceCents") ?? ""),
    currency: String(formData.get("currency") ?? "usd"),
    programIds: formData.getAll("programIds").map(String),
  };
}

export async function createPunchCardProductAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await createPunchCardProduct({
    workspaceId: workspace.id,
    input: getPunchCardInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/access-products");

  return emptyFormState;
}

export async function updatePunchCardProductAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await updatePunchCardProduct({
    workspaceId: workspace.id,
    punchCardProductId: String(formData.get("punchCardProductId") ?? ""),
    input: getPunchCardInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/access-products");

  return emptyFormState;
}

export async function togglePunchCardProductAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();

  await togglePunchCardProduct({
    workspaceId: workspace.id,
    punchCardProductId: String(formData.get("punchCardProductId") ?? ""),
    enabled: String(formData.get("enabled") ?? "false") === "true",
  });

  redirect("/dashboard/access-products");
}

export async function archivePunchCardProductAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();

  await archivePunchCardProduct({
    workspaceId: workspace.id,
    punchCardProductId: String(formData.get("punchCardProductId") ?? ""),
  });

  redirect("/dashboard/access-products");
}

export async function createDropInProductAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await createDropInProduct({
    workspaceId: workspace.id,
    input: getDropInInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/access-products");

  return emptyFormState;
}

export async function updateDropInProductAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { workspace } = await requireOwnerWorkspaceContext();
  const result = await updateDropInProduct({
    workspaceId: workspace.id,
    dropInProductId: String(formData.get("dropInProductId") ?? ""),
    input: getDropInInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/access-products");

  return emptyFormState;
}

export async function toggleDropInProductAction(formData: FormData): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();

  await toggleDropInProduct({
    workspaceId: workspace.id,
    dropInProductId: String(formData.get("dropInProductId") ?? ""),
    enabled: String(formData.get("enabled") ?? "false") === "true",
  });

  redirect("/dashboard/access-products");
}

export async function archiveDropInProductAction(
  formData: FormData,
): Promise<void> {
  const { workspace } = await requireOwnerWorkspaceContext();

  await archiveDropInProduct({
    workspaceId: workspace.id,
    dropInProductId: String(formData.get("dropInProductId") ?? ""),
  });

  redirect("/dashboard/access-products");
}
