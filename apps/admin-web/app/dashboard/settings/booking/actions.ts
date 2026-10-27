"use server";
import {
  confirmClassSchedulingPolicy,
  previewClassSchedulingPolicy,
  SchedulingPolicyError,
  type ClassSchedulingPolicyReview,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
export interface BookingRulesState {
  baseVersion: number;
  confirmedVersion: number | null;
  error: string | null;
  success: string | null;
  review: ClassSchedulingPolicyReview | null;
}
export async function bookingRulesAction(
  _state: BookingRulesState,
  form: FormData,
): Promise<BookingRulesState> {
  const context = await requireOwnerWorkspaceContext();
  const submittedVersion = Number(form.get("version"));
  const baseVersion =
    Number.isSafeInteger(submittedVersion) && submittedVersion >= 0
      ? submittedVersion
      : _state.baseVersion;
  try {
    let policy: unknown;
    try {
      policy = JSON.parse(String(form.get("policy") ?? ""));
    } catch {
      throw new SchedulingPolicyError(
        "Enter valid opening hours and booking limits.",
      );
    }
    const args = {
      actor: {
        workspaceId: context.workspace.id,
        userId: context.session.userId,
      },
      input: {
        policy,
        reason: String(form.get("reason") ?? ""),
        expectedVersion: submittedVersion,
      },
    };
    if (form.get("step") === "confirm") {
      const revision = await confirmClassSchedulingPolicy({
        ...args,
        previewHash: String(form.get("previewHash") ?? ""),
        confirmed: form.get("confirmCommitments") === "on",
      });
      revalidatePath("/dashboard", "layout");
      return {
        baseVersion: revision.version,
        confirmedVersion: revision.version,
        error: null,
        success: `Class booking rules version ${revision.version} confirmed.`,
        review: null,
      };
    }
    return {
      baseVersion,
      confirmedVersion: _state.confirmedVersion,
      error: null,
      success: null,
      review: await previewClassSchedulingPolicy(args),
    };
  } catch (error) {
    return {
      baseVersion,
      confirmedVersion: _state.confirmedVersion,
      error:
        error instanceof SchedulingPolicyError
          ? error.message
          : "Booking rules could not be confirmed. Reload and preview them again.",
      success: null,
      review: null,
    };
  }
}
