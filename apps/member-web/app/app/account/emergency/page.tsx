import { EmergencyContacts } from "@flowstate/ui";
import { getMemberEmergencyProfile, MemberProfileError } from "@flowstate/db";
import { randomUUID } from "node:crypto";
import { MemberShell } from "../../../_components/member-shell";
import { requireMemberPortalContext } from "../../../../lib/member-auth";
import { changeEmergencyContactAction } from "./emergency-actions";

export default async function MemberEmergencyPage({
  searchParams,
}: {
  searchParams?: Promise<{ memberId?: string }>;
}) {
  const query = await searchParams;
  const context = await requireMemberPortalContext({
    memberId: query?.memberId,
    permission: "view",
  });
  let emergency;
  try {
    emergency = await getMemberEmergencyProfile(
      { workspaceId: context.workspace.id, userId: context.session.userId },
      context.member.id,
    );
  } catch (error) {
    if (!(error instanceof MemberProfileError)) throw error;
  }
  return (
    <MemberShell
      context={context}
      title="Emergency contacts"
      description={`Current emergency information for ${context.member.fullName}.`}
    >
      <section className="member-card">
        {emergency ? (
          <EmergencyContacts
            {...emergency}
            operationIds={Object.fromEntries(
              ["new", ...emergency.contacts.map((contact) => contact.id)].map(
                (id) => [id, randomUUID()],
              ),
            )}
            action={changeEmergencyContactAction}
          />
        ) : (
          <p role="status">
            Ask the gym to verify your emergency contact permission for this
            person. Booking, signing and payment rights are separate.
          </p>
        )}
      </section>
    </MemberShell>
  );
}
