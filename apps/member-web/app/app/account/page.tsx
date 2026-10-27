import { resolveDisplayLocale } from "@flowstate/ui";
import Link from "next/link";
import { prisma } from "@flowstate/db";
import { MemberShell } from "../../_components/member-shell";
import { GymContact } from "../../_components/gym-contact";
import { requireMemberPortalContext } from "../../../lib/member-auth";
import { logoutAction } from "../../actions/logout";
import { signOutAllAction } from "./security-actions";

export default async function AccountPage({
  searchParams,
}: { searchParams?: Promise<{ error?: string }> } = {}) {
  const context = await requireMemberPortalContext({ scope: "account" });
  const locale = resolveDisplayLocale(context.workspace.settings?.locale);

  const query = await searchParams;
  const error =
    query?.error === "confirm"
      ? "Confirm that you want to sign out all devices."
      : query?.error === "retry"
        ? "Sign-out could not be confirmed. Try again."
        : null;
  const family =
    context.authorizedMembers?.filter(
      (member) => member.id !== context.member.id,
    ) ?? [];
  const events = await prisma.accountSecurityEvent.findMany({
    where: { userId: context.session.userId },
    select: {
      id: true,
      kind: true,
      createdAt: true,
      revokedSessionCount: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.location.timezone,
  });
  return (
    <MemberShell
      context={context}
      title="Account"
      description="Your sign-in details, account security and family access."
    >
      <section className="member-card">
        <h2>Sign-in details</h2>
        <dl className="member-detail-list">
          <div>
            <dt>Name</dt>
            <dd>{context.session.displayName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{context.session.email}</dd>
          </div>
        </dl>
        <p>Contact {context.workspace.name} to update these details.</p>
      </section>
      <section className="member-card">
        <h2>Emergency contacts</h2>
        <p>Emergency contacts have no booking, signing, payment or coaching rights through their contact entry.</p>
        <Link className="member-text-link" href={`/app/account/emergency?memberId=${context.member.id}`}>Manage my emergency contacts</Link>
        {family.map(member => <p key={member.id}><Link className="member-text-link" href={`/app/account/emergency?memberId=${member.id}`}>Emergency contacts for {member.fullName}</Link></p>)}
      </section>
      <section className="member-card member-form-stack">
        <h2>Account security</h2>
        <p>
          A password reset signs out every device. Your membership and bookings
          stay with your account.
        </p>
        <Link className="member-text-link" href="/forgot-password">
          Request a password reset
        </Link>
      </section>
      <section className="member-card member-form-stack">
        <h2>Sign out all devices</h2>
        <p>
          This signs out your account in every HitLink portal, including this
          device.
        </p>
        {error ? (
          <p role="alert" className="member-form-error">
            {error}
          </p>
        ) : null}
        <form action={signOutAllAction} className="member-form-stack">
          <label className="member-checkbox-field">
            <input name="confirm" type="checkbox" required />
            <span>Sign out every device, including this one.</span>
          </label>
          <button className="button" type="submit">
            Sign out all devices
          </button>
        </form>
      </section>
      <section className="member-card member-form-stack">
        <h2>Recent account security activity</h2>
        {events.length ? (
          <ul>
            {events.map((event) => (
              <li key={event.id}>
                {event.kind.toLowerCase().replaceAll("_", " ")} ·{" "}
                <time dateTime={event.createdAt.toISOString()}>
                  {dateFormat.format(event.createdAt)}
                </time>
                {event.revokedSessionCount !== null
                  ? ` · ${event.revokedSessionCount} sessions signed out`
                  : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>No recent security changes.</p>
        )}
        <p>Times use {context.location.timezone}.</p>
      </section>
      {family.length ? (
        <section className="member-card">
          <h2>Family access</h2>
          <ul>
            {family.map((member) => (
              <li key={member.id}>{member.fullName}</li>
            ))}
          </ul>
          <p>
            Choose a member in the header to manage their classes. Each member
            has separate membership and class limits.
          </p>
        </section>
      ) : null}
      <section className="member-card member-form-stack">
        <h2>Payments and documents</h2>
        <Link className="member-text-link" href="/app/account/records">
          Download your records
        </Link>
        <Link className="member-text-link" href="/app/billing">
          Your payments
        </Link>
        <Link className="member-text-link" href="/app/forms">
          Required forms
        </Link>
      </section>
      <GymContact workspaceId={context.workspace.id} />
      <form action={logoutAction}>
        <button className="button button-secondary" type="submit">
          Log out
        </button>
      </form>
    </MemberShell>
  );
}
