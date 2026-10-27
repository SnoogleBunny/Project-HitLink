import { redirect } from "next/navigation";
import Link from "next/link";
import { requireMemberPortalContext } from "../../lib/member-auth";
import { getPortalLanding } from "../../lib/portal-landing";
import { MemberShell } from "../_components/member-shell";

export default async function AppHomePage() {
  const context = await requireMemberPortalContext({ scope: "account" });
  const landing = await getPortalLanding({
    workspaceId: context.workspace.id,
    userId: context.session.userId,
    accountMemberId: (context.accountMember ?? context.member).id,
    authorizedMemberIds: (context.authorizedMembers ?? [context.member]).map(
      (member) => member.id,
    ),
  });
  if (landing.href) redirect(landing.href);
  return (
    <MemberShell
      context={context}
      title="Choose your service"
      description="Open your family’s gym activity or your own coaching program."
    >
      <section className="member-card">
        <h2>Gym and family</h2>
        <p>
          Classes, bookings, attendance and memberships for you and the children
          you manage.
        </p>
        <Link className="button" href="/app/schedule">
          Open classes
        </Link>
      </section>
      <section className="member-card">
        <h2>Your coaching</h2>
        <p>Your own program, published notes and coaching payment requests.</p>
        <Link className="button" href={landing.coachingHref ?? "/app/coaching"}>
          Open coaching
        </Link>
      </section>
    </MemberShell>
  );
}
