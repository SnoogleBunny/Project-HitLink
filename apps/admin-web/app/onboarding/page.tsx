import { AuthPanel } from "../_components/auth-panel";
import { OnboardingChoice } from "./onboarding-choice";
import { requireOnboardingSession } from "../../lib/admin-access";

export default async function OnboardingPage() {
  const session = await requireOnboardingSession();

  const defaultTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver";

  return (
    <AuthPanel
      eyebrow="Business setup"
      title="Set up your business"
      description="Start a new business workspace or arrange a reviewed migration from your current system."
    >
      <OnboardingChoice defaultTimezone={defaultTimezone} ownerEmail={session.email} />
    </AuthPanel>
  );
}
