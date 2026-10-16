import type { Prisma } from "@prisma/client";

/** Contacts alone confer no portal access. Use only currently authorized account mailboxes. */
export async function memberNotificationRecipients(db: Prisma.TransactionClient, workspaceId: string, memberIds: string[]) {
  const members = await db.member.findMany({
    where: { workspaceId, id: { in: [...new Set(memberIds)] } },
    include: {
      user: { include: { workspaceUsers: { where: { workspaceId, role: "CUSTOMER", isActive: true } } } },
      portalGrants: {
        where: { workspaceId, revokedAt: null, canBook: true },
        include: {
          user: { include: { workspaceUsers: { where: { workspaceId, role: "CUSTOMER", isActive: true } } } },
          guardian: { include: { familyLinks: { where: { workspaceId } } } },
        },
      },
    },
  });
  return members.flatMap((member) => {
    const recipients = new Map<string, { memberId: string; email: string; name: string | null }>();
    if (member.user?.workspaceUsers.length) recipients.set(member.user.email.toLowerCase(), { memberId: member.id, email: member.user.email, name: member.user.fullName });
    for (const grant of member.portalGrants) {
      if (!grant.verifiedAt || !grant.user.workspaceUsers.length || !grant.guardian.familyLinks.some((link) => link.childMemberId === member.id)) continue;
      recipients.set(grant.user.email.toLowerCase(), { memberId: member.id, email: grant.user.email, name: grant.user.fullName });
    }
    return [...recipients.values()];
  });
}
