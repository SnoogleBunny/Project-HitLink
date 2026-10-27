import { EntryShell } from "../_components/entry-shell";
import { ResetPasswordForm } from "./form";

export const metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

export default function ResetPasswordPage() {
  return (
    <EntryShell
      intent="account-recovery"
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Use the account email that received your reset link. The link lasts 30 minutes and works once."
    >
      <ResetPasswordForm />
    </EntryShell>
  );
}
