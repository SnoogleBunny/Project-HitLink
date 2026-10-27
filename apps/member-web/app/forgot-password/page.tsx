import { EntryShell } from "../_components/entry-shell";
import { ForgotPasswordForm } from "./form";

export const metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default function ForgotPasswordPage() {
  return (
    <EntryShell
      intent="account-recovery"
      eyebrow="Account recovery"
      title="Reset your password"
      description="Request a single-use link for your account email. Resetting your password signs out every device."
    >
      <ForgotPasswordForm />
    </EntryShell>
  );
}
