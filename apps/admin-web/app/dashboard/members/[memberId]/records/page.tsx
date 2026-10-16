import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMemberDataOptions, listMemberDataExports } from "@flowstate/db";
import { RecordsExportPanel } from "@flowstate/ui";
import { AdminShell } from "../../../../_components/admin-shell";
import { requireOwnerWorkspaceContext } from "../../../../../lib/owner-workspace";
import { ownerMemberRecordsAction } from "./actions";
export default async function OwnerMemberRecordsPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params,
    context = await requireOwnerWorkspaceContext();
  const actor = {
    workspaceId: context.workspace.id,
    userId: context.session.userId,
  };
  const options = await getMemberDataOptions(actor, memberId);
  if (!options.member) notFound();
  const targets = [options.member, options.payer].filter(
    (target) => target !== null,
  );
  const panels = await Promise.all(
    targets.map(async (target) => ({
      target,
      jobs: await listMemberDataExports(actor, target),
    })),
  );
  return (
    <AdminShell
      session={context.session}
      workspaceName={context.workspace.name}
      title={`${options.member.name}’s records`}
      description="Member service records and payer financial records have separate archives."
      actions={
        <Link className="text-link" href={`/dashboard/members/${memberId}`}>
          Back to member
        </Link>
      }
    >
      {panels.map(({ target, jobs }) => (
        <RecordsExportPanel
          key={`${target.scope}:${target.targetId}`}
          {...target}
          requestId={randomUUID()}
          timezone={context.location.timezone}
          jobs={jobs.map((job) => ({
            ...job,
            createdAt: job.createdAt.toISOString(),
            expiresAt: job.expiresAt.toISOString(),
            downloadedAt: job.downloadedAt?.toISOString() ?? null,
            receiptConfirmedAt: job.receiptConfirmedAt?.toISOString() ?? null,
          }))}
          action={ownerMemberRecordsAction}
          downloadBase={`/dashboard/members/${memberId}/records/download`}
        />
      ))}
      {!options.payer ? (
        <section className="management-card">
          <h2>Payer records</h2>
          <p>
            This member has no linked payer account. To export a parent’s
            financial records, open the parent’s member profile. The child’s
            service archive does not contain those records.
          </p>
        </section>
      ) : null}
    </AdminShell>
  );
}
