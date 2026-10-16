import type { ReactNode } from "react";
import { prisma } from "@flowstate/db";
import { requireMemberPortalContext } from "../../lib/member-auth";
import { MemberWorkspace } from "../_components/member-shell";
import { MemberSelector } from "../_components/member-selector";

export default async function MemberLayout({
  children,
}: {
  children: ReactNode;
}) {
  const context = await requireMemberPortalContext();
  const [coachingEnrollments, coachingPayerGrants] = await Promise.all([
    prisma.coachingEnrollment.count({
      where: {
        workspaceId: context.workspace.id,
        memberId: (context.accountMember ?? context.member).id,
      },
    }),
    prisma.coachingPayerGrant.count({
      where: {
        workspaceId: context.workspace.id,
        payerUserId: context.session.userId,
        payerMemberId: (context.accountMember ?? context.member).id,
        activeSlot: "ACTIVE",
        revokedAt: null,
      },
    }),
  ]);
  const hasCoaching = coachingEnrollments > 0 || coachingPayerGrants > 0;
  const members = context.authorizedMembers ?? [
    { id: context.member.id, fullName: context.member.fullName },
  ];
  return (
    <MemberWorkspace
      context={context}
      hasCoaching={hasCoaching}
      memberControl={
        members.length > 1 ? (
          <MemberSelector
            selectedMemberId={context.member.id}
            members={members}
          />
        ) : undefined
      }
    >
      {children}
    </MemberWorkspace>
  );
}
