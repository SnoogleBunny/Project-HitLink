import type { ReactNode } from "react";
import { WorkspaceLocaleProvider } from "@flowstate/ui";
import { getSessionOrNull } from "../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../lib/owner-workspace";
import { requireOperationsWorkspaceContext } from "../../lib/operations-workspace";
import { AdminWorkspace } from "../_components/admin-shell";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSessionOrNull();
  // Owners must be able to reach migration and setup before operational activation.
  const context =
    session?.role === "COACH"
      ? await requireOperationsWorkspaceContext()
      : await requireOwnerWorkspaceContext();
  return (
    <WorkspaceLocaleProvider locale={context.workspace.settings?.locale}>
      <AdminWorkspace
        session={context.session}
        workspaceName={context.workspace.name}
      >
        {children}
      </AdminWorkspace>
    </WorkspaceLocaleProvider>
  );
}
