import { EntryShell } from "../_components/entry-shell";
import { ResetPasswordForm } from "./form";
export const metadata = {
  title: "Choose a new password | HitLink",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function ResetPasswordPage() {
  return (
    <EntryShell
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Use the account email that received your reset link."
      identityEyebrow="HitLink"
      identityTitle="Secure your account"
      identityDescription="This link works once. After your password changes, sign in again on each device."
    >
      <ResetPasswordForm />
    </EntryShell>
  );
}
