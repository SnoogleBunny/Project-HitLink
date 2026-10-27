"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@flowstate/db";
import {
  previewFormPublication,
  publishFormRequirement,
  type PublicationInput,
} from "../../../../../packages/db/src/form-requirements.js";
import {
  FormRequirementError,
  parseRequirementTerms,
} from "../../../../../packages/db/src/form-requirements-policy.js";
import { StaffAccessError } from "../../../../../packages/db/src/staff-access.js";
import { requireOwnerWorkspaceContext } from "../../../lib/owner-workspace";

export type PublicationState = {
  error?: string;
  review?: Awaited<ReturnType<typeof previewFormPublication>>;
  input?: PublicationInput;
  publishedRevisionId?: string;
};
function parseInstant(value: FormDataEntryValue | null, required: boolean) {
  const raw = String(value ?? "").trim();
  if (!raw && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))
    throw new FormRequirementError("Choose an explicit date and time in UTC.");
  const at = new Date(`${raw}:00.000Z`);
  if (!Number.isFinite(+at) || at.toISOString().slice(0, 16) !== raw)
    throw new FormRequirementError("Choose a valid date and time.");
  return at.toISOString();
}
export async function formPublicationAction(
  _previous: PublicationState,
  data: FormData,
): Promise<PublicationState> {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  try {
    const input: PublicationInput = {
      publicationId: String(data.get("publicationId") ?? ""),
      formDocumentId: String(data.get("formDocumentId") ?? ""),
      formVersionId: String(data.get("formVersionId") ?? ""),
      expectedHeadHash: String(data.get("expectedHeadHash") ?? "") || null,
      reason: String(data.get("reason") ?? ""),
      terms: parseRequirementTerms({
        schemaVersion: 1,
        targets: data.getAll("targets").map(String),
        effectiveAt: parseInstant(data.get("effectiveAt"), true),
        consentValidUntil: parseInstant(data.get("consentValidUntil"), false),
        noticeLeadMinutes: Number(data.get("noticeLeadMinutes")),
        expiryWarningLeadMinutes: Number(data.get("expiryWarningLeadMinutes")),
      }),
    };
    if (data.get("intent") !== "publish")
      return {
        input,
        review: await previewFormPublication({
          db: prisma,
          workspaceId: workspace.id,
          actorUserId: session.userId,
          input,
        }),
      };
    if (data.get("confirmedAffectedCommitments") !== "on")
      throw new FormRequirementError(
        "Confirm the affected people, bookings and recovery responsibility.",
      );
    const portalOrigin =
      process.env.NEXT_PUBLIC_MEMBER_WEB_URL ??
      process.env.NEXT_PUBLIC_MEMBER_APP_URL;
    if (!portalOrigin)
      throw new FormRequirementError(
        "The member portal link is not configured. Contact support before publishing notices.",
      );
    const published = await publishFormRequirement({
      db: prisma,
      workspaceId: workspace.id,
      actorUserId: session.userId,
      input,
      expectedPreviewHash: String(data.get("previewHash") ?? ""),
      confirmShortNotice: data.get("confirmShortNotice") === "on",
      portalOrigin,
    });
    revalidatePath("/dashboard/forms");
    revalidatePath(`/dashboard/forms/${input.formDocumentId}`);
    revalidatePath(`/dashboard/forms/${input.formDocumentId}/publication`);
    return { publishedRevisionId: published.revisionId };
  } catch (error) {
    if (
      error instanceof FormRequirementError ||
      error instanceof StaffAccessError
    )
      return { error: error.message };
    throw error;
  }
}
