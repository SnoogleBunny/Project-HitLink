import { EntryShell } from "../_components/entry-shell";
import { ForgotPasswordForm } from "./form";
export const metadata = {
  title: "Reset access | HitLink",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function ForgotPasswordPage() {
  return (
    <EntryShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Request a single-use link for your account email."
      identityEyebrow="HitLink"
      identityTitle="Your account access"
      identityDescription="A password reset signs out every device. Your workspace and records stay with your account."
    >
      <ForgotPasswordForm />
    </EntryShell>
  );
}
