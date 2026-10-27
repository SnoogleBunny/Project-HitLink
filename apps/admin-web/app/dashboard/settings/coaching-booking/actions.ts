"use server";

import { randomUUID } from "node:crypto";
import {
  CoachingBookingPolicyError,
  confirmCoachingBookingPolicy,
  parseCoachingBookingPolicy,
  previewCoachingBookingPolicy,
  type CoachingBookingPolicy,
  type CoachingBookingPolicyReview,
} from "@flowstate/db";
import { revalidatePath } from "next/cache";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";

export interface CoachingBookingPolicyRequest {
  policy: CoachingBookingPolicy;
  reason: string;
  expectedVersion: number;
  operationId: string;
}

export interface CoachingBookingRulesState {
  status: "idle" | "preview" | "error" | "success";
  baseVersion: number;
  operationId: string;
  confirmedVersion: number | null;
  message: string | null;
  review: CoachingBookingPolicyReview | null;
  request: CoachingBookingPolicyRequest | null;
  confirmedPolicy: CoachingBookingPolicy | null;
}

function field(form: FormData, name: string): string {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new CoachingBookingPolicyError(
      "Reload the appointment rule editor before continuing.",
    );
  }
  return values[0];
}

function versionField(form: FormData): number {
  const value = field(form, "expectedVersion");
  const version = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(version)) {
    throw new CoachingBookingPolicyError(
      "Reload the appointment rule editor before continuing.",
    );
  }
  return version;
}

function sameRequest(
  reviewed: CoachingBookingPolicyRequest | null,
  submitted: CoachingBookingPolicyRequest,
): boolean {
  return reviewed !== null &&
    reviewed.expectedVersion === submitted.expectedVersion &&
    reviewed.operationId === submitted.operationId &&
    reviewed.reason === submitted.reason &&
    JSON.stringify(reviewed.policy) === JSON.stringify(submitted.policy);
}

export async function updateCoachingBookingPolicyAction(
  previousState: CoachingBookingRulesState,
  form: FormData,
): Promise<CoachingBookingRulesState> {
  // Keep auth redirects outside the form-error boundary. Domain commands also
  // recheck the current owner inside their locked transaction.
  const context = await requireOwnerWorkspaceContext();
  let baseVersion = previousState.baseVersion;
  let request: CoachingBookingPolicyRequest | null = null;
  try {
    baseVersion = versionField(form);
    const intent = field(form, "intent");
    if (intent !== "PREVIEW" && intent !== "CONFIRM") {
      throw new CoachingBookingPolicyError("Choose preview before confirming appointment rules.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(field(form, "policy"));
    } catch {
      throw new CoachingBookingPolicyError("Enter valid appointment service hours and booking limits.");
    }
    const policy = parseCoachingBookingPolicy(parsed);
    const reason = field(form, "reason").trim();
    if (!reason || reason.length > 500 || Array.from(reason).some((character) => character.charCodeAt(0) < 32)) {
      throw new CoachingBookingPolicyError("Record a reason using 500 characters or fewer.");
    }
    const operationId = field(form, "operationId");
    if (!/^[A-Za-z0-9:_-]{16,150}$/.test(operationId) || operationId !== previousState.operationId) {
      throw new CoachingBookingPolicyError("Reload the appointment rule editor before continuing.");
    }
    request = { policy, reason, expectedVersion: baseVersion, operationId };
    const args = {
      actor: {
        workspaceId: context.workspace.id,
        userId: context.session.userId,
      },
      input: request,
    };
    if (intent === "CONFIRM") {
      const previewHash = field(form, "previewHash");
      if (
        previousState.status !== "preview" ||
        !previousState.review ||
        previousState.review.version !== baseVersion ||
        previousState.review.previewHash !== previewHash ||
        !sameRequest(previousState.request, request)
      ) {
        throw new CoachingBookingPolicyError(
          "The draft changed after preview. Preview the current effects again.",
        );
      }
      const confirmations = form.getAll("confirmed");
      const revision = await confirmCoachingBookingPolicy({
        ...args,
        previewHash,
        confirmed: confirmations.length === 1 && confirmations[0] === "on",
      });
      revalidatePath("/dashboard", "layout");
      return {
        status: "success",
        baseVersion: revision.version,
        operationId: randomUUID(),
        confirmedVersion: revision.version,
        message: `Appointment booking rules version ${revision.version} confirmed.`,
        review: null,
        request: null,
        confirmedPolicy: policy,
      };
    }
    const review = await previewCoachingBookingPolicy(args);
    return {
      ...previousState,
      status: "preview",
      baseVersion,
      message: null,
      review,
      request,
    };
  } catch (error) {
    return {
      ...previousState,
      status: "error",
      baseVersion,
      message: error instanceof CoachingBookingPolicyError
        ? error.message
        : "Appointment rules could not be confirmed. Reload and preview them again.",
      review: null,
      request,
    };
  }
}
