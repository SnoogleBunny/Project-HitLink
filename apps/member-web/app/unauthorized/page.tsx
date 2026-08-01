import { logoutAction } from "../actions/logout";
import { EntryShell } from "../_components/entry-shell";

export default function UnauthorizedPage() {
  return (
    <EntryShell
      description="This portal is limited to customer accounts linked to a member profile at your gym."
      eyebrow="Access restricted"
      intent="restricted"
      title="Member access is not available for this account"
    >
      <div className="member-entry-recovery">
        <p>Sign out before retrying member login.</p>
        <form action={logoutAction}>
          <button className="member-button" type="submit">
            Sign out and return to login
          </button>
        </form>
      </div>
    </EntryShell>
  );
}
