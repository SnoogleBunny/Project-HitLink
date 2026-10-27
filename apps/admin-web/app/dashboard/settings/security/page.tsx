import Link from "next/link";
import { resolveDisplayLocale } from "@flowstate/ui";
import { prisma } from "@flowstate/db";
import { AdminShell } from "../../../_components/admin-shell";
import { requireAdminAccountContext } from "../../../../lib/account-security-context";
import { signOutAllAction } from "./actions";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await requireAdminAccountContext(),
    query = await searchParams;
  const locale = resolveDisplayLocale(context.workspace.settings?.locale);
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
  const error =
    query.error === "confirm"
      ? "Confirm that you want to sign out all devices."
      : query.error === "retry"
        ? "Sign-out could not be confirmed. Try again."
        : null;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.location.timezone,
  });
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title="Account security"
      description="Manage your own password and signed-in devices."
    >
      <section className="management-card form-stack">
        <h2>Password</h2>
        <p>
          Request a single-use reset link at {context.session.email}. Resetting
          your password signs out every device.
        </p>
        <Link className="text-link" href="/forgot-password">
          Request a password reset
        </Link>
      </section>
      <section className="management-card form-stack">
        <h2>Sign out all devices</h2>
        <p>
          This signs out your account in every HitLink portal, including this
          device.
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <form action={signOutAllAction} className="form-stack">
          <label className="field-checkbox">
            <input name="confirm" type="checkbox" required />
            <span>Sign out every device, including this one.</span>
          </label>
          <button className="button" type="submit">
            Sign out all devices
          </button>
        </form>
      </section>
      <section className="management-card form-stack">
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
    </AdminShell>
  );
}
