import { EntryShell } from "../_components/entry-shell";
import { LoginForm } from "./login-form";
import { redirectAuthenticatedUser } from "../../lib/admin-access";

export default async function LoginPage() {
  await redirectAuthenticatedUser();

  return (
    <EntryShell
      eyebrow="Owner + coach access"
      title="Welcome back"
      description="Owners and coaches use their admin credentials to continue."
      identityEyebrow="Flowstate admin"
      identityTitle="One front door. The right workspace."
      identityDescription="Role-aware access for one gym location."
      identityItems={[
        {
          label: "Owners",
          description: "Migration, setup, and gym operations.",
        },
        {
          label: "Coaches",
          description: "The roster and attendance workspace.",
        },
      ]}
    >
      <LoginForm />
    </EntryShell>
  );
}
