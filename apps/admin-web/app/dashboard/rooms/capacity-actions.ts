"use server";
import { randomUUID } from "node:crypto";
import {
  confirmRoomCapacityChange,
  previewRoomCapacityChange,
  RoomCapacityError,
  type RoomCapacityReview,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";
export interface RoomCapacityFormState {
  baseVersion: string;
  confirmedVersion: string | null;
  operationId: string;
  error: string | null;
  success: string | null;
  review: RoomCapacityReview | null;
}
export async function roomCapacityAction(
  previous: RoomCapacityFormState,
  form: FormData,
): Promise<RoomCapacityFormState> {
  const { workspace, session } = await requireOwnerWorkspaceContext();
  const submittedVersion = String(form.get("version") ?? "");
  const baseVersion = /^[a-f0-9]{64}$/.test(submittedVersion)
    ? submittedVersion
    : previous.baseVersion;
  const input = {
    roomId: String(form.get("roomId") ?? ""),
    capacity: String(form.get("capacity") ?? ""),
    expectedVersion: submittedVersion,
    reason: String(form.get("reason") ?? ""),
    operationId: String(form.get("operationId") ?? ""),
  };
  const actor = { workspaceId: workspace.id, userId: session.userId };
  try {
    if (form.get("step") === "confirm") {
      const result = await confirmRoomCapacityChange(actor, input, {
        previewHash: String(form.get("previewHash") ?? ""),
        confirmed: form.get("confirmEffects") === "on",
      });
      revalidatePath(`/dashboard/rooms/${input.roomId}/edit`);
      revalidatePath("/dashboard/rooms");
      revalidatePath("/dashboard/schedule");
      return {
        baseVersion: result.confirmedVersion,
        confirmedVersion: result.confirmedVersion,
        operationId: randomUUID(),
        error: null,
        success: `Room default capacity review ${result.revision} ${result.replayed ? "was already recorded" : "confirmed"}. Existing reservations and funding stay unchanged.`,
        review: null,
      };
    }
    return {
      ...previous,
      baseVersion,
      error: null,
      success: null,
      review: await previewRoomCapacityChange(actor, input),
    };
  } catch (error) {
    if (error instanceof RoomCapacityError)
      return {
        ...previous,
        baseVersion,
        error: error.message,
        success: null,
        review: null,
      };
    throw error;
  }
}
