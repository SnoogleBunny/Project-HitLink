import Link from "next/link";
import { AuthPanel } from "../_components/auth-panel";
import { logoutAction } from "../actions/logout";
import { getSessionOrNull } from "../../lib/admin-access";

export default async function UnauthorizedPage() {
  const session = await getSessionOrNull();

  return (
    <AuthPanel
      eyebrow="Unauthorized"
      title="This admin area is owner-only right now"
      description="Coach and customer roles remain valid in the data model, but this first admin dashboard is intentionally limited to owners."
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
    </AuthPanel>
  );
}
