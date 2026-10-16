import Link from "next/link";
import { MemberShell } from "../../_components/member-shell";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { logoutAction } from "../../actions/logout";

export default async function AccountPage() {
  const context = await requireMemberPortalContext({ scope: "account" });
  const family = context.authorizedMembers?.filter((member) => member.id !== context.member.id) ?? [];
  return <MemberShell context={context} title="Account" description="Your sign-in details and family access."><section className="member-card"><h2>Sign-in details</h2><dl className="member-detail-list"><div><dt>Name</dt><dd>{context.session.displayName}</dd></div><div><dt>Email</dt><dd>{context.session.email}</dd></div></dl><p>Contact {context.workspace.name} to update these details.</p></section>{family.length ? <section className="member-card"><h2>Family access</h2><ul>{family.map((member) => <li key={member.id}>{member.fullName}</li>)}</ul><p>Choose a member in the header to manage their classes. Each member has separate membership and class limits.</p></section> : null}<section className="member-card form-stack"><h2>Payments and documents</h2><Link className="text-link" href="/app/billing">Your payments</Link><Link className="text-link" href="/app/forms">Required forms</Link></section><form action={logoutAction}><button className="button button-secondary" type="submit">Log out</button></form></MemberShell>;
}
