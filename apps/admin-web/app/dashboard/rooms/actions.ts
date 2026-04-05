"use server";

import { redirect } from "next/navigation";
import {
  emptyFormState,
  type BasicFormState,
} from "../../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
import { archiveRoom, createRoom, updateRoom } from "../../../lib/rooms";

function getRoomInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
    isActive: formData.get("isActive") === "on",
  };
}

export async function createRoomAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { location } = await requireOwnerWorkspaceContext();
  const result = await createRoom({
    locationId: location.id,
    input: getRoomInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/rooms");

  return emptyFormState;
}

export async function updateRoomAction(
  _previousState: BasicFormState,
  formData: FormData,
): Promise<BasicFormState> {
  const { location } = await requireOwnerWorkspaceContext();
  const roomId = String(formData.get("roomId") ?? "");
  const result = await updateRoom({
    roomId,
    locationId: location.id,
    input: getRoomInput(formData),
  });

  if (result.status === "error") {
    return {
      error: result.message,
    };
  }

  redirect("/dashboard/rooms");

  return emptyFormState;
}

export async function archiveRoomAction(formData: FormData): Promise<void> {
  const { location } = await requireOwnerWorkspaceContext();
  const roomId = String(formData.get("roomId") ?? "");

  await archiveRoom({
    roomId,
    locationId: location.id,
  });

  redirect("/dashboard/rooms");
}
