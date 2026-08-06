import Link from "next/link";
import { EntryShell } from "../_components/entry-shell";
import { logoutAction } from "../actions/logout";
import { getSessionOrNull } from "../../lib/admin-access";

export default async function UnauthorizedPage() {
  const session = await getSessionOrNull();
  const roleDescription =
    session?.role === "COACH"
      ? "This page may be unavailable while your workspace is being prepared, or because your access does not include it."
      : session?.role === "OWNER"
        ? "Your owner account cannot open this route until its workspace is ready."
        : session?.role === "CUSTOMER"
          ? "Customer accounts use the member portal rather than the admin workspace."
          : "Sign in with the owner or coach account that has access to the page you need.";

  return (
    <EntryShell
      eyebrow="Access stays role-aware"
      title="You can’t open this admin page"
      description={roleDescription}
      identityEyebrow="Protected admin"
      identityTitle="The right role opens the right workspace."
      identityDescription="Flowstate keeps owner, coach, and customer access separate so operational routes stay bounded."
    >
      <div className="form-stack">
        <Link className="button" href="/">
          Return home
        </Link>

        {session ? (
          <form action={logoutAction}>
            <button className="button button-secondary" type="submit">
              Log out
            </button>
          </form>
        ) : null}
      </div>
    </EntryShell>
  );
}
