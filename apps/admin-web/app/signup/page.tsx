import { AuthPanel } from "../_components/auth-panel";
import { SignupForm } from "./signup-form";
import { redirectAuthenticatedUser } from "../../lib/admin-access";

export default async function SignupPage() {
  await redirectAuthenticatedUser();

  return (
    <AuthPanel
      eyebrow="Owner setup"
      title="Create your owner account"
      description="Start a guided migration handoff. Flowstate will review your current system, plan the import, and guide launch readiness with you."
    >
      <SignupForm />
    </AuthPanel>
  );
}
