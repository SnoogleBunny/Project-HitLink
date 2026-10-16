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
  const hasCoaching =
    (await prisma.coachingEnrollment.count({
      where: {
        workspaceId: context.workspace.id,
        memberId: (context.accountMember ?? context.member).id,
      },
    })) > 0;
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
