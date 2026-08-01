import { EntryShell } from "../_components/entry-shell";
import { SignupForm } from "./signup-form";
import { redirectAuthenticatedUser } from "../../lib/admin-access";

export default async function SignupPage() {
  await redirectAuthenticatedUser();

  return (
    <EntryShell
      eyebrow="Owner signup"
      title="Create your owner account"
      description="Start a guided, validated, and reviewable migration handoff before gym operations open."
      identityEyebrow="Migration first"
      identityTitle="Prepare the handoff before opening the workspace."
      identityDescription="Signup is for the gym owner responsible for reviewing one location’s migration."
      identityItems={[
        {
          label: "Guided",
          description: "Move through a defined migration sequence.",
        },
        {
          label: "Validated",
          description: "Resolve required details before handoff.",
        },
        {
          label: "Reviewable",
          description: "The owner reviews readiness before operations open.",
        },
      ]}
    >
      <SignupForm />
    </EntryShell>
  );
}
