import { AuthPanel } from "../_components/auth-panel";
import { OnboardingForm } from "./onboarding-form";
import { requireOnboardingSession } from "../../lib/admin-access";

export default async function OnboardingPage() {
  await requireOnboardingSession();

  const defaultTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver";

  return (
    <AuthPanel
      eyebrow="Workspace setup"
      title="Create your gym workspace"
      description="This first Slice 1 onboarding step creates your workspace, primary location, owner role assignment, and workspace settings in one transaction."
    >
      <OnboardingForm defaultTimezone={defaultTimezone} />
    </AuthPanel>
  );
}
