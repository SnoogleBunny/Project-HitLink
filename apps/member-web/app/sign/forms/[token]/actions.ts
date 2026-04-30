"use server";

import { headers } from "next/headers";
import { recordLocalFormSignature } from "@hitlink/db";
import type { SignatureFormState } from "../../../_components/form-signature-form";

function getClientMetadata(headerList: Headers) {
  const forwardedFor = headerList.get("x-forwarded-for");

  return {
    ipAddress: forwardedFor?.split(",")[0]?.trim() ?? null,
    userAgent: headerList.get("user-agent"),
  };
}

export async function signMagicLinkFormAction(
  _previousState: SignatureFormState,
  formData: FormData,
): Promise<SignatureFormState> {
  if (formData.get("acceptedConsent") !== "on") {
    return {
      error: "You must confirm consent before signing.",
      success: false,
    };
  }

  const headerList = await headers();
  const result = await recordLocalFormSignature({
    token: String(formData.get("token") ?? ""),
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
