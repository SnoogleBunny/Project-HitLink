import { AuthPanel } from "../_components/auth-panel";
import { SignupForm } from "./signup-form";
import { redirectAuthenticatedUser } from "../../lib/admin-access";

export default async function SignupPage() {
  await redirectAuthenticatedUser();

  return (
    <AuthPanel
      eyebrow="Owner setup"
      title="Create your owner account"
      description="We store one full name field in the database and return one normalized display name in session data."
    >
      <SignupForm />
    </AuthPanel>
  );
}
