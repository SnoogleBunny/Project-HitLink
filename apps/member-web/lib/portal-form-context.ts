import { prisma } from "@flowstate/db";
import { requireMemberPortalContext } from "./member-auth";
import { getPortalFormRequestPageData } from "./forms";

/** A signed request names its participant; another tab's member selector does not. */
export async function getAuthorizedPortalFormRequest(requestId: string) {
  const account = await requireMemberPortalContext({ scope: "account" });
  const memberIds = [
    ...new Set([
      (account.accountMember ?? account.member).id,
      ...(account.authorizedMembers ?? []).map((member) => member.id),
    ]),
  ];
  const target = await prisma.signatureRequest.findFirst({
    where: {
      id: requestId,
      workspaceId: account.workspace.id,
      memberId: { in: memberIds },
    },
    select: { memberId: true },
  });
  if (!target?.memberId) return null;
  const context = await requireMemberPortalContext({
    memberId: target.memberId,
    permission: "sign",
  });
  const request = await getPortalFormRequestPageData({
    workspaceId: context.workspace.id,
    memberId: context.member.id,
    requestId,
    guardianId: context.permissions?.guardianId,
  });
  return request ? { context, request } : null;
}
