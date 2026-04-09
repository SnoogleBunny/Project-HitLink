import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="member-auth-page">
      <section className="member-auth-card">
        <p className="member-eyebrow">Access restricted</p>
        <h1>Member access is not available for this account</h1>
        <p className="member-auth-description">
          This portal is limited to customer accounts that are linked to a
          member profile in one workspace.
        </p>
        <Link className="member-button" href="/login">
          Back to login
        </Link>
      </section>
    </main>
  );
}
