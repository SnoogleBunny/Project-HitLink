import { AuthPanel } from "../_components/auth-panel";
import { LoginForm } from "./login-form";
import { redirectAuthenticatedUser } from "../../lib/admin-access";

export default async function LoginPage() {
  await redirectAuthenticatedUser();

  return (
    <AuthPanel
      eyebrow="Owner access"
      title="Log in to Flowstate Admin"
      description="Use your owner credentials to continue into onboarding or your protected dashboard."
    >
      <LoginForm />
    </AuthPanel>
  );
}
