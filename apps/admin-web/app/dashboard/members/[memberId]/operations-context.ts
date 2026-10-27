import { getSessionOrNull } from "../../../../lib/admin-access";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { requireOperationsWorkspaceContext } from "../../../../lib/operations-workspace";

// Owners can maintain their real staging records. Coaches retain the existing
// operational readiness boundary and still need a fresh exact dated assignment
// inside the shared notes domain. The cached session role grants no write.
export async function requireMemberOperationsContext() {
  const session = await getSessionOrNull();
  return session?.role === "OWNER"
    ? requireOwnerWorkspaceContext()
    : requireOperationsWorkspaceContext();
}
