"use server";

import { headers } from "next/headers";
import { recordLocalFormSignature } from "@hitlink/db";
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
  const context = await requireMemberPortalContext();

  if (formData.get("acceptedConsent") !== "on") {
    return {
      error: "You must confirm consent before signing.",
      success: false,
    };
  }

  const headerList = await headers();
  const result = await recordLocalFormSignature({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
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

  return {
    error: null,
    success: true,
  };
}
