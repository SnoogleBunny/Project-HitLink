import { AuthPanel } from "../_components/auth-panel";
import { redirectAuthenticatedMember } from "../../lib/member-auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  await redirectAuthenticatedMember();

  return (
    <AuthPanel
      eyebrow="Member access"
      title="Log in to your member portal"
      description="View your membership, upcoming bookings, attendance history, and billing status in one place."
    >
      <LoginForm />
    </AuthPanel>
  );
}
