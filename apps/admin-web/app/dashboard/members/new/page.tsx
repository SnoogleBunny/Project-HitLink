import Link from "next/link";
import { randomUUID } from "node:crypto";
import { AdminShell } from "../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../lib/owner-workspace";
import { MemberCreateForm } from "../member-form";

export default async function NewMemberPage() {
  const { session, workspace } = await requireOwnerWorkspaceContext();
  return (
    <AdminShell
      session={session}
      workspaceName={workspace.name}
      title="Add member"
      description="Create a member or trial profile. Membership and portal access can be added afterward."
      actions={
        <Link className="text-link" href="/dashboard/members">
          All members
        </Link>
      }
    >
      <section className="management-card hl-focused-form">
        <h2>Personal details</h2>
        <MemberCreateForm operationId={randomUUID()} />
      </section>
    </AdminShell>
  );
}
