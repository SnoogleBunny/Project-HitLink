import { AuthPanel } from "../_components/auth-panel";
import { OnboardingForm } from "./onboarding-form";
import { requireOnboardingSession } from "../../lib/admin-access";

export default async function OnboardingPage() {
  await requireOnboardingSession();

  const defaultTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver";

  return (
    <AuthPanel
      eyebrow="Migration intake"
      title="Set up your gym migration"
      description="Share the access or export instructions Flowstate needs to start. The rest of this intake helps us scope the service internally, not push configuration work onto you."
    >
      <OnboardingForm defaultTimezone={defaultTimezone} />
    </AuthPanel>
  );
}
