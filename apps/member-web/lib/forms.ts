import {
  buildMagicLinkPath,
  buildSignatureRequestToken,
  getMagicLinkSignatureRequest,
  getPortalSignatureRequestForMember,
  resolveRequiredFormStatusesForMember,
  type RequiredFormStatusItem,
  type SignatureRequestPageData,
  type SignedFormHistoryItem,
} from "@hitlink/db";

export interface MemberFormStatusView extends RequiredFormStatusItem {
  actionableHrefs: Array<{
    requestId: string;
    label: string;
    href: string;
  }>;
}

export interface MemberFormsPageData {
  items: MemberFormStatusView[];
  history: SignedFormHistoryItem[];
}

export function formatRequiredFormState(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function formatTargetLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function buildMemberActionableHref(requestId: string): string {
  return `/app/forms/${requestId}`;
}

function buildActionLabel(item: RequiredFormStatusItem, guardianName: string | null): string {
  if (item.signerKind === "GUARDIAN" && guardianName) {
    return `Open guardian link for ${guardianName}`;
  }

  return item.signerKind === "GUARDIAN" ? "Open guardian signing link" : "Open signing form";
}

export async function getMemberFormsPageData(args: {
  workspaceId: string;
  memberId: string;
}): Promise<MemberFormsPageData> {
  const result = await resolveRequiredFormStatusesForMember({
    workspaceId: args.workspaceId,
    memberId: args.memberId,
  });

  return {
    items: result.items.map((item) => ({
      ...item,
      actionableHrefs: item.openRequests.map((request) => ({
        requestId: request.requestId,
        label: buildActionLabel(item, request.guardianName),
        href:
          request.accessMethod === "PORTAL"
            ? buildMemberActionableHref(request.requestId)
            : buildMagicLinkPath(buildSignatureRequestToken(request.requestId)),
      })),
    })),
    history: result.history,
  };
}

export function getPortalFormRequestPageData(args: {
  workspaceId: string;
  memberId: string;
  requestId: string;
}): Promise<SignatureRequestPageData | null> {
  return getPortalSignatureRequestForMember(args);
}

export function getMagicLinkFormRequestPageData(args: {
  token: string;
}): Promise<SignatureRequestPageData | null> {
  return getMagicLinkSignatureRequest(args);
}

