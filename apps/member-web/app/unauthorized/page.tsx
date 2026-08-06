import { logoutAction } from "../actions/logout";
import { EntryShell } from "../_components/entry-shell";

export default function UnauthorizedPage() {
  return (
    <EntryShell
      description="The portal may still be getting ready, or your current access may not include it."
      eyebrow="Access restricted"
      intent="restricted"
      title="Member portal access isn’t available right now"
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
