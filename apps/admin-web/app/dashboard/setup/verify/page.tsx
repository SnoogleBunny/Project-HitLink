import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { AdminShell } from "../../../_components/admin-shell";
import { SetupVerificationForm } from "./form";
export const metadata = {
  title: "Verify setup owner",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function VerifySetupPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      title="Verify setup owner"
      description="Confirm this single-use link while signed in to the account that created your business."
    >
      <SetupVerificationForm />
    </AdminShell>
  );
}
