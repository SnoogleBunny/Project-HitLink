import { getSessionOrNull } from "./admin-access";
import { requireOwnerWorkspaceContext } from "./owner-workspace";
import { requireOperationsWorkspaceContext } from "./operations-workspace";

/** Account security remains available while an owner is preparing the gym. */
export async function requireAdminAccountContext() {
  const session = await getSessionOrNull();
  return session?.role === "COACH"
    ? requireOperationsWorkspaceContext()
    : requireOwnerWorkspaceContext();
}
