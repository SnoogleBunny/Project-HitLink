"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordLocalFormSignature } from "@flowstate/db";
import type { SignatureFormState } from "../../../_components/form-signature-form";
import { requireMemberPortalContext } from "../../../../lib/member-auth";

function getClientMetadata(headerList: Headers) {
  const forwardedFor = headerList.get("x-forwarded-for");

  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
  };
}

export async function signPortalFormAction(
  _previousState: SignatureFormState,
  formData: FormData,
): Promise<SignatureFormState> {
  const context = await requireMemberPortalContext({
    permission: "sign",
    memberId: String(formData.get("memberId") ?? "") || undefined,
  });

  if (formData.get("acceptedConsent") !== "on") {
    return {
      error: "You must confirm consent before signing.",
      success: false,
    };
  }

  const headerList = await headers();
  const result = await recordLocalFormSignature({
    workspaceId: context.workspace.id,
    actorUserId: context.session.userId,
    memberId: context.member.id,
    guardianId: context.permissions?.guardianId,
    requestId: String(formData.get("requestId") ?? ""),
    signerName: String(formData.get("signerName") ?? ""),
    signerEmail: String(formData.get("signerEmail") ?? ""),
    ...getClientMetadata(headerList),
  });

  if (result.status === "error") {
    return {
      error: result.message,
      success: false,
    };
  }

  revalidatePath(`/app/forms/${String(formData.get("requestId") ?? "")}`);
  revalidatePath("/app/forms");

  return {
    error: null,
    success: true,
  };
}
