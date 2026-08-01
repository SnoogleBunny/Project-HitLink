import { EntryShell } from "../_components/entry-shell";
import { redirectAuthenticatedMember } from "../../lib/member-auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  await redirectAuthenticatedMember();

  return (
    <EntryShell
      intent="member-login"
      eyebrow="Member access"
      title="Log in to your member portal"
      description="Use the member login supplied by your gym."
    >
      <LoginForm />
    </EntryShell>
  );
}
